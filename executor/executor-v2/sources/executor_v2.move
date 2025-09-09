/// Executor V2 implementation
/// 
/// Note: Due to a bug in the quote_fee() function that doesn't properly handle executor versions,
/// we will not deploy an executor v3 in the future. Instead, new executors will be introduced
/// through a new routing mechanism that routes requests to the correct contract based on the
/// executor address rather than the version number.
module executor_v2::executor_v2 {
    use std::aptos_coin::AptosCoin;
    use std::coin::{Self, Coin};
    use std::error;
    use std::event::emit;
    use std::vector;

    use endpoint_v2_common::serde;
    use executor_v2_fee_lib_router_v1::executor_v2_fee_lib_router;
    use executor_auth::executor_cap::{Self, ExecutorCapability};
    use executor_v2::executor_fee_lib_config;
    use layerzero_common::packet::{Self, Packet};
    use layerzero_common::utils::{assert_u16, type_address};

    const EEXECUTOR_INVALID_ADAPTER_PARAMS_SIZE: u64 = 0x01;
    const EEXECUTOR_INVALID_ADAPTER_PARAMS_TYPE: u64 = 0x02;
    const EEXECUTOR_INSUFFICIENT_FEE: u64 = 0x03;

    /// Constants for executor options in options v3
    const EXECUTOR_WORKER_ID: u8 = 1;
    const EXECUTOR_OPTION_TYPE_LZ_RECEIVE: u8 = 1;
    const EXECUTOR_OPTION_TYPE_NATIVE_DROP: u8 = 2;

    /// The type of executor is for registration in the endpoint
    struct Executor {}

    #[event]
    struct ExecutorRequested has store, drop {
        executor: address,
        guid: vector<u8>,
        adapter_params: vector<u8>,
        fee: u64,
    }

    public fun request<UA>(
        executor: address,
        packet: &Packet,
        adapter_params: vector<u8>,
        fee: Coin<AptosCoin>,
        cap: &ExecutorCapability
    ): Coin<AptosCoin> {
        executor_cap::assert_version(cap, 2);
        let ua_address = type_address<UA>();
        let dst_chain_id = packet::dst_chain_id(packet);

        // Get required fee and then assert that the fee is sufficient
        let (fee_required, deposit_address) = get_executor_fee_and_deposit_address(ua_address, executor, dst_chain_id, adapter_params);
        assert!(coin::value(&fee) >= fee_required, error::invalid_argument(EEXECUTOR_INSUFFICIENT_FEE));

        // Pay fee
        let coin_required = coin::extract(&mut fee, fee_required);
        coin::deposit(deposit_address, coin_required);

        emit(ExecutorRequested {
            executor,
            guid: packet::get_guid(packet),
            adapter_params,
            fee: fee_required,
        });

        // Return the remaining fee
        fee
    }

    #[view]
    public fun quote_fee(ua_address: address, executor: address, dst_chain_id: u64, adapter_params: vector<u8>): u64 {
        let (fee, _) = get_executor_fee_and_deposit_address(ua_address, executor, dst_chain_id, adapter_params);
        fee
    }

    #[view]
    public fun get_executor_fee_and_deposit_address(
        ua_address: address,
        executor: address,
        dst_chain_id: u64,
        adapter_params: vector<u8>
    ): (u64, address) {
        assert_u16(dst_chain_id);
        // Convert the adapter_params to the options v3 for quoting
        let options = convert_to_options_type3(&adapter_params);
        let fee_lib = executor_fee_lib_config::get_executor_fee_lib(executor);
        executor_v2_fee_lib_router::get_executor_fee(
            fee_lib,
            executor,
            dst_chain_id as u32,
            ua_address,
            options,
        )
    }

    /// Convert adapter params to options
    fun convert_to_options_type3(adapter_params: &vector<u8>): vector<u8> {
        // Decode adapter params using the same logic as executor v1
        let (options_type, gas, airdrop_amount, receiver) = decode_adapter_params(adapter_params);
        
        // Create executor options in the new format
        let executor_options = vector::empty<u8>();
        
        // Add lz_receive option for both type 1 and type 2
        append_lz_receive_option(&mut executor_options, gas);
        
        // Add native drop option for type 2
        if (options_type == 2) {
            append_native_drop_option(&mut executor_options, airdrop_amount, receiver);
        };
        
        executor_options
    }

    /// Decode adapter params using the same logic as executor v1
    /// This function returns the following fields:
    /// - options_type: u16
    /// - gas: u64
    /// - airdrop_amount: u64
    /// - receiver: vector<u8>
    /// 
    /// The adapter params are decoded as follows:
    /// type    1
    /// bytes  [2     8       ]
    /// fields [type  extraGas]
    /// type    2
    /// bytes  [2     8         8           unfixed       ]
    /// fields [type  extraGas  airdropAmt  airdropAddress]
    fun decode_adapter_params(adapter_params: &vector<u8>): (u16, u64, u64, vector<u8>) {
        let size = vector::length(adapter_params);
        assert!(size == 10 || size > 18, error::invalid_argument(EEXECUTOR_INVALID_ADAPTER_PARAMS_SIZE));

        let options_type = serde::extract_u16(adapter_params, &mut 0);
        assert!(options_type == 1 || options_type == 2, error::invalid_argument(EEXECUTOR_INVALID_ADAPTER_PARAMS_TYPE));

        let gas;
        let airdrop_amount = 0;
        let receiver = vector::empty<u8>();
        
        if (options_type == 1) {
            assert!(size == 10, error::invalid_argument(EEXECUTOR_INVALID_ADAPTER_PARAMS_SIZE));
            gas = serde::extract_u64(adapter_params, &mut 2);
        } else if (options_type == 2) {
            assert!(size > 18, error::invalid_argument(EEXECUTOR_INVALID_ADAPTER_PARAMS_SIZE));
            gas = serde::extract_u64(adapter_params, &mut 2);
            airdrop_amount = serde::extract_u64(adapter_params, &mut 10);
            receiver = serde::extract_bytes_until_end(adapter_params, &mut 18);
        } else {
            abort error::invalid_argument(EEXECUTOR_INVALID_ADAPTER_PARAMS_TYPE)
        };

        (options_type, gas, airdrop_amount, receiver)
    }

    /// Append lz_receive option to executor options
    fun append_lz_receive_option(buf: &mut vector<u8>, execution_gas: u64) {
        serde::append_u8(buf, EXECUTOR_WORKER_ID);
        serde::append_u16(buf, 17); // 16 + 1, 16 for gas (u128), + 1 for option_type
        serde::append_u8(buf, EXECUTOR_OPTION_TYPE_LZ_RECEIVE);
        serde::append_u128(buf, execution_gas as u128);
    }

    /// Append native drop option to executor options
    fun append_native_drop_option(buf: &mut vector<u8>, amount: u64, receiver: vector<u8>) {
        // Pad receiver to 32 bytes. It will abort if the receiver is longer than 32 bytes
        let padded_receiver = serde::pad_zero_left(receiver, 32);
        serde::append_u8(buf, EXECUTOR_WORKER_ID);
        serde::append_u16(buf, 49); // 32 + 16 + 1, 32 + 16 for amount and receiver, + 1 for option_type
        serde::append_u8(buf, EXECUTOR_OPTION_TYPE_NATIVE_DROP);
        serde::append_u128(buf, amount as u128);
        serde::append_bytes(buf, padded_receiver);
    }

    #[test_only]
    public fun test_convert_to_options_type3(adapter_params: &vector<u8>): vector<u8> {
        convert_to_options_type3(adapter_params)
    }
}
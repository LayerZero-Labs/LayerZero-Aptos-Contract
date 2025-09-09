/// Entrypoint for all calls that come from the Message Library Router for ULN301
/// ULN301 is designed to work with EndpointV1, while being compatible with ULN302 on EndpointV2
module uln_301::router_calls {
    use std::any::Any;
    use std::aptos_coin::AptosCoin;
    use std::coin::Coin;

    use endpoint_v2_common::bytes32::Bytes32;
    use endpoint_v2_common::contract_identity::{
        DynamicCallRef,
        get_dynamic_call_ref_caller
    };
    use endpoint_v2_common::packet_raw::RawPacket;
    use fa_converter::fa_converter;
    use layerzero_common::packet::Packet;
    use layerzero_common::utils::type_address;
    use msglib_auth::msglib_cap::{Self, MsgLibReceiveCapability, MsgLibSendCapability};
    use msglib_types::dvn_verify_params;
    use packet_converter::packet_converter;
    use uln_301::configuration;
    use uln_301::sending;
    use uln_301::verification;
    use zro::zro::ZRO;

    /// The msglib version for EndpointV1
    const MSGLIB_MAJOR_VERSION: u64 = 2;
    const MSGLIB_MINOR_VERSION: u8 = 0;

    // ==================================================== Sending ===================================================

    /// Provides a quote for sending a packet
    public fun quote(
        ua_address: address,
        dst_chain_id: u64,
        payload_size: u64,
        pay_in_zro: bool,
        msglib_params: vector<u8> // treated as options in ULN301
    ): (u64, u64) {
        let packet = packet_converter::new_dummy_lzv2_packet(
            configuration::eid(),
            ua_address,
            dst_chain_id as u32,
            payload_size
        );
        sending::quote(packet, msglib_params, pay_in_zro)
    }

    /// Takes payment for sending a packet and triggers offchain entities to verify and deliver the packet
    public fun send<UA>(
        packet: &Packet,
        native_fee: Coin<AptosCoin>,
        zro_fee: Coin<ZRO>,
        msglib_params: vector<u8>, // treated as options in ULN301
        cap: &MsgLibSendCapability
    ): (Coin<AptosCoin>, Coin<ZRO>) {
        msglib_cap::assert_send_version(cap, MSGLIB_MAJOR_VERSION, MSGLIB_MINOR_VERSION);

        // Convert the packet to LZV2 format
        let packet = packet_converter::convert_to_lzv2_packet(packet);

        // Convert coins to fungible assets
        let native_fee_fa = fa_converter::coin_to_fungible_asset(native_fee);
        let zro_fee_fa = fa_converter::coin_to_optional_fungible_asset(zro_fee);

        // Send the packet
        sending::send(packet, msglib_params, &mut native_fee_fa, &mut zro_fee_fa);

        // Convert remaining fungible assets back to coins
        let native_fee_coin = fa_converter::fungible_asset_to_coin(native_fee_fa);
        let zro_fee_coin = fa_converter::optional_fungible_asset_to_coin(zro_fee_fa);

        (native_fee_coin, zro_fee_coin)
    }

    // =================================================== Receiving ==================================================

    /// Commits a verification for a packet and clears the memory of that packet
    ///
    /// Once a packet is committed, it cannot be recommitted without receiving all verifications again. This will abort
    /// if the packet has not been verified by all required parties. This is to be called by the uln_301_receive_helper's `commit_verification()`
    public fun commit_verification(
        packet_header: RawPacket,
        payload_hash: Bytes32,
        cap: &MsgLibReceiveCapability
    ) {
        msglib_cap::assert_receive_version(cap, MSGLIB_MAJOR_VERSION, MSGLIB_MINOR_VERSION);
        verification::commit_verification(packet_header, payload_hash);
    }

    // ===================================================== DVNs =====================================================

    /// This is called by the DVN to verify a packet
    ///
    /// This expects an Any of type DvnVerifyParams, which contains the packet header, payload hash, and the number of
    /// confirmations. This is stored and the verifications are checked as a group when `commit_verification` is called.
    public fun dvn_verify(contract_id: &DynamicCallRef, params: Any) {
        let worker = get_dynamic_call_ref_caller(contract_id, @uln_301, b"dvn_verify");
        let (packet_header, payload_hash, confirmations) = dvn_verify_params::unpack_dvn_verify_params(params);
        verification::verify(worker, packet_header, payload_hash, confirmations);
    }

    // ================================================= Configuration ================================================

    /// Sets the ULN and Executor configurations for an OApp
    public fun set_ua_config<UA>(chain_id: u64, config_type: u8, config_bytes: vector<u8>, cap: &MsgLibSendCapability) {
        msglib_cap::assert_send_version(cap, MSGLIB_MAJOR_VERSION, MSGLIB_MINOR_VERSION);
        configuration::set_config(type_address<UA>(), chain_id as u32, config_type as u32, config_bytes);
    }

    #[view]
    /// Gets the ULN or Executor configuration for an eid on an OApp
    public fun get_ua_config(ua_address: address, chain_id: u64, config_type: u8): vector<u8> {
        configuration::get_config(ua_address, chain_id as u32, config_type as u32)
    }

    // ================================================ View Functions ================================================

    #[view]
    public fun version(): (u64 /*major*/, u8 /*minor*/, u8 /*endpoint_version*/) {
        (3, 0, 1)
    }
}
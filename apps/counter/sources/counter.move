module counter::counter {
    use std::signer;
    use aptos_framework::coin::Self;
    use aptos_framework::aptos_coin::AptosCoin;
    use std::vector;
    use layerzero::endpoint::{Self, UaCapability};
    use layerzero::lzapp;
    use layerzero::remote;
    use aptos_std::type_info;

    const ECOUNTER_ALREADY_CREATED: u64 = 0x00;
    const ECOUNTER_NOT_CREATED: u64 = 0x01;
    const ECOUNTER_UNTRUSTED_ADDRESS: u64 = 0x02;

    const COUNTER_PAYLOAD: vector<u8> = vector<u8>[1, 2, 3, 4];

    struct CounterUA {}

    struct Capabilities has key {
        cap: UaCapability<CounterUA>,
    }

    /// Resource that wraps an integer counter
    struct Counter has key { i: u64 }

    fun init_module(account: &signer) {
        let cap = endpoint::register_ua<CounterUA>(account);
        lzapp::init(account, cap);
        remote::init(account);

        move_to(account, Capabilities { cap });
    }

    /// create_counter a `Counter` resource with value `i` under the given `account`
    public entry fun create_counter(account: &signer, i: u64) {
        move_to(account, Counter { i })
    }

    /// Read the value in the `Counter` resource stored at `addr`
    public fun get_count(addr: address): u64 acquires Counter {
        borrow_global<Counter>(addr).i
    }

    //
    // lz func
    //
    public entry fun send_to_remote(
        account: &signer,
        chain_id: u64,
        fee: u64,
        adapter_params: vector<u8>,
    ) acquires Capabilities {
        let fee_in_coin = coin::withdraw<AptosCoin>(account, fee);
        let signer_addr = signer::address_of(account);

        let cap = borrow_global<Capabilities>(signer_addr);
        let dst_address = remote::get(@counter, chain_id);
        let (_, refund) = lzapp::send<CounterUA>(chain_id, dst_address, COUNTER_PAYLOAD, fee_in_coin, adapter_params, vector::empty<u8>(), &cap.cap);

        coin::deposit(signer_addr, refund);
    }

    public fun quote_fee(dst_chain_id: u64, adapter_params: vector<u8>, pay_in_zro: bool): (u64, u64) {
        endpoint::quote_fee(@counter, dst_chain_id, vector::length(&COUNTER_PAYLOAD), pay_in_zro, adapter_params, vector::empty<u8>())
    }

    public entry fun lz_receive(chain_id: u64, src_address: vector<u8>, payload: vector<u8>) acquires Counter, Capabilities {
        lz_receive_internal(chain_id, src_address, payload);
    }

    public entry fun lz_receive_types(_src_chain_id: u64, _src_address: vector<u8>, _payload: vector<u8>) : vector<type_info::TypeInfo> {
        vector::empty<type_info::TypeInfo>()
    }

    fun lz_receive_internal(src_chain_id: u64, src_address: vector<u8>, payload: vector<u8>): vector<u8> acquires Counter, Capabilities {
        let cap = borrow_global<Capabilities>(@counter);

        remote::assert_remote(@counter, src_chain_id, src_address);
        endpoint::lz_receive<CounterUA>(src_chain_id, src_address, payload, &cap.cap);

        // increment the counter
        let c_ref = &mut borrow_global_mut<Counter>(@counter).i;
        *c_ref = *c_ref + 1;

        payload
    }

    public entry fun retry_payload(src_chain_id: u64, src_address: vector<u8>, nonce: u64, payload: vector<u8>) acquires Capabilities, Counter {
        let cap = borrow_global<Capabilities>(@counter);
        lzapp::remove_stored_paylaod<CounterUA>(src_chain_id, src_address, nonce, payload, &cap.cap);

        let c_ref = &mut borrow_global_mut<Counter>(@counter).i;
        *c_ref = *c_ref + 1;
    }

    #[test_only]
    use aptos_framework::coin::{MintCapability, BurnCapability};

    #[test_only]
    struct AptosCoinCap has key {
        mint_cap: MintCapability<AptosCoin>,
        burn_cap: BurnCapability<AptosCoin>,
    }

    #[test_only]
    fun setup(aptos: &signer, core_resources: &signer, addresses: vector<address>) {
        use aptos_framework::aptos_coin;
        use aptos_framework::aptos_account;

        // init the aptos_coin and give counter_root the mint ability.
        let (burn_cap, mint_cap) = aptos_coin::initialize_for_test(aptos);

        aptos_account::create_account(signer::address_of(core_resources));
        let coins = coin::mint<AptosCoin>(
            18446744073709551615,
            &mint_cap,
        );
        coin::deposit<AptosCoin>(signer::address_of(core_resources), coins);

        let i = 0;
        while (i < vector::length(&addresses)) {
            aptos_account::transfer(core_resources, *vector::borrow(&addresses, i), 100000000000);
            i = i + 1;
        };

        // gracefully shutdown
        move_to(core_resources, AptosCoinCap {
            mint_cap,
            burn_cap
        });
    }

    #[test(aptos = @aptos_framework, core_resources = @core_resources, layerzero_root = @layerzero, msglib_auth_root = @msglib_auth, counter_root = @counter, oracle_root = @1234, relayer_root = @5678, executor_root = @1357, executor_auth_root = @executor_auth)]
    public fun end_to_end_test(aptos: &signer, core_resources: &signer, layerzero_root: &signer, msglib_auth_root: &signer, counter_root: &signer, oracle_root: &signer, relayer_root: &signer, executor_root: &signer, executor_auth_root: &signer) acquires Counter, Capabilities {
        use std::bcs;
        use std::signer;
        use layerzero::test_helpers;
        use layerzero_common::packet;
        use layerzero_common::serde;

        let layerzero_addr = signer::address_of(layerzero_root);
        let oracle_addr = signer::address_of(oracle_root);
        let relayer_addr = signer::address_of(relayer_root);
        let executor_addr = signer::address_of(executor_root);
        let counter_addr = signer::address_of(counter_root);

        setup(aptos, core_resources, vector<address>[layerzero_addr, oracle_addr, relayer_addr, executor_addr, counter_addr]);

        // prepare the endpoint
        let src_chain_id: u64 = 20030;
        let dst_chain_id: u64 = 20030;

        test_helpers::setup_layerzero_for_test(layerzero_root, msglib_auth_root, oracle_root, relayer_root, executor_root, executor_auth_root, src_chain_id, dst_chain_id);
        // assumes layerzero is already initialized
        init_module(counter_root);

        // register the counter app
        create_counter(counter_root, 0);

        let src_address = @counter;
        let src_address_bytes = bcs::to_bytes(&src_address);

        let dst_address = @counter;
        let dst_address_bytes = bcs::to_bytes(&dst_address);

        remote::set(counter_root, dst_chain_id, dst_address_bytes);
        let addr = counter_addr; //loopback
        assert!(get_count(addr) == 0, 0);

        let confirmations_bytes = vector::empty();
        serde::serialize_u64(&mut confirmations_bytes, 20);
        lzapp::set_config<CounterUA>(counter_root, 1, 0, dst_chain_id, 3, confirmations_bytes);
        let config = layerzero::uln_config::get_uln_config(@counter, dst_chain_id);
        assert!(layerzero::uln_config::oracle(&config) == oracle_addr, 0);
        assert!(layerzero::uln_config::relayer(&config) == relayer_addr, 0);
        assert!(layerzero::uln_config::inbound_confirmations(&config) == 15, 0);
        assert!(layerzero::uln_config::outbound_confiramtions(&config) == 20, 0);

        // counter send - receive flow
        let adapter_params = vector::empty();
        let (fee, _) = quote_fee(dst_chain_id, adapter_params, false);
        assert!(fee == 10 + 100 + 1 * 4 + 1, 0); // oracle fee + relayer fee + treasury fee
        send_to_remote(counter_root, dst_chain_id, fee, adapter_params);

        // oracle and relayer submission
        let confirmation: u64 = 77;
        let payload = vector<u8>[1, 2, 3, 4];
        let nonce = 1;
        let emitted_packet = packet::new_packet(src_chain_id, src_address_bytes, dst_chain_id, dst_address_bytes, nonce, payload);

        test_helpers::deliver_packet<CounterUA>(oracle_root, relayer_root, emitted_packet, confirmation);

        // receive from remote
        let p = lz_receive_internal(dst_chain_id, dst_address_bytes, payload);
        assert!(p == vector<u8>[1, 2, 3, 4], 0);
        assert!(get_count(addr) == 1, 0);
    }

    #[test(aptos = @aptos_framework, core_resources = @core_resources, layerzero_root = @layerzero, msglib_auth_root = @msglib_auth, counter_root = @counter, oracle_root = @1234, relayer_root = @5678, executor_root = @1357, executor_auth_root = @executor_auth)]
    public fun test_store_and_pop_payload(aptos: &signer, core_resources: &signer, layerzero_root: &signer, msglib_auth_root: &signer, counter_root: &signer, oracle_root: &signer, relayer_root: &signer, executor_root: &signer, executor_auth_root: &signer) acquires Counter, Capabilities {
        use std::bcs;
        use std::signer;
        use layerzero::test_helpers;
        use layerzero_common::packet;
        use layerzero_common::serde;

        let layerzero_addr = signer::address_of(layerzero_root);
        let oracle_addr = signer::address_of(oracle_root);
        let relayer_addr = signer::address_of(relayer_root);
        let executor_addr = signer::address_of(executor_root);
        let counter_addr = signer::address_of(counter_root);

        setup(aptos, core_resources, vector<address>[layerzero_addr, oracle_addr, relayer_addr, executor_addr, counter_addr]);

        // prepare the endpoint
        let src_chain_id: u64 = 20030;
        let dst_chain_id: u64 = 20030;

        test_helpers::setup_layerzero_for_test(layerzero_root, msglib_auth_root, oracle_root, relayer_root, executor_root, executor_auth_root, src_chain_id, dst_chain_id);
        // assumes layerzero is already initialized
        init_module(counter_root);

        // register the counter app
        create_counter(counter_root, 0);

        let src_address = @counter;
        let src_address_bytes = bcs::to_bytes(&src_address);

        let dst_address = @counter;
        let dst_address_bytes = bcs::to_bytes(&dst_address);

        remote::set(counter_root, dst_chain_id, dst_address_bytes);

        let confirmations_bytes = vector::empty();
        serde::serialize_u64(&mut confirmations_bytes, 20);
        lzapp::set_config<CounterUA>(counter_root, 1, 0, dst_chain_id, 3, confirmations_bytes);

        // oracle and relayer submission
        let confirmation: u64 = 77;
        let payload = vector<u8>[1, 2, 3, 4];
        let nonce = 1;
        let emitted_packet = packet::new_packet(src_chain_id, src_address_bytes, dst_chain_id, dst_address_bytes, nonce, payload);

        test_helpers::deliver_packet<CounterUA>(oracle_root, relayer_root, emitted_packet, confirmation);

        // store payload
        lzapp::store_next_payload<CounterUA>(counter_root, dst_chain_id, dst_address_bytes, payload);

        assert!(lzapp::has_stored_payload(counter_addr, dst_chain_id, dst_address_bytes, nonce), 0);
        retry_payload(src_chain_id, src_address_bytes, nonce, payload);

        assert!(get_count(dst_address) == 1, 0);
    }
}
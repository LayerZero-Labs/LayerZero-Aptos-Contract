module proxy_oft::example_proxy_oft {
    use aptos_framework::coin;
    use aptos_framework::managed_coin;
    use aptos_framework::signer;
    use std::vector;
    use aptos_std::type_info::TypeInfo;

    use layerzero::endpoint::UaCapability;
    use layerzero_apps::oft;

    struct ExampleProxyOFT {}

    struct Capabilities has key {
        lz_cap: UaCapability<ExampleProxyOFT>,
    }

    fun init_module(account: &signer) {
        initialize(account);
    }

    public fun initialize(account: &signer) {
        managed_coin::initialize<ExampleProxyOFT>(
            account,
            b"Moon Coin",
            b"MOON",
            5,
            false,
        );

        coin::register<ExampleProxyOFT>(account);
        managed_coin::mint<ExampleProxyOFT>(account, signer::address_of(account), 1000000000);

        let lz_cap = oft::init_proxy_oft<ExampleProxyOFT>(account, 3);
        move_to(account, Capabilities {
            lz_cap,
        });
    }

    // should provide lz_receive() and lz_receive_types()
    public entry fun lz_receive(src_chain_id: u64, src_address: vector<u8>, payload: vector<u8>) {
        oft::lz_receive<ExampleProxyOFT>(src_chain_id, src_address, payload)
    }

    #[view]
    public fun lz_receive_types(_src_chain_id: u64, _src_address: vector<u8>, _payload: vector<u8>): vector<TypeInfo> {
        vector::empty<TypeInfo>()
    }

    #[test_only]
    use std::signer::address_of;
    #[test_only]
    use std::bcs;
    #[test_only]
    use layerzero::test_helpers;
    #[test_only]
    use layerzero::remote;
    #[test_only]
    use layerzero_common::packet;

    #[test(
        aptos = @aptos_framework,
        core_resources = @core_resources,
        layerzero = @layerzero,
        msglib_auth = @msglib_auth,
        oracle = @1234,
        relayer = @5678,
        executor = @1357,
        executor_auth = @executor_auth,
        oft = @proxy_oft,
        alice = @0xABCD,
        bob = @0xAABB
    )]
    fun test_send_and_receive_proxy_oft(
        aptos: &signer,
        core_resources: &signer,
        layerzero: &signer,
        msglib_auth: &signer,
        oracle: &signer,
        relayer: &signer,
        executor: &signer,
        executor_auth: &signer,
        oft: &signer,
        alice: &signer,
        bob: &signer
    ) {
        oft::setup(
            aptos,
            core_resources,
            &vector[
                address_of(layerzero),
                address_of(msglib_auth),
                address_of(oracle),
                address_of(relayer),
                address_of(executor),
                address_of(executor_auth),
                address_of(oft),
                address_of(alice),
                address_of(bob),
            ],
        );

        // prepare the endpoint
        let local_chain_id: u64 = 20030;
        let remote_chain_id: u64 = 20030;
        test_helpers::setup_layerzero_for_test(
            layerzero,
            msglib_auth,
            oracle,
            relayer,
            executor,
            executor_auth,
            local_chain_id,
            remote_chain_id
        );

        // user address
        let (alice_addr, bob_addr) = (address_of(alice), address_of(bob));
        let bob_addr_bytes = bcs::to_bytes(&bob_addr);

        // init oft and mint some coins to alice
        initialize(oft);
        coin::register<ExampleProxyOFT>(alice);
        managed_coin::mint<ExampleProxyOFT>(oft, alice_addr, 100000000000);

        // config oft
        let (local_oft_addr, remote_oft_addr) = (@proxy_oft, @proxy_oft);
        let (local_oft_addr_bytes, remote_oft_addr_bytes) = (bcs::to_bytes(&local_oft_addr), bcs::to_bytes(
            &remote_oft_addr
        ));
        remote::set(oft, remote_chain_id, remote_oft_addr_bytes);

        // config oft fee 10%
        oft::set_default_fee<ExampleProxyOFT>(oft, 1000);

        let amount = 100000;
        let (fee, _) = oft::quote_fee<ExampleProxyOFT>(
            remote_chain_id,
            bob_addr_bytes,
            amount,
            false,
            vector::empty<u8>(),
            vector::empty<u8>()
        );
        oft::send<ExampleProxyOFT>(
            alice,
            remote_chain_id,
            bob_addr_bytes,
            amount,
            90000,
            fee,
            0,
            vector::empty<u8>(),
            vector::empty<u8>()
        );

        // 90% coins are sent to bob and 10% to fee owner
        assert!(oft::get_total_locked_coin<ExampleProxyOFT>() == 90000, 0);
        let default_fee_owner = address_of(oft);
        assert!(coin::balance<ExampleProxyOFT>(default_fee_owner) == 10000 + 1000000000, 0);
        assert!(coin::balance<ExampleProxyOFT>(alice_addr) == 100000000000 - amount, 0);

        // mock packet for receiving oft: local chain -> remote chain
        let nonce = 1;
        let amount = 90000;
        let amount_sd = 900; // 90000 / 100
        let payload = oft::encode_send_payload_for_testing(bob_addr_bytes, amount_sd);
        let emitted_packet = packet::new_packet(
            local_chain_id,
            local_oft_addr_bytes,
            remote_chain_id,
            remote_oft_addr_bytes,
            nonce,
            payload
        );
        test_helpers::deliver_packet<ExampleProxyOFT>(oracle, relayer, emitted_packet, 20);

        // bob doesn't receive coin for no registering
        lz_receive(local_chain_id, local_oft_addr_bytes, payload);
        assert!(oft::get_claimable_amount<ExampleProxyOFT>(bob_addr) == amount, 0);

        // bob claim coin
        oft::claim<ExampleProxyOFT>(bob);
        assert!(oft::get_claimable_amount<ExampleProxyOFT>(bob_addr) == 0, 0);
        assert!(coin::balance<ExampleProxyOFT>(bob_addr) == 90000, 0);
        assert!(oft::get_total_locked_coin<ExampleProxyOFT>() == 0, 0); // all locked coin is released to bob
    }
}

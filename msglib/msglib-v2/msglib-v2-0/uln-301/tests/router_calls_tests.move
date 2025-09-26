#[test_only]
module uln_301::router_calls_tests {
    use std::account;
    use std::aptos_coin::{Self, AptosCoin};
    use std::bcs;
    use std::coin::{Self, BurnCapability, Coin, MintCapability};
    use std::option;
    use std::signer::address_of;
    use std::vector;
    use aptos_framework::event::was_event_emitted;
    use aptos_framework::managed_coin;
    use aptos_framework::object;

    use price_feed_module_0::feeds;
    use price_feed_module_0::price::{Self, EidTaggedPrice, tag_price_with_eid};
    use worker_common::multisig;
    use worker_common::worker_config::{Self, WorkerDvnTarget, WorkerExecutorTarget, WorkerPriceFeedTarget};

    use endpoint_v2_common::bytes32;
    use endpoint_v2_common::contract_identity::{
        create_contract_signer,
        irrecoverably_destroy_contract_signer,
        make_call_ref
    };
    use endpoint_v2_common::guid;
    use endpoint_v2_common::packet_raw;
    use endpoint_v2_common::packet_v1_codec;
    use endpoint_v2_common::universal_config;
    use layerzero_common::packet;
    use msglib_auth::msglib_cap::{Self, MsgLibSendCapability};
    use msglib_types::configs_executor::new_executor_config;
    use msglib_types::configs_uln::new_uln_config;
    use msglib_types::worker_options::{
        DVN_WORKER_ID,
        EXECUTOR_WORKER_ID,
    };
    use treasury::treasury;
    use uln_301::configuration;
    use uln_301::msglib;
    use uln_301::router_calls;
    use uln_301::sending;
    use uln_301::uln_301_store;
    use zro::zro::ZRO;

    const SRC_CHAIN_ID: u64 = 1;
    const DST_CHAIN_ID: u64 = 2;

    const EXECUTOR_ADDRESS: address = @10100;
    const DVN_ADDRESS: address = @10001;

    struct AptosCoinCap has key {
        mint_cap: MintCapability<AptosCoin>,
        burn_cap: BurnCapability<AptosCoin>,
    }

    struct SendCapStore has key {
        cap: MsgLibSendCapability,
    }

    struct TestUa {}

    fun mint_aptos_coin_for_test(amount: u64): Coin<AptosCoin> acquires AptosCoinCap {
        let mint_cap = &borrow_global<AptosCoinCap>(@0x1).mint_cap;
        let minted_coin = coin::mint<AptosCoin>(amount, mint_cap);
        minted_coin
    }

    fun mint_zro_coin_for_test(amount: u64): Coin<ZRO> {
        let account = &account::create_account_for_test(@zro);
        managed_coin::register<ZRO>(account);
        managed_coin::mint<ZRO>(account, address_of(account), amount);
        coin::withdraw<ZRO>(account, amount)
    }

    fun burn_aptos_coin_for_test(coin: Coin<AptosCoin>) acquires AptosCoinCap {
        let burn_cap = &borrow_global<AptosCoinCap>(@0x1).burn_cap;
        coin::burn(coin, burn_cap)
    }

    fun deposit_fake_coin_for_test(coin: Coin<ZRO>) {
        coin::deposit(@0x1, coin);
    }

    fun worker_options(): vector<u8> {
        x""
    }

    fun setup(zro_enabled: bool) {
        // initialize aptos coin
        let aptos = account::create_account_for_test(@0x1);
        let (burn_cap, mint_cap) = aptos_coin::initialize_for_test(&aptos);
        move_to(&aptos, AptosCoinCap { mint_cap, burn_cap });

        // initialize zro coin
        coin::create_coin_conversion_map(&aptos);
        let zro_signer = account::create_account_for_test(@zro);
        managed_coin::initialize<ZRO>(&zro_signer, b"ZRO", b"ZRO", 8, false);
        coin::migrate_to_fungible_store<ZRO>(&zro_signer);
        let meta = option::borrow(&coin::paired_metadata<ZRO>());
        let layerzero_admin = account::create_account_for_test(@layerzero_admin);
        universal_config::init_module_for_test(SRC_CHAIN_ID as u32);
        universal_config::set_zro_address(&layerzero_admin, object::object_address(meta));

        // initialize uln301
        uln_301_store::init_module_for_test();
        configuration::set_eid(33333);
        configuration::set_default_send_uln_config(DST_CHAIN_ID as u32, new_uln_config(
            5,
            0,
            vector[DVN_ADDRESS],
            vector[],
            false,
            false,
            false,
        ));
        configuration::set_default_executor_config(DST_CHAIN_ID as u32, new_executor_config(
            10000,
            EXECUTOR_ADDRESS,
        ));
        msglib::set_worker_config_for_fee_lib_routing_opt_in(&account::create_account_for_test(DVN_ADDRESS), true);
        msglib::set_worker_config_for_fee_lib_routing_opt_in(&account::create_account_for_test(EXECUTOR_ADDRESS), true);

        // initialize treasury
        treasury::init_module_for_test();
        let treasury_admin = account::create_account_for_test(@layerzero_treasury_admin);
        treasury::set_zro_enabled(&treasury_admin, zro_enabled);
        treasury::set_zro_fee(&treasury_admin, 1000);

        // initialize workers
        worker_config::initialize_for_worker_test_only(
            DVN_ADDRESS,
            DVN_WORKER_ID(),
            DVN_ADDRESS,
            DVN_ADDRESS,
            vector[DVN_ADDRESS],
            vector[@uln_301],
            @dvn_fee_lib_0
        );
        worker_config::initialize_for_worker_test_only(
            EXECUTOR_ADDRESS,
            EXECUTOR_WORKER_ID(),
            EXECUTOR_ADDRESS,
            EXECUTOR_ADDRESS,
            vector[EXECUTOR_ADDRESS],
            vector[@uln_301],
            @0x0fee
        );
        let executor_contract_signer = create_contract_signer(&account::create_account_for_test(EXECUTOR_ADDRESS));
        worker_config::set_executor_dst_config(
            &make_call_ref<WorkerExecutorTarget>(&executor_contract_signer),
            DST_CHAIN_ID as u32,
            10000,
            10000,
            0,
            10000,
            10000
        );
        let dvn_contract_signer = create_contract_signer(&account::create_account_for_test(DVN_ADDRESS));
        worker_config::set_dvn_dst_config(
            &make_call_ref<WorkerDvnTarget>(&dvn_contract_signer),
            DST_CHAIN_ID as u32,
            10000,
            10000,
            0
        );
        multisig::initialize_for_worker_test_only(
            DVN_ADDRESS,
            1,
            vector[x"e1b271a7296266189d300d37814581a695ec1da2e8ffbbeb9b89d754ac88d7bbecbff48968853fb6bf19251a0265df162fd436b8308a5ca6db97ee3e8f6e541a"]
        );

        // initialize price feed
        let feed_signer = account::create_account_for_test(@price_feed_module_0);
        feeds::initialize(&feed_signer);
        feeds::enable_feed_updater(&feed_signer, @price_feed_module_0);
        let list = vector<EidTaggedPrice>[
            tag_price_with_eid(DST_CHAIN_ID as u32, price::new_price(1, 2, 3)),
        ];
        let prices = price::serialize_eid_tagged_price_list(&list);
        feeds::set_price(&feed_signer, @price_feed_module_0, prices);
        worker_config::set_price_feed(
            &make_call_ref<WorkerPriceFeedTarget>(&executor_contract_signer),
            @price_feed_module_0,
            @price_feed_module_0
        );
        worker_config::set_price_feed(
            &make_call_ref<WorkerPriceFeedTarget>(&dvn_contract_signer),
            @price_feed_module_0,
            @price_feed_module_0
        );
        irrecoverably_destroy_contract_signer(executor_contract_signer);
        irrecoverably_destroy_contract_signer(dvn_contract_signer);
    }

    #[test]
    fun test_send() acquires AptosCoinCap {
        setup(false);
        let src_address = bcs::to_bytes(&@0x1);
        let dst_address = bcs::to_bytes(&@0x2);
        let nonce: u64 = 1;
        let message = b"test payload";
        let packet = packet::new_packet(SRC_CHAIN_ID, src_address, DST_CHAIN_ID, dst_address, nonce, message);

        let (apt_amount, _) = router_calls::quote(
            @uln_301,
            DST_CHAIN_ID,
            vector::length(&message),
            false,
            worker_options()
        );
        let aptos_coin = mint_aptos_coin_for_test(apt_amount);
        let zro_coin = coin::zero<ZRO>();
        let send_cap = msglib_cap::send_cap(2, 0);
        let (refund_apt, refund_zro) = router_calls::send<TestUa>(
            &packet,
            aptos_coin,
            zro_coin,
            worker_options(),
            &send_cap
        );

        let raw_packet = packet_v1_codec::new_packet_v1(
            SRC_CHAIN_ID as u32,
            bytes32::from_address(@0x1),
            DST_CHAIN_ID as u32,
            bytes32::from_address(@0x2),
            nonce,
            guid::compute_guid(
                nonce,
                SRC_CHAIN_ID as u32,
                bytes32::from_address(@0x1),
                DST_CHAIN_ID as u32,
                bytes32::from_address(@0x2)
            ),
            message
        );
        assert!(was_event_emitted(&sending::packet_send_event(
            packet_raw::get_packet_bytes(raw_packet),
            worker_options(),
            apt_amount,
            0
        )), 0);
        // clean up
        coin::destroy_zero(refund_apt);
        coin::destroy_zero(refund_zro);
        move_to(&account::create_account_for_test(@uln_301), SendCapStore { cap: send_cap })
    }

    #[test]
    fun test_send_with_zro() acquires AptosCoinCap {
        setup(true);
        let src_address = bcs::to_bytes(&@0x1);
        let dst_address = bcs::to_bytes(&@0x2);
        let nonce: u64 = 1;
        let message = b"test payload";
        let packet = packet::new_packet(SRC_CHAIN_ID, src_address, DST_CHAIN_ID, dst_address, nonce, message);

        let (apt_amount, zro_amount) = router_calls::quote(
            @uln_301,
            DST_CHAIN_ID,
            vector::length(&message),
            true,
            worker_options()
        );
        let aptos_coin = mint_aptos_coin_for_test(apt_amount);
        let zro_coin = mint_zro_coin_for_test(zro_amount);
        let send_cap = msglib_cap::send_cap(2, 0);
        let (refund_apt, refund_zro) = router_calls::send<TestUa>(
            &packet,
            aptos_coin,
            zro_coin,
            worker_options(),
            &send_cap
        );

        let raw_packet = packet_v1_codec::new_packet_v1(
            SRC_CHAIN_ID as u32,
            bytes32::from_address(@0x1),
            DST_CHAIN_ID as u32,
            bytes32::from_address(@0x2),
            nonce,
            guid::compute_guid(
                nonce,
                SRC_CHAIN_ID as u32,
                bytes32::from_address(@0x1),
                DST_CHAIN_ID as u32,
                bytes32::from_address(@0x2)
            ),
            message
        );
        assert!(was_event_emitted(&sending::packet_send_event(
            packet_raw::get_packet_bytes(raw_packet),
            worker_options(),
            apt_amount,
            zro_amount
        )), 0);
        // clean up
        coin::destroy_zero(refund_apt);
        coin::destroy_zero(refund_zro);
        move_to(&account::create_account_for_test(@uln_301), SendCapStore { cap: send_cap })
    }

    #[test]
    #[expected_failure]
    fun test_send_with_invalid_version() acquires AptosCoinCap {
        setup(false);
        let src_address = bcs::to_bytes(&@0x1);
        let dst_address = bcs::to_bytes(&@0x2);
        let packet = packet::new_packet(SRC_CHAIN_ID, src_address, DST_CHAIN_ID, dst_address, 1, b"test payload");

        let aptos_coin = mint_aptos_coin_for_test(1000);
        let zro_coin = coin::zero<ZRO>();
        let send_cap = msglib_cap::send_cap(1, 0); // Invalid version (should be 2,0)

        let (refund_apt, refund_zro) = router_calls::send<TestUa>(
            &packet,
            aptos_coin,
            zro_coin,
            worker_options(),
            &send_cap
        );

        // clean up
        burn_aptos_coin_for_test(refund_apt);
        coin::destroy_zero(refund_zro);
        move_to(&account::create_account_for_test(@uln_301), SendCapStore { cap: send_cap })
    }
}

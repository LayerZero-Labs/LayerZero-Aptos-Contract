module layerzero_apps::oft {
    use std::vector;
    use std::error;
    use std::string;
    use std::signer::address_of;
    use aptos_std::table::{Self, Table};
    use aptos_std::event::{Self, EventHandle};
    use aptos_std::from_bcs;
    use aptos_std::math64::pow;
    use aptos_framework::coin::{Self, BurnCapability, MintCapability, Coin, FreezeCapability};
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::account;
    use layerzero_common::serde;
    use layerzero_common::utils::{type_address, assert_type_signer, vector_slice, assert_length};
    use layerzero::endpoint::{Self, UaCapability};
    use layerzero::lzapp;
    use layerzero::remote;
    use zro::zro::ZRO;

    const EOFT_ALREADY_INITIALIZED: u64 = 0x00;
    const EOFT_NOT_INITIALIZED: u64 = 0x01;
    const EOFT_CLAIMABLE_COIN_NOT_FOUND: u64 = 0x02;
    const EOFT_AMOUNT_TOO_SMALL: u64 = 0x03;
    const EOFT_INVALID_FEE_BP: u64 = 0x04;
    const EOFT_INVALID_DECIMALS: u64 = 0x05;
    const EOFT_UNREGISTERED_FEE_OWNER: u64 = 0x06;
    const EOFT_INVALID_ADAPTER_PARAMS: u64 = 0x07;

    const BP_DENOMINATOR: u64 = 10000;

    // packet type
    const PT_SEND: u8 = 0;
    const PT_SEND_AND_CALL: u8 = 1;

    struct GlobalStore<phantom OFT> has key {
        // if the proxy oft, use lock and unlock mode. Otherwise, use mint and burn mode.
        // the proxy oft can be only used for the native coin on that chain, then every chain else should use non-proxy oft.
        proxy: bool,
        lz_cap: UaCapability<OFT>,
        ld2sd_rate: u64,
        fee_config: FeeConfig,
        custom_adapter_params: bool,
    }

    struct FeeConfig has store {
        fee_owner: address,
        default_fee_bp: u64,
        chain_id_to_fee_bp: Table<u64, u64>,
    }

    // only non-proxy oft has those capabilities
    struct CoinCapabilities<phantom OFT> has key {
        mint_cap: MintCapability<OFT>,
        burn_cap: BurnCapability<OFT>,
        freeze_cap: FreezeCapability<OFT>,
    }

    struct CoinStore<phantom OFT> has key {
        // record the claimable coin for the users who haven't registered yet
        claimable_amount: Table<address, u64>,
        // tvl
        locked_coin: Coin<OFT>,
    }

    struct EventStore has key {
        send_events: EventHandle<SendEvent>,
        receive_events: EventHandle<ReceiveEvent>,
        claim_events: EventHandle<ClaimEvent>,
    }

    struct SendEvent has drop, store {
        dst_chain_id: u64,
        dst_receiver: vector<u8>,
        amount: u64,
    }

    struct ReceiveEvent has drop, store {
        src_chain_id: u64,
        receiver: address,
        amount: u64,
        stashed: bool
    }

    struct ClaimEvent has drop, store {
        receiver: address,
        amount: u64,
    }

    public fun init_proxy_oft<OFT>(account: &signer, shared_decimals: u8): UaCapability<OFT> {
        init<OFT>(account, true, shared_decimals)
    }

    public fun init_oft<OFT>(
        account: &signer,
        name: vector<u8>,
        symbol: vector<u8>,
        decimals: u8,
        shared_decimals: u8,
    ): UaCapability<OFT> {
        let (burn_cap, freeze_cap, mint_cap) = coin::initialize<OFT>(
            account,
            string::utf8(name),
            string::utf8(symbol),
            decimals,
            true,
        );

        move_to(account, CoinCapabilities<OFT> {
            mint_cap,
            burn_cap,
            freeze_cap,
        });

        init<OFT>(account, false, shared_decimals)
    }

    // shared_decimals should be the minimum decimals of that coin on all chains
    fun init<OFT>(account: &signer, proxy: bool, shared_decimals: u8): UaCapability<OFT> {
        assert_type_signer<OFT>(account);
        assert!(
            !is_oft_initialized<OFT>(),
            error::already_exists(EOFT_ALREADY_INITIALIZED),
        );

        // calculate the ld2sd rate
        let decimals = coin::decimals<OFT>();
        assert!(decimals >= shared_decimals, error::invalid_argument(EOFT_INVALID_DECIMALS));
        let ld2sd_rate = pow(10, ((decimals - shared_decimals) as u64));

        // init lz ua
        let lz_cap = endpoint::register_ua<OFT>(account);
        lzapp::init(account, lz_cap);
        remote::init(account);

        // default fee owner register if needed
        let fee_owner = address_of(account);
        if (!coin::is_account_registered<OFT>(fee_owner)) {
            coin::register<OFT>(account);
        };

        move_to(account, GlobalStore {
            proxy,
            lz_cap,
            ld2sd_rate,
            fee_config: FeeConfig {
                fee_owner,
                default_fee_bp: 0,
                chain_id_to_fee_bp: table::new(),
            },
            custom_adapter_params: false,
        });

        move_to(account, CoinStore<OFT> {
            claimable_amount: table::new(),
            locked_coin: coin::zero<OFT>()
        });

        move_to(account, EventStore {
            send_events: account::new_event_handle<SendEvent>(account),
            receive_events: account::new_event_handle<ReceiveEvent>(account),
            claim_events: account::new_event_handle<ClaimEvent>(account),
        });

        lz_cap
    }

    //
    // send and receive functions
    //
    public entry fun send<OFT>(
        sender: &signer,
        dst_chain_id: u64,
        dst_receiver: vector<u8>,
        amount: u64,
        min_amount: u64,
        native_fee: u64,
        zro_fee: u64,
        adapter_params: vector<u8>,
        msglib_params: vector<u8>,
    ) acquires EventStore, GlobalStore, CoinCapabilities, CoinStore {
        // withdraw coins from sender
        let coin = coin::withdraw<OFT>(sender, amount);
        let native_fee = withdraw_coin_if_needed<AptosCoin>(sender, native_fee);
        let zro_fee = withdraw_coin_if_needed<ZRO>(sender, zro_fee);

        let (coin_refund, native_refund, zro_refund) = send_coin_with_zro(
            coin,
            min_amount,
            dst_chain_id,
            dst_receiver,
            native_fee,
            zro_fee,
            adapter_params,
            msglib_params
        );

        // refund to sender if more than zero
        let sender_addr = address_of(sender);
        deposit_coin_if_needed(sender_addr, coin_refund);
        deposit_coin_if_needed(sender_addr, native_refund);
        deposit_coin_if_needed(sender_addr, zro_refund);
    }

    public fun send_coin<OFT>(
        coin: Coin<OFT>,
        min_amount: u64,
        dst_chain_id: u64,
        dst_receiver: vector<u8>,
        native_fee: Coin<AptosCoin>,
        adapter_params: vector<u8>,
        msglib_params: vector<u8>,
    ): (Coin<OFT>, Coin<AptosCoin>) acquires CoinStore, GlobalStore, CoinCapabilities, EventStore {
        let (coin_refund, native_refund, zro_refund) = send_coin_with_zro(
            coin,
            min_amount,
            dst_chain_id,
            dst_receiver,
            native_fee,
            coin::zero<ZRO>(),
            adapter_params,
            msglib_params
        );
        coin::destroy_zero(zro_refund);
        (coin_refund, native_refund)
    }

    public fun send_coin_with_zro<OFT>(
        coin: Coin<OFT>,
        min_amount: u64,
        dst_chain_id: u64,
        dst_receiver: vector<u8>,
        native_fee: Coin<AptosCoin>,
        zro_fee: Coin<ZRO>,
        adapter_params: vector<u8>,
        msglib_params: vector<u8>,
    ): (Coin<OFT>, Coin<AptosCoin>, Coin<ZRO>) acquires CoinStore, GlobalStore, CoinCapabilities, EventStore {
        assert_oft_initialized<OFT>();

        // check adapter params
        check_adapter_params<OFT>(dst_chain_id, &adapter_params);

        // pay fee
        pay_fee(&mut coin, dst_chain_id);

        // remove dust
        let oft_address = type_address<OFT>();
        let global_store = borrow_global<GlobalStore<OFT>>(oft_address);
        let dust_refund = remove_dust(&mut coin, global_store.ld2sd_rate);

        // check amount
        let amount = coin::value(&coin);
        assert!(amount > 0 && amount >= min_amount, error::invalid_state(EOFT_AMOUNT_TOO_SMALL));

        if (global_store.proxy) {
            // lock the coin
            let coin_store = borrow_global_mut<CoinStore<OFT>>(oft_address);
            coin::merge(&mut coin_store.locked_coin, coin);
        } else {
            // burn the coin
            let caps = borrow_global<CoinCapabilities<OFT>>(oft_address);
            coin::burn(coin, &caps.burn_cap);
        };

        // send lz msg
        let amount_sd = ld2sd(amount, global_store.ld2sd_rate);
        let payload = encode_send_payload(dst_receiver, amount_sd);
        let dst_address = remote::get(oft_address, dst_chain_id);
        let (_, native_refund, zro_refund) = lzapp::send_with_zro<OFT>(
            dst_chain_id,
            dst_address,
            payload,
            native_fee,
            zro_fee,
            adapter_params,
            msglib_params,
            &global_store.lz_cap
        );

        // emit event
        let event_store = borrow_global_mut<EventStore>(oft_address);
        event::emit_event<SendEvent>(
            &mut event_store.send_events,
            SendEvent {
                dst_chain_id,
                dst_receiver,
                amount,
            },
        );

        (dust_refund, native_refund, zro_refund)
    }

    public fun lz_receive<OFT>(
        src_chain_id: u64,
        src_address: vector<u8>,
        payload: vector<u8>,
    ) acquires EventStore, CoinStore, GlobalStore, CoinCapabilities {
        assert_oft_initialized<OFT>();

        let oft_address = type_address<OFT>();
        let global_store = borrow_global<GlobalStore<OFT>>(oft_address);
        let event_store = borrow_global_mut<EventStore>(oft_address);

        // verify and decode payload
        remote::assert_remote(oft_address, src_chain_id, src_address);
        endpoint::lz_receive(src_chain_id, src_address, payload, &global_store.lz_cap);

        let (receiver, amount_sd) = decode_send_payload(&payload);

        let amount = sd2ld(amount_sd, global_store.ld2sd_rate);
        let stashed = unlock_or_mint_coin<OFT>(receiver, amount);

        event::emit_event<ReceiveEvent>(
            &mut event_store.receive_events,
            ReceiveEvent {
                src_chain_id,
                receiver,
                amount,
                stashed
            },
        );
    }

    public entry fun claim<OFT>(receiver: &signer) acquires EventStore, CoinStore {
        assert_oft_initialized<OFT>();

        // register the user if needed
        let receiver_addr = address_of(receiver);
        if (!coin::is_account_registered<OFT>(receiver_addr)) {
            coin::register<OFT>(receiver);
        };

        // assert the receiver has receivable and it is more than 0
        let oft_address = type_address<OFT>();
        let coin_store = borrow_global_mut<CoinStore<OFT>>(oft_address);
        assert!(
            table::contains(&coin_store.claimable_amount, receiver_addr),
            error::not_found(EOFT_CLAIMABLE_COIN_NOT_FOUND)
        );

        let claimable = table::remove(&mut coin_store.claimable_amount, receiver_addr);
        assert!(claimable > 0, error::not_found(EOFT_CLAIMABLE_COIN_NOT_FOUND));

        let unlocked_coin = coin::extract(&mut coin_store.locked_coin, claimable);
        coin::deposit(receiver_addr, unlocked_coin);

        let event_store = borrow_global_mut<EventStore>(oft_address);
        event::emit_event(
            &mut event_store.claim_events,
            ClaimEvent {
                receiver: receiver_addr,
                amount: claimable,
            }
        );
    }

    //
    // admin functions
    //
    public entry fun set_default_fee<OFT>(account: &signer, fee_bp: u64) acquires GlobalStore {
        assert_type_signer<OFT>(account);
        assert_oft_initialized<OFT>();
        assert!(fee_bp <= BP_DENOMINATOR, error::invalid_argument(EOFT_INVALID_FEE_BP));

        let oft_address = type_address<OFT>();
        let store = borrow_global_mut<GlobalStore<OFT>>(oft_address);
        store.fee_config.default_fee_bp = fee_bp;
    }

    public entry fun set_fee<OFT>(
        account: &signer,
        dst_chain_id: u64,
        enabled: bool,
        fee_bp: u64
    ) acquires GlobalStore {
        assert_type_signer<OFT>(account);
        assert_oft_initialized<OFT>();
        assert!(fee_bp <= BP_DENOMINATOR, error::invalid_argument(EOFT_INVALID_FEE_BP));

        let oft_address = type_address<OFT>();
        let store = borrow_global_mut<GlobalStore<OFT>>(oft_address);
        if (enabled) {
            table::upsert(&mut store.fee_config.chain_id_to_fee_bp, dst_chain_id, fee_bp);
        } else {
            table::remove(&mut store.fee_config.chain_id_to_fee_bp, dst_chain_id);
        }
    }

    public entry fun set_fee_owner<OFT>(account: &signer, new_owner: address) acquires GlobalStore {
        assert_type_signer<OFT>(account);
        assert_oft_initialized<OFT>();
        assert!(coin::is_account_registered<OFT>(new_owner), error::invalid_argument(EOFT_UNREGISTERED_FEE_OWNER));

        let store = borrow_global_mut<GlobalStore<OFT>>(type_address<OFT>());
        store.fee_config.fee_owner = new_owner;
    }

    public entry fun enable_custom_adapter_params<OFT>(account: &signer, enabled: bool) acquires GlobalStore {
        assert_type_signer<OFT>(account);
        assert_oft_initialized<OFT>();

        let store = borrow_global_mut<GlobalStore<OFT>>(type_address<OFT>());
        store.custom_adapter_params = enabled;
    }

    //
    // public view functions
    //
    public fun quote_fee<OFT>(
        dst_chain_id: u64,
        dst_receiver: vector<u8>,
        amount: u64,
        pay_in_zro: bool,
        adapter_params: vector<u8>,
        msglib_params: vector<u8>,
    ): (u64, u64) acquires GlobalStore {
        assert_oft_initialized<OFT>();
        check_adapter_params<OFT>(dst_chain_id, &adapter_params);

        let oft_address = type_address<OFT>();
        let global_store = borrow_global<GlobalStore<OFT>>(oft_address);

        let amount_sd = ld2sd(amount, global_store.ld2sd_rate);
        let payload = encode_send_payload(dst_receiver, amount_sd);
        endpoint::quote_fee(
            oft_address,
            dst_chain_id,
            vector::length(&payload),
            pay_in_zro,
            adapter_params,
            msglib_params
        )
    }

    public fun is_oft_initialized<OFT>(): bool {
        exists<GlobalStore<OFT>>(type_address<OFT>())
    }

    public fun is_proxy<OFT>(): bool acquires GlobalStore {
        assert_oft_initialized<OFT>();
        let global_store = borrow_global<GlobalStore<OFT>>(type_address<OFT>());
        global_store.proxy
    }

    public fun get_claimable_amount<OFT>(receiver: address): u64 acquires CoinStore {
        assert_oft_initialized<OFT>();

        let coin_store = borrow_global<CoinStore<OFT>>(type_address<OFT>());
        if (!table::contains(&coin_store.claimable_amount, receiver)) {
            return 0
        };

        *table::borrow(&coin_store.claimable_amount, receiver)
    }

    public fun quote_oft_fee<OFT>(dst_chain_id: u64, amount: u64): u64 acquires GlobalStore {
        assert_oft_initialized<OFT>();

        let store = borrow_global<GlobalStore<OFT>>(type_address<OFT>());
        if (table::contains(&store.fee_config.chain_id_to_fee_bp, dst_chain_id)) {
            let fee_bp = *table::borrow(&store.fee_config.chain_id_to_fee_bp, dst_chain_id);
            amount * fee_bp / BP_DENOMINATOR
        } else if (store.fee_config.default_fee_bp > 0) {
            amount * store.fee_config.default_fee_bp / BP_DENOMINATOR
        } else {
            0
        }
    }

    //
    // internal functions
    //
    fun unlock_or_mint_coin<OFT>(
        receiver: address,
        amount: u64
    ): bool acquires CoinStore, GlobalStore, CoinCapabilities {
        let oft_address = type_address<OFT>();
        let global_store = borrow_global<GlobalStore<OFT>>(oft_address);
        let coin_store = borrow_global_mut<CoinStore<OFT>>(oft_address);
        let stashed = !coin::is_account_registered<OFT>(receiver);
        if (stashed) {
            let claimable = table::borrow_mut_with_default(&mut coin_store.claimable_amount, receiver, 0);
            *claimable = *claimable + amount;

            // if stashed and the coin is non-proxy oft, then mint the coin and lock it
            if (!global_store.proxy) {
                let caps = borrow_global<CoinCapabilities<OFT>>(oft_address);
                let coin_minted = coin::mint(amount, &caps.mint_cap);
                coin::merge(&mut coin_store.locked_coin, coin_minted);
            }
        } else {
            // mint / unlock the coin, and deposit it
            let coin = if (global_store.proxy) {
                coin::extract<OFT>(&mut coin_store.locked_coin, amount)
            } else {
                let caps = borrow_global<CoinCapabilities<OFT>>(oft_address);
                coin::mint<OFT>(amount, &caps.mint_cap)
            };
            coin::deposit(receiver, coin);
        };
        stashed
    }

    fun pay_fee<OFT>(coin: &mut Coin<OFT>, dst_chain_id: u64) acquires GlobalStore {
        let oft_fee = quote_oft_fee<OFT>(dst_chain_id, coin::value(coin));
        if (oft_fee > 0) {
            let global_store = borrow_global<GlobalStore<OFT>>(type_address<OFT>());
            let fee_coin = coin::extract<OFT>(coin, oft_fee);
            coin::deposit(global_store.fee_config.fee_owner, fee_coin);
        };
    }

    fun withdraw_coin_if_needed<CoinType>(account: &signer, amount: u64): Coin<CoinType> {
        if (amount > 0) {
            coin::withdraw<CoinType>(account, amount)
        } else {
            coin::zero<CoinType>()
        }
    }

    fun deposit_coin_if_needed<CoinType>(account: address, coin: Coin<CoinType>) {
        if (coin::value(&coin) > 0) {
            coin::deposit(account, coin);
        } else {
            coin::destroy_zero(coin);
        }
    }

    fun assert_oft_initialized<OFT>() {
        assert!(is_oft_initialized<OFT>(), error::not_found(EOFT_NOT_INITIALIZED));
    }

    fun encode_send_payload(dst_receiver: vector<u8>, amount_sd: u64): vector<u8> {
        assert_length(&dst_receiver, 32);

        let payload = vector::empty<u8>();
        serde::serialize_u8(&mut payload, PT_SEND);
        serde::serialize_vector(&mut payload, dst_receiver);
        serde::serialize_u64(&mut payload, amount_sd);
        payload
    }

    fun decode_send_payload(payload: &vector<u8>): (address, u64) {
        // on aptos side, ignore send_and_call payload
        // evm always sends with packet_type(1) + receiver(32) + amount(8) + calldata(x)
        let receiver_bytes = vector_slice(payload, 1, 33);
        let receiver = from_bcs::to_address(receiver_bytes);
        let amount_sd = serde::deserialize_u64(&vector_slice(payload, 33, 41));
        (receiver, amount_sd)
    }

    fun check_adapter_params<OFT>(dst_chain_id: u64, adapter_params: &vector<u8>) acquires GlobalStore {
        let oft_address = type_address<OFT>();
        let global_store = borrow_global<GlobalStore<OFT>>(oft_address);
        if (global_store.custom_adapter_params) {
            lzapp::assert_gas_limit(oft_address, dst_chain_id, (PT_SEND as u64), adapter_params, 0);
        } else {
            assert!(vector::is_empty(adapter_params), error::invalid_argument(EOFT_INVALID_ADAPTER_PARAMS));
        }
    }

    fun ld2sd(amount: u64, ld2sd_rate: u64): u64 {
        amount / ld2sd_rate
    }

    fun sd2ld(amount: u64, ld2sd_rate: u64): u64 {
        amount * ld2sd_rate
    }

    fun remove_dust<OFT>(coin: &mut Coin<OFT>, ld2sd_rate: u64): Coin<OFT> {
        let dust = coin::value(coin) % ld2sd_rate;
        coin::extract(coin, dust)
    }

    //
    // test functions
    //
    #[test_only]
    public fun get_total_locked_coin<OFT>(): u64 acquires CoinStore {
        let coin_store = borrow_global<CoinStore<OFT>>(type_address<OFT>());
        coin::value(&coin_store.locked_coin)
    }

    #[test_only]
    public fun encode_send_payload_for_testing(dst_receiver: vector<u8>, amount: u64): vector<u8> {
        encode_send_payload(dst_receiver, amount)
    }

    #[test_only]
    public fun setup(aptos: &signer, core_resources: &signer, addresses: &vector<address>) {
        use aptos_framework::aptos_account;
        use aptos_framework::aptos_coin;

        let core_resources_addr = address_of(core_resources);

        // init the aptos_coin and give counter the mint ability.
        let (burn_cap, mint_cap) = aptos_coin::initialize_for_test(aptos);

        aptos_account::create_account(core_resources_addr);
        let coins = coin::mint<AptosCoin>(
            18446744073709551615,
            &mint_cap,
        );
        coin::deposit<AptosCoin>(address_of(core_resources), coins);

        let i = 0;
        while (i < vector::length(addresses)) {
            aptos_account::transfer(core_resources, *vector::borrow(addresses, i), 100000000000);
            i = i + 1
        };

        coin::destroy_burn_cap(burn_cap);
        coin::destroy_mint_cap(mint_cap);
    }

    #[test]
    fun test_encode_and_decode_send_payload() {
        use std::bcs;

        let receiver = @0x123456;
        let receiver_bytes = bcs::to_bytes(&receiver);
        let amount = 100;
        let payload = encode_send_payload(receiver_bytes, amount);
        assert!(payload == x"0000000000000000000000000000000000000000000000000000000000001234560000000000000064", 0);

        let (actual_receiver, actual_amount) = decode_send_payload(&payload);
        assert!(actual_receiver == receiver, 0);
        assert!(amount == actual_amount, 0);
    }

    #[test]
    #[expected_failure(abort_code = 0x10000)]
    fun test_decode_invalid_send_payload() {
        decode_send_payload(&x"00031234560000000000000001");
    }

    #[test]
    fun test_decode_send_and_call_payload() {
        use std::bcs;

        let receiver = @0x123456;
        let receiver_bytes = bcs::to_bytes(&receiver);
        let amount = 100;

        let payload = vector::empty<u8>();
        serde::serialize_u8(&mut payload, PT_SEND_AND_CALL);
        serde::serialize_vector(&mut payload, receiver_bytes);
        serde::serialize_u64(&mut payload, amount);
        serde::serialize_u64(&mut payload, 123);
        assert!(vector::length(&payload) >= 42, 0);

        let (actual_receiver, actual_amount) = decode_send_payload(&payload);
        assert!(actual_receiver == receiver, 0);
        assert!(amount == actual_amount, 0);
    }

    #[test_only]
    use layerzero::test_helpers;
    #[test_only]
    use test::test::MoonOFT;

    #[test_only]
    fun initialize(account: &signer) {
        let lz_cap = init_oft<MoonOFT>(account, b"Moon OFT", b"Moon", 5, 3);
        endpoint::destroy_ua_cap(lz_cap);
    }

    #[test(
        aptos = @aptos_framework,
        core_resources = @core_resources,
        layerzero = @layerzero,
        msglib_auth = @msglib_auth,
        oracle = @1234,
        relayer = @5678,
        executor = @1357,
        executor_auth = @executor_auth,
        oft = @test,
    )]
    fun test_quote_oft_fee(
        aptos: &signer,
        core_resources: &signer,
        layerzero: &signer,
        msglib_auth: &signer,
        oracle: &signer,
        relayer: &signer,
        executor: &signer,
        executor_auth: &signer,
        oft: &signer,
    ) acquires GlobalStore {
        setup(
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
            ],
        );

        // prepare the endpoint and init oft
        let (local_chain_id, remote_chain_id) = (20030, 20031);
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
        initialize(oft);

        // default fee is 0%
        let fee = quote_oft_fee<MoonOFT>(remote_chain_id, 5000);
        assert!(fee == 0, 0);

        // change default fee to 10%
        set_default_fee<MoonOFT>(oft, 1000);
        let fee = quote_oft_fee<MoonOFT>(remote_chain_id, 5000);
        assert!(fee == 500, 0);

        // change fee to 20% for remote chain
        set_fee<MoonOFT>(oft, remote_chain_id, true, 2000);
        let fee = quote_oft_fee<MoonOFT>(remote_chain_id, 5000);
        assert!(fee == 1000, 0);

        // change fee to 0% for remote chain
        set_fee<MoonOFT>(oft, remote_chain_id, true, 0);
        let fee = quote_oft_fee<MoonOFT>(remote_chain_id, 5000);
        assert!(fee == 0, 0);

        // disable fee for remote chain
        set_fee<MoonOFT>(oft, remote_chain_id, false, 0);
        let fee = quote_oft_fee<MoonOFT>(remote_chain_id, 5000);
        assert!(fee == 500, 0);
    }
}

#[test_only]
module test::test {
    struct MoonOFT {}
}

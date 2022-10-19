module layerzero::endpoint {
    use layerzero_common::packet::{Self, Packet};
    use layerzero_common::utils::{assert_u16, type_address, assert_type_signer, assert_signer};
    use layerzero::channel;
    use layerzero::msglib_router;
    use std::error;
    use std::bcs;
    use aptos_std::table::{Self, Table};
    use aptos_framework::coin::{Coin};
    use aptos_framework::aptos_coin::AptosCoin;
    use layerzero::msglib_config;
    use aptos_std::event::{Self, EventHandle};
    use aptos_std::type_info::{TypeInfo, type_of};
    use aptos_framework::account::new_event_handle;
    use layerzero::executor_config;
    use layerzero::executor_router;
    use zro::zro::ZRO;
    use std::hash::{Self, sha3_256};
    use layerzero::bulletin;
    use msglib_auth::msglib_cap::{Self, MsgLibSendCapability, MsgLibReceiveCapability};
    use layerzero_common::semver::{Self, SemVer};
    use executor_auth::executor_cap::{Self, ExecutorCapability};

    const ELAYERZERO_STORE_ALREADY_PUBLISHED: u64 = 0x00;
    const ELAYERZERO_INVALID_CHAIN_ID: u64 = 0x01;
    const ELAYERZERO_INVALID_DST_ADDRESS: u64 = 0x02;
    const ELAYERZERO_UA_ALREADY_REGISTERED: u64 = 0x03;
    const ELAYERZERO_INVALID_PAYLOAD: u64 = 0x04;
    const ELAYERZERO_UA_NOT_REGISTERED: u64 = 0x05;

    struct UaCapability<phantom UA> has store, copy {}

    struct ChainConfig has key {
        local_chain_id: u64,
    }

    struct UaRegistry has key {
        register_events: EventHandle<TypeInfo>,
        ua_infos: Table<address, TypeInfo>
    }

    struct Capabilities has key {
        send_caps: Table<SemVer, MsgLibSendCapability>,
        executor_caps: Table<u64, ExecutorCapability>
    }

    //
    // layerzero admin functions
    //
    public entry fun init(account: &signer, local_chain_id: u64) {
        assert_signer(account, @layerzero);
        assert_u16(local_chain_id);

        // assert the endpoint has not been initialized
        assert!(
            !exists<ChainConfig>(@layerzero),
            error::already_exists(ELAYERZERO_STORE_ALREADY_PUBLISHED)
        );

        move_to(account, ChainConfig {
            local_chain_id,
        });

        move_to(account, UaRegistry {
            register_events: new_event_handle<TypeInfo>(account),
            ua_infos: table::new(),
        });

        move_to(account, Capabilities {
            send_caps: table::new(),
            executor_caps: table::new()
        });
    }
    
    //
    // Executor Auth only
    //
    public entry fun register_executor<EXECUTOR>(account: &signer) acquires Capabilities {
        let (next_version, cap) = executor_cap::new_version(account); //authenticated in function
        executor_config::register_executor<EXECUTOR>(next_version);

        let caps = borrow_global_mut<Capabilities>(@layerzero);
        table::add(&mut caps.executor_caps, next_version, cap);
    }

    //
    // Msblib Auth only. Normally this function is called by the msglib_recieve module
    //
    public fun register_msglib<MSGLIB>(account: &signer, major: bool): MsgLibReceiveCapability acquires Capabilities {
        let (next_version, send_cap, receive_cap) = msglib_cap::new_version<MSGLIB>(account, major);
        msglib_config::register_msglib<MSGLIB>(next_version);

        let caps = borrow_global_mut<Capabilities>(@layerzero);
        table::add(&mut caps.send_caps, next_version, send_cap);

        // also register the bulletins
        bulletin::init_msglib_bulletin(next_version);

        receive_cap
    }

    //
    // UA authenticated functions
    //
    public fun register_ua<UA>(account: &signer): UaCapability<UA> acquires UaRegistry {
        // insert to the registry
        insert_ua<UA>(account);

        // init message channel
        channel::register<UA>(account);

        // init msglib configuration
        msglib_config::init_msglib_config<UA>(account);

        // insert executor configuration
        executor_config::init_executor_config<UA>(account);

        // init bulletin
        bulletin::init_ua_bulletin<UA>(account);

        // return ua capability
        UaCapability<UA> {}
    }

    // 1 account can only register 1 UA
    fun insert_ua<UA>(account: &signer) acquires UaRegistry {
        assert_type_signer<UA>(account);

        let regsitry = borrow_global_mut<UaRegistry>(@layerzero);
        let type_address = type_address<UA>();
        assert!(
            !table::contains(&regsitry.ua_infos, type_address),
            error::already_exists(ELAYERZERO_UA_ALREADY_REGISTERED)
        );

        let type_info = type_of<UA>();
        table::add(&mut regsitry.ua_infos, type_address, type_info);

        event::emit_event<TypeInfo>(
            &mut regsitry.register_events,
            type_info,
        );
    }

    // forward to proxy
    public fun set_config<UA>(
        major_version: u64,
        minor_version: u8,
        chain_id: u64,
        config_type: u8,
        config_bytes: vector<u8>,
        _cap: &UaCapability<UA>
    ) acquires Capabilities {
        assert_u16(chain_id);
        let version = semver::build_version(major_version, minor_version);
        let cap_store = borrow_global<Capabilities>(@layerzero);
        let cap = table::borrow(&cap_store.send_caps, version);
        msglib_router::set_config<UA>(chain_id, config_type, config_bytes, cap);
    }

    public fun set_send_msglib<UA>(chain_id: u64, major_version: u64, minor_version: u8, _cap: &UaCapability<UA>) {
        assert_u16(chain_id);
        let version = semver::build_version(major_version, minor_version);
        msglib_config::set_send_msglib<UA>(chain_id, version);
    }

    public fun set_receive_msglib<UA>(chain_id: u64, major_version: u64, minor_version: u8, _cap: &UaCapability<UA>) {
        assert_u16(chain_id);
        let version = semver::build_version(major_version, minor_version);
        msglib_config::set_receive_msglib<UA>(chain_id, version);
    }

    public fun set_executor<UA>(chain_id: u64, version: u64, executor: address, _cap: &UaCapability<UA>) {
        assert_u16(chain_id);
        executor_config::set_executor<UA>(chain_id, version, executor);
    }

    public fun destroy_ua_cap<UA>(cap: UaCapability<UA>) {
        let UaCapability<UA> { } = cap;
    }

    public fun bulletin_ua_write<UA>(key: vector<u8>, value: vector<u8>, _cap: &UaCapability<UA>) {
        let ua_address = type_address<UA>();
        bulletin::ua_write(ua_address, key, value);
    }

    public fun bulletin_msglib_write(key: vector<u8>, value: vector<u8>, cap: &MsgLibReceiveCapability) {
        let version = msglib_cap::receive_version(cap);
        bulletin::msglib_write(version, key, value);
    }

    //
    // UA authenticated functions - packet related
    //
    public fun send<UA>(
        dst_chain_id: u64,
        dst_address: vector<u8>,
        payload: vector<u8>,
        native_fee: Coin<AptosCoin>,
        zro_fee: Coin<ZRO>,
        adapter_params: vector<u8>,
        msglib_params: vector<u8>,
        _cap: &UaCapability<UA>
    ): (u64, Coin<AptosCoin>, Coin<ZRO>) acquires ChainConfig, Capabilities {
        assert_u16(dst_chain_id);

        let nonce = channel::outbound<UA>(dst_chain_id, dst_address);

        let packet = packet::new_packet(
            get_local_chain_id(),
            bcs::to_bytes(&type_address<UA>()),
            dst_chain_id,
            dst_address,
            nonce,
            payload
        );

        // handle msglib
        let send_version = msglib_config::get_send_msglib(type_address<UA>(), dst_chain_id);
        let cap_store = borrow_global<Capabilities>(@layerzero);
        let send_cap = table::borrow(&cap_store.send_caps, send_version);
        let (refund_native, refund_zro) = msglib_router::send<UA>(&packet, native_fee, zro_fee, msglib_params, send_cap);

        // handle executor
        refund_native = handle_executor<UA>(&packet, adapter_params, refund_native);

        (nonce, refund_native, refund_zro)
    }

    fun handle_executor<UA>(
        packet: &Packet,
        adapter_params: vector<u8>,
        fee: Coin<AptosCoin>
    ): Coin<AptosCoin> acquires Capabilities {
        let (version, executor) = get_executor(type_address<UA>(), packet::dst_chain_id((packet)));
        let caps = borrow_global<Capabilities>(@layerzero);
        let cap = table::borrow(&caps.executor_caps, version);
        executor_router::request<UA>(
            executor,
            packet,
            adapter_params,
            fee,
            cap
        )
    }

    // call from lz_receive
    public fun lz_receive<UA>(
        src_chain_id: u64,
        src_address: vector<u8>,
        payload: vector<u8>,
        _cap: &UaCapability<UA>
    ): u64 {
        assert_u16(src_chain_id);
        let (nonce, payload_hash) = channel::inbound<UA>(src_chain_id, src_address);
        assert!(payload_hash == sha3_256(payload), error::invalid_argument(ELAYERZERO_INVALID_PAYLOAD));
        nonce
    }

    // only receive packets from the UA-configured MSGLIB
    public fun receive<UA>(packet: Packet, cap: &MsgLibReceiveCapability) acquires ChainConfig, UaRegistry {
        // assert UA type
        assert!(is_ua_registered<UA>(), error::not_found(ELAYERZERO_UA_NOT_REGISTERED));

        // assert src chain id
        let src_chain_id = packet::src_chain_id(&packet);
        assert_u16(src_chain_id);

        // assert mgslib is same to ua config
        let ua_address = type_address<UA>();
        let version = msglib_cap::receive_version(cap);
        msglib_config::assert_receive_msglib(ua_address, src_chain_id, version);

        // assert the packet is targetting at the UA
        assert!(
            packet::dst_address(&packet) == bcs::to_bytes(&ua_address),
            error::invalid_argument(ELAYERZERO_INVALID_DST_ADDRESS),
        );

        // assert the packet is targetting at this chain
        assert!(
            packet::dst_chain_id(&packet) == get_local_chain_id(),
            error::invalid_argument(ELAYERZERO_INVALID_CHAIN_ID)
        );

        // nonce will be checked in the channel module
        channel::receive<UA>(
            src_chain_id,
            packet::src_address(&packet),
            packet::nonce(&packet),
            hash::sha3_256(packet::payload(&packet)),
        );
    }

    //
    // public view functions
    //
    public fun is_ua_registered<UA>(): bool acquires UaRegistry {
        let ua_address = type_address<UA>();
        let registry = borrow_global<UaRegistry>(@layerzero);
        if (!table::contains(&registry.ua_infos, ua_address)) {
            return false
        };

        let ua_info = table::borrow(&registry.ua_infos, ua_address);
        return type_of<UA>() == *ua_info
    }

    public fun get_next_guid(ua_address: address, dst_chain_id: u64, dst_address: vector<u8>): vector<u8> acquires ChainConfig {
        let chain_id = get_local_chain_id();
        let next_nonce = channel::outbound_nonce(ua_address, dst_chain_id, dst_address) + 1;

        packet::compute_guid(next_nonce, chain_id, bcs::to_bytes(&ua_address), dst_chain_id, dst_address)
    }

    public fun quote_fee(ua_address: address, dst_chain_id: u64, payload_size: u64, pay_in_zro: bool, adapter_params: vector<u8>, msglib_params: vector<u8>): (u64, u64) {
        let msglib_version = msglib_config::get_send_msglib(ua_address, dst_chain_id);
        let (native_fee, zro_fee)  = msglib_router::quote(ua_address, msglib_version, dst_chain_id, payload_size, pay_in_zro, msglib_params);

        let (executor_version, executor) = executor_config::get_executor(ua_address, dst_chain_id);
        let executor_fee=  executor_router::quote(ua_address, executor_version, executor, dst_chain_id, adapter_params);

        (native_fee + executor_fee, zro_fee)
    }

    public fun has_next_receive(ua_address: address, src_chain_id: u64, src_address: vector<u8>): bool {
        channel::have_next_inbound(ua_address, src_chain_id, src_address)
    }

    public fun outbound_nonce(ua_address: address, dst_chain_id: u64, dst_address: vector<u8>): u64 {
        channel::outbound_nonce(ua_address, dst_chain_id, dst_address)
    }

    public fun inbound_nonce(ua_address: address, src_chain_id: u64, src_address: vector<u8>): u64 {
        channel::inbound_nonce(ua_address, src_chain_id, src_address)
    }

    public fun get_default_send_msglib(chain_id: u64): (u64, u8) {
        let version = msglib_config::get_default_send_msglib(chain_id);
        semver::values(&version)
    }

    public fun get_default_receive_msglib(chain_id: u64): (u64, u8) {
        let version = msglib_config::get_default_receive_mgslib(chain_id);
        semver::values(&version)
    }

    public fun get_default_executor(chain_id: u64): (u64, address) {
        executor_config::get_default_executor(chain_id)
    }

    public fun get_ua_type_by_address(addr: address): TypeInfo acquires UaRegistry {
        let regsitry = borrow_global<UaRegistry>(@layerzero);
        *table::borrow(&regsitry.ua_infos, addr)
    }

    public fun get_local_chain_id(): u64 acquires ChainConfig {
        borrow_global<ChainConfig>(@layerzero).local_chain_id
    }

    public fun get_config(ua_address: address, major_version: u64, minor_version: u8, chain_id: u64, config_type: u8): vector<u8> {
        let version = semver::build_version(major_version, minor_version);
        msglib_router::get_config(ua_address, version, chain_id, config_type)
    }

    public fun get_send_msglib(ua_address: address, chain_id: u64): (u64, u8) {
        let version = msglib_config::get_send_msglib(ua_address, chain_id);
        semver::values(&version)
    }

    public fun get_receive_msglib(ua_address: address, chain_id: u64): (u64, u8) {
        let verison = msglib_config::get_receive_msglib(ua_address, chain_id);
        semver::values(&verison)
    }

    public fun get_executor(ua_address: address, chain_id: u64): (u64, address) {
        executor_config::get_executor(ua_address, chain_id)
    }

    public fun bulletin_ua_read(ua_address: address, key: vector<u8>): vector<u8> {
        bulletin::ua_read(ua_address, key)
    }

    public fun bulletin_msglib_read(major_version: u64, minor_version: u8, key: vector<u8>): vector<u8> {
        let version = semver::build_version(major_version, minor_version);
        bulletin::msglib_read(version, key)
    }

    //
    // Tests
    //
    #[test_only]
    struct ExampleType {}

    #[test_only]
    struct ExampleType2 {}

    #[test_only]
    struct UACapStore has key {
        cap: UaCapability<ExampleType>,
    }

    #[test(lz = @layerzero)]
    fun test_register_ua(lz: &signer) acquires UaRegistry {
        use aptos_framework::aptos_account;

        aptos_account::create_account(@layerzero);

        init(lz, 77);

        let cap = register_ua<ExampleType>(lz);
        // store the cap
        move_to(lz, UACapStore{ cap });
    }

    #[test(lz = @layerzero)]
    #[expected_failure(abort_code = 0x80003)]
    fun test_register_two_ua_in_same_address(lz: &signer) acquires UaRegistry {
        use aptos_framework::aptos_account;

        aptos_account::create_account(@layerzero);

        init(lz, 77);

        let cap = register_ua<ExampleType>(lz);
        destroy_ua_cap(cap);

        // should fail to register another ua in the same address
        let cap = register_ua<ExampleType2>(lz);
        destroy_ua_cap(cap);
    }
}
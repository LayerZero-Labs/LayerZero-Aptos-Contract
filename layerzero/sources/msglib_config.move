module layerzero::msglib_config {
    use aptos_std::table::{Self, Table};
    use aptos_std::type_info::{TypeInfo, type_of};
    use layerzero_common::utils::{assert_u16, type_address, assert_type_signer };
    use std::error;
    use aptos_std::event::{Self, EventHandle};
    use aptos_framework::account;
    use layerzero_common::semver::{Self, SemVer, build_version };
    use layerzero::admin;

    friend layerzero::endpoint;

    const ELAYERZERO_MSGLIB_EXISTED: u64 = 0x00;
    const ELAYERZERO_INVALID_VERSION: u64 = 0x01;
    const ELAYERZERO_UNSET_DEFAULT_MSGLIB: u64 = 0x02;
    const ELAYERZERO_MSGLIB_UNREGISTERED: u64 = 0x03;
    const ELAYERZERO_INVALID_MSGLIB: u64 = 0x04;

    struct MsgLibRegistry has key {
        type_to_version: Table<TypeInfo, SemVer>,
        version_to_type: Table<SemVer, TypeInfo>,
    }

    // default config will be stored at @layerzero
    // ua's config will be stored at @ua
    struct MsgLibConfig has key {
        // chain id -> version
        send_version: Table<u64, SemVer>,
        // chain id -> version
        receive_version: Table<u64, SemVer>,
    }

    // registration constructs
    struct EventStore has key {
        register_events: EventHandle<RegisterEvent>,
    }

    struct RegisterEvent has drop, store {
        type_info: TypeInfo,
        version: SemVer,
    }

    fun init_module(account: &signer) {
        move_to(account, MsgLibRegistry {
            type_to_version: table::new(),
            version_to_type: table::new(),
        });

        move_to(account, EventStore {
            register_events: account::new_event_handle<RegisterEvent>(account),
        });

        // the default configuration
        move_to(account, MsgLibConfig {
            send_version: table::new(),
            receive_version: table::new(),
        });
    }

    //
    // msglib auth only
    //
    public(friend) fun register_msglib<MSGLIB>(version: SemVer) acquires MsgLibRegistry, EventStore {
        assert!(!is_msglib_registered<MSGLIB>(), error::already_exists(ELAYERZERO_MSGLIB_EXISTED));
        assert!(!semver::is_blocking_or_default(&version), error::invalid_argument(ELAYERZERO_INVALID_VERSION));

        let registry = borrow_global_mut<MsgLibRegistry>(@layerzero);
        let type_info = type_of<MSGLIB>();
        table::add(&mut registry.type_to_version, type_info, version);
        table::add(&mut registry.version_to_type, version, type_info);

        let event_store = borrow_global_mut<EventStore>(@layerzero);
        event::emit_event<RegisterEvent>(
            &mut event_store.register_events,
            RegisterEvent {
                type_info,
                version,
            },
        );
    }

    //
    // admin only
    //
    public entry fun set_default_send_msglib(account: &signer, chain_id: u64, major_version: u64, minor_version: u8) acquires MsgLibConfig, MsgLibRegistry {
        admin::assert_config_admin(account);
        let config = borrow_global_mut<MsgLibConfig>(@layerzero);
        set_default_msglib(&mut config.send_version, chain_id, build_version(major_version, minor_version));
    }

    public entry fun set_default_receive_msglib(account: &signer, chain_id: u64, major_version: u64, minor_version: u8) acquires MsgLibConfig, MsgLibRegistry {
        admin::assert_config_admin(account);
        let config = borrow_global_mut<MsgLibConfig>(@layerzero);
        set_default_msglib(&mut config.receive_version, chain_id, build_version(major_version, minor_version));
    }

    fun set_default_msglib(lib_version: &mut Table<u64, SemVer>, chain_id: u64, version: SemVer) acquires MsgLibRegistry {
        assert_u16(chain_id);
        assert!(semver::is_blocking(&version) || is_version_registered(version), error::invalid_argument(ELAYERZERO_INVALID_VERSION));
        table::upsert(lib_version, chain_id, version);
    }

    //
    // ua functions
    //
    public(friend) fun init_msglib_config<UA>(account: &signer) {
        assert_type_signer<UA>(account);
        move_to(account, MsgLibConfig {
            send_version: table::new(),
            receive_version: table::new(),
        });
    }

    public(friend) fun set_send_msglib<UA>(chain_id: u64, version: SemVer) acquires MsgLibConfig, MsgLibRegistry {
        let config = borrow_global_mut<MsgLibConfig>(type_address<UA>());
        set_ua_msglib(&mut config.send_version, chain_id, version);
    }

    public(friend) fun set_receive_msglib<UA>(chain_id: u64, version: SemVer) acquires MsgLibConfig, MsgLibRegistry {
        let config = borrow_global_mut<MsgLibConfig>(type_address<UA>());
        set_ua_msglib(&mut config.receive_version, chain_id, version);
    }

    fun set_ua_msglib(lib_version: &mut Table<u64, SemVer>, chain_id: u64, version: SemVer) acquires MsgLibRegistry {
        assert_u16(chain_id);
        assert!(
            semver::is_blocking_or_default(&version) || is_version_registered(version),
            error::invalid_argument(ELAYERZERO_INVALID_VERSION)
        );
        table::upsert(lib_version, chain_id, version);
    }

    //
    // view functions
    //
    public fun get_send_msglib(ua_address: address, chain_id: u64): SemVer acquires MsgLibConfig {
        let version = get_send_version(ua_address, chain_id);
        if (semver::is_default(&version)) {
            get_default_send_msglib(chain_id)
        } else {
            version
        }
    }

    public fun get_receive_msglib(ua_address: address, chain_id: u64): SemVer acquires MsgLibConfig {
        let version = get_receive_version(ua_address, chain_id);
        if (semver::is_default(&version)) {
            get_default_receive_mgslib(chain_id)
        } else {
            version
        }
    }

    public fun get_default_send_msglib(chain_id: u64): SemVer acquires MsgLibConfig {
        let config = borrow_global<MsgLibConfig>(@layerzero);
        assert!(table::contains(&config.send_version, chain_id), error::invalid_argument(ELAYERZERO_UNSET_DEFAULT_MSGLIB));
        *table::borrow(&config.send_version, chain_id)
    }

    public fun get_default_receive_mgslib(chain_id: u64): SemVer acquires MsgLibConfig {
        let config = borrow_global<MsgLibConfig>(@layerzero);
        assert!(table::contains(&config.receive_version, chain_id), error::invalid_argument(ELAYERZERO_UNSET_DEFAULT_MSGLIB));
        *table::borrow(&config.receive_version, chain_id)
    }

    public fun is_msglib_registered<MSGLIB>(): bool acquires MsgLibRegistry {
        let registry = borrow_global<MsgLibRegistry>(@layerzero);
        table::contains(&registry.type_to_version, type_of<MSGLIB>())
    }

    public fun assert_receive_msglib(ua_address: address, chain_id: u64, version: SemVer) acquires MsgLibConfig {
        let expected_version = get_receive_msglib(ua_address, chain_id);
        assert!(version == expected_version, error::invalid_argument(ELAYERZERO_INVALID_MSGLIB));
    }

    public fun get_version_by_msglib<MSGLIB>(): SemVer acquires MsgLibRegistry {
        assert!(is_msglib_registered<MSGLIB>(), error::not_found(ELAYERZERO_MSGLIB_UNREGISTERED));

        let registry = borrow_global<MsgLibRegistry>(@layerzero);
        *table::borrow(&registry.type_to_version, type_of<MSGLIB>())
    }

    public fun get_msglib_by_version(version: SemVer): TypeInfo acquires MsgLibRegistry {
        assert!(is_version_registered(version), error::not_found(ELAYERZERO_INVALID_VERSION));

        let registry = borrow_global<MsgLibRegistry>(@layerzero);
        *table::borrow(&registry.version_to_type, version)
    }

    //
    // internal functions
    //
    public fun is_version_registered(version: SemVer): bool acquires MsgLibRegistry {
        let registry = borrow_global<MsgLibRegistry>(@layerzero);
        table::contains(&registry.version_to_type, version)
    }

    fun get_send_version(ua_address: address, chain_id: u64): SemVer acquires MsgLibConfig {
        let config = borrow_global<MsgLibConfig>(ua_address);
        if (table::contains(&config.send_version, chain_id)) {
            *table::borrow(&config.send_version, chain_id)
        } else {
            semver::default_version()
        }
    }

    fun get_receive_version(ua_address: address, chain_id: u64): SemVer acquires MsgLibConfig {
        let config = borrow_global<MsgLibConfig>(ua_address);
        if (table::contains(&config.receive_version, chain_id)) {
            *table::borrow(&config.receive_version, chain_id)
        } else {
            semver::default_version()
        }
    }

    #[test_only]
    struct TestMsgLibV1 {}

    #[test_only]
    struct TestMsgLibV2 {}

    #[test_only]
    struct TestMsgLibV3 {}

    #[test_only]
    public fun init_module_for_test(account: &signer) {
        init_module(account);
    }

    #[test_only]
    use test::msglib_test::TestUa;
    #[test_only]
    use std::signer::address_of;

    #[test_only]
    fun setup(lz: &signer, _auth: &signer, ua: &signer) acquires MsgLibRegistry, EventStore {
        use aptos_framework::aptos_account;

        aptos_account::create_account(address_of(lz));
        admin::init_module_for_test(lz);
        init_module_for_test(lz);

        // only register msglibs v1 and v2 expect for v3
        register_msglib<TestMsgLibV1>(semver::build_version(1, 0));
        register_msglib<TestMsgLibV2>(semver::build_version(2, 0));

        init_msglib_config<TestUa>(ua);
    }

    #[test(lz = @layerzero, auth = @msglib_auth, ua = @test)]
    fun test_register_msglib(lz: &signer, auth: &signer, ua: &signer)  acquires MsgLibRegistry, EventStore {
        setup(lz, auth, ua);

        assert!(get_version_by_msglib<TestMsgLibV1>() == semver::build_version(1, 0), 0);
        assert!(get_version_by_msglib<TestMsgLibV2>() == semver::build_version(2, 0), 0);

        assert!(is_version_registered(semver::build_version(1,0)), 0);
        assert!(is_version_registered(semver::build_version(2,0)), 0);
        assert!(!is_version_registered(semver::build_version(3,0)), 0); // v3 not registered
    }

    #[test(lz = @layerzero, auth = @msglib_auth, ua = @test)]
    #[expected_failure(abort_code = 0x80000)]
    fun test_reregister_msglib(lz: &signer, auth: &signer, ua: &signer)  acquires MsgLibRegistry, EventStore {
        setup(lz, auth, ua);
        register_msglib<TestMsgLibV1>(semver::build_version(1, 0));
    }

    #[test(lz = @layerzero, auth = @msglib_auth, ua = @test)]
    fun test_set_default_msglib(lz: &signer, auth: &signer, ua: &signer) acquires MsgLibConfig, MsgLibRegistry, EventStore {
        setup(lz, auth, ua);

        // set default send to v1 and receive msglib to v2
        let chain_id = 1;
        set_default_send_msglib(lz, chain_id, 1, 0);
        set_default_receive_msglib(lz, chain_id, 2, 0);
        assert!(get_default_send_msglib(chain_id) ==  semver::build_version(1, 0), 0);
        assert!(get_default_receive_mgslib(chain_id) ==  semver::build_version(2, 0), 0);

        // set both to BLOCK_VERSION
        set_default_send_msglib(lz, chain_id, 65535, 0);
        set_default_receive_msglib(lz, chain_id, 65535, 0);
        assert!(get_default_send_msglib(chain_id) == semver::blocking_version(), 0);
        assert!(get_default_receive_mgslib(chain_id) == semver::blocking_version(), 0);

        // set both to v2
        set_default_send_msglib(lz, chain_id, 2,0);
        set_default_receive_msglib(lz, chain_id, 2,0);
        assert!(get_default_send_msglib(chain_id) ==  semver::build_version(2, 0), 0);
        assert!(get_default_receive_mgslib(chain_id) ==  semver::build_version(2, 0), 0);
    }

    #[test(lz = @layerzero, auth = @msglib_auth, ua = @test)]
    #[expected_failure(abort_code = 0x10001)]
    fun test_set_default_msglib_to_default_version(lz: &signer, auth: &signer, ua: &signer) acquires MsgLibConfig, MsgLibRegistry, EventStore {
        setup(lz, auth, ua);
        set_default_send_msglib(lz, 1, 0, 0);
    }

    #[test(lz = @layerzero, auth = @msglib_auth, ua = @test)]
    #[expected_failure(abort_code = 0x10001)]
    fun test_set_default_msglib_to_invalid_version(lz: &signer, auth: &signer, ua: &signer) acquires MsgLibConfig, MsgLibRegistry, EventStore {
        setup(lz, auth, ua);
        set_default_send_msglib(lz, 1, 3, 0);
    }

    #[test(lz = @layerzero, auth = @msglib_auth, ua = @test)]
    #[expected_failure(abort_code = 0x10002)]
    fun test_unset_default_msglib(lz: &signer, auth: &signer, ua: &signer) acquires MsgLibConfig, MsgLibRegistry, EventStore {
        setup(lz, auth, ua);
        get_send_msglib(address_of(ua), 1); // fail to get send msglib for default one unset
    }

    #[test(lz = @layerzero, auth = @msglib_auth, ua = @test)]
    fun test_ua_set_msglib(lz: &signer, auth: &signer, ua: &signer) acquires MsgLibConfig, MsgLibRegistry, EventStore {
        setup(lz, auth, ua);
        let ua_addr = address_of(ua);

        // set default send and receive msglib v1
        let chain_id = 1;
        set_default_send_msglib(lz, chain_id, 1, 0);
        set_default_receive_msglib(lz, chain_id, 1, 0);

        // both versions for UA are same to default, cuz UA doesn't set any version
        assert!(get_send_msglib(ua_addr, chain_id) ==  semver::build_version(1, 0), 0);
        assert!(get_receive_msglib(ua_addr, chain_id) ==  semver::build_version(1, 0), 0);

        // ua set send msglib to BLOCK_VERSION and set receive msglib to v2
        set_send_msglib<TestUa>(chain_id, semver::blocking_version());
        set_receive_msglib<TestUa>(chain_id, semver::build_version(2, 0));
        assert!(get_send_msglib(ua_addr, chain_id) == semver::blocking_version(), 0);
        assert!(get_receive_msglib(ua_addr, chain_id) ==  semver::build_version(2, 0), 0);

        // ua set both msglib back to default
        set_send_msglib<TestUa>(chain_id, semver::default_version());
        set_receive_msglib<TestUa>(chain_id, semver::default_version());
        assert!(get_send_msglib(ua_addr, chain_id) == semver::build_version(1, 0), 0);
        assert!(get_receive_msglib(ua_addr, chain_id) == semver::build_version(1, 0), 0);
    }

    #[test(lz = @layerzero, auth = @msglib_auth, ua = @test)]
    #[expected_failure(abort_code = 0x10001)]
    fun test_ua_set_msglib_to_invalid_version(lz: &signer, auth: &signer, ua: &signer) acquires MsgLibConfig, MsgLibRegistry, EventStore {
        setup(lz, auth, ua);
        set_send_msglib<TestUa>(1, semver::build_version(3, 0));
    }

    #[test(lz = @layerzero, auth = @msglib_auth, ua = @test)]
    fun test_assert_receive_msglib(lz: &signer, auth: &signer, ua: &signer) acquires MsgLibConfig, MsgLibRegistry, EventStore {
        setup(lz, auth, ua);
        let ua_addr = address_of(ua);

        // set default receive msglib 1
        set_default_receive_msglib(lz, 1, 1, 0);
        assert_receive_msglib(ua_addr, 1, semver::build_version(1, 0));

        // ua set receive msglib 2
        set_receive_msglib<TestUa>(1, semver::build_version(2, 0));
        assert_receive_msglib(ua_addr, 1, semver::build_version(2, 0));

        // ua set receive msglib back to default
        set_receive_msglib<TestUa>(1, semver::default_version());
        assert_receive_msglib(ua_addr, 1, semver::build_version(1, 0));
    }

    #[test(lz = @layerzero, auth = @msglib_auth, ua = @test)]
    #[expected_failure(abort_code = 0x10004)]
    fun test_assert_invalid_msglib(lz: &signer, auth: &signer, ua: &signer) acquires MsgLibConfig, MsgLibRegistry, EventStore {
        setup(lz, auth, ua);

        // set default msglib 1
        let chain_id = 1;
        set_default_receive_msglib(lz, chain_id, 1, 0);

        // fail to assert msglib 2
        assert_receive_msglib(address_of(ua), chain_id, semver::build_version(2, 0));
    }
}

#[test_only]
module test::msglib_test {
    struct TestUa {}
}

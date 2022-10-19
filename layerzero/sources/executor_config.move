module layerzero::executor_config {
    use aptos_std::table::{Self, Table};
    use aptos_std::type_info::{TypeInfo, type_of};
    use layerzero_common::utils::{assert_u16, type_address, assert_type_signer};
    use std::error;
    use std::vector;
    use aptos_std::event::{Self, EventHandle};
    use aptos_framework::account;
    use layerzero::admin;

    friend layerzero::endpoint;

    const ELAYERZERO_EXECUTOR_EXISTED: u64 = 0x00;
    const ELAYERZERO_INVALID_VERSION: u64 = 0x01;
    const ELAYERZERO_UNSET_DEFAULT_EXECUTOR: u64 = 0x02;
    const ELAYERZERO_INVALID_EXECUTOR: u64 = 0x03;

    const DEFAULT_VERSION: u64 = 0;

    struct ExecutorRegistry has key {
        // version = index + 1
        executors: vector<TypeInfo>,
    }

    struct Config has drop, store {
        executor: address,
        version: u64,
    }

    struct ConfigStore has key {
        // chain id -> (version, executor)
        config: Table<u64, Config>,
    }

    struct EventStore has key {
        register_events: EventHandle<RegisterEvent>,
    }

    struct RegisterEvent has drop, store {
        type_info: TypeInfo,
        version: u64,
    }

    fun init_module(account: &signer) {
        move_to(account, ExecutorRegistry {
            executors: vector::empty(),
        });

        move_to(account, EventStore {
            register_events: account::new_event_handle<RegisterEvent>(account),
        });

        move_to(account, ConfigStore {
            config: table::new(),
        });
    }

    //
    // admin functions
    //
    public(friend) fun register_executor<EXECUTOR>(version: u64) acquires ExecutorRegistry, EventStore {
        let registry = borrow_global_mut<ExecutorRegistry>(@layerzero);

        let type_info = type_of<EXECUTOR>();
        assert!(
            !vector::contains(&registry.executors, &type_info),
            error::already_exists(ELAYERZERO_EXECUTOR_EXISTED)
        );
        assert!(
            version == vector::length(&registry.executors) + 1,
            error::invalid_argument(ELAYERZERO_INVALID_VERSION)
        );
        vector::push_back(&mut registry.executors, type_info);

        let event_store = borrow_global_mut<EventStore>(@layerzero);
        event::emit_event<RegisterEvent>(
            &mut event_store.register_events,
            RegisterEvent {
                type_info,
                version,
            },
        );
    }

    public entry fun set_default_executor(account: &signer, chain_id: u64, version: u64, executor: address) acquires ConfigStore, ExecutorRegistry {
        admin::assert_config_admin(account);
        assert_u16(chain_id);
        assert!(is_valid_version(version), error::invalid_argument(ELAYERZERO_INVALID_VERSION));
        assert!(executor != @0x00, error::invalid_argument(ELAYERZERO_INVALID_EXECUTOR));

        let store = borrow_global_mut<ConfigStore>(@layerzero);
        table::upsert(&mut store.config, chain_id, Config { version, executor });
    }

    //
    // ua functions
    //
    public(friend) fun init_executor_config<UA>(account: &signer) {
        assert_type_signer<UA>(account);
        move_to(account, ConfigStore {
            config: table::new(),
        });
    }

    public(friend) fun set_executor<UA>(chain_id: u64, version: u64, executor: address) acquires ConfigStore, ExecutorRegistry {
        assert!(
            version == DEFAULT_VERSION || is_valid_version(version),
            error::invalid_argument(ELAYERZERO_INVALID_VERSION)
        );
        // executor can't be 0x00 if version is not DEFAULT_VERSION
        assert!(version == DEFAULT_VERSION || executor != @0x00, error::invalid_argument(ELAYERZERO_INVALID_EXECUTOR));

        let store = borrow_global_mut<ConfigStore>(type_address<UA>());
        table::upsert(&mut store.config, chain_id, Config { version, executor });
    }

    //
    // view functions
    //
    public fun get_executor(ua_address: address, chain_id: u64): (u64, address) acquires ConfigStore {
        let (version, executor) = get_executor_internal(ua_address, chain_id);
        if (version == DEFAULT_VERSION) {
            get_default_executor(chain_id)
        } else {
            (version, executor)
        }
    }

    public fun get_default_executor(chain_id: u64): (u64, address) acquires ConfigStore {
        let store = borrow_global<ConfigStore>(@layerzero);
        assert!(table::contains(&store.config, chain_id), error::invalid_argument(ELAYERZERO_UNSET_DEFAULT_EXECUTOR));
        let config = table::borrow(&store.config, chain_id);
        (config.version, config.executor)
    }

    public fun is_valid_version(version: u64): bool acquires ExecutorRegistry {
        let registry = borrow_global<ExecutorRegistry>(@layerzero);
        version > 0 && version <= vector::length(&registry.executors)
    }

    public fun get_latest_version(): u64 acquires ExecutorRegistry {
        let registry = borrow_global<ExecutorRegistry>(@layerzero);
        vector::length(&registry.executors)
    }

    public fun get_executor_typeinfo_by_version(version: u64): TypeInfo acquires ExecutorRegistry {
        // assert it is a valid version
        assert!(is_valid_version(version), error::invalid_argument(ELAYERZERO_INVALID_VERSION));

        let registry = borrow_global<ExecutorRegistry>(@layerzero);
        *vector::borrow(&registry.executors, version - 1)
    }

    //
    // internal functions
    //
    fun get_executor_internal(ua_address: address, chain_id: u64): (u64, address) acquires ConfigStore {
        let store = borrow_global<ConfigStore>(ua_address);
        if (table::contains(&store.config, chain_id)) {
            let config = table::borrow(&store.config, chain_id);
            (config.version, config.executor)
        } else {
            (DEFAULT_VERSION, @0x00)
        }
    }

    #[test_only]
    use test::executor_test::TestUa;

    #[test_only]
    struct TestExecutorV1 {}

    #[test_only]
    struct TestExecutorV2 {}

    #[test_only]
    struct TestExecutorV3 {}

    #[test_only]
    public fun init_module_for_test(account: &signer) {
        init_module(account);
    }

    #[test_only]
    fun setup(lz: &signer, ua: &signer) acquires ExecutorRegistry, EventStore {
        use std::signer;
        use aptos_framework::aptos_account;

        aptos_account::create_account(signer::address_of(lz));
        admin::init_module_for_test(lz);
        init_module_for_test(lz);

        // only register executor v1 and v2 expect for v3
        register_executor<TestExecutorV1>(1);
        register_executor<TestExecutorV2>(2);

        init_executor_config<TestUa>(ua);
    }

    #[test(lz = @layerzero, ua = @test)]
    fun test_register_executor(lz: signer, ua: signer)  acquires ExecutorRegistry, EventStore {
        setup(&lz, &ua);

        assert!(is_valid_version(1), 0);
        assert!(is_valid_version(2), 0);
        assert!(!is_valid_version(3), 0); // v3 not registered

        assert!(get_executor_typeinfo_by_version(1) == type_of<TestExecutorV1>(), 0);
        assert!(get_executor_typeinfo_by_version(2) == type_of<TestExecutorV2>(), 0);
    }

    #[test(lz = @layerzero, ua = @test)]
    #[expected_failure(abort_code = 0x80000)]
    fun test_reregister_executor(lz: &signer, ua: &signer)  acquires ExecutorRegistry, EventStore {
        setup(lz, ua);
        register_executor<TestExecutorV1>(3);
    }

    #[test(lz = @layerzero, ua = @test)]
    fun test_set_default_executor(lz: &signer, ua: &signer) acquires ConfigStore, ExecutorRegistry, EventStore {
        setup(lz, ua);

        // set default executor to v1
        let chain_id = 1;
        set_default_executor(lz, chain_id, 1, @0x01);
        let (version, executor) = get_default_executor(chain_id);
        assert!(version == 1, 0);
        assert!(executor == @0x01, 0);

        // set default executor to v2
        set_default_executor(lz, chain_id, 2, @0x02);
        let (version, executor) = get_default_executor(chain_id);
        assert!(version == 2, 0);
        assert!(executor == @0x02, 0);
    }

    #[test(lz = @layerzero, ua = @test)]
    #[expected_failure(abort_code = 0x10001)]
    fun test_set_default_executor_to_default_version(lz: &signer, ua: &signer) acquires ConfigStore, ExecutorRegistry, EventStore {
        setup(lz, ua);
        set_default_executor(lz, 1, DEFAULT_VERSION, @0x01);
    }

    #[test(lz = @layerzero, ua = @test)]
    #[expected_failure(abort_code = 0x10001)]
    fun test_set_default_executor_to_invalid_version(lz: &signer, ua: &signer) acquires ConfigStore, ExecutorRegistry, EventStore {
        setup(lz, ua);
        set_default_executor(lz, 1, 3, @0x01);
    }

    #[test(lz = @layerzero, ua = @test)]
    #[expected_failure(abort_code = 0x10002)]
    fun test_unset_default_executor(lz: signer, ua: signer) acquires ConfigStore, ExecutorRegistry, EventStore {
        setup(&lz, &ua);
        get_executor(type_address<TestUa>(), 1); // fail to get executor for default one unset
    }

    #[test(lz = @layerzero, ua = @test)]
    fun test_ua_set_executor(lz: &signer, ua: &signer) acquires ConfigStore, ExecutorRegistry, EventStore {
        setup(lz, ua);

        let ua_address = type_address<TestUa>();

        // set default executor v1
        let chain_id = 1;
        set_default_executor(lz, chain_id, 1, @0x01);

        // same to default, cuz UA doesn't set any version
        let (version, executor) = get_executor(ua_address, chain_id);
        assert!(version == 1, 0);
        assert!(executor == @0x01, 0);

        // ua set executor to v2
        set_executor<TestUa>(chain_id, 2, @0x02);
        let (version, executor) = get_executor(ua_address, chain_id);
        assert!(version == 2, 0);
        assert!(executor == @0x02, 0);

        // ua set back to default
        set_executor<TestUa>(chain_id, 0, @0x00);
        let (version, executor) = get_executor(ua_address, chain_id);
        assert!(version == 1, 0);
        assert!(executor == @0x01, 0);
    }

    #[test(lz = @layerzero, ua = @test)]
    #[expected_failure(abort_code = 0x10001)]
    fun test_ua_set_msglib_to_invalid_version(lz: signer, ua: signer) acquires ConfigStore, ExecutorRegistry, EventStore {
        setup(&lz, &ua);
        set_executor<TestUa>(1, 3, @0x01);
    }
}

#[test_only]
module test::executor_test {
    struct TestUa {}
}
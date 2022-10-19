module layerzero::uln_config {
    use aptos_std::table::{Self, Table, borrow_mut_with_default, borrow};
    use layerzero_common::utils::{type_address, assert_u16 };
    use aptos_std::from_bcs::to_address;
    use layerzero_common::serde;
    use std::error;
    use std::vector;
    use std::bcs;
    use layerzero::admin;

    friend layerzero::msglib_v1_0;

    const EULN_INVALID_CONFIG: u64 = 0x00;
    const EULN_INVALID_CHAIN_ID: u64 = 0x01;
    const EULN_INVALID_ADDRESS_SIZE: u64 = 0x02;
    const EULN_CONFIG_NOT_FOUND: u64 = 0x03;
    const EULN_IMMUTABLE_ADDRESS_SIZE: u64 = 0x04;
    const EULN_INVALID_CONFIG_TYPE: u64 = 0x05;

    const CONFIG_TYPE_ORACLE: u8 = 0;
    const CONFIG_TYPE_RELAYER: u8 = 1;
    const CONFIG_TYPE_INBOUND_CONFIRMATIONS: u8 = 2;
    const CONFIG_TYPE_OUTBOUND_CONFIRMATIONS: u8 = 3;

    struct UlnConfig has copy, drop, store {
        oracle: address,
        relayer: address,
        inbound_confirmations: u64,
        outbound_confirmations: u64
    }

    struct UaConfigKey has copy, drop {
        ua_address: address,
        chain_id: u64,
    }

    // UaUlnConfig isn't stored in the UA account, otherwise the UA signer will be required to init resource again when upgrade the uln config
    struct UaUlnConfig has key {
        // ua address + chain id -> uln config
        config: Table<UaConfigKey, UlnConfig>
    }

    struct DefaultUlnConfig has key {
        // chain id -> uln config
        config: Table<u64, UlnConfig>
    }

    struct ChainConfig has key {
        // chain id -> address size
        chain_address_size: Table<u64, u64>,
    }

    //
    // layerzero only functions
    //
    fun init_module(account: &signer) {
        move_to(account, DefaultUlnConfig {
            config: table::new(),
        });

        move_to(account, UaUlnConfig {
            config: table::new(),
        });

        move_to(account, ChainConfig {
            chain_address_size: table::new(),
        });
    }

    public entry fun set_chain_address_size(account: &signer, chain_id: u64, size: u64) acquires ChainConfig {
        admin::assert_config_admin(account);
        assert_u16(chain_id);

        let chain_config_store = borrow_global_mut<ChainConfig>(@layerzero);
        assert!(
            !table::contains(&chain_config_store.chain_address_size, chain_id),
            error::invalid_argument(EULN_IMMUTABLE_ADDRESS_SIZE)
        );
        table::add(&mut chain_config_store.chain_address_size, chain_id, size);
    }

    public entry fun set_default_config(
        account: &signer,
        chain_id: u64,
        oracle: address,
        relayer: address,
        inbound_confirmations: u64,
        outbound_confirmations: u64
    ) acquires DefaultUlnConfig {
        admin::assert_config_admin(account);
        assert_u16(chain_id);

        // the global config can not set to default config
        let uln_config = new_uln_config(oracle, relayer, inbound_confirmations, outbound_confirmations);
        assert!(is_valid_default_uln_config(&uln_config), error::invalid_argument(EULN_INVALID_CONFIG));

        let default_config = borrow_global_mut<DefaultUlnConfig>(@layerzero);
        table::upsert(&mut default_config.config, chain_id, uln_config);
    }

    public(friend) fun set_ua_config<UA>(
        chain_id: u64,
        config_type: u8,
        config_bytes: vector<u8>,
    ) acquires UaUlnConfig {
        assert_u16(chain_id);
        let config_store = borrow_global_mut<UaUlnConfig>(@layerzero);

        let key = UaConfigKey {
            ua_address: type_address<UA>(),
            chain_id,
        };

        let config = borrow_mut_with_default(&mut config_store.config, key, default_uln_config());

        if (config_type == CONFIG_TYPE_ORACLE) {
            config.oracle = to_address(config_bytes);
        } else if (config_type == CONFIG_TYPE_RELAYER) {
            config.relayer = to_address(config_bytes);
        } else if (config_type == CONFIG_TYPE_INBOUND_CONFIRMATIONS) {
            config.inbound_confirmations = serde::deserialize_u64(&config_bytes);
        } else if (config_type == CONFIG_TYPE_OUTBOUND_CONFIRMATIONS) {
            config.outbound_confirmations = serde::deserialize_u64(&config_bytes);
        } else {
            abort error::invalid_argument(EULN_INVALID_CONFIG_TYPE)
        }
    }

    //
    // view functions
    //
    public fun get_ua_config(
        ua_address: address,
        chain_id: u64,
        config_type: u8,
    ): vector<u8> acquires UaUlnConfig {
        let config_store = borrow_global<UaUlnConfig>(@layerzero);

        let key = UaConfigKey {
            ua_address,
            chain_id,
        };

        assert!(table::contains(&config_store.config, key), error::not_found(EULN_CONFIG_NOT_FOUND));
        let config = borrow(&config_store.config, key);

        if (config_type == CONFIG_TYPE_RELAYER) {
            bcs::to_bytes(&config.relayer)
        } else if (config_type == CONFIG_TYPE_ORACLE) {
            bcs::to_bytes(&config.oracle)
        } else if (config_type == CONFIG_TYPE_INBOUND_CONFIRMATIONS) {
            let confirmations_bytes = vector::empty<u8>();
            serde::serialize_u64(&mut confirmations_bytes, config.inbound_confirmations);
            confirmations_bytes
        } else if (config_type == CONFIG_TYPE_OUTBOUND_CONFIRMATIONS) {
            let confirmations_bytes = vector::empty<u8>();
            serde::serialize_u64(&mut confirmations_bytes, config.outbound_confirmations);
            confirmations_bytes
        } else {
            abort error::invalid_argument(EULN_INVALID_CONFIG_TYPE)
        }
    }

    public fun assert_address_size(chain_id: u64, address_size: u64) acquires ChainConfig {
        let chain_address_size = get_address_size(chain_id);
        assert!(address_size == chain_address_size, error::invalid_argument(EULN_INVALID_ADDRESS_SIZE));
    }

    public fun get_address_size(chain_id: u64): u64 acquires ChainConfig {
        let chain_config = borrow_global<ChainConfig>(@layerzero);
        assert!(table::contains(&chain_config.chain_address_size, chain_id), error::invalid_argument(EULN_INVALID_CHAIN_ID));

        *borrow(&chain_config.chain_address_size, chain_id)
    }

    public fun get_uln_config(ua_address: address, chain_id: u64): UlnConfig acquires DefaultUlnConfig, UaUlnConfig {
        let default_config_store = borrow_global<DefaultUlnConfig>(@layerzero);
        assert!(table::contains(&default_config_store.config, chain_id), error::invalid_argument(EULN_INVALID_CHAIN_ID));
        let default_config = table::borrow(&default_config_store.config, chain_id);

        let ua_config_store = borrow_global<UaUlnConfig>(@layerzero);
        let key = UaConfigKey {
            ua_address,
            chain_id,
        };

        if (table::contains(&ua_config_store.config, key)) {
            // ua has initialize the configuration
            let ua_config = table::borrow(&ua_config_store.config, key);
            merge(ua_config, default_config)
        } else {
            // return the default configuration if otherwise
            *default_config
        }
    }

    public fun new_uln_config(oracle: address, relayer: address, inbound_confirmations: u64, outbound_confirmations: u64): UlnConfig {
        return UlnConfig {
            oracle,
            relayer,
            inbound_confirmations,
            outbound_confirmations
        }
    }

    public fun default_uln_config(): UlnConfig {
        return new_uln_config(
            @0x00,
            @0x00,
            0,
            0
        )
    }

    // default configuration can not point to the null value
    public fun is_valid_default_uln_config(config: &UlnConfig): bool {
        config.oracle != @0x00 &&
            config.relayer != @0x00 &&
            config.inbound_confirmations > 0 &&
            config.outbound_confirmations > 0
    }

    // public getters
    public fun oracle(config: &UlnConfig): address {
        return config.oracle
    }

    public fun relayer(config: &UlnConfig): address {
        return config.relayer
    }

    public fun inbound_confirmations(config: &UlnConfig): u64 {
        return config.inbound_confirmations
    }

    public fun outbound_confiramtions(config: &UlnConfig): u64 {
        return config.outbound_confirmations
    }

    fun merge(ua_config: &UlnConfig, default_configs: &UlnConfig): UlnConfig {
        let rtn: UlnConfig = *default_configs;

        if (ua_config.oracle != @0x00) {
            rtn.oracle = ua_config.oracle;
        };
        if (ua_config.relayer != @0x00) {
            rtn.relayer = ua_config.relayer;
        };
        if (ua_config.inbound_confirmations != 0) {
            rtn.inbound_confirmations = ua_config.inbound_confirmations;
        };
        if (ua_config.outbound_confirmations != 0) {
            rtn.outbound_confirmations = ua_config.outbound_confirmations;
        };

        rtn
    }

    #[test_only]
    struct ExampleUa {}

    #[test_only]
    public fun init_module_for_test(account: &signer) {
        init_module(account);
    }

    #[test_only]
    fun setup(lz: &signer) {
        use aptos_framework::aptos_account;

        aptos_account::create_account(@layerzero);
        admin::init_module_for_test(lz);
        init_module(lz);
    }

    #[test(lz = @layerzero)]
    fun test_set_chain_address_size(lz: signer) acquires ChainConfig {
        setup(&lz);

        let chain_id = 87;

        // set to 20 and assert
        set_chain_address_size(&lz, chain_id, 20);
        assert_address_size(chain_id, 20);

        let store = borrow_global<ChainConfig>(@layerzero);
        let chain_address_size = table::borrow(&store.chain_address_size, chain_id);
        assert!(*chain_address_size == 20, 0);
    }

    #[test(lz = @layerzero)]
    #[expected_failure(abort_code = 0x10004)]
    fun test_change_chain_address_size(lz: signer) acquires ChainConfig {
        setup(&lz);
        set_chain_address_size(&lz, 1, 20);
        set_chain_address_size(&lz, 1, 30); // fail to change
    }

    #[test(lz = @layerzero)]
    fun test_set_ua_uln_config(lz: signer)  acquires DefaultUlnConfig, UaUlnConfig {
        use std::vector;
        use std::bcs;

        setup(&lz);

        let chain_id = 77;

        // set default config
        let oracle = @0x2;
        let relayer = @0x3;
        let inbound_confirmations = 10;
        let outbound_confirmations = 11;
        set_default_config(&lz, chain_id, oracle, relayer, inbound_confirmations, outbound_confirmations);

        // assert default config
        let uln_config = get_uln_config(type_address<ExampleUa>(), chain_id);
        assert!(uln_config.oracle == oracle, 0);
        assert!(uln_config.relayer == relayer, 0);
        assert!(uln_config.inbound_confirmations == inbound_confirmations, 0);
        assert!(uln_config.outbound_confirmations == outbound_confirmations, 0);

        // set ua the config
        let new_outbound_confirmations = 20;
        let confirmations_bytes = vector::empty();
        serde::serialize_u64(&mut confirmations_bytes, new_outbound_confirmations);
        set_ua_config<ExampleUa>(chain_id, CONFIG_TYPE_OUTBOUND_CONFIRMATIONS, confirmations_bytes);

        let new_relayer = @0x4;
        set_ua_config<ExampleUa>(chain_id, CONFIG_TYPE_RELAYER, bcs::to_bytes(&new_relayer));

        // assert config
        let uln_config = get_uln_config(type_address<ExampleUa>(), chain_id);
        assert!(uln_config.oracle == oracle, 0);
        assert!(uln_config.relayer == new_relayer, 0);
        assert!(uln_config.outbound_confirmations == new_outbound_confirmations, 0);
    }
}
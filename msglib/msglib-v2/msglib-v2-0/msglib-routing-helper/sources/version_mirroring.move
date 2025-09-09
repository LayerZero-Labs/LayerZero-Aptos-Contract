module msglib_routing_helper::version_mirroring {
    use layerzero::msglib_config;
    use msglib_v2::msglib_v2_router::{Self, create_msglib_config_cap, MsglibConfigCap};

    struct Store has key {
        cap: MsglibConfigCap,
    }

    fun init_module(account: &signer) {
        move_to(account, Store {
            cap: create_msglib_config_cap(account),
        });
    }

    #[test_only]
    public fun init_module_for_test(account: &signer) {
        init_module(account);
    }

    /// Syncs the send version from msglib_config to msglib_v2_router for a given UA and chain ID
    /// This function can be called by anyone permissionlessly
    public entry fun sync(ua_address: address, chain_id: u64) acquires Store {
        // 1. Read send version from msglib_config
        let version = msglib_config::get_send_msglib(ua_address, chain_id);

        // 2. Set the send version in msglib_v2_router
        msglib_v2_router::set_send_msglib(
            ua_address,
            chain_id,
            version,
            &borrow_global<Store>(@msglib_routing_helper).cap
        );
    }
}

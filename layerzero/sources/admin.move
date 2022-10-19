// managing layerzero admin priviledges.
// can transfer the admin account to new multi-sig or resources accounts
module layerzero::admin {
    use std::error;
    use std::signer::address_of;

    const EADMIN_NOT_AUTHORIZED: u64 = 0x00;

    struct Config has key {
        admin: address
    }

    // defaults to @layerzero
    fun init_module(account: &signer) {
        move_to(account, Config { admin: @layerzero } )
    }

    public entry fun transfer_admin(account: &signer, new_admin: address) acquires Config {
        let config = borrow_global_mut<Config>(@layerzero);
        assert!(
            address_of(account) == config.admin,
            error::permission_denied(EADMIN_NOT_AUTHORIZED)
        );

        config.admin = new_admin;
    }

    public fun is_config_admin(account: address): bool acquires Config {
        let config = borrow_global<Config>(@layerzero);
        account == config.admin
    }

    public fun assert_config_admin(account: &signer) acquires Config {
        assert!(
            is_config_admin(address_of(account)),
            error::permission_denied(EADMIN_NOT_AUTHORIZED)
        );
    }

    #[test_only]
    public fun init_module_for_test(account: &signer) {
        init_module(account);
    }

    #[test(lz = @layerzero, alice = @1234)]
    #[expected_failure(abort_code = 0x50000)]
    fun test_set_by_non_admin(lz: &signer, alice: &signer) acquires Config {
        init_module(lz);

        transfer_admin(alice, address_of(lz))
    }

    #[test(lz = @layerzero, alice = @1234)]
    fun test_set_by_admin(lz: &signer, alice: &signer) acquires Config {
        init_module(lz);

        let alice_addr = address_of(alice);
        transfer_admin(lz, alice_addr);

        let config = borrow_global<Config>(@layerzero);
        assert!(config.admin == alice_addr, 0);
    }

    #[test(lz = @layerzero, alice = @1234)]
    #[expected_failure(abort_code = 0x50000)]
    fun test_assert_not_admin(lz: &signer, alice: &signer) acquires Config {
        init_module(lz);

        assert_config_admin(alice);
    }

    #[test(lz = @layerzero)]
    fun test_assert_admin(lz: &signer) acquires Config {
        init_module(lz);

        assert_config_admin(lz);
    }
}
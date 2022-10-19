module oracle::oracle {
    use aptos_std::table::{Self, Table};
    use std::signer::address_of;
    use std::error;
    use layerzero::uln_signer;
    use layerzero::uln_receive::{oracle_propose};
    use aptos_framework::account::{Self, SignerCapability};
    use aptos_framework::coin;
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::aptos_account;
    use std::vector;
    use layerzero_common::utils::{assert_length, assert_u16};

    const EORACLE_NOT_AUTHORIZED: u64 = 0x00;
    const EORACLE_NOT_ADMIN: u64 = 0x01;
    const EORACLE_NOT_VALIDATOR: u64 = 0x02;
    const EORACLE_ALREADY_SUBMITTED: u64 = 0x03;
    const EORACLE_ALREADY_APPROVED: u64 = 0x04;
    const EORALCE_ALREADY_IN_STATE: u64 = 0x05;
    const EORALCE_LESS_THAN_THRESHOLD: u64 = 0x06;

    struct Oracle {}

    struct Proposal has store {
        submitted: bool,
        approved_by: vector<address>,
    }

    struct ProposalKey has copy, drop {
        hash: vector<u8>,
        confirmations: u64
    }

    struct ProposalStore has key {
        proposals: Table<ProposalKey, Proposal>
    }

    struct Config has key {
        admin: address,
        validators: vector<address>, // bool is always true
        threshold: u64,
        resource_cap: SignerCapability,
        resource_addr: address
    }

    fun init_module(account: &signer) {
        move_to(account, ProposalStore {
            proposals: table::new()
        });

        let (resource_signer, resource_cap) = account::create_resource_account(account, x"01");
        move_to(account, Config {
            admin: @oracle,
            validators: vector::empty(),
            threshold: 0,
            resource_cap,
            resource_addr: address_of(&resource_signer)
        });

        coin::register<AptosCoin>(&resource_signer);
        uln_signer::register(&resource_signer);
    }

    // ==================== Validator functions ================
    public entry fun propose(account: &signer, hash: vector<u8>, confirmations: u64) acquires Config, ProposalStore {
        assert_validator(account);
        assert_length(&hash, 32);

        let validator = address_of(account);
        let store = borrow_global_mut<ProposalStore>(@oracle);

        let key = ProposalKey {
            hash,
            confirmations
        };

        // new proposal if not exists. otherwise approve it
        if (!table::contains(&store.proposals, key)) {
            let approved_by = vector::empty();
            vector::push_back(&mut approved_by, validator);

            table::add(&mut store.proposals, key, Proposal {
                submitted: false,
                approved_by
            });
        } else {
            let proposal = table::borrow_mut(&mut store.proposals, key);
            assert!(!proposal.submitted, error::already_exists(EORACLE_ALREADY_SUBMITTED));
            assert!(
                !vector::contains(&proposal.approved_by, &validator),
                error::already_exists(EORACLE_ALREADY_APPROVED)
            );
            vector::push_back(&mut proposal.approved_by, validator);
        };

        // submit proposal if threshold is reached
        let proposal = table::borrow_mut(&mut store.proposals, key);
        if (vector::length(&proposal.approved_by) >= get_threshold()) {
            let config = borrow_global<Config>(@oracle);
            let resource = account::create_signer_with_capability(&config.resource_cap);
            oracle_propose(&resource, hash, confirmations);
            proposal.submitted = true;
        };
    }

    public entry fun set_fee(account: &signer, remote_chain_id: u64, base_fee: u64) acquires Config {
        assert_admin_or_validator(account);
        assert_u16(remote_chain_id);

        let config = borrow_global<Config>(@oracle);
        let resource = account::create_signer_with_capability(&config.resource_cap);

        uln_signer::set_fee(&resource, remote_chain_id, base_fee, 0);
    }

    // ==================== Admin functions ====================
    public entry fun transfer_admin(account: &signer, new_admin: address) acquires Config {
        let config = borrow_global_mut<Config>(@oracle);
        assert!(
            address_of(account) == config.admin,
            error::permission_denied(EORACLE_NOT_AUTHORIZED)
        );
        config.admin = new_admin;
    }

    public entry fun set_validator(account: &signer, validator: address, active: bool) acquires Config {
        assert_admin(account);

        let config = borrow_global_mut<Config>(@oracle);
        let (exists, i) = vector::index_of(&config.validators, &validator);
        if (active && !exists) {
            // does not exist, add it
            vector::push_back(&mut config.validators, validator);
        } else if(!active && exists) {
            // exists, remove it
            vector::swap_remove(&mut config.validators, i);
        } else {
            // already in desired state
            // exists and active
            // not exists and not active
            abort error::already_exists(EORALCE_ALREADY_IN_STATE)
        };

        assert!(
            vector::length(&config.validators) >= config.threshold,
            error::invalid_argument(EORALCE_LESS_THAN_THRESHOLD)
        );
    }

    public entry fun set_threshold(account: &signer, threshold: u64) acquires Config {
        assert_admin(account);

        let config = borrow_global_mut<Config>(@oracle);
        assert!(
            vector::length(&config.validators) >= config.threshold,
            error::invalid_argument(EORALCE_LESS_THAN_THRESHOLD)
        );

        config.threshold = threshold;
    }

    public entry fun allowlist(account: &signer, ua: address) acquires Config {
        assert_admin(account);

        let config = borrow_global<Config>(@oracle);
        let resource = account::create_signer_with_capability(&config.resource_cap);

        uln_signer::allowlist(&resource, ua);
    }

    public entry fun denylist(account: &signer, ua: address) acquires Config {
        assert_admin(account);

        let config = borrow_global<Config>(@oracle);
        let resource = account::create_signer_with_capability(&config.resource_cap);

        uln_signer::denylist(&resource, ua);
    }

    public entry fun withdraw_fee(account: &signer, receiver: address, amount: u64) acquires Config {
        assert_admin(account);

        let config = borrow_global<Config>(@oracle);
        let resource = account::create_signer_with_capability(&config.resource_cap);

        aptos_account::transfer(&resource, receiver, amount)
    }

    // ==================== View functions ====================

    public fun is_admin(account: address): bool acquires Config {
        let config = borrow_global<Config>(@oracle);
        return config.admin == account
    }

    public fun is_validator(validator: address): bool acquires Config {
        let config = borrow_global<Config>(@oracle);
        vector::contains(&config.validators, &validator)
    }

    public fun get_threshold(): u64 acquires Config {
        let config = borrow_global<Config>(@oracle);
        config.threshold
    }

    // ==================== Assert functions ====================

    public fun assert_validator(account: &signer)acquires Config {
        assert!(
            is_validator(address_of(account)),
            error::permission_denied(EORACLE_NOT_VALIDATOR)
        );
    }

    public fun assert_admin(account: &signer) acquires Config {
        assert!(
            is_admin(address_of(account)),
            error::permission_denied(EORACLE_NOT_ADMIN)
        );
    }

    public fun assert_admin_or_validator(account: &signer) acquires Config {
        assert!(
            is_admin(address_of(account)) || is_validator(address_of(account)),
            error::permission_denied(EORACLE_NOT_AUTHORIZED)
        );
    }

    // ==================== Test ================================

    #[test_only]
    public fun init_module_for_test(account: &signer) {
        init_module(account);
    }

    #[test(oracle = @oracle)]
    public fun test_transfer_admin(oracle: &signer) acquires Config {
        init_module(oracle);

        transfer_admin(oracle, @1234);
        assert!(is_admin(@1234), 0);
    }

    #[test(oracle = @oracle)]
    public fun test_set_validator(oracle: &signer) acquires Config {
        init_module(oracle);

        assert!(!is_validator(@1234), 0);

        set_validator(oracle, @1234, true);
        assert!(is_validator(@1234), 0);
        let config = borrow_global<Config>(@oracle);
        assert!(config.validators == vector<address>[@1234], 0);

        set_validator(oracle, @1234, false);
        assert!(!is_validator(@1234), 0);
        let config = borrow_global<Config>(@oracle);
        assert!(vector::length(&config.validators) == 0, 0);
    }

    #[test(oracle = @oracle)]
    #[expected_failure(abort_code = 0x80005)]
    public fun test_fail_to_set_validater_twice(oracle: &signer) acquires Config {
        init_module(oracle);
        set_validator(oracle, @1234, true);
        set_validator(oracle, @1234, true);
    }


    #[test(oracle = @oracle)]
    public fun test_set_threshold(oracle: &signer) acquires Config {
        init_module(oracle);

        set_threshold(oracle, 2);
        assert!(get_threshold() == 2, 0);
    }

    #[test(oracle = @oracle, validator1 = @1234)]
    public fun test_set_fee(oracle: &signer, validator1: &signer) acquires Config {
        init_module(oracle);
        set_validator(oracle, address_of(validator1), true);

        set_fee(validator1, 20108, 10);

        let config = borrow_global<Config>(@oracle);
        assert!(uln_signer::quote(config.resource_addr, @1122, 20108, 0) == 10, 0);
    }

    #[test(oracle = @oracle, layerzero = @layerzero, msglib_auth = @msglib_auth, validator1 = @1234, validator2 = @2345)]
    public fun test_propose(oracle: &signer, layerzero: &signer, msglib_auth: &signer, validator1: &signer, validator2: &signer) acquires Config, ProposalStore {
        use layerzero::test_helpers;
        use std::bcs;
        use layerzero_common::packet;
        use layerzero::uln_receive;

        test_helpers::setup_layerzero_for_oracle_test(layerzero, msglib_auth);
        init_module(oracle);

        set_validator(oracle, @1234, true);
        set_validator(oracle, @2345, true);
        set_threshold(oracle, 2);

        let payload = vector<u8>[1, 2, 3, 4];
        let emitted_packet = packet::new_packet(20108, bcs::to_bytes(&@3456), 20108, bcs::to_bytes(&@3456), 1, payload);
        let hash = packet::hash_sha3_packet(&emitted_packet);
        let confirmations = 1;
        let key = ProposalKey {
            hash,
            confirmations
        };

        propose(validator1, hash, confirmations);

        let store = borrow_global<ProposalStore>(@oracle);
        let proposal = table::borrow(&store.proposals, key);
        assert!(!proposal.submitted, 0);
        assert!(vector::length(&proposal.approved_by) == 1, 0);
        assert!(vector::contains(&proposal.approved_by, &@1234), 0);

        propose(validator2, hash, confirmations);

        let store = borrow_global<ProposalStore>(@oracle);
        let proposal = table::borrow(&store.proposals, key);
        assert!(proposal.submitted, 0);
        assert!(vector::length(&proposal.approved_by) == 2, 0);

        let config = borrow_global<Config>(@oracle);
        assert!(uln_receive::get_proposal_confirmations(config.resource_addr, hash) == confirmations, 0);
    }
}
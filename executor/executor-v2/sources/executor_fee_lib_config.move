module executor_v2::executor_fee_lib_config {
    use std::event::emit;
    use std::signer;
    use std::table::{Self, Table};

    const ENOT_FOUND: u64 = 0x01;

    struct Config has key {
        // executor address -> executor fee library address
        executor_to_fee_lib: Table<address, address>,
    }

    #[event]
    struct ExecutorFeeLibSet has store, drop {
        executor: address,
        fee_lib: address,
    }

    fun init_module(account: &signer) {
        move_to(account, Config {
            executor_to_fee_lib: table::new(),
        });
    }

    public entry fun set_executor_fee_lib(executor: &signer, fee_lib: address) acquires Config {
        let config = borrow_global_mut<Config>(@executor_v2);
        let executor_address = signer::address_of(executor);
        table::upsert(&mut config.executor_to_fee_lib, executor_address, fee_lib);
        emit(ExecutorFeeLibSet {
            executor: executor_address,
            fee_lib,
        });
    }

    #[view]
    public fun get_executor_fee_lib(executor: address): address acquires Config {
        let config = borrow_global<Config>(@executor_v2);
        assert!(table::contains(&config.executor_to_fee_lib, executor), ENOT_FOUND);
        *table::borrow(&config.executor_to_fee_lib, executor)
    }

    #[test_only]
    public fun init_module_for_test() {
        let account = &std::account::create_signer_for_test(@executor_v2);
        init_module(account);
    }

    #[test_only]
    public fun executor_fee_lib_set_event(executor: address, fee_lib: address): ExecutorFeeLibSet {
        ExecutorFeeLibSet {
            executor,
            fee_lib,
        }
    }
}
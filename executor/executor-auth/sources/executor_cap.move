module executor_auth::executor_cap {
    use std::error;
    use layerzero_common::utils::assert_signer;

    const EEXECUTOR_AUTH_NOT_AUTORIZED: u64 = 0x00;

    struct GlobalStore has key {
        last_version: u64
    }

    struct ExecutorCapability has store {
        version: u64
    }

    fun init_module(account: &signer) {
        move_to(account, GlobalStore { last_version: 0 })
    }

    public fun new_version(account: &signer): (u64, ExecutorCapability) acquires GlobalStore {
        assert_signer(account, @executor_auth);
        let store = borrow_global_mut<GlobalStore>(@executor_auth);
        store.last_version = store.last_version + 1;
        (store.last_version, ExecutorCapability { version: store.last_version })
    }

    public fun version(cap: &ExecutorCapability): u64 {
        cap.version
    }

    public fun assert_version(cap: &ExecutorCapability, version: u64) {
        assert!(cap.version == version, error::invalid_argument(EEXECUTOR_AUTH_NOT_AUTORIZED));
    }

    #[test_only]
    public fun init_module_for_test(account: &signer) {
        init_module(account);
    }
}
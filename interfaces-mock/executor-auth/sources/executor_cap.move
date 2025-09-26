module executor_auth::executor_cap {

    struct ExecutorCapability has store {
        version: u64
    }

    public fun version(cap: &ExecutorCapability): u64 {
        cap.version
    }

    public fun assert_version(_cap: &ExecutorCapability, _version: u64) {
        abort 0
    }
}
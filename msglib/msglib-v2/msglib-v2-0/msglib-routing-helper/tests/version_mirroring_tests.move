#[test_only]
module msglib_routing_helper::version_mirroring_tests {

    use std::account;

    use layerzero_common::semver;

    use layerzero::endpoint;
    use layerzero::msglib_config;
    use msglib_routing_helper::version_mirroring;
    use msglib_v2::msglib_v2_router;

    struct TestUa {}

    const TEST_CHAIN_ID: u64 = 1;

    fun setup(lz: &signer, ua: &signer, msglib_v2_router: &signer) {
        msglib_config::setup(lz, lz, ua);
        msglib_v2_router::init(msglib_v2_router);
        endpoint::init(lz, 2);
        let account = account::create_account_for_test(@msglib_routing_helper);
        let ua_cap = endpoint::register_ua<TestUa>(&account);
        endpoint::set_send_msglib<TestUa>(TEST_CHAIN_ID, 2, 0, &ua_cap);
        endpoint::destroy_ua_cap<TestUa>(ua_cap);
        version_mirroring::init_module_for_test(&account);
    }

    #[test(lz = @layerzero, ua = @test, msglib_v2_router = @msglib_v2)]
    fun test_sync(lz: &signer, ua: &signer, msglib_v2_router: &signer) {
        setup(lz, ua, msglib_v2_router);
        version_mirroring::sync(@msglib_routing_helper, TEST_CHAIN_ID);
        let version = msglib_v2_router::get_send_msglib(@msglib_routing_helper, TEST_CHAIN_ID);
        let (major, minor) = semver::values(&version);
        assert!(major == 2, 0);
        assert!(minor == 0, 1);
    }
}

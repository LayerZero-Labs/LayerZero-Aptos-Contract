#[test_only]
module uln_301_receive_helper::address_size_config_tests {
    use endpoint_v2_common::universal_config::{Self, layerzero_admin};
    use uln_301_receive_helper::uln_301_receive_helper;

    // Constants used in tests
    const TEST_EID_1: u32 = 101;
    const TEST_EID_2: u32 = 102;
    const TEST_ADDRESS_SIZE_1: u8 = 20;
    const TEST_ADDRESS_SIZE_2: u8 = 32;

    // Test helper to initialize the module for testing
    fun setup(): signer {
        // Initialize the module with admin account
        universal_config::init_module_for_test(TEST_EID_1);
        uln_301_receive_helper::init_module_for_test(&std::account::create_signer_for_test(@uln_301_receive_helper));
        std::account::create_signer_for_test(layerzero_admin())
    }

    #[test]
    /// Test that set_chain_address_size correctly sets an address size for a chain ID
    fun test_set_chain_address_size_success() {
        let admin = setup();

        // Set address size for a chain ID
        uln_301_receive_helper::set_address_size(&admin, TEST_EID_1, TEST_ADDRESS_SIZE_1);

        // Verify that the address size is set correctly
        let retrieved_size = uln_301_receive_helper::get_address_size(TEST_EID_1);
        assert!(retrieved_size == TEST_ADDRESS_SIZE_1, 0);

        // Set address size for another chain ID
        uln_301_receive_helper::set_address_size(&admin, TEST_EID_2, TEST_ADDRESS_SIZE_2);

        // Verify that the address size is set correctly
        let retrieved_size = uln_301_receive_helper::get_address_size(TEST_EID_2);
        assert!(retrieved_size == TEST_ADDRESS_SIZE_2, 1);
    }

    #[test]
    #[expected_failure(abort_code = 0x10001)] // EULN_IMMUTABLE_ADDRESS_SIZE = 1, error::invalid_argument(1) = 0x10001
    /// Test that set_chain_address_size fails when trying to set an address size for a chain ID that already has one
    fun test_set_chain_address_size_duplicate_fails() {
        let admin = setup();

        // Set address size for a chain ID
        uln_301_receive_helper::set_address_size(&admin, TEST_EID_1, TEST_ADDRESS_SIZE_1);

        // Try to set address size for the same chain ID again - should fail
        uln_301_receive_helper::set_address_size(&admin, TEST_EID_1, TEST_ADDRESS_SIZE_2);
    }

    #[test]
    #[expected_failure(abort_code = 0x10002)] // EULN_INVALID_ADDRESS_SIZE = 1, error::invalid_argument(2) = 0x10002
    /// Test that set_chain_address_size fails when trying to set an address size for a chain ID that is not supported
    fun test_set_chain_address_size_exceed_max_fails() {
        let admin = setup();

        uln_301_receive_helper::set_address_size(&admin, TEST_EID_1, 33);
    }

    #[test]
    #[expected_failure(abort_code = universal_config::EUNAUTHORIZED)]
    /// Test that set_chain_address_size fails when trying to set an address size for a chain ID that is not supported
    fun test_set_chain_address_size_by_non_admin_fails() {
        setup();
        let non_admin = std::account::create_signer_for_test(@uln_301_receive_helper);
        uln_301_receive_helper::set_address_size(&non_admin, TEST_EID_1, TEST_ADDRESS_SIZE_1);
    }

    #[test]
    #[expected_failure]
    /// Test that get_address_size fails when trying to get an address size for a chain ID that hasn't been set
    fun test_get_address_size_nonexistent_fails() {
        setup();

        // Try to get address size for a chain ID that hasn't been set - should fail
        uln_301_receive_helper::get_address_size(999);
    }
} 
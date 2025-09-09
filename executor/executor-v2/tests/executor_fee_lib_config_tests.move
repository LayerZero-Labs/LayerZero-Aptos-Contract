#[test_only]
module executor_v2::executor_fee_lib_config_tests {
    use std::account::create_signer_for_test;
    use std::event::was_event_emitted;
    use std::signer;

    use executor_v2::executor_fee_lib_config;

    #[test]
    fun test_set_executor_fee_lib() {
        executor_fee_lib_config::init_module_for_test();
        let executor = create_signer_for_test(@0x123);
        let fee_lib = @0x456;

        // Set executor fee library
        executor_fee_lib_config::set_executor_fee_lib(&executor, fee_lib);

        // Verify the fee library is set
        let registered_fee_lib = executor_fee_lib_config::get_executor_fee_lib(signer::address_of(&executor));
        assert!(registered_fee_lib == fee_lib, 0);
        assert!(was_event_emitted(&executor_fee_lib_config::executor_fee_lib_set_event(
            signer::address_of(&executor),
            fee_lib,
        )), 1);
    }

    #[test]
    fun test_set_executor_fee_lib_update() {
        executor_fee_lib_config::init_module_for_test();
        let executor = create_signer_for_test(@0x123);
        let fee_lib1 = @0x456;
        let fee_lib2 = @0x789;

        // Set executor fee library
        executor_fee_lib_config::set_executor_fee_lib(&executor, fee_lib1);
        let registered_fee_lib = executor_fee_lib_config::get_executor_fee_lib(signer::address_of(&executor));
        assert!(registered_fee_lib == fee_lib1, 0);
        
        // Update the same executor's fee library - should succeed
        executor_fee_lib_config::set_executor_fee_lib(&executor, fee_lib2);

        let registered_fee_lib = executor_fee_lib_config::get_executor_fee_lib(signer::address_of(&executor));
        assert!(registered_fee_lib == fee_lib2, 1);
        assert!(was_event_emitted(&executor_fee_lib_config::executor_fee_lib_set_event(
            signer::address_of(&executor),
            fee_lib2,
        )), 1);
    }

    #[test]
    #[expected_failure(abort_code = executor_v2::executor_fee_lib_config::ENOT_FOUND)]
    fun test_get_executor_fee_lib_not_found() {
        executor_fee_lib_config::init_module_for_test();
        let non_existent_executor = @0x999;

        // Try to get fee library for non-existent executor - should fail
        executor_fee_lib_config::get_executor_fee_lib(non_existent_executor);
    }

    #[test]
    fun test_set_multiple_executors_fee_lib() {
        executor_fee_lib_config::init_module_for_test();
        let executor1 = create_signer_for_test(@0x111);
        let executor2 = create_signer_for_test(@0x222);
        let fee_lib1 = @0x456;
        let fee_lib2 = @0x789;

        // Set first executor's fee library
        executor_fee_lib_config::set_executor_fee_lib(&executor1, fee_lib1);

        // Set second executor's fee library
        executor_fee_lib_config::set_executor_fee_lib(&executor2, fee_lib2);

        // Verify both fee libraries are set
        let registered_fee_lib1 = executor_fee_lib_config::get_executor_fee_lib(signer::address_of(&executor1));
        let registered_fee_lib2 = executor_fee_lib_config::get_executor_fee_lib(signer::address_of(&executor2));

        assert!(registered_fee_lib1 == fee_lib1, 0);
        assert!(registered_fee_lib2 == fee_lib2, 1);
    }

    #[test]
    fun test_set_executors_with_same_fee_lib() {
        executor_fee_lib_config::init_module_for_test();
        let executor1 = create_signer_for_test(@0x111);
        let executor2 = create_signer_for_test(@0x222);
        let shared_fee_lib = @0x456;

        // Set two executors with the same fee library
        executor_fee_lib_config::set_executor_fee_lib(&executor1, shared_fee_lib);
        executor_fee_lib_config::set_executor_fee_lib(&executor2, shared_fee_lib);

        // Verify both fee libraries are set
        let registered_fee_lib1 = executor_fee_lib_config::get_executor_fee_lib(signer::address_of(&executor1));
        let registered_fee_lib2 = executor_fee_lib_config::get_executor_fee_lib(signer::address_of(&executor2));

        assert!(registered_fee_lib1 == shared_fee_lib, 0);
        assert!(registered_fee_lib2 == shared_fee_lib, 1);
    }
} 
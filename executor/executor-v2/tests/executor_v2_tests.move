#[test_only]
module executor_v2::executor_v2_tests {
    use endpoint_v2_common::serde;
    use executor_v2::executor_v2;

    #[test]
    fun test_convert_to_options_type3_with_type_1_adapter_params() {
        // Test with legacy type 1 adapter params: [2 bytes: type][8 bytes: extraGas]
        // Type 1, extraGas = 200000 (0x30d40)
        let legacy_options = x"00010000000000030d40";
        let expected_options = x"0100110100000000000000000000000000030d40";

        let result = executor_v2::test_convert_to_options_type3(&legacy_options);
        assert!(result == expected_options, 0);

        // Verify the structure of the converted options
        let pos = &mut 0;
        assert!(serde::extract_u8(&result, pos) == 1, 1); // worker_id
        assert!(serde::extract_u16(&result, pos) == 17, 2); // option_size
        assert!(serde::extract_u8(&result, pos) == 1, 3); // option_type
        assert!(serde::extract_u128(&result, pos) == 200000, 4); // option value (execution gas)
    }

    #[test]
    fun test_convert_to_options_type3_with_type_2_adapter_params() {
        // Test with legacy type 2 adapter params: [2 bytes: type][8 bytes: extraGas][8 bytes: airdropAmt][variable: airdropAddress]
        // Type 2, extraGas = 200000 (0x30d40), airdropAmt = 10000000 (0x989680), airdropAddress = 0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266
        let legacy_options = x"00020000000000030d400000000000989680f39fd6e51aad88f6f4ce6ab8827279cfffb92266";
        let expected_options = x"0100110100000000000000000000000000030d400100310200000000000000000000000000989680000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb92266";

        let result = executor_v2::test_convert_to_options_type3(&legacy_options);
        assert!(result == expected_options, 0);

        // Verify the structure of the converted options
        let pos = &mut 0;
        // First option (lz_receive)
        assert!(serde::extract_u8(&result, pos) == 1, 1); // worker_id
        assert!(serde::extract_u16(&result, pos) == 17, 2); // option_size
        assert!(serde::extract_u8(&result, pos) == 1, 3); // option_type
        assert!(serde::extract_u128(&result, pos) == 200000, 4); // option value (execution gas)
        // Second option (native_drop)
        assert!(serde::extract_u8(&result, pos) == 1, 5); // worker_id
        assert!(serde::extract_u16(&result, pos) == 49, 6); // option_size
        assert!(serde::extract_u8(&result, pos) == 2, 7); // option_type
        assert!(serde::extract_u128(&result, pos) == 10000000, 8); // option value (amount)
        let expected_receiver = endpoint_v2_common::bytes32::to_bytes32(
            x"000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb92266"
        );
        assert!(serde::extract_bytes32(&result, pos) == expected_receiver, 9); // option value (receiver)
    }

    #[test]
    #[expected_failure(abort_code = 0x10002, location = executor_v2::executor_v2)]
    fun test_convert_to_options_type3_with_invalid_type_3() {
        // Test with invalid adapter params type 3 (should fail because function only accepts type 1 or 2)
        let invalid_options = x"00030000000000030d40";
        executor_v2::test_convert_to_options_type3(&invalid_options);
    }

    #[test]
    #[expected_failure(abort_code = 0x10001, location = executor_v2::executor_v2)]
    fun test_convert_to_options_type3_with_invalid_size() {
        // Test with invalid adapter params size (should fail because type 1 requires exactly 10 bytes)
        let invalid_options = x"0001000000000030d4"; // only 9 bytes
        executor_v2::test_convert_to_options_type3(&invalid_options);
    }

    #[test]
    #[expected_failure(abort_code = 0x10001, location = executor_v2::executor_v2)]
    fun test_convert_to_options_type3_with_invalid_size2() {
        // Test with invalid adapter params size (should fail because type 1 requires at least 18 bytes)
        let invalid_options = x"00020000000000030d4000000000989680"; // only 17 bytes
        executor_v2::test_convert_to_options_type3(&invalid_options);
    }
} 
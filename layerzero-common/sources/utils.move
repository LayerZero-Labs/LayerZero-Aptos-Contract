module layerzero_common::utils {
    use std::vector;
    use std::error;
    use std::signer::address_of;
    use aptos_std::type_info::{account_address, type_of};

    const ELAYERZERO_INVALID_INDEX: u64 = 0x00;
    const ELAYERZERO_INVALID_U16: u64 = 0x01;
    const ELAYERZERO_INVALID_LENGTH: u64 = 0x02;
    const ELAYERZERO_PERMISSION_DENIED: u64 = 0x03;

    public fun vector_slice<T: copy>(vec: &vector<T>, start: u64, end: u64): vector<T> {
        assert!(start < end && end <= vector::length(vec), error::invalid_argument(ELAYERZERO_INVALID_INDEX));
        let slice = vector::empty<T>();
        let i = start;
        while (i < end) {
            vector::push_back(&mut slice, *vector::borrow(vec, i));
            i = i + 1;
        };
        slice
    }

    public fun assert_signer(account: &signer, account_address: address) {
        assert!(address_of(account) == account_address, error::permission_denied(ELAYERZERO_PERMISSION_DENIED));
    }

    public fun assert_length(data: &vector<u8>, length: u64) {
        assert!(vector::length(data) == length, error::invalid_argument(ELAYERZERO_INVALID_LENGTH));
    }

    public fun assert_type_signer<TYPE>(account: &signer) {
        assert!(type_address<TYPE>() == address_of(account), error::permission_denied(ELAYERZERO_PERMISSION_DENIED));
    }

    public fun assert_u16(chain_id: u64) {
        assert!(chain_id <= 65535, error::invalid_argument(ELAYERZERO_INVALID_U16));
    }

    public fun type_address<TYPE>(): address {
        account_address(&type_of<TYPE>())
    }

    #[test]
    fun test_vector_slice() {
        let vec = vector<u8>[1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        let slice = vector_slice<u8>(&vec, 2, 8);
        assert!(slice == vector<u8>[3, 4, 5, 6, 7, 8], 0);

        let slice = vector_slice<u8>(&vec, 2, 3);
        assert!(slice == vector<u8>[3], 0);
    }

    #[test]
    #[expected_failure(abort_code = 0x10000)]
    fun test_vector_slice_with_invalid_index() {
        let vec = vector<u8>[1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        vector_slice<u8>(&vec, 2, 20);
    }
}
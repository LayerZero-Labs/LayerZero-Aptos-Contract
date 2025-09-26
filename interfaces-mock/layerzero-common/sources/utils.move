// mock utils
module layerzero_common::utils {
    public fun type_address<TYPE>(): address {
        abort 0
    }

    public fun assert_u16(_chain_id: u64) {
        abort 0
    }
}
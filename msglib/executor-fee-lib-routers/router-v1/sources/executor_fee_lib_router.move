module executor_fee_lib_router_v1::executor_fee_lib_router {
    use std::vector;

    use executor_fee_lib_router_v2::executor_fee_lib_router as executor_fee_lib_router_next;

    /// This address is a magic number that indicates no fee is charged and not a reference
    /// to an actual contract.
    const FEE_LIB_ZERO: address = @0x0fee;

    const EINVALID_OPTIONS: u64 = 0x1;

    public fun get_executor_fee(
        msglib: address,
        executor_fee_lib: address,
        worker: address,
        dst_eid: u32,
        sender: address,
        message_size: u64,
        options: vector<u8>,
    ): (u64, address) {
        // If fee_lib is FEE_LIB_ZERO, no fee is charged, but as a precaution, we enforce that
        // the options are empty.
        if (executor_fee_lib == FEE_LIB_ZERO) {
            assert!(vector::is_empty(&options), EINVALID_OPTIONS);
            (0, @0x0)
        } else {
            executor_fee_lib_router_next::get_executor_fee(
                msglib,
                executor_fee_lib,
                worker,
                dst_eid,
                sender,
                message_size,
                options,
            )
        }
    }
}

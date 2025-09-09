module executor_fee_lib_router_v2::executor_fee_lib_router {
    use executor_fee_lib_router_v3::executor_fee_lib_router as executor_fee_lib_router_next;
    use executor_fee_lib_v1::executor_fee_lib;

    const ENOT_IMPLEMENTED: u64 = 1;

    #[view]
    public fun get_executor_fee(
        msglib: address,
        fee_lib: address,
        worker: address,
        dst_eid: u32,
        sender: address,
        message_size: u64,
        options: vector<u8>,
    ): (u64, address) {
        if (fee_lib == @executor_fee_lib_v1) {
            executor_fee_lib::get_executor_fee(
                msglib,
                worker,
                dst_eid,
                sender,
                message_size,
                options,
                // Don't require a non-zero LZ Receive Gas on the call from the ULN 301; this is required when called from the Endpoint
                true,
            )
        } else {
            executor_fee_lib_router_next::get_executor_fee(
                msglib,
                fee_lib,
                worker,
                dst_eid,
                sender,
                message_size,
                options,
            )
        }
    }
}

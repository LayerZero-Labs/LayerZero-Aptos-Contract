module executor_v2_fee_lib_router_v1::executor_v2_fee_lib_router {
    use executor_fee_lib_v1::executor_fee_lib as msglib_executor_fee_lib_v1;
    use executor_v2_fee_lib_router_v2::executor_v2_fee_lib_router as executor_v2_fee_lib_router_next;

    #[view]
    public fun get_executor_fee(
        executor_fee_lib: address,
        executor: address,
        dst_eid: u32,
        sender: address,
        options: vector<u8>,
    ): (u64, address) {
        if (executor_fee_lib == @executor_fee_lib_v1) {
            msglib_executor_fee_lib_v1::get_executor_fee(
                @executor_v2,
                executor,
                dst_eid,
                sender,
                0, // quote with 0 message size
                options,
                // Require a non-zero LZ Receive Gas on the call from the Endpoint; this is not required when called from the ULN 301
                false,
            )
        } else {
            executor_v2_fee_lib_router_next::get_executor_fee(
                executor_fee_lib,
                executor,
                dst_eid,
                sender,
                options,
            )
        }
    }
}

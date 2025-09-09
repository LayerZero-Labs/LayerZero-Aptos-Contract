module executor_v2_fee_lib_router_v2::executor_v2_fee_lib_router {

    const ENOT_IMPLEMENTED: u64 = 0x00;

    #[view]
    public fun get_executor_fee(
        _executor_fee_lib: address,
        _executor: address,
        _dst_eid: u32,
        _sender: address,
        _options: vector<u8>,
    ): (u64, address) {
        abort ENOT_IMPLEMENTED
    }
}

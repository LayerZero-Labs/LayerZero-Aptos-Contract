module layerzero::executor_router {
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::coin::Coin;
    use layerzero::executor_v1;
    use layerzero_common::packet::Packet;
    use executor_v2::executor_v2;
    use executor_auth::executor_cap::{Self, ExecutorCapability};

    friend layerzero::endpoint;

    // interacting with the currently configured version
    public(friend) fun request<UA>(
        executor: address,
        packet: &Packet,
        adapter_params: vector<u8>,
        fee: Coin<AptosCoin>,
        cap: &ExecutorCapability,
    ): Coin<AptosCoin> {
        let version = executor_cap::version(cap);
        if (version == 1) {
            executor_v1::request<UA>(executor, packet, adapter_params, fee, cap)
        } else {
            executor_v2::request<UA>(executor, packet, adapter_params, fee, cap)
        }
    }

    public fun quote(
        ua_address: address,
        version: u64,
        executor: address,
        dst_chain_id: u64,
        adapter_params: vector<u8>
    ): u64 {
        if (version == 1) {
            executor_v1::quote_fee(ua_address, executor, dst_chain_id, adapter_params)
        } else {
            executor_v2::quote_fee(ua_address, executor, dst_chain_id, adapter_params)
        }
    }
}
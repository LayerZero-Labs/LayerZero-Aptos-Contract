module executor_v2::executor_v2 {
    use aptos_framework::coin::Coin;
    use aptos_framework::aptos_coin::AptosCoin;
    use layerzero_common::packet::Packet;
    use executor_auth::executor_cap::ExecutorCapability;

    public fun request<UA>(
        _executor: address,
        _packet: &Packet,
        _adapter_params: vector<u8>,
        _fee: Coin<AptosCoin>,
        _cap: &ExecutorCapability
    ): Coin<AptosCoin> {
        abort 0
    }

    public fun quote_fee(
        _ua_address: address,
        _executor: address,
        _dst_chain_id: u64,
        _adapter_params: vector<u8>
    ): u64 {
        abort 0
    }
}
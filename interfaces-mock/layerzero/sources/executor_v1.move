module layerzero::executor_v1 {
    public entry fun airdrop(
        _account: &signer,
        _src_chain_id: u64,
        _guid: vector<u8>,
        _receiver: address,
        _amount: u64,
    ) {
        abort 0
    }
}
module layerzero::endpoint {

    use msglib_auth::msglib_cap::MsgLibReceiveCapability;
    use layerzero_common::packet::Packet;

    public fun receive<UA>(_packet: Packet, _cap: &MsgLibReceiveCapability) {
        abort 0
    }

    public fun register_msglib<MSGLIB>(_account: &signer, _major: bool): MsgLibReceiveCapability {
        abort 0
    }

    public entry fun register_executor<EXECUTOR>(_account: &signer) {
        abort 0
    }

    public fun get_send_msglib(_ua_address: address, _chain_id: u64): (u64, u8) {
        abort 0
    }

    public fun get_receive_msglib(_ua_address: address, _chain_id: u64): (u64, u8) {
        abort 0
    }

    public fun inbound_nonce(_ua_address: address, _src_chain_id: u64, _src_address: vector<u8>): u64 {
        abort 0
    }

    public fun has_next_receive(_ua_address: address, _src_chain_id: u64, _src_address: vector<u8>): bool {
        abort 0
    }

    public fun get_local_chain_id(): u64 {
        abort 0
    }
}
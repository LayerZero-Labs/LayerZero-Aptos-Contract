// mock packet
module layerzero_common::packet {

    struct Packet has drop, key, store, copy {
        src_chain_id: u64, // u16
        src_address: vector<u8>,
        dst_chain_id: u64, // u16
        dst_address: vector<u8>,
        nonce: u64,
        payload: vector<u8>
    }

    public fun new_packet(src_chain_id: u64, src_address: vector<u8>, dst_chain_id: u64, dst_address: vector<u8>, nonce: u64, payload: vector<u8>): Packet {
        return Packet{src_chain_id, src_address, dst_chain_id, dst_address, nonce, payload}
    }

    public fun src_chain_id(p: &Packet): u64 {
        return p.src_chain_id
    }

    public fun src_address(p: &Packet): vector<u8> {
        return p.src_address
    }

    public fun dst_chain_id(p: &Packet): u64 {
        return p.dst_chain_id
    }

    public fun dst_address(p: &Packet): vector<u8> {
        return p.dst_address
    }

    public fun nonce(p: &Packet): u64 {
        return p.nonce
    }

    public fun payload(p: &Packet): vector<u8> {
        return p.payload
    }

    public fun get_guid(_p: &Packet): vector<u8> {
        abort 0
    }

    public fun decode_packet(_packet_bytes: &vector<u8>, _src_address_size: u64): Packet {
        abort 0
    }
}
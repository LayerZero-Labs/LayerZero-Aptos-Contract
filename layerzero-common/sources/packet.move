module layerzero_common::packet {
    use std::vector;
    use std::hash;
    use layerzero_common::serde;
    use layerzero_common::utils::vector_slice;

    // basic packet structure for a data packet {channel_id, nocne and payload}
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

    public fun encode_packet(p: &Packet): vector<u8> {
        let bytes = vector::empty();
        serde::serialize_u64(&mut bytes, p.nonce);
        serde::serialize_u16(&mut bytes, p.src_chain_id);
        serde::serialize_vector(&mut bytes, p.src_address);
        serde::serialize_u16(&mut bytes, p.dst_chain_id);
        serde::serialize_vector(&mut bytes, p.dst_address);
        serde::serialize_vector(&mut bytes, p.payload);
        bytes
    }

    // only apply to serialized packet of this specific packet type
    public fun decode_packet(packet_bytes: &vector<u8>, src_address_size: u64): Packet {
        let nonce = decode_nonce(packet_bytes);
        let src_chain_id = decode_src_chain_id(packet_bytes);
        let src_address = decode_src_address(packet_bytes, src_address_size);
        let dst_chain_id = decode_dst_chain_id(packet_bytes, src_address_size);
        let dst_address = decode_dst_address(packet_bytes, src_address_size);
        let payload = decode_payload(packet_bytes, src_address_size);
        Packet{nonce, src_chain_id, src_address, dst_chain_id, dst_address, payload}
    }

    // only apply to serialized packet of this specific packet type
    public fun decode_nonce(packet_bytes: &vector<u8>): u64 {
        serde::deserialize_u64(&vector_slice(packet_bytes, 0, 8))
    }

    // only apply to serialized packet of this specific packet type
    public fun decode_src_chain_id(packet_bytes: &vector<u8>): u64 {
        serde::deserialize_u16(&vector_slice(packet_bytes, 8, 10))
    }

    // only apply to serialized packet of this specific packet type
    public fun decode_src_address(packet_bytes: &vector<u8>, src_address_size: u64): vector<u8> {
        vector_slice(packet_bytes, 10, 10 + src_address_size)
    }

    // only apply to serialized packet of this specific packet type
    public fun decode_dst_chain_id(packet_bytes: &vector<u8>, src_address_size: u64): u64 {
        serde::deserialize_u16(&vector_slice(packet_bytes, 10 + src_address_size, 12 + src_address_size))
    }

    // only apply to serialized packet of this specific packet type
    public fun decode_dst_address(packet_bytes: &vector<u8>, src_address_size: u64): vector<u8> {
        vector_slice(packet_bytes, 12 + src_address_size, 44 + src_address_size)
    }

    // only apply to serialized packet of this specific packet type
    public fun decode_payload(packet_bytes: &vector<u8>, src_address_size: u64): vector<u8> {
        vector_slice(packet_bytes, 44 + src_address_size, vector::length(packet_bytes))
    }

    public fun hash_sha3_packet(p: &Packet): vector<u8> {
        hash_sha3_packet_bytes(encode_packet(p))
    }

    public fun hash_sha3_packet_bytes(packet_bytes: vector<u8>): vector<u8> {
        hash::sha3_256(packet_bytes)
    }

    public fun get_guid(p: &Packet): vector<u8> {
        compute_guid(
            p.nonce,
            p.src_chain_id,
            p.src_address,
            p.dst_chain_id,
            p.dst_address,
        )
    }

    public fun compute_guid(nonce: u64, src_chain_id: u64, src_address: vector<u8>, dst_chain_id: u64, dst_address: vector<u8>): vector<u8> {
        let guid_bytes = vector::empty<u8>();
        serde::serialize_u64(&mut guid_bytes, nonce);
        serde::serialize_u16(&mut guid_bytes, src_chain_id);
        serde::serialize_vector(&mut guid_bytes, src_address);
        serde::serialize_u16(&mut guid_bytes, dst_chain_id);
        serde::serialize_vector(&mut guid_bytes, dst_address);

        hash::sha3_256(guid_bytes)
    }

    #[test_only]
    use aptos_std::comparator::{compare, is_equal};
    #[test_only]
    use std::bcs;

    #[test]
    fun test_encode_packet() {
        let packet = Packet {
            src_chain_id: 1,
            src_address: vector<u8>[1, 2, 3, 4, 5, 6],
            dst_chain_id: 2,
            dst_address: vector<u8>[7, 8, 9, 10, 11, 12],
            nonce: 0x1234u64,
            payload: vector::empty(),
        };
        let encoded = encode_packet(&packet);
        assert!(is_equal(&compare(&encoded, &vector<u8>[0, 0, 0, 0, 0, 0, 18, 52, 0, 1, 1, 2, 3, 4, 5, 6, 0, 2, 7, 8, 9, 10, 11, 12])), 1);
    }

    #[test]
    fun test_hash_packet() {
        let packet = Packet {
            src_chain_id: 1,
            src_address: vector<u8>[1, 2, 3, 4, 5, 6],
            dst_chain_id: 2,
            dst_address: vector<u8>[7, 8, 9, 10, 11, 12],
            nonce: 0,
            payload: vector::empty(),
        };
        let hash = hash_sha3_packet(&packet);
        assert!(is_equal(&compare(&hash, &vector<u8>[160, 33, 246, 191, 58, 98, 150, 157, 194, 101, 84, 32, 27, 37, 210, 161, 174, 187, 155, 55, 97, 162, 32, 68, 218, 115, 15, 113, 10, 17, 117, 68])), 1);
    }

    #[test]
    fun test_decode_packet() {
        let packet = Packet {
            src_chain_id: 1,
            src_address: vector<u8>[1, 2, 3, 4, 5, 6],
            dst_chain_id: 2,
            dst_address: bcs::to_bytes(&@0x1),
            nonce: 100,
            payload: vector<u8>[1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        };
        let encoded = encode_packet(&packet);
        let decoded_pk = decode_packet(&encoded, 6);
        assert!(packet == decoded_pk, 1);
    }
}
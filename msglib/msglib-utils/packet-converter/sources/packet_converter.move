module packet_converter::packet_converter {
    use endpoint_v2_common::bytes32;
    use endpoint_v2_common::packet_raw::RawPacket;
    use endpoint_v2_common::packet_v1_codec;
    use endpoint_v2_common::send_packet::{Self, SendPacket};
    use endpoint_v2_common::serde::{Self, map_count, pad_zero_left};
    use layerzero_common::packet::{Self, Packet};

    /// Convert a LZV1 packet to a LZV2 packet
    public fun convert_to_lzv2_packet(packet: &Packet): SendPacket {
        let nonce = packet::nonce(packet);
        let src_eid = packet::src_chain_id(packet) as u32;
        let sender = bytes32::to_bytes32(packet::src_address(packet));
        let dst_eid = packet::dst_chain_id(packet) as u32;
        let receiver = bytes32::to_bytes32(pad_zero_left(packet::dst_address(packet), 32));
        let message = packet::payload(packet);
        send_packet::new_send_packet(
            nonce,
            src_eid,
            sender,
            dst_eid,
            receiver,
            message,
        )
    }

    /// Convert a LZV2 raw packet to a LZV1 packet
    public inline fun convert_to_lzv1_packet(raw_packet: &RawPacket, address_size: |u32| u8): Packet {
        let nonce = packet_v1_codec::get_nonce(raw_packet);
        let src_eid = packet_v1_codec::get_src_eid(raw_packet);
        let sender = bytes32::from_bytes32(packet_v1_codec::get_sender(raw_packet));
        sender = serde::extract_bytes_until_end(
            &sender,
            &mut (32 - (address_size(src_eid) as u64)),
        );
        let dst_eid = packet_v1_codec::get_dst_eid(raw_packet);
        let receiver = bytes32::from_bytes32(packet_v1_codec::get_receiver(raw_packet));
        let message = packet_v1_codec::get_message(raw_packet);
        packet::new_packet(
            src_eid as u64,
            sender,
            dst_eid as u64,
            receiver,
            nonce,
            message
        )
    }

    /// Create a dummy LZV2 packet with some missing fields, this packet is only used for quoting fees
    public fun new_dummy_lzv2_packet(src_eid: u32, sender: address, dst_eid: u32, message_length: u64): SendPacket {
        let sender = bytes32::from_address(sender);
        let receiver = bytes32::zero_bytes32();
        let message = map_count<u8>(message_length, |i| 0);
        let nonce = 1;
        send_packet::new_send_packet(nonce, src_eid, sender, dst_eid, receiver, message)
    }
}

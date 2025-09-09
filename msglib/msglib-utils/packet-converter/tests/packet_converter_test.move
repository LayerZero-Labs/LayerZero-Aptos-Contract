#[test_only]
module packet_converter::packet_converter_test {
    use std::bcs;
    use std::vector;

    use endpoint_v2_common::bytes32;
    use endpoint_v2_common::packet_v1_codec;
    use endpoint_v2_common::send_packet;
    use layerzero_common::packet::{Self};
    
    use packet_converter::packet_converter;

    #[test]
    fun test_convert_to_lzv2_packet() {
        // Setup: create a test LZV1 packet
        let nonce = 12345;
        let src_chain_id: u64 = 1;
        let src_address = bcs::to_bytes(&@0x1);
        let dst_chain_id: u64 = 2;
        let dst_address = bcs::to_bytes(&@0x2);
        let payload = b"test payload";
        
        let v1_packet = packet::new_packet(
            src_chain_id,
            src_address,
            dst_chain_id,
            dst_address,
            nonce,
            payload,
        );
        
        // Call the function to test
        let v2_packet = packet_converter::convert_to_lzv2_packet(&v1_packet);
        
        // Verify the V2 packet has the correct properties
        assert!(send_packet::get_nonce(&v2_packet) == nonce, 0);
        assert!(send_packet::get_src_eid(&v2_packet) == (src_chain_id as u32), 1);
        assert!(send_packet::get_dst_eid(&v2_packet) == (dst_chain_id as u32), 2);
        
        // Verify sender (converted to bytes32)
        let expected_sender = bytes32::to_bytes32(src_address);
        assert!(send_packet::get_sender(&v2_packet) == expected_sender, 3);
        
        // Verify receiver (padded to bytes32)
        let expected_receiver = bytes32::to_bytes32(dst_address);
        assert!(send_packet::get_receiver(&v2_packet) == expected_receiver, 4);
        
        // Verify payload
        assert!(*send_packet::borrow_message(&v2_packet) == payload, 5);
    }

    #[test]
    fun test_convert_to_lzv1_packet() {
        // Create test data
        let nonce = 1;
        let src_eid: u32 = 1;
        let dst_eid: u32 = 2;
        let guid = x"0000000000000000000000000000000000000000000000000000000000000000";
        let message_payload = b"test";
        // Create sender address - a 32-byte address with the last 20 bytes being significant
        let sender_bytes = x"000000000000000000000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        // Trim to get the expected 20 byte address (based on address_size_config)
        let expected_src_address = vector::slice(
            &sender_bytes,
            12,  // 32 - 20 = 12 bytes to skip
            32   // To the end
        );
        let receiver_bytes = x"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
        // Convert to RawPacket
        let raw_packet = packet_v1_codec::new_packet_v1(
            src_eid,
            bytes32::to_bytes32(sender_bytes),
            dst_eid,
            bytes32::to_bytes32(receiver_bytes),
            nonce,
            bytes32::to_bytes32(guid),
            message_payload
        );

        // Call function under test
        let converted_packet = packet_converter::convert_to_lzv1_packet(&raw_packet, |eid| (20 as u8));

        // Verify that the packet was converted correctly
        assert!(packet::nonce(&converted_packet) == nonce, 1);
        assert!(packet::src_chain_id(&converted_packet) == (src_eid as u64), 2);
        assert!(packet::dst_chain_id(&converted_packet) == (dst_eid as u64), 3);

        // Verify the src_address was properly truncated based on EID
        assert!(packet::src_address(&converted_packet) == expected_src_address, 4);

        // Verify the dst_address
        assert!(packet::dst_address(&converted_packet) == bytes32::from_bytes32(bytes32::to_bytes32(receiver_bytes)), 5);

        // Verify the payload
        assert!(packet::payload(&converted_packet) == message_payload, 6);
    }
} 
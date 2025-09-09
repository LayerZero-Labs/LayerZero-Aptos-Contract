module uln_301_receive_helper::uln_301_receive_helper {
    use std::error;
    use std::signer::address_of;
    use std::table::{Self, Table};
    use std::event;

    use layerzero::endpoint;

    use endpoint_v2_common::packet_raw;
    use endpoint_v2_common::packet_v1_codec;
    use endpoint_v2_common::universal_config::assert_layerzero_admin;
    use msglib_auth::msglib_cap::MsgLibReceiveCapability;
    use packet_converter::packet_converter;
    use uln_301::router_calls;

    #[test_only]
    use msglib_auth::msglib_cap;

    struct ULN301 {}

    struct Store has key {
        cap: MsgLibReceiveCapability,
        // eid -> address size
        address_size_configs: Table<u32, u8>,
    }

    #[event]
    struct AddressSizeSet has drop, store {
        eid: u32,
        size: u8,
    }

    fun init_module(account: &signer) {
        let cap = endpoint::register_msglib<ULN301>(account, true);
        move_to(account, Store { cap, address_size_configs: table::new() });
    }

    public entry fun commit_verification<UA>(raw_packet: vector<u8>) acquires Store {
        let lzv2_raw_packet = packet_raw::bytes_to_raw_packet(raw_packet);

        // step 1. Verify packet by calling ULN301's commit_verification()
        let packet_header = packet_v1_codec::extract_header(&lzv2_raw_packet);
        let payload_hash = packet_v1_codec::get_payload_hash(&lzv2_raw_packet);
        router_calls::commit_verification(packet_header, payload_hash, &store().cap);

        // step 2. Receive packet on endpoint
        let lzv1_packet = packet_converter::convert_to_lzv1_packet(
            &lzv2_raw_packet,
            |eid| get_address_size(eid)
        );
        endpoint::receive<UA>(lzv1_packet, &store().cap);
    }

    public entry fun set_address_size(account: &signer, eid: u32, size: u8) acquires Store {
        assert_layerzero_admin(address_of(move account));

        assert!(size <= 32, error::invalid_argument(EULN_INVALID_ADDRESS_SIZE));
        assert!(
            !table::contains(&store().address_size_configs, eid),
            error::invalid_argument(EULN_IMMUTABLE_ADDRESS_SIZE)
        );
        table::add(&mut store_mut().address_size_configs, eid, size);

        event::emit(AddressSizeSet { eid, size });
    }

    #[view]
    public fun get_address_size(eid: u32): u8 acquires Store {
        *table::borrow(&store().address_size_configs, eid)
    }

    inline fun store(): &Store {
        borrow_global(@uln_301_receive_helper)
    }

    inline fun store_mut(): &mut Store {
        borrow_global_mut(@uln_301_receive_helper)
    }

    // ================================================= Testing Helpers =================================================

    #[test_only]
    /// Initialize the module for testing
    public fun init_module_for_test(account: &signer) {
        move_to(account, Store {
            cap: msglib_cap::receive_cap(2, 0),
            address_size_configs: table::new()
        });
    }

    // ================================================= Error Codes ==================================================

    const EULN_IMMUTABLE_ADDRESS_SIZE: u64 = 1;
    const EULN_INVALID_ADDRESS_SIZE: u64 = 2;
}

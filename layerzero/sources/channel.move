// a channel is defined by its path identifier (src, dst) and its nonce states
// the channel only interacts with the endpoint with
//     (1) outbound() on endpoint.send() -> outbound_nonce++
//     (2) receive() on endpoint.receive() from msglib -> insert the payload into the Channel
//          note that the packets can arrive out of order
//     (3) inbound() receive on endpoint.lz_receive() -> inbound_nonce++
//          packets are consumed by order
module layerzero::channel {
    use aptos_std::table::{Self, Table};
    use layerzero_common::utils::{type_address, assert_type_signer};
    use std::error;
    use aptos_framework::event::{Self, EventHandle};
    use aptos_framework::account;

    friend layerzero::endpoint;

    const ELAYERZERO_INVALID_NONCE: u64 = 0x00;

    struct Remote has copy, drop {
        chain_id: u64,
        addr: vector<u8>
    }

    struct Channels has key {
        states: Table<Remote, Channel>,
    }

    struct Channel has store {
        outbound_nonce: u64,
        inbound_nonce: u64,
        payload_hashs: Table<u64, vector<u8>>, // by nonce
    }

    // structs for events
    struct EventStore has key {
        outbound_events: EventHandle<MsgEvent>,
        inbound_events: EventHandle<MsgEvent>,
        receive_events: EventHandle<MsgEvent>,
    }

    struct MsgEvent has drop, store {
        local_address: address,
        remote_chain_id: u64,
        remote_address: vector<u8>,
        nonce: u64,
    }

    //
    // layerzero calls
    //
    fun init_module(account: &signer) {
        move_to(account, EventStore {
            inbound_events: account::new_event_handle<MsgEvent>(account),
            outbound_events: account::new_event_handle<MsgEvent>(account),
            receive_events: account::new_event_handle<MsgEvent>(account),
        });
    }

    public(friend) fun register<UA>(account: &signer) {
        assert_type_signer<UA>(account);
        move_to(account, Channels {
            states: table::new()
        });
    }

    public(friend) fun receive<UA>(src_chain_id: u64, src_address: vector<u8>, nonce: u64, payload_hash: vector<u8>) acquires Channels, EventStore {
        let ua_address = type_address<UA>();
        let channels = borrow_global_mut<Channels>(ua_address);
        let channel = get_channel_mut(channels, src_chain_id, src_address);

        assert!(nonce > channel.inbound_nonce, error::invalid_argument(ELAYERZERO_INVALID_NONCE));
        table::upsert(&mut channel.payload_hashs, nonce, payload_hash);

        // emit the publish event
        let event_store = borrow_global_mut<EventStore>(@layerzero);
        event::emit_event<MsgEvent>(
            &mut event_store.receive_events,
            MsgEvent {
                local_address: ua_address,
                remote_chain_id: src_chain_id,
                remote_address: src_address,
                nonce,
            },
        );
    }

    // return the outbound nonce
    public(friend) fun outbound<UA>(dst_chain_id: u64, dst_address: vector<u8>): u64 acquires Channels, EventStore {
        let channels = borrow_global_mut<Channels>(type_address<UA>());

        let channel = get_channel_mut(channels, dst_chain_id, dst_address);

        // ++outbound
        channel.outbound_nonce = channel.outbound_nonce + 1;

        let event_store = borrow_global_mut<EventStore>(@layerzero);
        event::emit_event<MsgEvent>(
            &mut event_store.outbound_events,
            MsgEvent {
                local_address: type_address<UA>(),
                remote_chain_id: dst_chain_id,
                remote_address: dst_address,
                nonce: channel.outbound_nonce,
            },
        );
        channel.outbound_nonce
    }

    public(friend) fun inbound<UA>(src_chain_id: u64, src_address: vector<u8>): (u64, vector<u8>) acquires Channels, EventStore {
        let channels = borrow_global_mut<Channels>(type_address<UA>());
        let channel = get_channel_mut(channels, src_chain_id, src_address);

        channel.inbound_nonce = channel.inbound_nonce + 1;
        assert!(table::contains(&channel.payload_hashs, channel.inbound_nonce), error::not_found(ELAYERZERO_INVALID_NONCE));

        let hash = table::remove(&mut channel.payload_hashs, channel.inbound_nonce);

        // emit the receive event
        let event_store = borrow_global_mut<EventStore>(@layerzero);
        event::emit_event<MsgEvent>(
            &mut event_store.inbound_events,
            MsgEvent {
                local_address: type_address<UA>(),
                remote_chain_id: src_chain_id,
                remote_address: src_address,
                nonce: channel.inbound_nonce,
            },
        );

        (channel.inbound_nonce, hash)
    }

    public fun outbound_nonce(ua_address: address, dst_chain_id: u64, dst_address: vector<u8>): u64 acquires Channels {
        let channels = borrow_global<Channels>(ua_address);
        let remote = Remote {
            chain_id: dst_chain_id,
            addr: dst_address,
        };
        if (table::contains(&channels.states, remote)) {
            table::borrow(&channels.states, remote).outbound_nonce
        } else {
            0
        }
    }

    public fun inbound_nonce(ua_address: address, src_chain_id: u64, src_address: vector<u8>): u64 acquires Channels {
        let channels = borrow_global<Channels>(ua_address);
        let remote = Remote {
            chain_id: src_chain_id,
            addr: src_address,
        };
        if (table::contains(&channels.states, remote)) {
            table::borrow(&channels.states, remote).inbound_nonce
        } else {
            0
        }
    }

    public fun have_next_inbound(ua_address: address, src_chain_id: u64, src_address: vector<u8>): bool acquires Channels {
        let channels = borrow_global<Channels>(ua_address);
        let remote = Remote {
            chain_id: src_chain_id,
            addr: src_address,
        };
        if (!table::contains(&channels.states, remote)) {
            return false
        };

        let channel = table::borrow(&channels.states, remote);
        table::contains(&channel.payload_hashs, channel.inbound_nonce + 1)
    }

    fun get_channel_mut(channel: &mut Channels, remote_chain_id: u64, remote_address: vector<u8>): &mut Channel {
        let remote = Remote {
            chain_id: remote_chain_id,
            addr: remote_address,
        };
        // init if necessary
        if (!table::contains(&channel.states, remote)) {
            let state = Channel {
                outbound_nonce: 0,
                inbound_nonce: 0,
                payload_hashs: table::new()
            };
            table::add(&mut channel.states, remote, state);
        };

        table::borrow_mut(&mut channel.states, remote)
    }

    #[test_only]
    struct TestUA {}

    #[test_only]
    public fun init_module_for_test(account: &signer) {
        init_module(account);
    }

    #[test_only]
    fun setup(lz: &signer) {
        use std::signer;
        use aptos_framework::aptos_account;

        aptos_account::create_account(signer::address_of(lz));
        init_module_for_test(lz);
        register<TestUA>(lz);
    }

    #[test(lz = @layerzero)]
    fun test_outbound_nonce(lz: signer) acquires Channels, EventStore {
        setup(&lz);

        let dst_chain_id = 1;
        let dst_address = x"01";

        let outb_nonce = outbound<TestUA>(dst_chain_id, dst_address);
        assert!(outb_nonce == 1, 0);

        let outb_nonce = outbound<TestUA>(dst_chain_id, dst_address);
        assert!(outb_nonce == 2, 0);

        let outbound_nonce = outbound_nonce(type_address<TestUA>(), dst_chain_id, dst_address);
        assert!(outbound_nonce == 2, 0);
    }

    #[test(lz = @layerzero)]
    fun test_receive_and_inbound(lz: signer) acquires Channels, EventStore {
        setup(&lz);

        let src_chain_id = 1;
        let src_address = x"01";

        // receive in disorder
        receive<TestUA>(src_chain_id, src_address, 3, x"03");
        receive<TestUA>(src_chain_id, src_address, 2, x"02");
        receive<TestUA>(src_chain_id, src_address, 1, x"01");
        receive<TestUA>(src_chain_id, src_address, 4, x"04");

        // check inbound nonce 0
        let ua_address = type_address<TestUA>();
        let nonce = inbound_nonce(ua_address, src_chain_id, src_address);
        assert!(nonce == 0, 0);

        // inbound
        let (nonce, actual_payload) = inbound<TestUA>(src_chain_id, src_address);
        assert!(nonce == 1, 0);
        assert!(actual_payload == x"01", 0);

        // re-receive with new payload and inbound
        let new_payload_hash = x"05";
        receive<TestUA>(src_chain_id, src_address, 2, new_payload_hash);

        let (nonce, actual_payload) = inbound<TestUA>(src_chain_id, src_address);
        assert!(nonce == 2, 0);
        assert!(actual_payload == new_payload_hash, 0);
    }

    #[test(lz = @layerzero)]
    #[expected_failure(abort_code = 0x10000)]
    fun test_receive_with_outdated_nonce(lz: signer) acquires Channels, EventStore {
        setup(&lz);

        let src_chain_id = 1;
        let src_address = x"01";

        receive<TestUA>(src_chain_id, src_address, 1, x"01");
        receive<TestUA>(src_chain_id, src_address, 2, x"01");
        let (nonce, _) = inbound<TestUA>(src_chain_id, src_address);
        assert!(nonce == 1, 0);

        // nonce 1 is outdated
        receive<TestUA>(src_chain_id, src_address, 1, x"01");
    }

    #[test(lz = @layerzero)]
    #[expected_failure(abort_code = 0x60000)]
    fun test_over_inbound(lz: signer) acquires Channels, EventStore {
        setup(&lz);

        let src_chain_id = 1;
        let src_address = x"01";

        // receive in disorder without nonce 1
        receive<TestUA>(src_chain_id, src_address, 3, x"03");
        receive<TestUA>(src_chain_id, src_address, 2, x"02");
        receive<TestUA>(src_chain_id, src_address, 4, x"04");

        let ua_address = type_address<TestUA>();
        assert!(!have_next_inbound(ua_address, src_chain_id, src_address), 0);

        inbound<TestUA>(src_chain_id, src_address);
    }
}
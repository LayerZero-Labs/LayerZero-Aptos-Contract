module layerzero::packet_event {
    use aptos_std::event::EventHandle;
    use aptos_framework::account;
    use layerzero_common::packet::{Packet, encode_packet};
    use aptos_std::event;

    friend layerzero::msglib_v1_0;
    friend layerzero::uln_receive;

    struct InboundEvent has drop, store {
        packet: Packet,
    }

    struct OutboundEvent has drop, store {
        encoded_packet: vector<u8>,
    }

    struct EventStore has key {
        inbound_events: EventHandle<InboundEvent>,
        outbound_events: EventHandle<OutboundEvent>,
    }

    fun init_module(account: &signer) {
        move_to(account, EventStore {
            inbound_events: account::new_event_handle<InboundEvent>(account),
            outbound_events: account::new_event_handle<OutboundEvent>(account),
        });
    }

    public(friend) fun emit_inbound_event(packet: Packet) acquires EventStore {
        let event_store = borrow_global_mut<EventStore>(@layerzero);
        event::emit_event<InboundEvent>(
            &mut event_store.inbound_events,
            InboundEvent { packet },
        );
    }

    public(friend) fun emit_outbound_event(packet: &Packet) acquires EventStore {
        let event_store = borrow_global_mut<EventStore>(@layerzero);
        event::emit_event<OutboundEvent>(
            &mut event_store.outbound_events,
            OutboundEvent { encoded_packet: encode_packet(packet) },
        );
    }

    #[test_only]
    public fun init_module_for_test(account: &signer) {
        init_module(account);
    }
}
module layerzero::oft {
    use std::vector;
    use std::error;
    use std::signer::address_of;
    use aptos_framework::coin::{Self, BurnCapability, MintCapability, Coin};
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_std::table::{Self, Table};
    use aptos_std::event::{Self, EventHandle};
    use aptos_framework::account;
    use layerzero_common::utils::{type_address, assert_type_signer, vector_slice};
    use layerzero::endpoint::{Self, UaCapability};
    use layerzero::lzapp;
    use layerzero::remote;
    use layerzero_common::serde;
    use std::bcs;
    use aptos_std::from_bcs;

    const EOFT_ALREADY_INITIALIZED: u64 = 0x00;
    const EOFT_NOT_INITIALIZED: u64 = 0x01;
    const EOFT_CLAIMABLE_COIN_NOT_FOUND: u64 = 0x02;
    const EOFT_INVALID_PACKET_TYPE: u64 = 0x03;

    const PT_SEND: u8 = 0;
    const PT_RECEIVE: u8 = 1;

    struct GlobalStore<phantom OFT> has key {
        // if this is the base coin, use lock and unlock mode. Otherwise, use mint and burn mode.
        base: bool,
        lz_cap: UaCapability<OFT>,
    }

    struct CoinCapabilities<phantom OFT> has key {
        mint_cap: MintCapability<OFT>,
        burn_cap: BurnCapability<OFT>,
    }

    struct LockedCoin<phantom OFT> has key {
        // address -> amount
        claimable_amount: Table<address, u64>,
        // tvl
        total_coin: Coin<OFT>,
    }

    struct EventStore has key {
        send_events: EventHandle<SendEvent>,
        receive_events: EventHandle<ReceiveEvent>,
        claim_events: EventHandle<ClaimEvent>,
    }

    struct SendEvent has drop, store {
        sender: address,
        dst_chain_id: u64,
        dst_receiver: vector<u8>,
        amount: u64,
    }

    struct ReceiveEvent has drop, store {
        src_chain_id: u64,
        src_sender: vector<u8>,
        receiver: address,
        amount: u64,
        stashed: bool
    }

    struct ClaimEvent has drop, store {
        receiver: address,
        amount: u64,
    }

    public fun init_base_oft<OFT>(account: &signer): UaCapability<OFT> {
        init<OFT>(account, true)
    }

    public fun init_oft<OFT>(
        account: &signer,
        mint_cap: MintCapability<OFT>,
        burn_cap: BurnCapability<OFT>,
    ): UaCapability<OFT> {
        move_to(account, CoinCapabilities<OFT> {
            mint_cap,
            burn_cap,
        });

        init<OFT>(account, false)
    }

    //
    // send and receive functions
    //
    public entry fun send<OFT>(
        sender: &signer,
        dst_chain_id: u64,
        dst_receiver: vector<u8>,
        amount: u64,
        fee: u64,
        adapter_params: vector<u8>,
        msglib_params: vector<u8>,
    ) acquires EventStore, GlobalStore, CoinCapabilities, LockedCoin {
        let sender_addr = address_of(sender);
        let coin = coin::withdraw<OFT>(sender, amount);
        let fee = coin::withdraw<AptosCoin>(sender, fee);

        let refund = send_coin(sender_addr, coin, dst_chain_id, dst_receiver, fee, adapter_params, msglib_params);

        // refund to sender
        coin::deposit(sender_addr, refund);
    }

    public fun send_coin<OFT>(
        sender_address: address,
        coin: Coin<OFT>,
        dst_chain_id: u64,
        dst_receiver: vector<u8>,
        fee: Coin<AptosCoin>,
        adapter_params: vector<u8>,
        msglib_params: vector<u8>,
    ): Coin<AptosCoin> acquires LockedCoin, GlobalStore, CoinCapabilities, EventStore {
        assert_oft_initialized<OFT>();

        let oft_address = type_address<OFT>();
        let global_store = borrow_global<GlobalStore<OFT>>(oft_address);

        let amount = coin::value(&coin);
        if (global_store.base) {
            // lock the coin
            let locked_coin = borrow_global_mut<LockedCoin<OFT>>(oft_address);
            coin::merge(&mut locked_coin.total_coin, coin);
        } else {
            // burn the coin
            let caps = borrow_global<CoinCapabilities<OFT>>(oft_address);
            coin::burn<OFT>(coin, &caps.burn_cap);
        };

        // send lz msg
        let payload = encode_send_payload(sender_address, dst_receiver, amount);
        let dst_address = remote::get(oft_address, dst_chain_id);
        let (_, refund) = lzapp::send<OFT>(dst_chain_id, dst_address, payload, fee, adapter_params, msglib_params, &global_store.lz_cap);

        // emit event
        let event_store = borrow_global_mut<EventStore>(oft_address);
        event::emit_event<SendEvent>(
            &mut event_store.send_events,
            SendEvent {
                sender: sender_address,
                dst_chain_id,
                dst_receiver,
                amount,
            },
        );

        refund
    }

    public entry fun lz_receive<OFT>(
        src_chain_id: u64,
        src_address: vector<u8>,
        payload: vector<u8>,
    ) acquires EventStore, LockedCoin, GlobalStore, CoinCapabilities {
        assert_oft_initialized<OFT>();

        let oft_address = type_address<OFT>();
        let global_store = borrow_global<GlobalStore<OFT>>(oft_address);

        // verify and decode payload
        remote::assert_remote(oft_address, src_chain_id, src_address);
        endpoint::lz_receive<OFT>(src_chain_id, src_address, payload, &global_store.lz_cap);
        let (src_sender, receiver, amount) = decode_receive_payload(&payload);

        // try to deposit
        let locked_coin = borrow_global_mut<LockedCoin<OFT>>(oft_address);
        let stashed = !coin::is_account_registered<OFT>(receiver);
        if (stashed) {
            let claimable = table::borrow_mut_with_default(&mut locked_coin.claimable_amount, receiver, 0);
            *claimable = *claimable + amount;

            if (!global_store.base) {
                let caps = borrow_global<CoinCapabilities<OFT>>(oft_address);
                let coin_minted = coin::mint(amount, &caps.mint_cap);
                coin::merge(&mut locked_coin.total_coin, coin_minted);
            }
        } else {
            let coin = if (global_store.base) {
                coin::extract<OFT>(&mut locked_coin.total_coin, amount)
            } else {
                let caps = borrow_global<CoinCapabilities<OFT>>(oft_address);
                coin::mint<OFT>(amount, &caps.mint_cap)
            };
            coin::deposit(receiver, coin);
        };

        let event_store = borrow_global_mut<EventStore>(oft_address);
        event::emit_event<ReceiveEvent>(
            &mut event_store.receive_events,
            ReceiveEvent {
                src_chain_id,
                src_sender,
                receiver,
                amount,
                stashed
            },
        );
    }

    public entry fun claim<OFT>(receiver: &signer) acquires EventStore, LockedCoin {
        assert_oft_initialized<OFT>();

        // register the user if needed
        let receiver_addr = address_of(receiver);
        if (!coin::is_account_registered<OFT>(receiver_addr)) {
            coin::register<OFT>(receiver);
        };

        // assert the receiver has receivable and it is more than 0
        let oft_address = type_address<OFT>();
        let locked_coin = borrow_global_mut<LockedCoin<OFT>>(oft_address);
        assert!(table::contains(&locked_coin.claimable_amount, receiver_addr), error::not_found(EOFT_CLAIMABLE_COIN_NOT_FOUND));

        let claimable = table::remove(&mut locked_coin.claimable_amount, receiver_addr);
        assert!(claimable > 0, error::not_found(EOFT_CLAIMABLE_COIN_NOT_FOUND));

        let unlocked_coin = coin::extract(&mut locked_coin.total_coin, claimable);
        coin::deposit(receiver_addr, unlocked_coin);

        let event_store = borrow_global_mut<EventStore>(oft_address);
        event::emit_event(
            &mut event_store.claim_events,
            ClaimEvent {
                receiver: receiver_addr,
                amount: claimable,
            }
        );
    }

    //
    // public view functions
    //
    public fun quote_fee<OFT>(
        sender: address,
        dst_chain_id: u64,
        dst_receiver: vector<u8>,
        amount: u64,
        pay_in_zro: bool,
        adpter_params: vector<u8>,
    ): (u64, u64) {
        let payload = encode_send_payload(sender, dst_receiver, amount);
        endpoint::quote_fee(type_address<OFT>(), dst_chain_id, vector::length(&payload), pay_in_zro, adpter_params, vector::empty<u8>())
    }

    public fun is_oft_initialized<OFT>(): bool {
        exists<GlobalStore<OFT>>(type_address<OFT>())
    }

    public fun is_base<OFT>(): bool acquires GlobalStore {
        let global_store = borrow_global<GlobalStore<OFT>>(type_address<OFT>());
        global_store.base
    }

    public fun get_claimable_amount<OFT>(receiver: address): u64 acquires LockedCoin {
        assert_oft_initialized<OFT>();

        let locked_coin = borrow_global<LockedCoin<OFT>>(type_address<OFT>());
        if (!table::contains(&locked_coin.claimable_amount, receiver)) {
            return 0
        };

        *table::borrow(&locked_coin.claimable_amount, receiver)
    }

    //
    // internal functions
    //
    fun init<OFT>(account: &signer, base: bool): UaCapability<OFT> {
        assert_type_signer<OFT>(account);
        assert!(
            !is_oft_initialized<OFT>(),
            error::already_exists(EOFT_ALREADY_INITIALIZED),
        );

        let lz_cap = endpoint::register_ua<OFT>(account);
        lzapp::init(account, lz_cap);
        remote::init(account);

        move_to(account, GlobalStore<OFT> {
            base,
            lz_cap,
        });

        move_to(account, LockedCoin<OFT> {
            claimable_amount: table::new(),
            total_coin: coin::zero<OFT>()
        });

        move_to(account, EventStore {
            send_events: account::new_event_handle<SendEvent>(account),
            receive_events: account::new_event_handle<ReceiveEvent>(account),
            claim_events: account::new_event_handle<ClaimEvent>(account),
        });

        lz_cap
    }

    fun assert_oft_initialized<OFT>() {
        assert!(is_oft_initialized<OFT>(), error::not_found(EOFT_NOT_INITIALIZED));
    }

    fun encode_send_payload(sender: address, dst_receiver: vector<u8>, amount: u64): vector<u8> {
        let payload = vector::empty<u8>();
        serde::serialize_u8(&mut payload, PT_SEND);
        serde::serialize_vector(&mut payload, bcs::to_bytes(&sender));
        serde::serialize_vector(&mut payload, dst_receiver);
        serde::serialize_u64(&mut payload, amount);
        payload
    }

    fun decode_receive_payload(payload: &vector<u8>): (vector<u8>, address, u64) {
        let packet_type = serde::deserialize_u8(&vector_slice(payload, 0, 1));
        assert!(packet_type == PT_RECEIVE, error::aborted(EOFT_INVALID_PACKET_TYPE));

        let src_sender = vector_slice(payload, 1, 33);
        let receiver_bytes = vector_slice(payload, 33, 65);
        let receiver = from_bcs::to_address(receiver_bytes);
        let amount = serde::deserialize_u64(&vector_slice(payload, 65, 73));
        (src_sender, receiver, amount)
    }
}

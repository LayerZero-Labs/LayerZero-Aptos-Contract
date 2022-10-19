/// LZApp Remote module helps the app manage its trusted remote addresses on other chains,
/// where the app only wants to send msg to and receive msg from.
/// It only supports that there is only one trusted remote address on each chain.
///
/// Remote is saparated from the lzApp because lzApp might have multiple remotes
module layerzero::remote {
    use std::error;
    use aptos_std::table::{Self, Table};
    use layerzero_common::utils::{type_address, assert_u16};
    use std::signer::address_of;
    use layerzero::endpoint::UaCapability;

    const ELZAPP_REMOTE_ALREADY_INITIALIZED: u64 = 0x00;
    const ELZAPP_REMOTE_NOT_INITIALIZED: u64 = 0x01;
    const ELZAPP_INVALID_REMOTE: u64 = 0x02;

    struct Remotes has key {
        // chainId -> remote address
        peers: Table<u64, vector<u8>>
    }

    public fun init(account: &signer) {
        assert!(!exists<Remotes>(address_of(account)), error::already_exists(ELZAPP_REMOTE_ALREADY_INITIALIZED));

        move_to(account, Remotes {
            peers: table::new(),
        });
    }

    /// Set a trusted remote address for a chain by an admin signer.
    public entry fun set(account: &signer, chain_id: u64, remote_addr: vector<u8>) acquires Remotes {
        set_internal(address_of(account), chain_id, remote_addr);
    }

    /// Set a trusted remote address for a chain with UaCapability.
    public fun set_with_cap<UA>(chain_id: u64, remote_addr: vector<u8>, _cap: &UaCapability<UA>) acquires Remotes {
        set_internal(type_address<UA>(), chain_id, remote_addr);
    }

    fun set_internal(ua_address: address, chain_id: u64, remote_addr: vector<u8>) acquires Remotes {
        assert_u16(chain_id);
        assert!(exists<Remotes>(ua_address), error::not_found(ELZAPP_REMOTE_NOT_INITIALIZED));

        let remotes = borrow_global_mut<Remotes>(ua_address);
        table::upsert(&mut remotes.peers, chain_id, remote_addr)
    }

    public fun get(ua_address: address, chain_id: u64): vector<u8> acquires Remotes {
        assert!(exists<Remotes>(ua_address), error::not_found(ELZAPP_REMOTE_NOT_INITIALIZED));

        let remotes = borrow_global<Remotes>(ua_address);
        *table::borrow(&remotes.peers, chain_id)
    }

    public fun contains(ua_address: address, chain_id: u64): bool acquires Remotes {
        assert!(exists<Remotes>(ua_address), error::not_found(ELZAPP_REMOTE_NOT_INITIALIZED));

        let remotes = borrow_global<Remotes>(ua_address);
        table::contains(&remotes.peers, chain_id)
    }

    public fun assert_remote(ua_address: address, chain_id: u64, remote_addr: vector<u8>) acquires Remotes {
        let expected = get(ua_address, chain_id);
        assert!(expected == remote_addr, error::invalid_argument(ELZAPP_INVALID_REMOTE));
    }
}
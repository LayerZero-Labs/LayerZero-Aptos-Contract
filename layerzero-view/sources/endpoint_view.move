/// This module is used to view the state of the Endpoint V1 contract, which was made
/// before the introduction of view functions in Aptos.
module layerzero_view::endpoint_view {
    use std::type_info::TypeInfo;

    use layerzero::executor_router;
    use layerzero::executor_config;
    use layerzero::msglib_router;
    use layerzero::msglib_config;
    use layerzero_common::semver;
    use layerzero::endpoint;
    use msglib_v2::msglib_v2_router;

    // EXECUTABLE STATES keep the same as uln_302
    // No VERIFIED_BUT_NOT_EXECUTABLE because endpoint v1 execute messages in order
    const STATE_NOT_EXECUTABLE: u8 = 0;
    const STATE_EXECUTABLE: u8 = 2;
    const STATE_EXECUTED: u8 = 3;

    #[view]
    public fun get_local_chain_id(): u64 {
        endpoint::get_local_chain_id()
    }

    #[view]
    public fun quote_fee(
        ua_address: address,
        dst_chain_id: u64,
        payload_size: u64,
        pay_in_zro: bool,
        adapter_params: vector<u8>,
        msglib_params: vector<u8>
    ): (u64, u64) {
        let msglib_version = msglib_config::get_send_msglib(ua_address, dst_chain_id);
        let (major, _minor) = semver::values(&msglib_version);
        let (native_fee, zro_fee) = if (major == 1) {
            msglib_router::quote(
                ua_address,
                msglib_version,
                dst_chain_id,
                payload_size,
                pay_in_zro,
                msglib_params
            )
        } else {
            msglib_v2_router::quote_versioned(
                ua_address,
                dst_chain_id,
                payload_size,
                pay_in_zro,
                msglib_params,
                &msglib_version
            )
        };

        let (executor_version, executor) = executor_config::get_executor(ua_address, dst_chain_id);
        let executor_fee = executor_router::quote(ua_address, executor_version, executor, dst_chain_id, adapter_params);

        (native_fee + executor_fee, zro_fee)
    }

    #[view]
    public fun has_next_receive(ua_address: address, src_chain_id: u64, src_address: vector<u8>): bool {
        endpoint::has_next_receive(ua_address, src_chain_id, src_address)
    }

    #[view]
    public fun outbound_nonce(ua_address: address, dst_chain_id: u64, dst_address: vector<u8>): u64 {
        endpoint::outbound_nonce(ua_address, dst_chain_id, dst_address)
    }

    #[view]
    public fun inbound_nonce(ua_address: address, src_chain_id: u64, src_address: vector<u8>): u64 {
        endpoint::inbound_nonce(ua_address, src_chain_id, src_address)
    }

    #[view]
    public fun get_default_send_msglib(chain_id: u64): (u64, u8) {
        endpoint::get_default_send_msglib(chain_id)
    }

    #[view]
    public fun get_send_msglib(ua_address: address, chain_id: u64): (u64, u8) {
        endpoint::get_send_msglib(ua_address, chain_id)
    }

    #[view]
    public fun get_default_receive_msglib(chain_id: u64): (u64, u8) {
        endpoint::get_default_receive_msglib(chain_id)
    }

    #[view]
    public fun get_receive_msglib(ua_address: address, chain_id: u64): (u64, u8) {
        endpoint::get_receive_msglib(ua_address, chain_id)
    }

    #[view]
    public fun get_default_executor(chain_id: u64): (u64, address) {
        endpoint::get_default_executor(chain_id)
    }

    #[view]
    public fun get_executor(ua_address: address, chain_id: u64): (u64, address) {
        endpoint::get_executor(ua_address, chain_id)
    }

    #[view]
    public fun get_config(
        ua_address: address,
        major_version: u64,
        minor_version: u8,
        chain_id: u64,
        config_type: u8
    ): vector<u8> {
        let version = semver::build_version(major_version, minor_version);
        if (major_version == 1) {
            msglib_router::get_config(ua_address, version, chain_id, config_type)
        } else {
            msglib_v2_router::get_ua_config_versioned(
                ua_address,
                chain_id,
                config_type,
                &version,
            )
        }
    }

    #[view]
    public fun is_ua_registered<UA>(): bool {
        endpoint::is_ua_registered<UA>()
    }

    #[view]
    public fun get_ua_type_by_address(addr: address): TypeInfo {
        endpoint::get_ua_type_by_address(addr)
    }

    #[view]
    public fun get_next_guid(ua_address: address, dst_chain_id: u64, dst_address: vector<u8>): vector<u8> {
        endpoint::get_next_guid(ua_address, dst_chain_id, dst_address)
    }

    #[view]
    public fun bulletin_ua_read(ua_address: address, key: vector<u8>): vector<u8> {
        endpoint::bulletin_ua_read(ua_address, key)
    }

    #[view]
    public fun bulletin_msglib_read(major_version: u64, minor_version: u8, key: vector<u8>): vector<u8> {
        endpoint::bulletin_msglib_read(major_version, minor_version, key)
    }

    #[view]
    /// View function to check if a message is executable
    public fun executable(
        src_eid: u32,
        sender: vector<u8>,
        nonce: u64,
        receiver: address,
    ): u8 {
        let inbound_nonce = endpoint::inbound_nonce(receiver, src_eid as u64, sender);
        if (nonce <= inbound_nonce) {
            return STATE_EXECUTED
        };
        let is_next_nonce = inbound_nonce + 1 == nonce;
        if (is_next_nonce && endpoint::has_next_receive(receiver, src_eid as u64, sender)) {
            return STATE_EXECUTABLE
        };
        STATE_NOT_EXECUTABLE
    }
}

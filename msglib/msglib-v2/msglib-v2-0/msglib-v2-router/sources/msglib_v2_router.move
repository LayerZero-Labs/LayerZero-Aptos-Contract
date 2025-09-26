module msglib_v2::msglib_v2_router {
    use std::aptos_coin::AptosCoin;
    use std::coin::Coin;
    use std::from_bcs;
    use std::signer::address_of;
    use std::table::{Self, Table};
    use std::event;

    use layerzero_common::utils::type_address;
    use layerzero_common::packet::{dst_chain_id, Packet, src_address};
    use layerzero_common::semver::{Self, SemVer};
    use msglib_auth::msglib_cap::{Self, MsgLibSendCapability};
    use msglib_v2_1::msglib_v2_1_router;
    use msglib_v3::msglib_v3_router;
    use uln_301::router_calls as uln301;
    use zro::zro::ZRO;

    /// Because router_v1 does not propagate the SemVer into router_v2 on quote() and get_ua_config(),
    /// we need to explicitly store it again within this module. The version_mirroring module will then be
    /// responsible for synchronizing the config from the endpoint.
    struct MsgLibConfig has key {
        send_version: Table<ConfigKey, SemVer>,
    }

    struct ConfigKey has store, drop, copy {
        ua_address: address,
        chain_id: u64,
    }

    /// This Capability is created for the @msglib_routing_helper module to update the configuration in this module   
    struct MsglibConfigCap has store {}

    #[event]
    struct VersionUpdated has drop, store {
        ua_address: address,
        chain_id: u64,
        version: SemVer,
    }

    /// This router module was upgraded from a placeholder. This initializes storage
    /// not previously needed in the placeholder.
    public entry fun init(account: &signer) {
        assert!(address_of(account) == @msglib_v2, EUNAUTHORIZED);
        move_to(account, MsgLibConfig {
            send_version: table::new()
        });
    }

    /// Send a message using the configured message library
    /// This relies on the router containing the up-to-date message library version, therefore
    /// it is required that the OApp call msglib_routing_helper::version_mirroring::sync()
    /// before calling this function
    public fun send<UA>(
        packet: &Packet,
        native_fee: Coin<AptosCoin>,
        zro_fee: Coin<ZRO>,
        msglib_params: vector<u8>,
        cap: &MsgLibSendCapability
    ): (Coin<AptosCoin>, Coin<ZRO>) acquires MsgLibConfig {
        let version = msglib_cap::send_version(cap);
        let (major, minor) = semver::values(&version);

        update_send_version_if_needed(from_bcs::to_address(src_address(packet)), dst_chain_id(packet), version);

        if (major == 2 && minor == 0) {
            uln301::send<UA>(packet, native_fee, zro_fee, msglib_params, cap)
        } else if (major == 2) {
            msglib_v2_1_router::send<UA>(packet, native_fee, zro_fee, msglib_params, cap)
        } else {
            msglib_v3_router::send<UA>(packet, native_fee, zro_fee, msglib_params, cap)
        }
    }

    /// Get a quote from the OApp configured message library
    /// This relies on the router containing the up-to-date message library version, therefore
    /// it is required that the OApp call msglib_routing_helper::version_mirroring::sync()
    /// before calling this function
    public fun quote(
        ua_address: address,
        dst_chain_id: u64,
        payload_size: u64,
        pay_in_zro: bool,
        msglib_params: vector<u8>
    ): (u64, u64) acquires MsgLibConfig {
        let version = &get_send_msglib(ua_address, dst_chain_id);
        quote_versioned(ua_address, dst_chain_id, payload_size, pay_in_zro, msglib_params, version)
    }

    public fun quote_versioned(
        ua_address: address,
        dst_chain_id: u64,
        payload_size: u64,
        pay_in_zro: bool,
        msglib_params: vector<u8>,
        version: &SemVer
    ): (u64, u64) {
        let (major, minor) = semver::values(version);
        if (major == 2 && minor == 0) {
            uln301::quote(
                ua_address,
                dst_chain_id,
                payload_size,
                pay_in_zro,
                msglib_params
            )
        } else if (major == 2) {
            msglib_v2_1_router::quote(
                ua_address,
                dst_chain_id,
                payload_size,
                pay_in_zro,
                msglib_params,
                version
            )
        } else {
            msglib_v3_router::quote(
                ua_address,
                dst_chain_id,
                payload_size,
                pay_in_zro,
                msglib_params,
                version
            )
        }
    }

    public fun set_ua_config<UA>(
        chain_id: u64,
        config_type: u8,
        config_bytes: vector<u8>,
        cap: &MsgLibSendCapability
    ) acquires MsgLibConfig {
        let version = msglib_cap::send_version(cap);
        let (major, minor) = semver::values(&version);

        update_send_version_if_needed(type_address<UA>(), chain_id, version);

        // must also authenticate inside each msglib with send_cap::assert_version(cap);
        if (major == 2 && minor == 0) {
            uln301::set_ua_config<UA>(chain_id, config_type, config_bytes, cap)
        } else if (major == 2) {
            msglib_v2_1_router::set_ua_config<UA>(chain_id, config_type, config_bytes, cap)
        } else {
            msglib_v3_router::set_ua_config<UA>(chain_id, config_type, config_bytes, cap)
        }
    }

    /// This function is not supported for msglib_v2_0, because the version is not propagated into the router
    /// Please use get_ua_config_versioned instead
    public fun get_ua_config(
        _ua_address: address,
        _chain_id: u64,
        _config_type: u8
    ): vector<u8> {
        abort ENOT_SUPPORTED
    }

    public fun get_ua_config_versioned(
        ua_address: address,
        chain_id: u64,
        config_type: u8,
        version: &SemVer
    ): vector<u8> {
        let (major, minor) = semver::values(version);
        if (major == 2 && minor == 0) {
            uln301::get_ua_config(ua_address, chain_id, config_type)
        } else if (major == 2) {
            msglib_v2_1_router::get_ua_config(ua_address, chain_id, config_type, version)
        } else {
            msglib_v3_router::get_ua_config(ua_address, chain_id, config_type, version)
        }
    }

    // ======================================= Msglib Configs =============================================

    /// This function is used to get the msglib_config_cap by the msglib_routing_helper module
    public fun create_msglib_config_cap(account: &signer): MsglibConfigCap {
        assert!(address_of(account) == @msglib_routing_helper, EUNAUTHORIZED);
        MsglibConfigCap {}
    }

    public fun set_send_msglib(
        ua_address: address,
        chain_id: u64,
        version: SemVer,
        _cap: &MsglibConfigCap
    ) acquires MsgLibConfig {
        update_send_version_if_needed(ua_address, chain_id, version);
    }

    /// Update the send version if it is not already set or if it is outdated
    fun update_send_version_if_needed(
        ua_address: address,
        chain_id: u64,
        version: SemVer,
    ) acquires MsgLibConfig {
        let configs = &mut borrow_global_mut<MsgLibConfig>(@msglib_v2).send_version;
        let key = ConfigKey { ua_address, chain_id };
        if (!table::contains(configs, key) || version != *table::borrow(configs, key)) {
            table::upsert(configs, key, version);
            event::emit(VersionUpdated { ua_address, chain_id, version });
        }
    }

    #[view]
    public fun get_send_msglib(
        ua_address: address,
        chain_id: u64
    ): SemVer acquires MsgLibConfig {
        let configs = &borrow_global<MsgLibConfig>(@msglib_v2).send_version;
        let key = ConfigKey { ua_address, chain_id };
        assert!(table::contains(configs, key), ESEND_VERSION_NOT_FOUND);
        *table::borrow(configs, key)
    }

    const EUNAUTHORIZED: u64 = 1;
    const ESEND_VERSION_NOT_FOUND: u64 = 2;
    const ENOT_SUPPORTED: u64 = 3;
}

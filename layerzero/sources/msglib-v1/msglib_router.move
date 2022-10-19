// this module proxies the call to the configured msglib module.
// need to upgrade this module to support new msglib modules
// note: V1 only support uln_send
module layerzero::msglib_router {
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::coin::{Coin};
    use layerzero_common::packet::Packet;
    use layerzero::msglib_v1_0;
    use msglib_v2::msglib_v2_router;
    use zro::zro::ZRO;
    use msglib_auth::msglib_cap::{Self, MsgLibSendCapability};
    use layerzero_common::semver::{Self, SemVer};
    use msglib_v1_1::msglib_v1_1_router;

    friend layerzero::endpoint;

    //
    // interacting with the currently configured version
    //
    public(friend) fun send<UA>(
        packet: &Packet,
        native_fee: Coin<AptosCoin>,
        zro_fee: Coin<ZRO>,
        msglib_params: vector<u8>,
        cap: &MsgLibSendCapability
    ): (Coin<AptosCoin>, Coin<ZRO>) {
        let version = msglib_cap::send_version(cap);
        let (major, minor) = semver::values(&version);

        // must also authenticate inside each msglib with send_cap::assert_version(cap);
        if (major == 1) {
            if (minor == 0) {
                msglib_v1_0::send<UA>(packet, native_fee, zro_fee, msglib_params, cap)
            } else {
                msglib_v1_1_router::send<UA>(packet, native_fee, zro_fee, msglib_params, cap)
            }
        } else {
            msglib_v2_router::send<UA>(packet, native_fee, zro_fee, msglib_params, cap)
        }
    }

    public(friend) fun set_config<UA>(
        chain_id: u64,
        config_type: u8,
        config_bytes: vector<u8>,
        cap: &MsgLibSendCapability
    ) {
        let version = msglib_cap::send_version(cap);
        let (major, minor) = semver::values(&version);
        // must also authenticate inside each msglib with send_cap::assert_version(cap);
        if (major == 1) {
            if (minor == 0) {
                msglib_v1_0::set_ua_config<UA>(chain_id, config_type, config_bytes, cap);
            } else {
                msglib_v1_1_router::set_ua_config<UA>(chain_id, config_type, config_bytes, cap);
            }
        } else {
            msglib_v2_router::set_ua_config<UA>(chain_id, config_type, config_bytes, cap);
        }
    }

    //
    // public view functions
    //
    public fun quote(ua_address: address, version: SemVer, dst_chain_id: u64, payload_size: u64, pay_in_zro: bool, msglib_params: vector<u8>): (u64, u64) {
        let (major, minor) = semver::values(&version);
        if (major == 1) {
            if (minor == 0) {
                msglib_v1_0::quote(ua_address, dst_chain_id, payload_size, pay_in_zro, msglib_params)
            } else {
                msglib_v1_1_router::quote(ua_address, dst_chain_id, payload_size, pay_in_zro, msglib_params)
            }
        } else {
            msglib_v2_router::quote(ua_address, dst_chain_id, payload_size, pay_in_zro, msglib_params)
        }
    }

    public fun get_config(
        ua_address: address,
        version: SemVer,
        chain_id: u64,
        config_type: u8,
    ): vector<u8> {
        let (major, minor) = semver::values(&version);
        if (major == 1) {
            if (minor == 0) {
                msglib_v1_0::get_ua_config(ua_address, chain_id, config_type)
            } else {
                msglib_v1_1_router::get_ua_config(ua_address, chain_id, config_type)
            }
        } else {
            msglib_v2_router::get_ua_config(ua_address, chain_id, config_type)
        }
    }
}
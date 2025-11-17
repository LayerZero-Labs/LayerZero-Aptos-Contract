// mock uln 301
module uln_301::router_calls {
    use std::aptos_coin::AptosCoin;
    use std::coin::Coin;

    use layerzero_common::packet::Packet;
    use zro::zro::ZRO;
    use msglib_auth::msglib_cap::MsgLibSendCapability;

    public fun send<UA>(
        _packet: &Packet,
        _native_fee: Coin<AptosCoin>,
        _zro_fee: Coin<ZRO>,
        _msglib_params: vector<u8>,
        _cap: &MsgLibSendCapability
    ): (Coin<AptosCoin>, Coin<ZRO>) {
        abort 0
    }

    public fun quote(_ua_address: address, _dst_chain_id: u64, _payload_size: u64, _pay_in_zro: bool, _msglib_params: vector<u8>): (u64, u64) {
        abort 0
    }

    public fun set_ua_config<UA>(_chain_id: u64, _config_type: u8, _config_bytes: vector<u8>, _cap: &MsgLibSendCapability) {
        abort 0
    }

    public fun get_ua_config(_ua_address: address, _chain_id: u64, _config_type: u8): vector<u8>{
        abort 0
    }
} 
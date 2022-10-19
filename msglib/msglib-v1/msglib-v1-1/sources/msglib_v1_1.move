module msglib_v1_1::msglib_v1_1 {
    use layerzero_common::packet::Packet;
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::coin::Coin;
    use zro::zro::ZRO;
    use msglib_auth::msglib_cap::MsgLibSendCapability;

    const ELAYERZERO_NOT_SUPPORTED: u64 = 0x00;

    public fun send<UA>(
        _packet: &Packet,
        _native_fee: Coin<AptosCoin>,
        _zro_fee: Coin<ZRO>,
        _msglib_params: vector<u8>,
        _cap: &MsgLibSendCapability
    ): (Coin<AptosCoin>, Coin<ZRO>) {
        abort ELAYERZERO_NOT_SUPPORTED
    }

    public fun quote(_ua_address: address, _dst_chain_id: u64, _payload_size: u64, _pay_in_zro: bool, _msglib_params: vector<u8>): (u64, u64) {
        abort ELAYERZERO_NOT_SUPPORTED
    }

    public fun set_ua_config<UA>(_chain_id: u64, _config_type: u8, _config_bytes: vector<u8>, _cap: &MsgLibSendCapability) {
        abort ELAYERZERO_NOT_SUPPORTED
    }

    public fun get_ua_config(_ua_address: address, _chain_id: u64, _config_type: u8): vector<u8>{
        abort ELAYERZERO_NOT_SUPPORTED
    }
}
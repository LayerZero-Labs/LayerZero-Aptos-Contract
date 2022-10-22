export const enum PacketType {
    SEND_TO_APTOS,
    RECEIVE_FROM_APTOS,
}

export const enum UlnV2ConfigType {
    INBOUND_PROOF_LIBRARY_VERSION = 1,
    INBOUND_BLOCK_CONFIRMATIONS,
    RELAYER,
    OUTBOUND_PROOF_TYPE,
    OUTBOUND_BLOCK_CONFIRMATIONS,
    ORACLE,
}

export const ULNV2_CONFIG_TYPE_LOOKUP = {
    [UlnV2ConfigType.INBOUND_PROOF_LIBRARY_VERSION]: "uint16",
    [UlnV2ConfigType.INBOUND_BLOCK_CONFIRMATIONS]: "uint64",
    [UlnV2ConfigType.RELAYER]: "address",
    [UlnV2ConfigType.OUTBOUND_PROOF_TYPE]: "uint16",
    [UlnV2ConfigType.OUTBOUND_BLOCK_CONFIRMATIONS]: "uint64",
    [UlnV2ConfigType.ORACLE]: "address",
}

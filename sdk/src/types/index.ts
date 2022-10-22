import * as aptos from "aptos"

export interface TypeInfo {
    account_address: string
    module_name: string
    struct_name: string
}

export interface TypeInfoEx extends TypeInfo {
    type: string
}

export interface UlnConfigType {
    inbound_confirmations: aptos.BCS.Uint64
    oracle: string
    outbound_confirmations: aptos.BCS.Uint64
    relayer: string
}

export interface Packet {
    nonce: string | aptos.BCS.Uint64
    src_chain_id: string | aptos.BCS.Uint16
    src_address: Buffer
    dst_chain_id: string | aptos.BCS.Uint16
    dst_address: Buffer
    payload: Buffer
}

export interface UlnSignerFee {
    base_fee: aptos.BCS.Uint64
    fee_per_byte: aptos.BCS.Uint64
}

export enum Environment {
    MAINNET = "mainnet",
    TESTNET = "testnet",
    DEVNET = "devnet",
    LOCAL = "local",
}

import * as aptos from "aptos"
import { HexString } from "aptos"
import { ExtendedBuffer } from "extended-buffer"
import BN from "bn.js"
import crypto from "crypto"
import { Packet } from "./types"
import invariant from "tiny-invariant"
import fs from "fs"
import { bytesToHex } from "@noble/hashes/utils"
import * as bip39 from "bip39"
import os from "os"

export const ZERO_ADDRESS_HEX = fullAddress("0x0").toString()
export const ZERO_ADDRESS_BYTES = fullAddress("0x0").toUint8Array()
export const GAS_LIMIT_SAFETY_BPS = 2000

export function encodePacket(packet: Packet): Buffer {
    const encoded_packet = new ExtendedBuffer()
    encoded_packet.writeBuffer(new BN(packet.nonce.toString()).toArrayLike(Buffer, "be", 8))
    encoded_packet.writeUInt16BE(new BN(packet.src_chain_id).toNumber())
    encoded_packet.writeBuffer(packet.src_address)
    encoded_packet.writeUInt16BE(new BN(packet.dst_chain_id).toNumber())
    encoded_packet.writeBuffer(packet.dst_address)
    encoded_packet.writeBuffer(packet.payload)
    return encoded_packet.buffer
}

export function computeGuid(packet: Packet): string {
    const encoded_packet = new ExtendedBuffer()
    encoded_packet.writeBuffer(new BN(packet.nonce.toString()).toArrayLike(Buffer, "be", 8))
    encoded_packet.writeUInt16BE(new BN(packet.src_chain_id).toNumber())
    encoded_packet.writeBuffer(packet.src_address)
    encoded_packet.writeUInt16BE(new BN(packet.dst_chain_id).toNumber())
    encoded_packet.writeBuffer(packet.dst_address)
    return hashBuffer(encoded_packet.buffer)
}

export interface GetAddressSizeOfChainFunc {
    (chainId: number): Promise<number>
}

export async function decodePacket(
    buf: Buffer,
    getAddressSizeOfChain: number | GetAddressSizeOfChainFunc,
): Promise<Packet> {
    // based on encodePacket, implement decodePacket
    const extendedBuffer = new ExtendedBuffer()
    extendedBuffer.writeBuffer(buf)
    const nonce = BigInt(new BN(Uint8Array.from(extendedBuffer.readBuffer(8, true)), "be").toString())
    const src_chain_id = extendedBuffer.readUInt16BE()
    const src_address = extendedBuffer.readBuffer(32, true)
    const dst_chain_id = extendedBuffer.readUInt16BE()
    let addressSize = 0
    if (typeof getAddressSizeOfChain === "number") {
        addressSize = getAddressSizeOfChain
    } else if (typeof getAddressSizeOfChain === "function") {
        addressSize = await getAddressSizeOfChain(dst_chain_id)
    }
    const dst_address = extendedBuffer.readBuffer(addressSize, true)
    const payload = extendedBuffer.readBuffer(extendedBuffer.getReadableSize(), true)
    return {
        nonce,
        src_chain_id,
        src_address,
        dst_chain_id,
        dst_address,
        payload,
    }
}

export function hashBuffer(buf: Buffer): string {
    return crypto.createHash("sha3-256").update(buf).digest("hex")
}

export function hashPacket(packet: Packet): string {
    return hashBuffer(encodePacket(packet))
}

export async function rebuildPacketFromEvent(
    event: aptos.Types.Event,
    getAddressSizeOfChain: GetAddressSizeOfChainFunc | number,
): Promise<Packet> {
    const hexValue = event.data.encoded_packet.replace(/^0x/, "")
    const input = Buffer.from(hexValue, "hex")
    return decodePacket(input, getAddressSizeOfChain)
}

export async function generateMultisig(
    publicKeys: Uint8Array[],
    threshold: number,
): Promise<[aptos.TxnBuilderTypes.MultiEd25519PublicKey, string]> {
    const multiSigPublicKey = new aptos.TxnBuilderTypes.MultiEd25519PublicKey(
        publicKeys.map((publicKey) => new aptos.TxnBuilderTypes.Ed25519PublicKey(publicKey)),
        threshold,
    )
    const authKey = aptos.TxnBuilderTypes.AuthenticationKey.fromMultiEd25519PublicKey(multiSigPublicKey)
    return [multiSigPublicKey, authKey.derivedAddress().toString()]
}

export function multiSigSignedBCSTxn(
    pubkey: aptos.TxnBuilderTypes.MultiEd25519PublicKey,
    rawTx: aptos.TxnBuilderTypes.RawTransaction,
    signatures: aptos.HexString[],
    bitmap: number[],
): aptos.BCS.Bytes {
    const txBuilder = new aptos.TransactionBuilderMultiEd25519(() => {
        return new aptos.TxnBuilderTypes.MultiEd25519Signature(
            signatures.map((signature) => new aptos.TxnBuilderTypes.Ed25519Signature(signature.toUint8Array())),
            aptos.TxnBuilderTypes.MultiEd25519Signature.createBitmap(bitmap),
        )
    }, pubkey)
    return txBuilder.sign(rawTx)
}

export function fullAddress(address: string | aptos.HexString): aptos.HexString {
    const rawValue = aptos.HexString.ensure(address).noPrefix()
    return aptos.HexString.ensure(
        Buffer.concat([Buffer.alloc(64 - rawValue.length, "0"), Buffer.from(rawValue)]).toString(),
    )
}

function isHexStrict(hex: string): boolean {
    return /^(-)?0x[0-9a-f]*$/i.test(hex)
}

// https://github.com/ChainSafe/web3.js/blob/release/1.7.5/packages/web3-utils/src/index.js#L166
export function hexToAscii(hex: string): string {
    invariant(isHexStrict(hex), `Invalid hex string ${hex}`)

    let str = ""
    let i = 0
    const l = hex.length
    if (hex.substring(0, 2) === "0x") {
        i = 2
    }
    for (; i < l; i += 2) {
        const code = parseInt(hex.slice(i, i + 2), 16)
        str += String.fromCharCode(code)
    }

    return str
}

export function isSameAddress(a: string | HexString, b: string | HexString): boolean {
    return fullAddress(a).toString() == fullAddress(b).toString()
}

export function isZeroAddress(a: string | HexString): boolean {
    return isSameAddress(a, ZERO_ADDRESS_HEX)
}

export function convertUint64ToBytes(number: aptos.BCS.Uint64 | aptos.BCS.Uint32): aptos.BCS.Bytes {
    return aptos.BCS.bcsSerializeUint64(number).reverse() //big endian
}

export function convertBytesToUint64(bytes: aptos.BCS.Bytes): aptos.BCS.Uint64 {
    return BigInt(new BN(bytes, "be").toString())
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isErrorOfApiError(e: any, status: number) {
    if (e instanceof aptos.ApiError) {
        return e.status === status
    } else if (e instanceof aptos.Types.ApiError) {
        return e.status === status
    } else if (e instanceof Error && e.constructor.name.match(/ApiError[0-9]*/)) {
        if (Object.prototype.hasOwnProperty.call(e, "vmErrorCode")) {
            const err = e as aptos.ApiError
            return err.status === status
        } else if (Object.prototype.hasOwnProperty.call(e, "request")) {
            const err = e as aptos.Types.ApiError
            return err.status === status
        }
    } else if (e instanceof Error) {
        if (Object.prototype.hasOwnProperty.call(e, "status")) {
            return (e as any).status === status
        }
    }
    return false
}

export function bytesToUint8Array(data: aptos.BCS.Bytes, length: number) {
    return Uint8Array.from([...new Uint8Array(length - data.length), ...data])
}

export function convertToPaddedUint8Array(str: string, length: number): Uint8Array {
    const value = Uint8Array.from(Buffer.from(str.replace(/^0x/i, "").padStart(length, "0"), "hex"))
    return Uint8Array.from([...new Uint8Array(length - value.length), ...value])
}

export function paddingUint8Array(bytes: Uint8Array, length: number): Uint8Array {
    return Uint8Array.from([...new Uint8Array(length - bytes.length), ...bytes])
}

export function stringToUint8Array(str: string): Uint8Array {
    return Uint8Array.from(Buffer.from(str.replace(/^0[xX]/, ""), "hex"))
}

export interface MutipleSignatureItem {
    signature: aptos.HexString
    bitmap: number
}

export type MultipleSignFunc = (data: Uint8Array) => Promise<MutipleSignatureItem[]>

export function makeSignFuncWithMultipleSigners(...signers: aptos.AptosAccount[]) {
    return function(data: Uint8Array): Promise<MutipleSignatureItem[]> {
        const retval = signers.map((s, index): MutipleSignatureItem => {
            return {
                signature: s.signBuffer(data),
                bitmap: index,
            }
        })
        return Promise.resolve(retval)
    }
}

export function applyGasLimitSafety(gasUsed: string): BigInt {
    return (BigInt(gasUsed) * BigInt(10000 + GAS_LIMIT_SAFETY_BPS)) / BigInt(10000)
}

export function decodePayload(payload: Buffer) {
    const extendedBuffer = new ExtendedBuffer()
    extendedBuffer.writeBuffer(payload)
    const packetType = extendedBuffer.readUInt8()
    const remoteCoinAddr = extendedBuffer.readBuffer(32, true)
    const receiverBytes = extendedBuffer.readBuffer(32, true)
    return {
        packetType,
        remoteCoinAddr,
        receiverBytes,
    }
}

export function getSignedTransactionHash(signedTransaction: Uint8Array): string {
    const deserializer = new aptos.BCS.Deserializer(signedTransaction)
    const userTxn = aptos.TxnBuilderTypes.UserTransaction.load(deserializer)
    const txnHash = aptos.HexString.fromUint8Array(userTxn.hash()).toString()
    return txnHash
}

export async function getBalance(client: aptos.AptosClient, address: string): Promise<bigint> {
    const resource = await client.getAccountResource(address, "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>")
    const { coin } = resource.data as { coin: { value: string } }
    return BigInt(coin.value)
}

export enum KeyType {
    HEX_PRIVATE_KEY = 0,
    JSON_FILE = 1,
    MNEMONIC = 2,
}

export function getAccount(key: string, keyType: KeyType, path: string = "m/44'/637'/0'/0'/0'"): aptos.AptosAccount {
    switch (keyType) {
        case KeyType.HEX_PRIVATE_KEY: {
            const privateKeyBytes = Uint8Array.from(Buffer.from(aptos.HexString.ensure(key).noPrefix(), "hex"))
            return new aptos.AptosAccount(privateKeyBytes)
        }
        case KeyType.JSON_FILE: {
            const content = fs.readFileSync(expandTilde(key), "utf8")
            const keyPair = JSON.parse(content)
            const privateKeyBytes = Uint8Array.from(
                Buffer.from(aptos.HexString.ensure(keyPair.privateKeyHex).noPrefix(), "hex"),
            )
            return new aptos.AptosAccount(privateKeyBytes)
        }
        case KeyType.MNEMONIC: {
            // https://aptos.dev/guides/building-your-own-wallet/#creating-an-aptos-account
            if (!aptos.AptosAccount.isValidPath(path)) {
                throw new Error(`Invalid derivation path: ${path}`)
            }
            const normalizeMnemonics = key
                .trim()
                .split(/\s+/)
                .map((part) => part.toLowerCase())
                .join(" ")
            {
                const { key } = aptos.derivePath(path, bytesToHex(bip39.mnemonicToSeedSync(normalizeMnemonics)))
                return new aptos.AptosAccount(new Uint8Array(key))
            }
        }
    }
}

export function expandTilde(filepath: string): string {
    return filepath.replace(/^~/, os.homedir())
}

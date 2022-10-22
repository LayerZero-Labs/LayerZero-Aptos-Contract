import { SDK } from "../index"
import * as aptos from "aptos"
import { convertBytesToUint64, convertUint64ToBytes, isErrorOfApiError } from "../utils"
import { Packet } from "../types"

export interface Fee {
    airdropAmtCap: aptos.BCS.Uint64
    priceRatio: aptos.BCS.Uint64
    gasPrice: aptos.BCS.Uint64
}

export class Executor {
    public readonly module
    public readonly moduleName
    public readonly type

    constructor(private sdk: SDK) {
        this.module = `${sdk.accounts.layerzero}::executor_v1`
        this.moduleName = "layerzero::executor_v1"
        this.type = `${this.module}::Executor`
    }

    setDefaultAdapterParamsPayload(
        dstChainId: aptos.BCS.Uint16,
        adapterParams: aptos.BCS.Bytes,
    ): aptos.Types.EntryFunctionPayload {
        return {
            function: `${this.module}::set_default_adapter_params`,
            type_arguments: [],
            arguments: [dstChainId, Array.from(adapterParams)],
        }
    }

    async setDefaultAdapterParams(
        signer: aptos.AptosAccount,
        dstChainId: aptos.BCS.Uint16,
        adapterParams: aptos.BCS.Bytes,
    ): Promise<aptos.Types.Transaction> {
        const transaction = this.setDefaultAdapterParamsPayload(dstChainId, adapterParams)
        return this.sdk.sendAndConfirmTransaction(signer, transaction)
    }

    async getDefaultAdapterParams(chainId: aptos.BCS.Uint16): Promise<aptos.BCS.Bytes> {
        const resource = await this.sdk.client.getAccountResource(
            this.sdk.accounts.layerzero!,
            `${this.module}::AdapterParamsConfig`,
        )
        const { params } = resource.data as { params: { handle: string } }
        try {
            const response = await this.sdk.client.getTableItem(params.handle, {
                key_type: "u64",
                value_type: "vector<u8>",
                key: chainId.toString(),
            })
            return Buffer.from(aptos.HexString.ensure(response).noPrefix(), "hex")
        } catch (e) {
            return this.buildDefaultAdapterParams(0)
        }
    }

    async isRegistered(address: aptos.MaybeHexString): Promise<boolean> {
        try {
            await this.sdk.client.getAccountResource(address, `${this.module}::ExecutorConfig`)
            return true
        } catch (e) {
            if (isErrorOfApiError(e, 404)) {
                return false
            }
            throw e
        }
    }

    registerPayload(): aptos.Types.EntryFunctionPayload {
        return {
            function: `${this.module}::register`,
            type_arguments: [],
            arguments: [],
        }
    }

    async register(signer: aptos.AptosAccount): Promise<aptos.Types.Transaction> {
        const transaction = this.registerPayload()
        return this.sdk.sendAndConfirmTransaction(signer, transaction)
    }

    setFeePayload(dstChainId: aptos.BCS.Uint16, config: Fee): aptos.Types.EntryFunctionPayload {
        return {
            function: `${this.module}::set_fee`,
            type_arguments: [],
            arguments: [dstChainId, config.airdropAmtCap, config.priceRatio, config.gasPrice],
        }
    }

    async setFee(
        signer: aptos.AptosAccount,
        dstChainId: aptos.BCS.Uint16,
        config: Fee,
    ): Promise<aptos.Types.Transaction> {
        const transaction = this.setFeePayload(dstChainId, config)
        return this.sdk.sendAndConfirmTransaction(signer, transaction)
    }

    async getFee(executor: aptos.MaybeHexString, chainId: aptos.BCS.Uint16): Promise<Fee> {
        try {
            const resource = await this.sdk.client.getAccountResource(executor, `${this.module}::ExecutorConfig`)
            const { fee } = resource.data as { fee: { handle: string } }
            const response = await this.sdk.client.getTableItem(fee.handle, {
                key_type: "u64",
                value_type: `${this.module}::Fee`,
                key: chainId.toString(),
            })
            return {
                airdropAmtCap: BigInt(response.airdrop_amt_cap),
                priceRatio: BigInt(response.price_ratio),
                gasPrice: BigInt(response.gas_price),
            }
        } catch (e) {
            if (isErrorOfApiError(e, 404)) {
                return {
                    airdropAmtCap: 0n,
                    priceRatio: 0n,
                    gasPrice: 0n,
                }
            }
            throw e
        }
    }

    airdropPayload(
        srcChainId: aptos.BCS.Uint16,
        guid: aptos.BCS.Bytes,
        receiver: aptos.MaybeHexString,
        amount: aptos.BCS.Uint64 | aptos.BCS.Uint32,
    ): aptos.Types.EntryFunctionPayload {
        return {
            function: `${this.module}::airdrop`,
            type_arguments: [],
            arguments: [srcChainId, Array.from(guid), receiver, amount.toString()],
        }
    }

    async airdrop(
        signer: aptos.AptosAccount,
        srcChainId: aptos.BCS.Uint16,
        guid: aptos.BCS.Bytes,
        receiver: aptos.MaybeHexString,
        amount: aptos.BCS.Uint64 | aptos.BCS.Uint32,
    ): Promise<aptos.Types.Transaction> {
        const transaction = this.airdropPayload(srcChainId, guid, receiver, amount)
        return this.sdk.sendAndConfirmTransaction(signer, transaction)
    }

    async isAirdropped(guid: aptos.BCS.Bytes, receiver: aptos.MaybeHexString): Promise<boolean> {
        try {
            const resource = await this.sdk.client.getAccountResource(
                this.sdk.accounts.layerzero!,
                `${this.module}::JobStore`,
            )
            const { done } = resource.data as { done: { handle: string } }
            const response = await this.sdk.client.getTableItem(done.handle, {
                key_type: `${this.module}::JobKey`,
                value_type: "bool",
                key: {
                    guid: Buffer.from(guid).toString("hex"),
                    executor: receiver.toString(),
                },
            })
            return response
        } catch (e) {
            if (isErrorOfApiError(e, 404)) {
                return false
            }
            throw e
        }
    }

    async quoteFee(
        executor: aptos.MaybeHexString,
        dstChainId: aptos.BCS.Uint16,
        adapterParams: aptos.BCS.Bytes,
    ): Promise<aptos.BCS.Uint64> {
        if (adapterParams === undefined || adapterParams.length === 0) {
            adapterParams = await this.getDefaultAdapterParams(dstChainId)
        }

        const fee = await this.getFee(executor, dstChainId)
        const [, uaGas, airdropAmount] = this.decodeAdapterParams(adapterParams)
        return ((uaGas * fee.gasPrice + airdropAmount) * fee.priceRatio) / 10000000000n
    }

    buildDefaultAdapterParams(uaGas: aptos.BCS.Uint64 | aptos.BCS.Uint32): aptos.BCS.Bytes {
        const params = [0, 1].concat(Array.from(convertUint64ToBytes(uaGas)))
        return Uint8Array.from(Buffer.from(params))
    }

    buildAirdropAdapterParams(
        uaGas: aptos.BCS.Uint64 | aptos.BCS.Uint32,
        airdropAmount: aptos.BCS.Uint64 | aptos.BCS.Uint32,
        airdropAddress: string,
    ): aptos.BCS.Bytes {
        if (airdropAmount === 0n) {
            return this.buildDefaultAdapterParams(uaGas)
        }
        const params = [0, 2]
            .concat(Array.from(convertUint64ToBytes(uaGas)))
            .concat(Array.from(convertUint64ToBytes(airdropAmount)))
            .concat(Array.from(aptos.HexString.ensure(airdropAddress).toUint8Array()))

        return Buffer.from(params)
    }

    // txType 1
    // bytes  [2       8       ]
    // fields [txType  extraGas]
    // txType 2
    // bytes  [2       8         8           unfixed       ]
    // fields [txType  extraGas  airdropAmt  airdropAddress]
    decodeAdapterParams(
        adapterParams: aptos.BCS.Bytes,
    ): [aptos.BCS.Uint16, aptos.BCS.Uint64, aptos.BCS.Uint64, string] {
        const type = adapterParams[0] * 256 + adapterParams[1]
        if (type === 1) {
            // default
            if (adapterParams.length !== 10) throw new Error("invalid adapter params")

            const uaGas = adapterParams.slice(2, 10)
            return [type, convertBytesToUint64(uaGas), 0n, ""]
        } else if (type === 2) {
            // airdrop
            if (adapterParams.length <= 18) throw new Error("invalid adapter params")

            const uaGas = adapterParams.slice(2, 10)
            const airdropAmount = adapterParams.slice(10, 18)
            const airdropAddressBytes = adapterParams.slice(18)
            return [
                type,
                convertBytesToUint64(uaGas),
                convertBytesToUint64(airdropAmount),
                aptos.HexString.fromUint8Array(airdropAddressBytes).toString(),
            ]
        } else {
            throw new Error("invalid adapter params")
        }
    }

    async getLzReceivePayload(type_arguments: string[], packet: Packet): Promise<aptos.Types.EntryFunctionPayload> {
        const uaTypeInfo = await this.sdk.LayerzeroModule.Endpoint.getUATypeInfo(
            aptos.HexString.fromBuffer(packet.dst_address),
        )
        const transaction: aptos.Types.EntryFunctionPayload = {
            function: `${uaTypeInfo.account_address}::${uaTypeInfo.module_name}::lz_receive`,
            type_arguments,
            arguments: [
                packet.src_chain_id,
                Array.from(Uint8Array.from(packet.src_address)),
                Array.from(Uint8Array.from(packet.payload)),
            ],
        }
        return transaction
    }

    async lzReceive(signer: aptos.AptosAccount, type_arguments: string[], packet: Packet) {
        const transaction = await this.getLzReceivePayload(type_arguments, packet)
        return this.sdk.sendAndConfirmTransaction(signer, transaction)
    }

    getShortRequestEventType() {
        return `${this.module}::RequestEvent`.replace(/^(0x)0*/i, "$1")
    }
}

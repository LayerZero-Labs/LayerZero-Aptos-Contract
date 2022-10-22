import * as aptos from "aptos"
import { SDK } from "../../index"
import { LzApp } from "./lzapp"
import { isErrorOfApiError } from "../../utils"
import { UlnConfigType } from "../../types"

export class Counter {
    readonly address: aptos.MaybeHexString
    SEND_PAYLOAD_LENGTH: number = 4
    private sdk: SDK
    private lzApp: LzApp
    private readonly uaType: string

    constructor(sdk: SDK, counter: aptos.MaybeHexString, lzApp?: aptos.MaybeHexString) {
        this.sdk = sdk
        this.address = counter
        this.lzApp = new LzApp(sdk, lzApp || sdk.accounts.layerzero!, counter)
        this.uaType = `${this.address}::counter::CounterUA`
    }

    async initialize(signer: aptos.AptosAccount): Promise<aptos.Types.Transaction> {
        const transaction: aptos.Types.EntryFunctionPayload = {
            function: `${this.address}::counter::init`,
            type_arguments: [],
            arguments: [],
        }

        return this.sdk.sendAndConfirmTransaction(signer, transaction)
    }

    async getRemote(remoteChainId: aptos.BCS.Uint16): Promise<aptos.BCS.Bytes> {
        return this.lzApp.getRemote(remoteChainId)
    }

    async getCount(): Promise<aptos.BCS.Uint64> {
        const resource = await this.sdk.client.getAccountResource(this.address, `${this.address}::counter::Counter`)
        const { i } = resource.data as { i: string }
        return BigInt(i)
    }

    async createCounter(
        signer: aptos.AptosAccount,
        i: aptos.BCS.Uint64 | aptos.BCS.Uint32,
    ): Promise<aptos.Types.Transaction> {
        const transaction: aptos.Types.EntryFunctionPayload = {
            function: `${this.address}::counter::create_counter`,
            type_arguments: [],
            arguments: [i],
        }

        return this.sdk.sendAndConfirmTransaction(signer, transaction)
    }

    async setRemote(
        signer: aptos.AptosAccount,
        remoteChainId: aptos.BCS.Uint16,
        remoteAddress: aptos.BCS.Bytes,
    ): Promise<aptos.Types.Transaction> {
        return this.lzApp.setRemote(signer, remoteChainId, remoteAddress)
    }

    async setAppConfig(
        signer: aptos.AptosAccount,
        majorVersion: aptos.BCS.Uint16,
        minorVersion: aptos.BCS.Uint8,
        remoteChainId: aptos.BCS.Uint16,
        configType: aptos.BCS.Uint8,
        configBytes: aptos.BCS.Bytes,
    ): Promise<aptos.Types.Transaction> {
        console.log(`configType: ${configType}, configBytes: ${configBytes}`)
        return this.lzApp.setConfig(
            signer,
            this.uaType,
            majorVersion,
            minorVersion,
            remoteChainId,
            configType,
            configBytes,
        )
    }

    async setAppConfigBundle(
        signer: aptos.AptosAccount,
        majorVersion: aptos.BCS.Uint16,
        minorVersion: aptos.BCS.Uint8,
        remoteChainId: aptos.BCS.Uint16,
        config: UlnConfigType,
    ) {
        await this.lzApp.setConfigBundle(signer, this.uaType, majorVersion, minorVersion, remoteChainId, config)
    }

    async sendToRemote(
        signer: aptos.AptosAccount,
        remoteChainId: aptos.BCS.Uint16,
        fee: aptos.BCS.Uint64 | aptos.BCS.Uint32,
        adapterParams: Uint8Array,
    ): Promise<aptos.Types.Transaction> {
        const transaction: aptos.Types.EntryFunctionPayload = {
            function: `${this.address}::counter::send_to_remote`,
            type_arguments: [],
            arguments: [remoteChainId, fee, Array.from(adapterParams)],
        }

        return this.sdk.sendAndConfirmTransaction(signer, transaction)
    }

    async lzReceive(
        signer: aptos.AptosAccount,
        remoteChainId: aptos.BCS.Uint16,
        remoteAddress: aptos.BCS.Bytes,
        payload: aptos.BCS.Bytes,
    ): Promise<aptos.Types.Transaction> {
        const transaction: aptos.Types.EntryFunctionPayload = {
            function: `${this.address}::counter::lz_receive`,
            type_arguments: [],
            arguments: [remoteChainId, Array.from(remoteAddress), Array.from(payload)],
        }

        return this.sdk.sendAndConfirmTransaction(signer, transaction)
    }

    async isCounterCreated(address: aptos.MaybeHexString): Promise<boolean> {
        try {
            const owner = aptos.HexString.ensure(address).toString()
            await this.sdk.client.getAccountResource(this.address, `${owner}::counter::Counter`)
            return true
        } catch (e) {
            if (isErrorOfApiError(e, 404)) {
                return false
            }
            throw e
        }
    }
}

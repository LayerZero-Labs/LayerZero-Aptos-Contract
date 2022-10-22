import * as aptos from "aptos"
import { SDK } from "../../index"
import { UlnConfigType } from "../../types"
import { isErrorOfApiError } from "../../utils"

export class LzApp {
    private sdk: SDK
    private readonly lzApp: aptos.MaybeHexString
    private readonly ua: aptos.MaybeHexString

    constructor(sdk: SDK, lzApp: aptos.MaybeHexString, ua: aptos.MaybeHexString) {
        this.sdk = sdk
        this.lzApp = lzApp
        this.ua = ua
    }

    async getRemote(remoteChainId: aptos.BCS.Uint16): Promise<aptos.BCS.Bytes> {
        const resource = await this.sdk.client.getAccountResource(this.ua, `${this.lzApp}::remote::Remotes`)
        const { peers } = resource.data as { peers: { handle: string } }
        const trustedRemoteHandle = peers.handle

        const response = await this.sdk.client.getTableItem(trustedRemoteHandle, {
            key_type: "u64",
            value_type: "vector<u8>",
            key: remoteChainId.toString(),
        })

        return Uint8Array.from(Buffer.from(aptos.HexString.ensure(response).noPrefix(), "hex"))
    }

    async getMinDstGas(
        uaType: string,
        remoteChainId: aptos.BCS.Uint16,
        packetType: aptos.BCS.Uint64,
    ): Promise<aptos.BCS.Uint64> {
        const resource = await this.sdk.client.getAccountResource(this.ua, `${this.lzApp}::lzapp::Config`)
        const { min_dst_gas_lookup } = resource.data as { min_dst_gas_lookup: { handle: string } }

        try {
            const response = await this.sdk.client.getTableItem(min_dst_gas_lookup.handle, {
                key_type: `${this.lzApp}::lzapp::Path`,
                value_type: "u64",
                key: {
                    chain_id: remoteChainId.toString(),
                    packet_type: packetType.toString(),
                },
            })
            return response
        } catch (e) {
            if (isErrorOfApiError(e, 404)) {
                return BigInt(0)
            }
            throw e
        }
    }

    setMinDstPayload(
        uaType: string,
        remoteChainId: aptos.BCS.Uint16,
        packetType: aptos.BCS.Uint64,
        minDstGas: aptos.BCS.Uint64,
    ): aptos.Types.EntryFunctionPayload {
        return {
            function: `${this.lzApp}::lzapp::set_min_dst_gas`,
            type_arguments: [uaType],
            arguments: [remoteChainId, packetType.toString(), minDstGas.toString()],
        }
    }

    async setMinDstGas(
        signer: aptos.AptosAccount,
        uaType: string,
        remoteChainId: aptos.BCS.Uint16,
        packetType: aptos.BCS.Uint64,
        minDstGas: aptos.BCS.Uint64,
    ): Promise<aptos.Types.Transaction> {
        const transaction = this.setMinDstPayload(uaType, remoteChainId, packetType, minDstGas)
        return this.sdk.sendAndConfirmTransaction(signer, transaction)
    }

    setRemotePaylaod(
        remoteChainId: aptos.BCS.Uint16,
        remoteAddress: aptos.BCS.Bytes,
    ): aptos.Types.EntryFunctionPayload {
        return {
            function: `${this.lzApp}::remote::set`,
            type_arguments: [],
            arguments: [remoteChainId, Array.from(remoteAddress)],
        }
    }

    async setRemote(
        signer: aptos.AptosAccount,
        remoteChainId: aptos.BCS.Uint16,
        remoteAddress: aptos.BCS.Bytes,
    ): Promise<aptos.Types.Transaction> {
        const expectedAddressSize = await this.sdk.LayerzeroModule.Uln.Config.getChainAddressSize(remoteChainId)
        if (expectedAddressSize !== remoteAddress.length) {
            const address = Buffer.from(remoteAddress).toString("hex")
            throw new Error(`address(${address}) doesn't match expected size(${expectedAddressSize})`)
        }

        const transaction = this.setRemotePaylaod(remoteChainId, remoteAddress)
        return this.sdk.sendAndConfirmTransaction(signer, transaction)
    }

    async setConfig(
        signer: aptos.AptosAccount,
        uaType: string,
        majorVersion: aptos.BCS.Uint16,
        minorVersion: aptos.BCS.Uint8,
        remoteChainId: aptos.BCS.Uint16,
        configType: aptos.BCS.Uint8,
        configBytes: aptos.BCS.Bytes,
    ): Promise<aptos.Types.Transaction> {
        console.log(`configType: ${configType}, configBytes: ${configBytes}`)
        const transaction: aptos.Types.EntryFunctionPayload = {
            function: `${this.lzApp}::lzapp::set_config`,
            type_arguments: [uaType],
            arguments: [majorVersion, minorVersion, remoteChainId, configType, Array.from(configBytes)],
        }

        return this.sdk.sendAndConfirmTransaction(signer, transaction)
    }

    async setConfigBundle(
        signer: aptos.AptosAccount,
        uaType: string,
        majorVersion: aptos.BCS.Uint16,
        minorVersion: aptos.BCS.Uint8,
        remoteChainId: aptos.BCS.Uint16,
        config: UlnConfigType,
    ) {
        await this.setConfig(
            signer,
            uaType,
            majorVersion,
            minorVersion,
            remoteChainId,
            this.sdk.LayerzeroModule.Uln.Config.TYPE_ORACLE,
            Buffer.from(aptos.HexString.ensure(config.oracle).noPrefix(), "hex"),
        )
        await this.setConfig(
            signer,
            uaType,
            majorVersion,
            minorVersion,
            remoteChainId,
            this.sdk.LayerzeroModule.Uln.Config.TYPE_RELAYER,
            Buffer.from(aptos.HexString.ensure(config.relayer).noPrefix(), "hex"),
        )
        console.log(`setAppConfig inbound_confirmations: ${config.inbound_confirmations}`)
        await this.setConfig(
            signer,
            uaType,
            majorVersion,
            minorVersion,
            remoteChainId,
            this.sdk.LayerzeroModule.Uln.Config.TYPE_INBOUND_CONFIRMATIONS,
            aptos.BCS.bcsSerializeUint64(config.inbound_confirmations).reverse(), // BCS is little endian, but we want big endian
        )
        await this.setConfig(
            signer,
            uaType,
            majorVersion,
            minorVersion,
            remoteChainId,
            this.sdk.LayerzeroModule.Uln.Config.TYPE_OUTBOUND_CONFIRMATIONS,
            aptos.BCS.bcsSerializeUint64(config.outbound_confirmations).reverse(), // BCS is little endian, but we want big endian
        )
    }
}

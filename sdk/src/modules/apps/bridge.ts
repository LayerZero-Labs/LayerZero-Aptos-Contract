import * as aptos from "aptos"
import { SDK } from "../../index"
import { BridgeCoinType, Coin } from "./coin"
import * as utils from "../../utils"
import { convertToPaddedUint8Array, decodePayload, isErrorOfApiError } from "../../utils"
import { Packet, TypeInfo, TypeInfoEx } from "../../types"
import { LzApp } from "./lzapp"
import { BRIDGE_ADDRESS } from "../../constants"

export const DEFAULT_LIMITER_CAP_SD = 1000000000000
export const DEFAULT_LIMITER_WINDOW_SEC = 3600 * 4

export interface RemoteCoin {
    address: aptos.BCS.Bytes
    tvlSD: aptos.BCS.Uint64
    unwrappable: boolean
}

export enum PacketType {
    RECIEVE,
    SEND,
}

export class Bridge {
    readonly address: aptos.MaybeHexString
    readonly module: string
    readonly moduleName: string
    SEND_PAYLOAD_LENGTH = 74
    private sdk: SDK
    private coin: Coin
    private lzApp: LzApp
    private readonly uaType: string

    constructor(sdk: SDK, coin: Coin, bridge?: aptos.MaybeHexString, lzApp?: aptos.MaybeHexString) {
        this.sdk = sdk
        this.coin = coin
        this.address = bridge ?? BRIDGE_ADDRESS[sdk.stage]!
        this.lzApp = new LzApp(sdk, lzApp || sdk.accounts.layerzero!, this.address)
        this.uaType = `${this.address}::coin_bridge::BridgeUA`
        this.module = `${this.address}::coin_bridge`
        this.moduleName = "bridge::coin_bridge"
    }

    async setAppConfig(
        signer: aptos.AptosAccount,
        major: aptos.BCS.Uint16,
        minor: aptos.BCS.Uint8,
        remoteChainId: aptos.BCS.Uint16,
        configType: aptos.BCS.Uint8,
        configBytes: aptos.BCS.Bytes,
    ): Promise<aptos.Types.Transaction> {
        return this.lzApp.setConfig(signer, this.uaType, major, minor, remoteChainId, configType, configBytes)
    }

    async getMinDstGas(dstChainId: aptos.BCS.Uint16, type: aptos.BCS.Uint64) {
        return this.lzApp.getMinDstGas(this.uaType, dstChainId, type)
    }

    setMinDstGasPayload(
        dstChainId: aptos.BCS.Uint16,
        packetType: aptos.BCS.Uint64,
        minGas: aptos.BCS.Uint64,
    ): aptos.Types.EntryFunctionPayload {
        return this.lzApp.setMinDstPayload(this.uaType, dstChainId, packetType, minGas)
    }

    async customAdapterParamsEnabled(): Promise<boolean> {
        const resource = await this.sdk.client.getAccountResource(this.address, `${this.address}::coin_bridge::Config`)
        const { custom_adapter_params } = resource.data as { custom_adapter_params: boolean }
        return custom_adapter_params
    }

    enableCustomAdapterParamsPayload(enable: boolean): aptos.Types.EntryFunctionPayload {
        return {
            function: `${this.module}::enable_custom_adapter_params`,
            type_arguments: [],
            arguments: [enable],
        }
    }

    setRemoteBridgePayload(
        remoteChainId: aptos.BCS.Uint16,
        remoteBridgeAddr: aptos.BCS.Bytes,
    ): aptos.Types.EntryFunctionPayload {
        return this.lzApp.setRemotePaylaod(remoteChainId, remoteBridgeAddr)
    }

    async setRemoteBridge(
        signer: aptos.AptosAccount,
        remoteChainId: aptos.BCS.Uint16,
        remoteBridgeAddr: aptos.BCS.Bytes,
    ): Promise<aptos.Types.Transaction> {
        return this.lzApp.setRemote(signer, remoteChainId, remoteBridgeAddr)
    }

    registerCoinPayload(
        coin: BridgeCoinType,
        name: string,
        symbol: string,
        decimals: aptos.BCS.Uint8,
        limiterCapSD: aptos.BCS.Uint32 | aptos.BCS.Uint64,
    ): aptos.Types.EntryFunctionPayload {
        return {
            function: `${this.module}::register_coin`,
            type_arguments: [this.coin.getCoinType(coin)],
            arguments: [name, symbol, decimals, limiterCapSD],
        }
    }

    async registerCoin(
        signer: aptos.AptosAccount,
        coin: BridgeCoinType,
        name: string,
        symbol: string,
        decimals: aptos.BCS.Uint8,
        limiterCapSD: aptos.BCS.Uint32 | aptos.BCS.Uint64,
    ): Promise<aptos.Types.Transaction> {
        const transaction = this.registerCoinPayload(coin, name, symbol, decimals, limiterCapSD)
        return this.sdk.sendAndConfirmTransaction(signer, transaction)
    }

    setRemoteCoinPayload(
        coin: BridgeCoinType,
        remoteChainId: aptos.BCS.Uint16,
        remoteCoinAddr: aptos.MaybeHexString,
        unwrappable: boolean,
    ): aptos.Types.EntryFunctionPayload {
        const remoteCoinAddrBytes = convertToPaddedUint8Array(remoteCoinAddr.toString(), 32)
        return {
            function: `${this.module}::set_remote_coin`,
            type_arguments: [this.coin.getCoinType(coin)],
            arguments: [remoteChainId, Array.from(remoteCoinAddrBytes), unwrappable],
        }
    }

    async setRemoteCoin(
        signer: aptos.AptosAccount,
        coin: BridgeCoinType,
        remoteChainId: aptos.BCS.Uint16,
        remoteCoinAddr: aptos.MaybeHexString,
        unwrappable: boolean,
    ): Promise<aptos.Types.Transaction> {
        const transaction = this.setRemoteCoinPayload(coin, remoteChainId, remoteCoinAddr, unwrappable)
        return this.sdk.sendAndConfirmTransaction(signer, transaction)
    }

    forceResumePayload(srcChainId: aptos.BCS.Uint16): aptos.Types.EntryFunctionPayload {
        return {
            function: `${this.module}::force_resume`,
            type_arguments: [],
            arguments: [srcChainId],
        }
    }

    async forceResume(signer: aptos.AptosAccount, srcChainId: aptos.BCS.Uint16): Promise<aptos.Types.Transaction> {
        const transaction = this.forceResumePayload(srcChainId)
        return this.sdk.sendAndConfirmTransaction(signer, transaction)
    }

    async setPause(
        signer: aptos.AptosAccount,
        coin: BridgeCoinType,
        paused: boolean,
    ): Promise<aptos.Types.Transaction> {
        const transaction = {
            function: `${this.module}::set_pause`,
            type_arguments: [coin],
            arguments: [paused],
        }
        return this.sdk.sendAndConfirmTransaction(signer, transaction)
    }

    sendCoinPayload(
        coin: BridgeCoinType,
        dstChainId: aptos.BCS.Uint16,
        dstReceiver: aptos.BCS.Bytes,
        amountLD: aptos.BCS.Uint64 | aptos.BCS.Uint32,
        nativeFee: aptos.BCS.Uint64 | aptos.BCS.Uint32,
        zroFee: aptos.BCS.Uint64 | aptos.BCS.Uint32,
        unwrap: boolean,
        adapterParams: aptos.BCS.Bytes,
        msglibPararms: aptos.BCS.Bytes,
    ): aptos.Types.EntryFunctionPayload {
        return {
            function: `${this.module}::send_coin_from`,
            type_arguments: [this.coin.getCoinType(coin)],
            arguments: [
                dstChainId.toString(),
                Array.from(dstReceiver),
                amountLD.toString(),
                nativeFee.toString(),
                zroFee.toString(),
                unwrap.toString(),
                Array.from(adapterParams),
                Array.from(msglibPararms),
            ],
        }
    }

    async sendCoin(
        signer: aptos.AptosAccount,
        coin: BridgeCoinType,
        dstChainId: aptos.BCS.Uint16,
        dstReceiver: aptos.BCS.Bytes,
        amountLD: aptos.BCS.Uint64 | aptos.BCS.Uint32,
        nativeFee: aptos.BCS.Uint64 | aptos.BCS.Uint32,
        zroFee: aptos.BCS.Uint64 | aptos.BCS.Uint32,
        unwrap: boolean,
        adapterParams: aptos.BCS.Bytes,
        msglibParams: aptos.BCS.Bytes,
    ): Promise<aptos.Types.Transaction> {
        const transaction = this.sendCoinPayload(
            coin,
            dstChainId,
            dstReceiver,
            amountLD,
            nativeFee,
            zroFee,
            unwrap,
            adapterParams,
            msglibParams,
        )
        return this.sdk.sendAndConfirmTransaction(signer, transaction)
    }

    lzReceivePayload(
        coin: BridgeCoinType,
        srcChainId: aptos.BCS.Uint16,
        srcAddress: aptos.BCS.Bytes,
        payload: aptos.BCS.Bytes,
    ): aptos.Types.EntryFunctionPayload {
        return {
            function: `${this.module}::lz_receive`,
            type_arguments: [this.coin.getCoinType(coin)],
            arguments: [srcChainId, Array.from(srcAddress), Array.from(payload)],
        }
    }

    async lzReceive(
        signer: aptos.AptosAccount,
        coin: BridgeCoinType,
        srcChainId: aptos.BCS.Uint16,
        srcAddress: aptos.BCS.Bytes,
        payload: aptos.BCS.Bytes,
    ): Promise<aptos.Types.Transaction> {
        const transaction = this.lzReceivePayload(coin, srcChainId, srcAddress, payload)
        return this.sdk.sendAndConfirmTransaction(signer, transaction)
    }

    async getTypesFromPacket(packet: Packet): Promise<string[]> {
        const payload = decodePayload(packet.payload)
        const coinType = await this.getCoinTypeByRemoteCoin(packet.src_chain_id, payload.remoteCoinAddr)
        return [coinType.type]
    }

    claimCoinPayload(coin: BridgeCoinType): aptos.Types.EntryFunctionPayload {
        return {
            function: `${this.module}::claim_coin`,
            type_arguments: [this.coin.getCoinType(coin)],
            arguments: [],
        }
    }

    async claimCoin(signer: aptos.AptosAccount, coin: BridgeCoinType): Promise<aptos.Types.Transaction> {
        const transaction = this.claimCoinPayload(coin)
        return this.sdk.sendAndConfirmTransaction(signer, transaction)
    }

    async globalPaused(): Promise<boolean> {
        const resource = await this.sdk.client.getAccountResource(this.address, `${this.module}::Config`)
        const { paused_global } = resource.data as { paused_global: boolean }
        return paused_global
    }

    async getRemoteBridge(remoteChainId: aptos.BCS.Uint16): Promise<aptos.BCS.Bytes> {
        try {
            return await this.lzApp.getRemote(remoteChainId)
        } catch (e) {
            if (isErrorOfApiError(e, 404)) {
                return Buffer.alloc(0)
            }
            throw e
        }
    }

    async getCoinTypeByRemoteCoin(
        remoteChainId: string | aptos.BCS.Uint16,
        remoteCoinAddr: aptos.BCS.Bytes,
    ): Promise<TypeInfoEx> {
        const resource = await this.getCoinTypeStore()
        const { type_lookup } = resource.data as { type_lookup: { handle: string } }
        const coinInfosHandle = type_lookup.handle
        const typeInfo = await this.sdk.client.getTableItem(coinInfosHandle, {
            key_type: `${this.module}::Path`,
            value_type: `0x1::type_info::TypeInfo`,
            key: {
                remote_chain_id: remoteChainId.toString(),
                remote_coin_addr: Buffer.from(remoteCoinAddr).toString("hex"),
            },
        })

        const account_address = utils.fullAddress(typeInfo.account_address).toString()
        const module_name = utils.hexToAscii(typeInfo.module_name)
        const struct_name = utils.hexToAscii(typeInfo.struct_name)
        return {
            account_address,
            module_name,
            struct_name,
            type: `${account_address}::${module_name}::${struct_name}`,
        }
    }

    async getRemoteCoin(coin: BridgeCoinType, remoteChainId: aptos.BCS.Uint16): Promise<RemoteCoin> {
        const resource = await this.getCoinStore(coin)
        const { remote_coins } = resource.data as { remote_coins: { handle: string } }
        const remoteCoinHandle = remote_coins.handle

        const remoteCoin = await this.sdk.client.getTableItem(remoteCoinHandle, {
            key_type: "u64",
            value_type: `${this.module}::RemoteCoin`,
            key: remoteChainId.toString(),
        })

        const address = Uint8Array.from(
            Buffer.from(aptos.HexString.ensure(remoteCoin.remote_address).noPrefix(), "hex"),
        )
        const tvlSD = BigInt(remoteCoin.tvl_sd)
        const unwrappable = remoteCoin.unwrappable
        return {
            address,
            tvlSD,
            unwrappable,
        }
    }

    async getRemoteCoins(coin: BridgeCoinType): Promise<RemoteCoin[]> {
        const resource = await this.getCoinStore(coin)

        const { remote_chains: remoteChains } = resource.data as { remote_chains: string[] }
        const rtn = []
        for (const chain of remoteChains) {
            const remoteCoin = await this.getRemoteCoin(coin, parseInt(chain))
            rtn.push(remoteCoin)
        }
        return rtn
    }

    async hasRemoteCoin(coin: BridgeCoinType, remoteChainId: aptos.BCS.Uint16): Promise<boolean> {
        try {
            const remoteCoin = await this.getRemoteCoin(coin, remoteChainId)
            return remoteCoin !== undefined
        } catch (e) {
            if (utils.isErrorOfApiError(e, 404)) {
                return false
            }
            throw e
        }
    }

    async getClaimableCoin(coin: BridgeCoinType, owner: aptos.MaybeHexString): Promise<aptos.BCS.Uint64> {
        const resource = await this.getCoinStore(coin)
        const { claimable_amt_ld } = resource.data as { claimable_amt_ld: { handle: string } }
        const claimableAmtLDHandle = claimable_amt_ld.handle

        try {
            const response = await this.sdk.client.getTableItem(claimableAmtLDHandle, {
                key_type: "address",
                value_type: "u64",
                key: owner,
            })
            return BigInt(response)
        } catch (e) {
            if (utils.isErrorOfApiError(e, 404)) {
                return BigInt(0)
            }
            throw e
        }
    }

    async hasCoinRegistered(coin: BridgeCoinType): Promise<boolean> {
        try {
            const resource = await this.getCoinStore(coin)
            return resource !== undefined
        } catch (e) {
            if (utils.isErrorOfApiError(e, 404)) {
                return false
            }
            throw e
        }
    }

    async getLd2SdRate(coin: BridgeCoinType): Promise<string> {
        const resource = await this.getCoinStore(coin)
        const { ld2sd_rate } = resource.data as { ld2sd_rate: string }
        return ld2sd_rate
    }

    async convertAmountToLD(
        coin: BridgeCoinType,
        amountSD: aptos.BCS.Uint64 | aptos.BCS.Uint32,
    ): Promise<aptos.BCS.Uint64> {
        const rate = await this.getLd2SdRate(coin)
        return BigInt(amountSD) * BigInt(rate)
    }

    async convertAmountToSD(
        coin: BridgeCoinType,
        amountLD: aptos.BCS.Uint64 | aptos.BCS.Uint32,
    ): Promise<aptos.BCS.Uint64> {
        const rate = await this.getLd2SdRate(coin)
        return BigInt(amountLD) / BigInt(rate)
    }

    registerPayload(coin: BridgeCoinType): aptos.Types.EntryFunctionPayload {
        return {
            function: `0x1::managed_coin::register`,
            type_arguments: [this.coin.getCoinType(coin)],
            arguments: [],
        }
    }

    async coinRegister(signer: aptos.AptosAccount, coin: BridgeCoinType): Promise<aptos.Types.Transaction> {
        const transaction = this.registerPayload(coin)
        return this.sdk.sendAndConfirmTransaction(signer, transaction)
    }

    async getCoinTypes(): Promise<TypeInfoEx[]> {
        const resource = await this.getCoinTypeStore()
        const { types: coinTypes } = resource.data as { types: TypeInfo[] }

        const rtn = []
        for (const typeInfo of coinTypes) {
            const account_address = utils.fullAddress(typeInfo.account_address).toString()
            const module_name = utils.hexToAscii(typeInfo.module_name)
            const struct_name = utils.hexToAscii(typeInfo.struct_name)
            rtn.push({
                account_address,
                module_name,
                struct_name,
                type: `${account_address}::${module_name}::${struct_name}`,
            })
        }
        return rtn
    }

    async getLimitedAmount(coin: BridgeCoinType): Promise<{ limited: boolean; amount: aptos.BCS.Uint64 }> {
        const resource = await this.sdk.client.getAccountResource(
            this.address,
            `${this.address}::limiter::Limiter<${this.coin.getCoinType(coin)}>`,
        )

        const { enabled } = resource.data as { enabled: boolean }

        if (!enabled) {
            return {
                limited: false,
                amount: BigInt(0),
            }
        }

        const data = resource.data as { [key: string]: string }
        const limiter = {
            t0Sec: BigInt(data.t0_sec),
            windowSec: BigInt(data.window_sec),
            sumSD: BigInt(data.sum_sd),
            capSD: BigInt(data.cap_sd),
        }

        const now = await this.getCurrentTimestamp()
        let count = (now - limiter.t0Sec) / limiter.windowSec

        while (count > 0) {
            limiter.sumSD /= BigInt(2)
            count -= BigInt(1)
        }

        const limitedAmtSD = limiter.capSD - limiter.sumSD
        return {
            limited: true,
            amount: await this.convertAmountToLD(coin, limitedAmtSD),
        }
    }

    setLimiterCapPayload(
        coin: BridgeCoinType,
        enable: boolean,
        capSD: aptos.BCS.Uint32 | aptos.BCS.Uint64,
        windowSec: aptos.BCS.Uint32 | aptos.BCS.Uint64,
    ): aptos.Types.EntryFunctionPayload {
        return {
            function: `${this.module}::set_limiter_cap`,
            type_arguments: [this.coin.getCoinType(coin)],
            arguments: [enable, capSD.toString(), windowSec.toString()],
        }
    }

    async setLimiterCap(
        signer: aptos.AptosAccount,
        coin: BridgeCoinType,
        enable: boolean,
        capSD: aptos.BCS.Uint32 | aptos.BCS.Uint64,
        windowSec: aptos.BCS.Uint32 | aptos.BCS.Uint64,
    ): Promise<aptos.Types.Transaction> {
        const transaction = this.setLimiterCapPayload(coin, enable, capSD, windowSec)
        return this.sdk.sendAndConfirmTransaction(signer, transaction)
    }

    async getLimitCap(
        coin: BridgeCoinType,
    ): Promise<{ enabled: boolean; capSD: aptos.BCS.Uint64; windowSec: aptos.BCS.Uint64 }> {
        try {
            const resource = await this.sdk.client.getAccountResource(
                this.address,
                `${this.address}::limiter::Limiter<${this.coin.getCoinType(coin)}>`,
            )
            const { enabled, cap_sd, window_sec } = resource.data as {
                enabled: boolean
                cap_sd: string
                window_sec: string
            }
            return {
                enabled,
                capSD: BigInt(cap_sd),
                windowSec: BigInt(window_sec),
            }
        } catch (e) {
            if (isErrorOfApiError(e, 404)) {
                return {
                    enabled: true,
                    capSD: BigInt(DEFAULT_LIMITER_CAP_SD),
                    windowSec: BigInt(DEFAULT_LIMITER_WINDOW_SEC),
                }
            }
            throw e
        }
    }

    async setGlobalPause(signer: aptos.AptosAccount, pause: boolean): Promise<aptos.Types.Transaction> {
        const transaction = {
            function: `${this.module}::set_global_pause`,
            type_arguments: [],
            arguments: [pause],
        }
        return this.sdk.sendAndConfirmTransaction(signer, transaction)
    }

    private async getCoinStore(coin: BridgeCoinType): Promise<aptos.Types.MoveResource> {
        // if input is full type, get coinStore directly
        return await this.sdk.client.getAccountResource(
            this.address,
            `${this.module}::CoinStore<${this.coin.getCoinType(coin)}>`,
        )
    }

    private async getCoinTypeStore(): Promise<aptos.Types.MoveResource> {
        return await this.sdk.client.getAccountResource(this.address, `${this.module}::CoinTypeStore`)
    }

    private async getCurrentTimestamp(): Promise<aptos.BCS.Uint64> {
        const resource = await this.sdk.client.getAccountResource("0x1", "0x1::timestamp::CurrentTimeMicroseconds")
        const { microseconds } = resource.data as { microseconds: string }
        return BigInt(microseconds) / BigInt(1000000)
    }
}

import * as aptos from "aptos"
import { SDK } from "../../index"
import { isErrorOfApiError } from "../../utils"
import { BRIDGE_ADDRESS } from "../../constants"

export enum CoinType {
    APTOS = "AptosCoin", // native coin
    // coin that bridge supports, same to bridge::coin module
    WETH = "WETH",
    WBTC = "WBTC",

    USDC = "USDC",
    USDT = "USDT",
    BUSD = "BUSD",
    USDD = "USDD",
}

export const supportedTypes = [CoinType.WETH, CoinType.WBTC, CoinType.USDC, CoinType.USDT, CoinType.BUSD, CoinType.USDD]

export type BridgeCoinType =
    CoinType.WETH
    | CoinType.WBTC
    | CoinType.USDC
    | CoinType.USDT
    | CoinType.BUSD
    | CoinType.USDD

export class Coin {
    private sdk: SDK
    private readonly bridge: aptos.MaybeHexString

    constructor(sdk: SDK, bridge?: aptos.MaybeHexString) {
        this.sdk = sdk
        this.bridge = bridge ?? BRIDGE_ADDRESS[sdk.stage]!
    }

    getCoinType(coin: CoinType): string {
        switch (coin) {
            case CoinType.APTOS:
                return `0x1::aptos_coin::${coin}`
            default:
                return `${this.bridge}::asset::${coin}`
        }
    }

    transferPayload(
        coin: CoinType,
        to: aptos.MaybeHexString,
        amount: aptos.BCS.Uint64 | aptos.BCS.Uint32,
    ): aptos.Types.EntryFunctionPayload {
        if (coin === CoinType.APTOS) {
            return {
                function: `0x1::aptos_account::transfer`,
                type_arguments: [],
                arguments: [to, amount],
            }
        } else {
            return {
                function: `0x1::coin::transfer`,
                type_arguments: [this.getCoinType(coin)],
                arguments: [to, amount],
            }
        }
    }

    async transfer(
        signer: aptos.AptosAccount,
        coin: CoinType,
        to: aptos.MaybeHexString,
        amount: aptos.BCS.Uint64 | aptos.BCS.Uint32,
    ): Promise<aptos.Types.Transaction> {
        const transaction = this.transferPayload(coin, to, amount)
        return this.sdk.sendAndConfirmTransaction(signer, transaction)
    }

    async balance(coin: CoinType, owner: aptos.MaybeHexString): Promise<aptos.BCS.Uint64> {
        try {
            const resource = await this.sdk.client.getAccountResource(
                owner,
                `0x1::coin::CoinStore<${this.getCoinType(coin)}>`,
            )
            const { coin: c } = resource.data as { coin: { value: string } }
            return BigInt(c.value)
        } catch (e) {
            if (isErrorOfApiError(e, 404)) {
                return BigInt(0)
            }
            throw e
        }
    }

    async isAccountRegistered(coin: CoinType, accountAddr: aptos.MaybeHexString): Promise<boolean> {
        try {
            await this.sdk.client.getAccountResource(accountAddr, `0x1::coin::CoinStore<${this.getCoinType(coin)}>`)
            return true
        } catch (e) {
            if (isErrorOfApiError(e, 404)) {
                return false
            }
            throw e
        }
    }
}

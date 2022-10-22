import { ChainId } from "@layerzerolabs/core-sdk"
import { CoinType } from "../../../../sdk/src/modules/apps/coin"
import { PacketType } from "./types"
import { getConfig } from "../../../../sdk/tasks/config/testnet"

export const CONFIG = {
    useCustomAdapterParams: true,
    feeBP: 6,
    minDstGas: {
        [PacketType.SEND_TO_APTOS]: 2500,
    },
    coins: {
        [ChainId.GOERLI]: getCoinsFromAptosConfig(ChainId.GOERLI),
        [ChainId.FUJI]: getCoinsFromAptosConfig(ChainId.FUJI),
    },
}

function getCoinsFromAptosConfig(chainId: ChainId): CoinType[] {
    const types = []
    const coins = getConfig([]).bridge.coins
    for (const coin in coins) {
        const remotes = Object.keys(coins[coin].remotes)
        if (remotes.includes(chainId.toString())) {
            types.push(coin as CoinType)
        }
    }
    return types
}

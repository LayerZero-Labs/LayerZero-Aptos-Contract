import { ChainId } from "@layerzerolabs/core-sdk"
import { CoinType } from "../../../../sdk/src/modules/apps/coin"
import { PacketType } from "./types"
import { getConfig } from "../../../../sdk/tasks/config/mainnet"

export const CONFIG = {
    useCustomAdapterParams: true,
    feeBP: 0,
    minDstGas: {
        [PacketType.SEND_TO_APTOS]: 2500,
    },
    coins: {
        [ChainId.ETHEREUM]: getCoinsFromAptosConfig(ChainId.ETHEREUM),
        [ChainId.AVALANCHE]: getCoinsFromAptosConfig(ChainId.AVALANCHE),
        [ChainId.POLYGON]: getCoinsFromAptosConfig(ChainId.POLYGON),
        [ChainId.BSC]: getCoinsFromAptosConfig(ChainId.BSC),
        [ChainId.ARBITRUM]: getCoinsFromAptosConfig(ChainId.ARBITRUM),
        [ChainId.OPTIMISM]: getCoinsFromAptosConfig(ChainId.OPTIMISM),
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

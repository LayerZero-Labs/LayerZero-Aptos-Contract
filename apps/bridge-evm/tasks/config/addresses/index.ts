import { ChainId } from "@layerzerolabs/core-sdk"
import { BridgeCoinType, CoinType } from "../../../../../sdk/src/modules/apps/coin"
import { getDeploymentAddresses } from "../../utils/readStatic"
import {
    WETH_ADDRESS as WETH_MAINNET_ADDRESS,
    USDT_ADDRESS as USDT_MAINNET_ADDRESS,
    USDC_ADDRESS as USDC_MAINNET_ADDRESS,
} from "./mainnetAddresses"
import {
    WETH_ADDRESS as WETH_TESTNET_ADDRESS,
    USDT_ADDRESS as USDT_TESTNET_ADDRESS,
    USDC_ADDRESS as USDC_TESTNET_ADDRESS,
} from "./testnetAddresses"
import {
    WETH_ADDRESS as WETH_SANDBOX_ADDRESS,
    USDT_ADDRESS as USDT_SANDBOX_ADDRESS,
    USDC_ADDRESS as USDC_SANDBOX_ADDRESS,
} from "./sandboxAddresses"

export const WETH_ADDRESS: { [chainId in ChainId]?: string } = {
    ...WETH_SANDBOX_ADDRESS,
    ...WETH_TESTNET_ADDRESS,
    ...WETH_MAINNET_ADDRESS,
}

export const USDC_ADDRESS: { [chainId in ChainId]?: string } = {
    ...USDC_SANDBOX_ADDRESS,
    ...USDC_TESTNET_ADDRESS,
    ...USDC_MAINNET_ADDRESS,
}

export const USDT_ADDRESS: { [chainId in ChainId]?: string } = {
    ...USDT_SANDBOX_ADDRESS,
    ...USDT_TESTNET_ADDRESS,
    ...USDT_MAINNET_ADDRESS,
}

export const TOKEN_ADDRESSES: { [type in BridgeCoinType]?: { [chainId in ChainId]?: string } } = {
    [CoinType.WETH]: WETH_ADDRESS,
    [CoinType.USDC]: USDC_ADDRESS,
    [CoinType.USDT]: USDT_ADDRESS,
}

const bridgeAddresses: { [key: string]: string } = {}
export function evmBridgeAddresses(network: string, forked = false): string {
    if (forked) {
        network = `${network}-fork`
    }
    const key = `${network}}`
    if (!bridgeAddresses[key]) {
        bridgeAddresses[key] = getDeploymentAddresses(network)["TokenBridge"]
    }
    return bridgeAddresses[key]
}

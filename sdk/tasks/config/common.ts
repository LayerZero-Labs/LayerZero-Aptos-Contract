import { ChainId, ChainStage } from "@layerzerolabs/core-sdk"

export type ConfigType = {
    msglib: {
        msglibv1: any
    }
    endpoint: any
    executor: any
    relayer: any
    oracle: any
    bridge: any
}

export const NETWORK_NAME: { [c in ChainStage]?: string } = {
    [ChainStage.MAINNET]: "aptos",
    [ChainStage.TESTNET]: "aptos-testnet",
    [ChainStage.TESTNET_SANDBOX]: "aptos-testnet-sandbox",
}

export const EVM_ADDERSS_SIZE = 20

export const ARBITRUM_MULTIPLIER = 10

export function applyArbitrumMultiplier(chainId: ChainId, value: number) {
    return [ChainId.ARBITRUM_GOERLI, ChainId.ARBITRUM_GOERLI_SANDBOX, ChainId.ARBITRUM].includes(chainId)
        ? value * ARBITRUM_MULTIPLIER
        : value
}

export const DEFAULT_BLOCK_CONFIRMATIONS: { [chainStage in ChainStage]?: { [chainId in ChainId]?: number } } = {
    [ChainStage.MAINNET]: {
        [ChainId.ETHEREUM]: 15,
        [ChainId.BSC]: 20,
        [ChainId.AVALANCHE]: 12,
        [ChainId.POLYGON]: 512,
        [ChainId.ARBITRUM]: 20,
        [ChainId.OPTIMISM]: 20,
        [ChainId.FANTOM]: 5,
    },
    [ChainStage.TESTNET]: {
        [ChainId.GOERLI]: 10,
        [ChainId.BSC_TESTNET]: 5,
        [ChainId.FUJI]: 6,
        [ChainId.MUMBAI]: 10,
        [ChainId.FANTOM_TESTNET]: 7,
        [ChainId.HARMONY_TESTNET]: 5,
        [ChainId.ARBITRUM_GOERLI]: 3,
        [ChainId.OPTIMISM_GOERLI]: 3,
    },
    [ChainStage.TESTNET_SANDBOX]: {
        [ChainId.BSC_TESTNET_SANDBOX]: 5,
        [ChainId.FUJI_SANDBOX]: 6,
        [ChainId.MUMBAI_SANDBOX]: 10,
        [ChainId.FANTOM_TESTNET_SANDBOX]: 7,
        [ChainId.GOERLI_SANDBOX]: 10,
    },
}

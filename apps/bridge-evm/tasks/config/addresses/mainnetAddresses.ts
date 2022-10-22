import { ChainId } from "@layerzerolabs/core-sdk"

type MainnetChainId = ChainId.ETHEREUM | ChainId.BSC | ChainId.AVALANCHE | ChainId.POLYGON | ChainId.ARBITRUM | ChainId.OPTIMISM | ChainId.FANTOM

export const WETH_ADDRESS: { [chainId in MainnetChainId]?: string } = {
    [ChainId.ETHEREUM]: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    [ChainId.ARBITRUM]: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    [ChainId.OPTIMISM]: "0x4200000000000000000000000000000000000006",
}

export const USDT_ADDRESS: { [chainId in MainnetChainId]?: string } = {
    [ChainId.ETHEREUM]: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    [ChainId.BSC]: "0x55d398326f99059fF775485246999027B3197955",
    [ChainId.AVALANCHE]: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7",
    [ChainId.POLYGON]: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
}

export const USDC_ADDRESS: { [chainId in MainnetChainId]?: string } = {
    [ChainId.ETHEREUM]: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    [ChainId.AVALANCHE]: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
    [ChainId.POLYGON]: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
    [ChainId.ARBITRUM]: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
    [ChainId.OPTIMISM]: "0x7F5c764cBc14f9669B88837ca1490cCa17c31607",
}

export const WETH_DECIMALS: { [chainId in MainnetChainId]?: number } = {
    [ChainId.ETHEREUM]: 18,
    [ChainId.ARBITRUM]: 18,
    [ChainId.OPTIMISM]: 18,
}

export const USDT_DECIMALS: { [chainId in MainnetChainId]?: number } = {
    [ChainId.ETHEREUM]: 6,
    [ChainId.BSC]: 18,
    [ChainId.AVALANCHE]: 6,
    [ChainId.POLYGON]: 6,
}

export const USDC_DECIMALS: { [chainId in MainnetChainId]?: number } = {
    [ChainId.ETHEREUM]: 6,
    [ChainId.AVALANCHE]: 6,
    [ChainId.POLYGON]: 6,
    [ChainId.ARBITRUM]: 6,
    [ChainId.OPTIMISM]: 6,
}
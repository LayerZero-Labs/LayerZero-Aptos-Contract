import { ChainId } from "@layerzerolabs/core-sdk"

type TestnetChainId =
    | ChainId.GOERLI
    | ChainId.BSC_TESTNET
    | ChainId.FUJI
    | ChainId.MUMBAI
    | ChainId.FANTOM_TESTNET
    | ChainId.ARBITRUM_GOERLI
    | ChainId.OPTIMISM_GOERLI

export const WETH_ADDRESS: { [chainId in TestnetChainId]?: string } = {
    [ChainId.GOERLI]: "0xcC0235a403E77C56d0F271054Ad8bD3ABcd21904",
}

export const USDT_ADDRESS: { [chainId in TestnetChainId]?: string } = {
    [ChainId.BSC_TESTNET]: "0xF49E250aEB5abDf660d643583AdFd0be41464EfD",
    [ChainId.FUJI]: "0x134Dc38AE8C853D1aa2103d5047591acDAA16682",
    [ChainId.MUMBAI]: "0x6Fc340be8e378c2fF56476409eF48dA9a3B781a0",
    [ChainId.FANTOM_TESTNET]: "0x4a4129978218e7bac738D7B841D3F382D6EFbeE9",
}

export const USDC_ADDRESS: { [chainId in TestnetChainId]?: string } = {
    [ChainId.GOERLI]: "0x30c212b53714daf3739Ff607AaA8A0A18956f13c",
    [ChainId.FUJI]: "0x4A0D1092E9df255cf95D72834Ea9255132782318",
    [ChainId.MUMBAI]: "0x742DfA5Aa70a8212857966D491D67B09Ce7D6ec7",
    [ChainId.FANTOM_TESTNET]: "0x076488D244A73DA4Fa843f5A8Cd91F655CA81a1e",
}

import { ChainId } from "@layerzerolabs/core-sdk"

type SandboxChainId = ChainId.GOERLI_SANDBOX | ChainId.ARBITRUM_GOERLI_SANDBOX | ChainId.OPTIMISM_GOERLI_SANDBOX

export const WETH_ADDRESS: { [chainId in SandboxChainId]?: string } = {
    [ChainId.GOERLI_SANDBOX]: "0xcC0235a403E77C56d0F271054Ad8bD3ABcd21904",
}

export const USDT_ADDRESS: { [chainId in SandboxChainId]?: string } = {}

export const USDC_ADDRESS: { [chainId in SandboxChainId]?: string } = {
    [ChainId.GOERLI_SANDBOX]: "0x30c212b53714daf3739Ff607AaA8A0A18956f13c",
}

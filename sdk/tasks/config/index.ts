import { ChainId, ChainStage } from "@layerzerolabs/core-sdk"
import { getConfig as SandboxConfig } from "./sandbox"
import { getConfig as TestnetConfig } from "./testnet"
import { getConfig as MainnetConfig } from "./mainnet"

export * from "./common"

export function LzConfig(stage: ChainStage, chainIds: ChainId[], forked = false) {
    switch (stage) {
        case ChainStage.TESTNET_SANDBOX:
            return SandboxConfig()
        case ChainStage.TESTNET:
            return TestnetConfig(chainIds)
        case ChainStage.MAINNET:
            return MainnetConfig(chainIds, forked)
        default:
            throw new Error(`Invalid stage: ${stage}`)
    }
}

import { ChainStage } from "@layerzerolabs/core-sdk"
import { CONFIG as SandboxConfig } from "./sandbox"
import { CONFIG as TestnetConfig } from "./testnet"
import { CONFIG as MainnetConfig } from "./mainnet"

export function getConfig(stage: ChainStage) {
    switch (stage) {
        case ChainStage.TESTNET_SANDBOX:
            return SandboxConfig
        case ChainStage.TESTNET:
            return TestnetConfig
        case ChainStage.MAINNET:
            return MainnetConfig
        default:
            throw new Error(`Invalid stage: ${stage}`)
    }
}

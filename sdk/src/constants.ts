import { ChainStage } from "@layerzerolabs/lz-sdk"
import { Environment } from "./types"

export const NODE_URL: { [env in Environment]: string } = {
    [Environment.MAINNET]: "https://mainnet.aptoslabs.com/v1",
    [Environment.TESTNET]: "https://fullnode.testnet.aptoslabs.com/v1",
    [Environment.DEVNET]: "https://fullnode.devnet.aptoslabs.com/v1",
    [Environment.LOCAL]: "http://127.0.0.1:8080/v1",
}

export const FAUCET_URL: { [env in Environment]: string } = {
    [Environment.MAINNET]: "",
    [Environment.TESTNET]: "https://faucet.testnet.aptoslabs.com",
    [Environment.DEVNET]: "https://faucet.devnet.aptoslabs.com",
    [Environment.LOCAL]: "http://127.0.0.1:8081",
}

export const LAYERZERO_ADDRESS: { [stage in ChainStage]?: string } = {
    [ChainStage.MAINNET]: "0x54ad3d30af77b60d939ae356e6606de9a4da67583f02b962d2d3f2e481484e90",
    [ChainStage.TESTNET]: "0x1759cc0d3161f1eb79f65847d4feb9d1f74fb79014698a23b16b28b9cd4c37e3",
    [ChainStage.TESTNET_SANDBOX]: "0xcdc2c5597e2a96faf08135db560e3846e8c8c5683b0db868f6ad68f143906b3e",
}

export const ORACLE_ADDRESS: { [stage in ChainStage]?: string } = {
    [ChainStage.MAINNET]: "0xc2846ea05319c339b3b52186ceae40b43d4e9cf6c7350336c3eb0b351d9394eb",
    [ChainStage.TESTNET]: "0x8ab85d94bf34808386b3ce0f9516db74d2b6d2f1166aa48f75ca641f3adb6c63",
    [ChainStage.TESTNET_SANDBOX]: "0x38ee7e8bc9d2601ec0934a5d6e23182a266380d87840e5f0850bfeb647297d3a",
}

export const ORACLE_SIGNER_ADDRESS: { [stage in ChainStage]?: string } = {
    [ChainStage.MAINNET]: "0x12e12de0af996d9611b0b78928cd9f4cbf50d94d972043cdd829baa77a78929b",
    [ChainStage.TESTNET]: "0x47a30bcdb5b5bdbf6af883c7325827f3e40b3f52c3538e9e677e68cf0c0db060",
    [ChainStage.TESTNET_SANDBOX]: "0x760b1ad2811b7c3e7e04a9dc38520320dc30850fbf001db61c18d1e36221d5c8",
}

export const RELAYER_SIGNER_ADDRESS: { [stage in ChainStage]?: string } = {
    [ChainStage.MAINNET]: "0x1d8727df513fa2a8785d0834e40b34223daff1affc079574082baadb74b66ee4",
    [ChainStage.TESTNET]: "0xc192864c4215741051321d44f89c3b7a54840a0b1b7ef5bec6149a07f9df4641",
    [ChainStage.TESTNET_SANDBOX]: "0xc180500ddac3fef70cb1e9fc0d75793850e2cef84d518ea0a3b3adfb93751ea7",
}

export const EXECUTOR_ADDRESS: { [stage in ChainStage]?: string } = {
    [ChainStage.MAINNET]: "0x1d8727df513fa2a8785d0834e40b34223daff1affc079574082baadb74b66ee4",
    [ChainStage.TESTNET]: "0xc192864c4215741051321d44f89c3b7a54840a0b1b7ef5bec6149a07f9df4641",
    [ChainStage.TESTNET_SANDBOX]: "0xc180500ddac3fef70cb1e9fc0d75793850e2cef84d518ea0a3b3adfb93751ea7",
}

export const BRIDGE_ADDRESS: { [stage in ChainStage]?: string } = {
    [ChainStage.MAINNET]: "0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa",
    [ChainStage.TESTNET]: "0xec84c05cc40950c86d8a8bed19552f1e8ebb783196bb021c916161d22dc179f7",
    [ChainStage.TESTNET_SANDBOX]: "0x808b4ffe04011cd20327a910518b4bff661f73fa907e9fc41ad690f84fa6f83e",
}

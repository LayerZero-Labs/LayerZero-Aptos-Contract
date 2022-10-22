import { ConfigType } from "./common"
import * as _ from "lodash"
import { CoinType } from "../../src/modules/apps/coin"
import { DEFAULT_LIMITER_CAP_SD, DEFAULT_LIMITER_WINDOW_SEC } from "../../src/modules/apps/bridge"

export const CONFIG: ConfigType = {
    msglib: {
        msglibv1: {
            addressSize: 32,
            versionTypes: {
                "1.0": "uln_receive::ULN",
            },
            defaultSendVersion: "1.0",
            defaultReceiveVersion: "1.0",
        },
    },
    endpoint: {
        defaultExecutorVersion: 1,
        defaultExecutor: {
            version: 1,
        },
    },
    executor: {},
    relayer: {},
    oracle: {
        threshold: 2,
    },
    bridge: {
        enableCustomAdapterParams: true,
        coins: {
            [CoinType.WETH]: {
                name: "WETH",
                symbol: "WETH",
                decimals: 18,
                limiter: {
                    enabled: true,
                    capSD: 100000000000,
                    windowSec: 3600,
                },
            },
            [CoinType.USDC]: {
                name: "USDC",
                symbol: "USDC",
                decimals: 18,
                limiter: {
                    enabled: true,
                    capSD: DEFAULT_LIMITER_CAP_SD,
                    windowSec: DEFAULT_LIMITER_WINDOW_SEC,
                },
            },
        },
    },
}

export function getTestConfig(
    remoteChainId: number,
    layerzeroAddress: string,
    oracleAddress: string,
    oracleSignerAddress: string,
    relayerAddress: string,
    executorAddress: string,
    validators = {},
): ConfigType {
    return _.merge(CONFIG, {
        msglib: {
            msglibv1: {
                defaultAppConfig: {
                    [remoteChainId]: {
                        oracle: oracleSignerAddress,
                        relayer: relayerAddress,
                        inboundConfirmations: 15,
                        outboundConfirmations: 15,
                    },
                },
            },
        },
        endpoint: {
            defaultExecutor: {
                address: executorAddress,
            },
            defaultAdapterParam: {
                [remoteChainId]: {
                    uaGas: 10000,
                },
            },
        },
        executor: {
            address: executorAddress,
            fee: {
                [remoteChainId]: {
                    airdropAmtCap: 10000000000, // 10^10
                    priceRatio: 10000000000, // denominated in 10^10
                    gasPrice: 1,
                },
            },
        },
        relayer: {
            signerAddress: relayerAddress,
            fee: {
                [remoteChainId]: {
                    baseFee: 100,
                    feePerByte: 1,
                },
            },
        },
        oracle: {
            address: oracleAddress,
            signerAddress: oracleSignerAddress,
            fee: {
                [remoteChainId]: {
                    baseFee: 10,
                },
            },
            validators: validators,
        },
    })
}

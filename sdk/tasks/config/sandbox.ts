import { CHAIN_KEY, ChainId, ChainStage } from "@layerzerolabs/core-sdk"
import { evmBridgeAddresses, TOKEN_ADDRESSES } from "../../../apps/bridge-evm/tasks/config/addresses"
import { applyArbitrumMultiplier, ConfigType, DEFAULT_BLOCK_CONFIRMATIONS, EVM_ADDERSS_SIZE } from "./common"
import { CoinType } from "../../src/modules/apps/coin"
import { DEFAULT_LIMITER_CAP_SD, DEFAULT_LIMITER_WINDOW_SEC, PacketType } from "../../src/modules/apps/bridge"
import {
    BRIDGE_ADDRESS,
    EXECUTOR_ADDRESS,
    ORACLE_ADDRESS,
    ORACLE_SIGNER_ADDRESS,
    RELAYER_SIGNER_ADDRESS,
} from "../../src/constants"

const chainStage = ChainStage.TESTNET_SANDBOX
const ChainIds = [ChainId.GOERLI_SANDBOX]

const _CONFIG: ConfigType = {
    msglib: {
        msglibv1: {
            addressSize: 20,
            versionTypes: {
                "1.0": "uln_receive::ULN",
            },
            defaultAppConfig: {},
            defaultSendVersion: "1.0",
            defaultReceiveVersion: "1.0",
        },
    },
    endpoint: {
        defaultExecutorVersion: 1,
        defaultExecutor: {
            version: 1,
            address: EXECUTOR_ADDRESS[chainStage],
        },
        defaultAdapterParam: {},
    },
    executor: {
        address: EXECUTOR_ADDRESS[chainStage],
        fee: {},
    },
    relayer: {
        signerAddress: RELAYER_SIGNER_ADDRESS[chainStage],
        fee: {},
    },
    oracle: {
        address: ORACLE_ADDRESS[chainStage],
        signerAddress: ORACLE_SIGNER_ADDRESS[chainStage],
        fee: {},
        validators: {
            "0xbe08c77d93f1560132d2d78b2aab2a5559adeee897bcdea25de754a34f36c7f7": true,
            "0x96cf17279932c8c837751b5e1d01b7d7106eeab4928b8e25fcf4acbfb5bbdb4d": true,
            "0xc98b5018c54451bd3a04ccdc86ab76ac474ba90a29f94678e9d109cd24b15772": true,
        },
        threshold: 1,
    },
    bridge: {
        address: BRIDGE_ADDRESS[chainStage],
        enableCustomAdapterParams: true,
        remoteBridge: {},
        minDstGas: {
            [PacketType.SEND]: {},
        },
        coins: {
            [CoinType.WETH]: {
                name: "Wrapped Ether",
                symbol: "WETH",
                decimals: 6,
                remotes: {
                    [ChainId.GOERLI_SANDBOX]: {},
                },
                limiter: {
                    enabled: true,
                    capSD: DEFAULT_LIMITER_CAP_SD,
                    windowSec: DEFAULT_LIMITER_WINDOW_SEC,
                },
            },
            [CoinType.USDC]: {
                name: "USD Coin",
                symbol: "USDC",
                decimals: 6,
                remotes: {
                    [ChainId.GOERLI_SANDBOX]: {},
                },
                limiter: {
                    enabled: true,
                    capSD: DEFAULT_LIMITER_CAP_SD,
                    windowSec: DEFAULT_LIMITER_WINDOW_SEC,
                },
            },
        },
    },
}

export function getConfig(): ConfigType {
    for (const chainId of ChainIds) {
        // fill default app config for each chain
        _CONFIG.msglib.msglibv1.defaultAppConfig[chainId] = {}
        _CONFIG.msglib.msglibv1.defaultAppConfig[chainId].inboundConfirmations =
            DEFAULT_BLOCK_CONFIRMATIONS[chainStage][chainId]
        _CONFIG.msglib.msglibv1.defaultAppConfig[chainId].oracle = _CONFIG.oracle.signerAddress
        _CONFIG.msglib.msglibv1.defaultAppConfig[chainId].outboundConfirmations = 10 //only aptos
        _CONFIG.msglib.msglibv1.defaultAppConfig[chainId].relayer = RELAYER_SIGNER_ADDRESS[chainStage]

        // fill bridge config
        _CONFIG.bridge.remoteBridge[chainId] = {}
        _CONFIG.bridge.remoteBridge[chainId].address = evmBridgeAddresses(CHAIN_KEY[chainId])
        _CONFIG.bridge.remoteBridge[chainId].addressSize = EVM_ADDERSS_SIZE
        _CONFIG.bridge.minDstGas[PacketType.SEND][chainId] = applyArbitrumMultiplier(chainId, 150000)

        //fill relayer fee
        _CONFIG.relayer.fee[chainId] = {}
        _CONFIG.relayer.fee[chainId].baseFee = applyArbitrumMultiplier(chainId, 100)
        _CONFIG.relayer.fee[chainId].feePerByte = 1

        //fill oracle fee
        _CONFIG.oracle.fee[chainId] = {}
        _CONFIG.oracle.fee[chainId].baseFee = applyArbitrumMultiplier(chainId, 100)

        //fill endpoint default adapter param
        _CONFIG.endpoint.defaultAdapterParam[chainId] = {}
        _CONFIG.endpoint.defaultAdapterParam[chainId].uaGas = applyArbitrumMultiplier(chainId, 200000)

        //fill executor
        _CONFIG.executor.fee[chainId] = {}
        _CONFIG.executor.fee[chainId].airdropAmtCap = applyArbitrumMultiplier(chainId, 10000000000)
        _CONFIG.executor.fee[chainId].priceRatio = 10000000000
        _CONFIG.executor.fee[chainId].gasPrice = 1
    }

    // fill coin config
    for (const coinType in _CONFIG.bridge.coins) {
        for (const remoteChainId in _CONFIG.bridge.coins[coinType].remotes) {
            _CONFIG.bridge.coins[coinType].remotes[remoteChainId].address = TOKEN_ADDRESSES[coinType][remoteChainId]
            _CONFIG.bridge.coins[coinType].remotes[remoteChainId].unwrappable = coinType === CoinType.WETH
        }
    }
    return _CONFIG
}

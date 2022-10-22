import { applyArbitrumMultiplier, ConfigType, DEFAULT_BLOCK_CONFIRMATIONS, EVM_ADDERSS_SIZE } from "./common"
import { CHAIN_KEY, ChainId, ChainStage } from "@layerzerolabs/core-sdk"
import {
    BRIDGE_ADDRESS,
    EXECUTOR_ADDRESS,
    ORACLE_ADDRESS,
    ORACLE_SIGNER_ADDRESS,
    RELAYER_SIGNER_ADDRESS,
} from "../../src/constants"
import { DEFAULT_LIMITER_CAP_SD, PacketType } from "../../src/modules/apps/bridge"
import { CoinType } from "../../src/modules/apps/coin"
import { evmBridgeAddresses, TOKEN_ADDRESSES } from "../../../apps/bridge-evm/tasks/config/addresses"
import { ethers } from "ethers"

const chainStage = ChainStage.MAINNET

const _CONFIG = {
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
            "0x01": true, // MAINNET
            "0x02": true, // MAINNET
            "0x03": true, // MAINNET
        },
        threshold: 2,
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
                    [ChainId.ETHEREUM]: {},
                    [ChainId.ARBITRUM]: {},
                    [ChainId.OPTIMISM]: {},
                },
                limiter: {
                    enabled: true,
                    capSD: 769230769,
                    windowSec: 86400,
                },
            },
            [CoinType.USDT]: {
                name: "Tether USD",
                symbol: "USDT",
                decimals: 6,
                remotes: {
                    [ChainId.ETHEREUM]: {},
                    [ChainId.BSC]: {},
                    [ChainId.AVALANCHE]: {},
                    [ChainId.POLYGON]: {},
                },
                limiter: {
                    enabled: true,
                    capSD: DEFAULT_LIMITER_CAP_SD,
                    windowSec: 86400,
                },
            },
            [CoinType.USDC]: {
                name: "USD Coin",
                symbol: "USDC",
                decimals: 6,
                remotes: {
                    [ChainId.ETHEREUM]: {},
                    [ChainId.AVALANCHE]: {},
                    [ChainId.POLYGON]: {},
                    [ChainId.ARBITRUM]: {},
                    [ChainId.OPTIMISM]: {},
                },
                limiter: {
                    enabled: true,
                    capSD: DEFAULT_LIMITER_CAP_SD,
                    windowSec: 86400,
                },
            },
        },
    },
}

const APTOS_DECIMALS = 8
const PRICE_RATIO_DENOMINATOR = 10000000000 // 10^10
const PriceUSD: { [chainId in ChainId]?: number } = {
    [ChainId.ETHEREUM]: 1283,
    [ChainId.ARBITRUM]: 1283,
    [ChainId.OPTIMISM]: 1283,
    [ChainId.BSC]: 270,
    [ChainId.AVALANCHE]: 16,
    [ChainId.POLYGON]: 0.8,
    [ChainId.APTOS]: 2,
}
const GasPrice: { [chainId in ChainId]?: number } = {
    [ChainId.ETHEREUM]: 13977890740 / 10 ** 18,
    [ChainId.ARBITRUM]: 100000000 / 10 ** 18,
    [ChainId.OPTIMISM]: 1000000 / 10 ** 18,
    [ChainId.BSC]: 5000000000 / 10 ** 18,
    [ChainId.AVALANCHE]: 25000000000 / 10 ** 18,
    [ChainId.POLYGON]: 55670819290 / 10 ** 18,
    [ChainId.APTOS]: 100 / 10 ** APTOS_DECIMALS,
}

const AirdropCap: { [chainId in ChainId]?: string } = {
    [ChainId.ETHEREUM]: ethers.utils.parseEther("0.2").toString(),
    [ChainId.ARBITRUM]: ethers.utils.parseEther("0.2").toString(),
    [ChainId.OPTIMISM]: ethers.utils.parseEther("0.2").toString(),
    [ChainId.BSC]: ethers.utils.parseEther("1").toString(),
    [ChainId.AVALANCHE]: ethers.utils.parseEther("10").toString(),
    [ChainId.POLYGON]: ethers.utils.parseEther("200").toString(),
}

const RELAYER_EVM_BASE_GAS = 120000
const ORACLE_EVM_BASE_GAS = 160000
const DEFAULT_EVM_DST_GAS = 250000
const DEFAULT_EVM_AIRDROP_CAP = 10000000000

export function getConfig(chainIds: ChainId[], forked = false): ConfigType {
    for (const chainId of chainIds) {
        // fill default app config for each chain
        _CONFIG.msglib.msglibv1.defaultAppConfig[chainId] = {}
        _CONFIG.msglib.msglibv1.defaultAppConfig[chainId].inboundConfirmations =
            DEFAULT_BLOCK_CONFIRMATIONS[chainStage][chainId]
        _CONFIG.msglib.msglibv1.defaultAppConfig[chainId].oracle = _CONFIG.oracle.signerAddress
        _CONFIG.msglib.msglibv1.defaultAppConfig[chainId].outboundConfirmations = 518400 // only aptos, 3 days
        // _CONFIG.msglib.msglibv1.defaultAppConfig[chainId].outboundConfirmations = 10
        _CONFIG.msglib.msglibv1.defaultAppConfig[chainId].relayer = RELAYER_SIGNER_ADDRESS[chainStage]

        // fill bridge config
        _CONFIG.bridge.remoteBridge[chainId] = {}
        _CONFIG.bridge.remoteBridge[chainId].address = evmBridgeAddresses(CHAIN_KEY[chainId], forked)
        _CONFIG.bridge.remoteBridge[chainId].addressSize = EVM_ADDERSS_SIZE
        _CONFIG.bridge.minDstGas[PacketType.SEND][chainId] = applyArbitrumMultiplier(chainId, 150000)

        const priceRatio = PriceUSD[chainId] / PriceUSD[ChainId.APTOS]
        const gasPriceInAptosUnits = GasPrice[chainId] * priceRatio * 10 ** APTOS_DECIMALS

        //fill relayer fee
        _CONFIG.relayer.fee[chainId] = {}
        const relayerBaseGas = applyArbitrumMultiplier(chainId, RELAYER_EVM_BASE_GAS)
        _CONFIG.relayer.fee[chainId].baseFee = Math.round(relayerBaseGas * gasPriceInAptosUnits)
        _CONFIG.relayer.fee[chainId].feePerByte = 1

        //fill oracle fee
        _CONFIG.oracle.fee[chainId] = {}
        const oracleBaseGas = applyArbitrumMultiplier(chainId, ORACLE_EVM_BASE_GAS)
        _CONFIG.oracle.fee[chainId].baseFee = Math.round(oracleBaseGas * gasPriceInAptosUnits)

        //fill endpoint default adapter param
        _CONFIG.endpoint.defaultAdapterParam[chainId] = {}
        _CONFIG.endpoint.defaultAdapterParam[chainId].uaGas = applyArbitrumMultiplier(chainId, DEFAULT_EVM_DST_GAS)

        //fill executor
        _CONFIG.executor.fee[chainId] = {}
        _CONFIG.executor.fee[chainId].airdropAmtCap = AirdropCap[chainId]
        _CONFIG.executor.fee[chainId].priceRatio = Math.round(priceRatio * PRICE_RATIO_DENOMINATOR)
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

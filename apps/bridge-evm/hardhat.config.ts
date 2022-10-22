import * as dotenv from "dotenv"

import { HardhatUserConfig } from "hardhat/config"
import "@nomiclabs/hardhat-waffle"
import "@nomiclabs/hardhat-ethers"
import "hardhat-spdx-license-identifier"
import "hardhat-gas-reporter"
import "solidity-coverage"
import "hardhat-deploy"
import "hardhat-deploy-ethers"
import "./tasks"
import { ChainId, setupNetwork, setupNetworks } from "@layerzerolabs/lz-sdk"

dotenv.config()

//const LOCAL_IP = "127.0.0.1"
const LOCAL_IP = "192.168.0.42"

const config: HardhatUserConfig = {
    namedAccounts: {
        deployer: {
            default: 0,
        },
    },
    networks: {
        hardhat: {
            blockGasLimit: 30_000_000,
            throwOnCallFailures: false,
        },

        ...setupNetwork({ url: `https://eth-mainnet.g.alchemy.com/v2/_LNG7WUztp0NiK8HSOXmxi3sVuh7ABRT` }, [ChainId.ETHEREUM]),
        ...setupNetwork({ url: `https://polygon-mainnet.g.alchemy.com/v2/xXH_Dx-y7cQ-v-oWjhwrbXl1m5zR1hN-` }, [ChainId.POLYGON]),
        ...setupNetwork({ url: `https://arb-mainnet.g.alchemy.com/v2/JVqdsumULOgSlByrFSC_DnhC7sa6DNNL` }, [ChainId.ARBITRUM]),
        ...setupNetwork({ url: `https://opt-mainnet.g.alchemy.com/v2/SEEFpm0O3DfDF6bh85izC24-1S2qMJqA` }, [ChainId.OPTIMISM]),
        ...setupNetwork({ url: `https://bsc-dataseed4.defibit.io` }, [ChainId.BSC]),
        ...setupNetwork({ url: `https://api.avax.network/ext/bc/C/rpc` }, [ChainId.AVALANCHE]),

        ...setupNetworks([[ChainId.FUJI, {}]]),
        ...setupNetwork(
            {
                url: "https://goerli.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161",
            },
            [ChainId.GOERLI, ChainId.GOERLI_SANDBOX]
        ),
        "ethereum-fork": {
            url: `http://${LOCAL_IP}:8501/`,
            accounts: {
                mnemonic: process.env.MNEMONIC ?? "test test test test test test test test test test test junk",
            },
        },
        "goerli-fork": {
            url: `http://${LOCAL_IP}:8501/`,
            accounts: {
                mnemonic: process.env.MNEMONIC ?? "test test test test test test test test test test test junk",
            },
        },
        "goerli-sandbox-fork": {
            url: `http://${LOCAL_IP}:8501/`,
            accounts: {
                mnemonic: process.env.MNEMONIC ?? "test test test test test test test test test test test junk",
            },
        },
    },
    gasReporter: {
        enabled: process.env.REPORT_GAS !== undefined,
        currency: "USD",
    },
    solidity: {
        compilers: [
            {
                version: "0.8.15",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 1000,
                    },
                },
            },
        ],
    },
    // specify separate cache for hardhat, since it could possibly conflict with foundry's
    paths: { cache: "hh-cache" },
    spdxLicenseIdentifier: {
        overwrite: true,
        runOnCompile: true,
    },
}
export default config

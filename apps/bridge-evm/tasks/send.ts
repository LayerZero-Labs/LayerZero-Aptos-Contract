import * as crossChainHelper from "./utils/crossChainHelper"
import { ethers } from "ethers"
import { TOKEN_ADDRESSES } from "./config/addresses"
import { CHAIN_ID } from "@layerzerolabs/core-sdk"
import { CoinType } from "../../../sdk/src/modules/apps/coin"

const abiDecoder = require("abi-decoder")

const ABIs = [
    "../deployments/goerli-sandbox/TokenBridge.json",
    "../artifacts/@layerzerolabs/solidity-examples/contracts/lzApp/NonblockingLzApp.sol/NonblockingLzApp.json",
    "@layerzerolabs/layerzero-core/artifacts/contracts/UltraLightNodeV2.sol/UltraLightNodeV2.json",
    "@layerzerolabs/layerzero-core/artifacts/contracts/RelayerV2.sol/RelayerV2.json",
    "@layerzerolabs/layerzero-core/artifacts/contracts/Endpoint.sol/Endpoint.json",
    "@layerzerolabs/d2-contracts/artifacts/contracts/OracleV2.sol/OracleV2.json",
]

try {
    for (const abi of ABIs) {
        abiDecoder.addABI(require(abi).abi)
    }
} catch (e) {}

// npx hardhat --network ethereum-fork send
module.exports = async function (taskArgs, hre) {
    // await inspect(hre.network.name)
    // return

    const network = hre.network.name
    const lookupChainId = CHAIN_ID[network.replace("-fork", "")]

    crossChainHelper.setForking(network.includes("fork"), ["TokenBridge"])
    console.log(`Forking: ${crossChainHelper.FORKING}`)

    const signers = await hre.ethers.getSigners()
    const signer = signers[0]

    const amount = ethers.BigNumber.from(taskArgs.a)
    console.log(`amount: ${amount}`)

    const bridge = await crossChainHelper.getContract(hre, network, "TokenBridge")
    // const aptosChainId = await bridge.aptosChainId()
    // console.log(`aptosChainId: ${aptosChainId}`)

    const receiverAddr = taskArgs.r
    const lzCallParams = [signer.address, ethers.constants.AddressZero]
    const adapterParams = ethers.utils.solidityPack(["uint16", "uint256", "uint256", "bytes"], [2, 5000, 1000000, receiverAddr])
    const { nativeFee, zroFee } = await bridge.quoteForSend(lzCallParams, adapterParams)

    const args = [receiverAddr, amount.toString(), lzCallParams, adapterParams]

    let receipt
    const tokenType = taskArgs.t
    switch (tokenType) {
        case "ETH": {
            receipt = await crossChainHelper.executeTransaction(
                hre,
                network,
                {
                    contractName: "TokenBridge",
                    methodName: "sendETHToAptos",
                    args,
                    txArgs: { value: amount.add(nativeFee) },
                },
                true
            )
            break
        }
        case CoinType.USDT:
        case CoinType.WETH:
        case CoinType.USDC: {
            const tokenAddress = TOKEN_ADDRESSES[tokenType][lookupChainId]
            const provider = crossChainHelper.getProvider(network)
            const token = new ethers.Contract(
                tokenAddress,
                new ethers.utils.Interface(["function approve(address,uint) public returns (bool)"])
            ).connect(provider)
            await (await token.approve(bridge.address, amount)).wait()

            receipt = await crossChainHelper.executeTransaction(
                hre,
                network,
                {
                    contractName: "TokenBridge",
                    methodName: "sendToAptos",
                    args: [tokenAddress, receiverAddr, amount, lzCallParams, adapterParams],
                    txArgs: { value: amount.add(nativeFee) },
                },
                false
            )
            break
        }
    }

    let decodedLogs = abiDecoder.decodeLogs(receipt.logs)
    const logs = decodedLogs.map((log) => {
        return {
            name: log.name,
            args: log.events.map((event) => {
                return `${event.name}(${event.value})`
            }),
            address: log.address,
        }
    })
    console.log(logs)
}

async function inspect(network: string) {
    const provider = crossChainHelper.getProvider(network)
    const receipt = await provider.getTransactionReceipt("0x9cc64ee01e28a81f5a02bf7e4713aec058b796aac55a8c900d0c60c6933d1c9a")
    console.log(receipt.blockNumber)
    const decodedLogs = abiDecoder.decodeLogs(receipt.logs)
    const logs = decodedLogs.map((log) => {
        return {
            name: log.name,
            args: log.events.map((event) => {
                return `${event.name}(${event.value})`
            }),
            address: log.address,
        }
    })
    console.log(logs)
    return
}

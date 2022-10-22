import * as ethers from "ethers"
import { getDeploymentAddresses, getRpc } from "./readStatic"
import { CHAIN_ID } from "@layerzerolabs/core-sdk"
import { cli } from "cli-ux"
import { ContractReceipt } from "ethers"
import { createProvider } from "hardhat/internal/core/providers/construction"
import { DeploymentsManager } from "hardhat-deploy/dist/src/DeploymentsManager"

export let FORKING = false
export let CONTRACT_ON_FORK: string[] = []
export const setForking = (fork: boolean, contractsOnFork: string[]) => {
    FORKING = fork
    CONTRACT_ON_FORK = contractsOnFork
}

//todo: after deprecating ulnv1, update sdk to new chainId and get id directly from CHAIN_ID
export function getEndpointId(networkName: string): number {
    const key = networkName.replace("-fork", "")
    if (key.includes("aptos")) {
        return CHAIN_ID[key]
    }
    return CHAIN_ID[key] + 100
}

export interface ExecutableTransaction {
    contractName: string
    methodName: string
    args: any[]
    txArgs?: any
}

export interface Transaction {
    needChange: boolean
    contractName: string
    calldata: string
    methodName: string
    args: any[]
    chainId: string
    remoteChainId?: string
    diff?: { [key: string]: { newValue: any; oldValue: any } }
}

const getDeploymentManager = (hre, networkName): any => {
    const network: any = {
        name: networkName,
        config: hre.config.networks[networkName],
        provider: createProvider(networkName, hre.config.networks[networkName], hre.config.paths, hre.artifacts),
        saveDeployments: true,
    }
    const newHre = Object.assign(Object.create(Object.getPrototypeOf(hre)), hre)
    newHre.network = network
    const deploymentsManager = new DeploymentsManager(newHre, network)
    newHre.deployments = deploymentsManager.deploymentsExtension
    newHre.getNamedAccounts = deploymentsManager.getNamedAccounts.bind(deploymentsManager)
    newHre.getUnnamedAccounts = deploymentsManager.getUnnamedAccounts.bind(deploymentsManager)
    newHre.getChainId = () => {
        return deploymentsManager.getChainId()
    }
    return deploymentsManager
}

export const deployContract = async (hre: any, network: string, tags: string[]) => {
    const deploymentsManager = getDeploymentManager(hre, network)
    // console.log("hre.network.name")
    // console.log(deploymentsManager.network.name)
    await deploymentsManager.runDeploy(tags, {
        log: false, //args.log,
        resetMemory: false,
        writeDeploymentsToFiles: true,
        savePendingTx: false,
    })
}

const providerByNetwork: { [name: string]: ethers.providers.JsonRpcProvider } = {}
export const getProvider = (network: string) => {
    if (!providerByNetwork[network]) {
        let networkUrl = FORKING && !network.includes("-fork") ? getRpc(`${network}-fork`) : getRpc(network)
        providerByNetwork[network] = new ethers.providers.JsonRpcProvider(networkUrl)
    }
    return providerByNetwork[network]
}

export const getWallet = (index) => {
    return ethers.Wallet.fromMnemonic(process.env.MNEMONIC || "", `m/44'/60'/0'/0/${index}`)
}

const connectedWallets = {}
export const getConnectedWallet = (network, walletIndex) => {
    const key = `${network}-${walletIndex}`
    if (!connectedWallets[key]) {
        const provider = getProvider(network)
        const wallet = getWallet(walletIndex)
        connectedWallets[key] = wallet.connect(provider)
    }
    return connectedWallets[key]
}

const deploymentAddresses: { [key: string]: string } = {}
export const getDeploymentAddress = (network: string, contractName: string) => {
    if (CONTRACT_ON_FORK.includes(contractName) && !network.includes("-fork")) {
        network = `${network}-fork`
    } else if (!CONTRACT_ON_FORK.includes(contractName) && network.includes("-fork")) {
        network = network.replace("-fork", "")
    }

    const key = `${network}-${contractName}`
    if (!deploymentAddresses[key]) {
        deploymentAddresses[key] = getDeploymentAddresses(network)[contractName]
    }
    if (!deploymentAddresses[key]) {
        throw Error(`contract ${key} not found for network: ${network}`)
    }
    return deploymentAddresses[key]
}

const contracts: { [key: string]: any } = {}
export const getContract = async (hre: any, network: string, contractName: string) => {
    if (network == "hardhat") {
        return await hre.ethers.getContract(contractName)
    }

    const key = `${network}-${contractName}`
    if (!contracts[key]) {
        const contractAddress = getDeploymentAddress(network, contractName)
        // console.log(`contractAddress[${contractAddress}] for ${network} - ${contractName}`)
        const provider = getProvider(network)
        const contractFactory = await getContractFactory(hre, contractName)
        const contract = contractFactory.attach(contractAddress)
        contracts[key] = contract.connect(provider)
    }
    return contracts[key]
}

export const getWalletContract = async (hre, network, contractName, walletIndex) => {
    const contract = await getContract(hre, network, contractName)
    const wallet = getConnectedWallet(network, walletIndex)
    return contract.connect(wallet)
}

const contractFactories: { [name: string]: ethers.ContractFactory } = {}
const getContractFactory = async (hre: any, contractName: string) => {
    if (!contractFactories[contractName]) {
        const artifacts = await hre.artifacts.readArtifactSync(contractName)
        contractFactories[contractName] = new ethers.ContractFactory(artifacts.abi, artifacts.bytecode)
    }
    return contractFactories[contractName]
}

export async function promptToProceed(msg: string, noPrompt: boolean = false) {
    if (!noPrompt) {
        const proceed = await cli.prompt(`${msg} y/N`)
        if (!["y", "yes"].includes(proceed.toLowerCase())) {
            console.log("Aborting...")
            process.exit(0)
        }
    }
}

export const executeTransaction = async (
    hre: any,
    network: string,
    transaction: ExecutableTransaction,
    impersonate = true
): Promise<ContractReceipt> => {
    if (FORKING && impersonate) {
        const contract = await getContract(hre, network, transaction.contractName)
        console.log(`${transaction.contractName}[${contract.address}].${transaction.methodName}(${transaction.args.join(",")}) - ${network}`)
        const provider = contract.provider

        const owner = await contract.owner()
        await provider.send("hardhat_impersonateAccount", [owner])
        await provider.send("hardhat_setBalance", [owner, "0x1000000000000000000000000000000000000000000000000000000000000000"])
        const signer = provider.getSigner(owner)

        let receipt: ContractReceipt
        if (transaction.txArgs) {
            receipt = await (await contract.connect(signer)[transaction.methodName](...transaction.args, transaction.txArgs)).wait()
        } else {
            receipt = await (await contract.connect(signer)[transaction.methodName](...transaction.args)).wait()
        }

        await provider.send("hardhat_stopImpersonatingAccount", [owner])

        return receipt
    } else {
        const walletContract = await getWalletContract(hre, network, transaction.contractName, 0)

        const gasPrice = await getProvider(network).getGasPrice()
        const finalGasPrice = gasPrice.mul(10).div(8)
        // const finalGasPrice = gasPrice.mul(2)
        // const receipt: TransactionReceipt = await (await walletContract[transaction.methodName](...transaction.args, {gasPrice: finalGasPrice})).wait()
        // const receipt: TransactionReceipt = await (await walletContract[transaction.methodName](...transaction.args, { gasLimit: 8000000 })).wait()
        return await (
            await walletContract[transaction.methodName](...transaction.args, {
                gasPrice: finalGasPrice,
                gasLimit: 8000000,
                ...transaction.txArgs,
            })
        ).wait()
    }
}

import * as aptos from "aptos"
import invariant from "tiny-invariant"
import { Layerzero } from "./modules"
import { applyGasLimitSafety, MultipleSignFunc, multiSigSignedBCSTxn } from "./utils"
import { LAYERZERO_ADDRESS } from "./constants"
import { ChainStage } from "@layerzerolabs/core-sdk"

export * as utils from "./utils"
export * as modules from "./modules"
export * as types from "./types"
export * as constants from "./constants"

export type AccountsOption = {
    layerzero?: aptos.MaybeHexString
    msglib_auth?: aptos.MaybeHexString
    msglib_v1_1?: aptos.MaybeHexString
    msglib_v2?: aptos.MaybeHexString
    zro?: aptos.MaybeHexString
    executor_auth?: aptos.MaybeHexString
    executor_v2?: aptos.MaybeHexString
} & Record<string, aptos.MaybeHexString>

export type SdkOptions = {
    provider: aptos.AptosClient
    stage?: ChainStage
    accounts?: AccountsOption
}

export class SDK {
    stage: ChainStage
    client: aptos.AptosClient
    LayerzeroModule: Layerzero
    accounts: AccountsOption

    constructor(options: SdkOptions) {
        this.stage = options.stage ?? ChainStage.TESTNET_SANDBOX
        this.accounts = options.accounts ?? {
            layerzero: LAYERZERO_ADDRESS[this.stage]!,
            msglib_auth: LAYERZERO_ADDRESS[this.stage]!,
            msglib_v1_1: LAYERZERO_ADDRESS[this.stage]!,
            msglib_v2: LAYERZERO_ADDRESS[this.stage]!,
            zro: LAYERZERO_ADDRESS[this.stage]!,
            executor_auth: LAYERZERO_ADDRESS[this.stage]!,
            executor_v2: LAYERZERO_ADDRESS[this.stage]!,
        }
        this.client = options.provider
        this.LayerzeroModule = new Layerzero(this)
    }

    async sendAndConfirmBcsTransaction(bcsTransction: aptos.BCS.Bytes): Promise<aptos.Types.Transaction> {
        const res = await this.client.submitSignedBCSTransaction(bcsTransction)
        return this.waitAndGetTransaction(res.hash)
    }

    async sendAndConfirmTransaction(signer: aptos.AptosAccount, payload: aptos.Types.EntryFunctionPayload) {
        const options = await this.estimateGas(signer, payload)
        const txnRequest = await this.client.generateTransaction(signer.address(), payload, options)
        const signedTxn = await this.client.signTransaction(signer, txnRequest)
        return this.sendAndConfirmRawTransaction(signedTxn)
    }

    async estimateGas(
        signer: aptos.AptosAccount,
        payload: aptos.Types.EntryFunctionPayload,
    ): Promise<{
        max_gas_amount: string
        gas_unit_price: string
    }> {
        const txnRequest = await this.client.generateTransaction(signer.address(), payload)
        const sim = await this.client.simulateTransaction(signer, txnRequest, {
            estimateGasUnitPrice: true,
            estimateMaxGasAmount: true,
        })
        const tx = sim[0]
        invariant(tx.success, `Transaction failed: ${tx.vm_status}}`)
        const max_gas_amount = applyGasLimitSafety(tx.gas_used).toString()
        return {
            max_gas_amount,
            gas_unit_price: tx.gas_unit_price,
        }
    }

    async sendAndConfirmMultiSigTransaction(
        client: aptos.AptosClient,
        multisigAccountAddress: string,
        multisigAccountPubkey: aptos.TxnBuilderTypes.MultiEd25519PublicKey,
        payload: aptos.TxnBuilderTypes.TransactionPayload,
        signFunc: MultipleSignFunc,
    ) {
        const [{ sequence_number: sequenceNumber }, chainId] = await Promise.all([
            client.getAccount(multisigAccountAddress),
            client.getChainId(),
        ])

        const rawTxn = new aptos.TxnBuilderTypes.RawTransaction(
            aptos.TxnBuilderTypes.AccountAddress.fromHex(multisigAccountAddress),
            BigInt(sequenceNumber),
            payload,
            BigInt(10000),
            BigInt(100),
            BigInt(Math.floor(Date.now() / 1000) + 10),
            new aptos.TxnBuilderTypes.ChainId(chainId),
        )

        const signingMessage = aptos.TransactionBuilderMultiEd25519.getSigningMessage(rawTxn)

        const items = await signFunc(signingMessage)
        const signatures = items.map((item) => item.signature)
        const bitmap = items.map((item) => item.bitmap)

        const signedBCSTxn = multiSigSignedBCSTxn(multisigAccountPubkey, rawTxn, signatures, bitmap)
        const pendingTransaction = await client.submitSignedBCSTransaction(signedBCSTxn)
        const txnHash = pendingTransaction.hash
        await client.waitForTransaction(pendingTransaction.hash)

        const txn = (await client.getTransactionByHash(txnHash)) as aptos.Types.Transaction_UserTransaction
        invariant(txn.type == "user_transaction", `Invalid response type: ${txn.type}`)
        invariant(txn.success, `Transaction failed: ${txn.vm_status}`)
        return txn
    }

    async deploy(signer: aptos.AptosAccount, metadata: Uint8Array, modules: aptos.TxnBuilderTypes.Module[]) {
        const gasUnitPrice = BigInt((await this.client.estimateGasPrice()).gas_estimate)
        const txnHash = await this.client.publishPackage(signer, metadata, modules, {
            maxGasAmount: BigInt(20000 * modules.length),
            gasUnitPrice,
        })
        const txn = (await this.client.waitForTransactionWithResult(txnHash)) as aptos.Types.UserTransaction
        if (!txn.success) {
            throw new Error(txn.vm_status)
        }
        return txnHash
    }

    private async waitAndGetTransaction(txnHash: string): Promise<aptos.Types.Transaction> {
        await this.client.waitForTransaction(txnHash)

        const tx: aptos.Types.Transaction = await this.client.getTransactionByHash(txnHash)
        invariant(tx.type == "user_transaction", `Invalid response type: ${tx.type}`)
        const txn = tx as aptos.Types.Transaction_UserTransaction
        invariant(txn.success, `Transaction failed: ${txn.vm_status}`)
        return tx
    }

    private async sendAndConfirmRawTransaction(signedTransaction: Uint8Array): Promise<aptos.Types.Transaction> {
        const res = await this.client.submitTransaction(signedTransaction)
        return this.waitAndGetTransaction(res.hash)
    }
}

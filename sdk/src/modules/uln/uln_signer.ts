import { SDK } from "../../index"
import * as aptos from "aptos"
import { isErrorOfApiError, MultipleSignFunc } from "../../utils"
import { UlnSignerFee } from "../../types"

export class UlnSigner {
    public readonly module
    public readonly moduleName

    constructor(private sdk: SDK) {
        this.module = `${sdk.accounts.layerzero}::uln_signer`
        this.moduleName = "layerzero::uln_signer"
    }

    async register_TransactionPayload(): Promise<aptos.TxnBuilderTypes.TransactionPayload> {
        return new aptos.TxnBuilderTypes.TransactionPayloadEntryFunction(
            aptos.TxnBuilderTypes.EntryFunction.natural(`${this.module}`, "register", [], []),
        )
    }

    async registerMS(
        multisigAccountAddress: string,
        multisigAccountPubkey: aptos.TxnBuilderTypes.MultiEd25519PublicKey,
        signFunc: MultipleSignFunc,
    ): Promise<aptos.Types.Transaction> {
        const payload = await this.register_TransactionPayload()
        return await this.sdk.sendAndConfirmMultiSigTransaction(
            this.sdk.client,
            multisigAccountAddress,
            multisigAccountPubkey,
            payload,
            signFunc,
        )
    }

    async isRegistered(address: aptos.MaybeHexString): Promise<boolean> {
        try {
            await this.sdk.client.getAccountResource(address, `${this.module}::Config`)
            return true
        } catch (e) {
            if (isErrorOfApiError(e, 404)) {
                return false
            }
            throw e
        }
    }

    registerPayload(): aptos.Types.EntryFunctionPayload {
        return {
            function: `${this.module}::register`,
            type_arguments: [],
            arguments: [],
        }
    }

    async register(signer: aptos.AptosAccount): Promise<aptos.Types.Transaction> {
        const transaction = this.registerPayload()
        return this.sdk.sendAndConfirmTransaction(signer, transaction)
    }

    async getSetFee_TransactionPayload(
        dstChainId: aptos.BCS.Uint16,
        baseFee: aptos.BCS.Uint64 | aptos.BCS.Uint32,
        feePerByte: aptos.BCS.Uint64 | aptos.BCS.Uint32,
    ): Promise<aptos.TxnBuilderTypes.TransactionPayload> {
        return new aptos.TxnBuilderTypes.TransactionPayloadEntryFunction(
            aptos.TxnBuilderTypes.EntryFunction.natural(
                `${this.module}`,
                "set_fee",
                [],
                [
                    aptos.BCS.bcsSerializeUint64(dstChainId),
                    aptos.BCS.bcsSerializeUint64(baseFee),
                    aptos.BCS.bcsSerializeUint64(feePerByte),
                ],
            ),
        )
    }

    setFeePayload(
        dstChainId: aptos.BCS.Uint16,
        baseFee: aptos.BCS.Uint64 | aptos.BCS.Uint32,
        feePerByte: aptos.BCS.Uint64 | aptos.BCS.Uint32,
    ): aptos.Types.EntryFunctionPayload {
        return {
            function: `${this.module}::set_fee`,
            type_arguments: [],
            arguments: [dstChainId, baseFee, feePerByte],
        }
    }

    async setFee(
        signer: aptos.AptosAccount,
        dstChainId: aptos.BCS.Uint16,
        baseFee: aptos.BCS.Uint64 | aptos.BCS.Uint32,
        feePerByte: aptos.BCS.Uint64 | aptos.BCS.Uint32,
    ): Promise<aptos.Types.Transaction> {
        const transaction = this.setFeePayload(dstChainId, baseFee, feePerByte)
        return this.sdk.sendAndConfirmTransaction(signer, transaction)
    }

    async setFeeMS(
        multisigAccountAddress: string,
        multisigAccountPubkey: aptos.TxnBuilderTypes.MultiEd25519PublicKey,
        signFunc: MultipleSignFunc,
        dstChainId: aptos.BCS.Uint16,
        baseFee: aptos.BCS.Uint64 | aptos.BCS.Uint32,
        feePerByte: aptos.BCS.Uint64 | aptos.BCS.Uint32,
    ): Promise<aptos.Types.Transaction> {
        const payload = await this.getSetFee_TransactionPayload(dstChainId, baseFee, feePerByte)
        return await this.sdk.sendAndConfirmMultiSigTransaction(
            this.sdk.client,
            multisigAccountAddress,
            multisigAccountPubkey,
            payload,
            signFunc,
        )
    }

    async getFee(address: aptos.MaybeHexString, dstChainId: aptos.BCS.Uint16): Promise<UlnSignerFee> {
        try {
            const resource = await this.sdk.client.getAccountResource(address, `${this.module}::Config`)
            const { fees } = resource.data as { fees: { handle: string } }
            const response = await this.sdk.client.getTableItem(fees.handle, {
                key_type: `u64`,
                value_type: `${this.module}::Fee`,
                key: dstChainId.toString(),
            })
            return {
                base_fee: BigInt(response.base_fee),
                fee_per_byte: BigInt(response.fee_per_byte),
            }
        } catch (e) {
            if (isErrorOfApiError(e, 404)) {
                return {
                    base_fee: BigInt(0),
                    fee_per_byte: BigInt(0),
                }
            }
            throw e
        }
    }
}

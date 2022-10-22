import { SDK } from "../../index"
import * as aptos from "aptos"
import { fullAddress, isErrorOfApiError } from "../../utils"

export class Oracle {
    readonly address: aptos.MaybeHexString
    public readonly module
    public readonly moduleName

    constructor(public sdk: SDK, address: aptos.MaybeHexString) {
        this.address = address
        this.module = `${this.address}::oracle`
        this.moduleName = "oracle::oracle"
    }

    async getThreshold(): Promise<aptos.BCS.Uint8> {
        const resource: { data: any } = await this.sdk.client.getAccountResource(this.address, `${this.module}::Config`)
        const { threshold } = resource.data as { threshold: number }
        return Number(threshold)
    }

    setThresholdPayload(threshold: aptos.BCS.Uint8): aptos.Types.EntryFunctionPayload {
        return {
            function: `${this.module}::set_threshold`,
            type_arguments: [],
            arguments: [threshold],
        }
    }

    async setThreshold(signer: aptos.AptosAccount, threshold: aptos.BCS.Uint8): Promise<aptos.Types.Transaction> {
        const transaction = this.setThresholdPayload(threshold)
        return this.sdk.sendAndConfirmTransaction(signer, transaction)
    }

    async isValidator(validator: aptos.MaybeHexString): Promise<boolean> {
        const resource: { data: any } = await this.sdk.client.getAccountResource(this.address, `${this.module}::Config`)
        const validators = resource.data.validators
        const val = aptos.HexString.ensure(validator).toShortString()
        return validators.includes(val)
    }

    setValidatorPayload(validator: aptos.MaybeHexString, active: boolean): aptos.Types.EntryFunctionPayload {
        return {
            function: `${this.module}::set_validator`,
            type_arguments: [],
            arguments: [validator, active],
        }
    }

    async setValidator(
        signer: aptos.AptosAccount,
        validator: aptos.MaybeHexString,
        active: boolean,
    ): Promise<aptos.Types.Transaction> {
        const transaction = this.setValidatorPayload(validator, active)
        return this.sdk.sendAndConfirmTransaction(signer, transaction)
    }

    setFeePayload(
        dstChainId: aptos.BCS.Uint16,
        baseFee: aptos.BCS.Uint64 | aptos.BCS.Uint32,
    ): aptos.Types.EntryFunctionPayload {
        return {
            function: `${this.module}::set_fee`,
            type_arguments: [],
            arguments: [dstChainId, baseFee],
        }
    }

    async setFee(
        signer: aptos.AptosAccount,
        dstChainId: aptos.BCS.Uint16,
        baseFee: aptos.BCS.Uint64 | aptos.BCS.Uint32,
    ): Promise<aptos.Types.Transaction> {
        const transaction = this.setFeePayload(dstChainId, baseFee)
        return this.sdk.sendAndConfirmTransaction(signer, transaction)
    }

    getProposePayload(
        hash: Uint8Array,
        confirmations: aptos.BCS.Uint64 | aptos.BCS.Uint32,
    ): aptos.Types.EntryFunctionPayload {
        return {
            function: `${this.module}::propose`,
            type_arguments: [],
            arguments: [Array.from(hash), confirmations],
        }
    }

    async propose(
        signer: aptos.AptosAccount,
        hash: Uint8Array,
        confirmations: aptos.BCS.Uint64 | aptos.BCS.Uint32,
    ): Promise<aptos.Types.Transaction> {
        const transaction = this.getProposePayload(hash, confirmations)
        return this.sdk.sendAndConfirmTransaction(signer, transaction)
    }

    async isSubmitted(
        validator: aptos.MaybeHexString,
        hash: string,
        confirmations: aptos.BCS.Uint64 | aptos.BCS.Uint32,
    ): Promise<boolean> {
        const resource: { data: any } = await this.sdk.client.getAccountResource(
            this.address,
            `${this.module}::ProposalStore`,
        )
        const { proposals } = resource.data as { proposals: { handle: string } }

        try {
            const proposal = await this.sdk.client.getTableItem(proposals.handle, {
                key_type: `${this.module}::ProposalKey`,
                value_type: `${this.module}::Proposal`,
                key: {
                    hash,
                    confirmations: confirmations.toString(),
                },
            })

            if (proposal.submitted) {
                return true
            }

            const val = aptos.HexString.ensure(validator).toShortString()
            return proposal.approved_by.includes(val)
        } catch (e) {
            if (isErrorOfApiError(e, 404)) {
                return false
            } else {
                throw e
            }
        }
    }

    async getResourceAddress(): Promise<string> {
        const resource = await this.sdk.client.getAccountResource(this.address, `${this.module}::Config`)
        const { resource_addr } = resource.data as { resource_addr: string }
        return fullAddress(resource_addr).toString()
    }

    async withdrawFee(
        signer: aptos.AptosAccount,
        receiver: aptos.MaybeHexString,
        amount: aptos.BCS.Uint64,
    ): Promise<aptos.Types.Transaction> {
        const transaction = {
            function: `${this.module}::withdraw_fee`,
            type_arguments: [],
            arguments: [receiver, amount],
        }
        return this.sdk.sendAndConfirmTransaction(signer, transaction)
    }
}

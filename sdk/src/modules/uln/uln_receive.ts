import { SDK } from "../../index"
import * as aptos from "aptos"
import { HexString } from "aptos"
import { MultipleSignFunc } from "../../utils"

export class UlnReceive {
    public readonly module

    constructor(private sdk: SDK) {
        this.module = `${sdk.accounts.layerzero}::uln_receive`
    }

    async initialize(signer: aptos.AptosAccount): Promise<aptos.Types.Transaction> {
        const transaction: aptos.Types.EntryFunctionPayload = {
            function: `${this.module}::init`,
            type_arguments: [],
            arguments: [],
        }

        return this.sdk.sendAndConfirmTransaction(signer, transaction)
    }

    async getOracleProposePayload(
        hash: Uint8Array,
        confirmations: aptos.BCS.Uint64 | aptos.BCS.Uint32,
    ): Promise<aptos.Types.EntryFunctionPayload> {
        const transaction: aptos.Types.EntryFunctionPayload = {
            function: `${this.module}::oracle_propose`,
            type_arguments: [],
            arguments: [Array.from(hash), confirmations],
        }
        return transaction
    }

    async oraclePropose(
        signer: aptos.AptosAccount,
        hash: string,
        confirmations: aptos.BCS.Uint64 | aptos.BCS.Uint32,
    ): Promise<aptos.Types.Transaction> {
        const transaction = await this.getOracleProposePayload(HexString.ensure(hash).toUint8Array(), confirmations)
        return this.sdk.sendAndConfirmTransaction(signer, transaction)
    }

    async getProposal(oracle: aptos.MaybeHexString, hash: string): Promise<aptos.BCS.Uint64> {
        const resource = await this.sdk.client.getAccountResource(
            this.sdk.accounts.layerzero!,
            `${this.module}::ProposalStore`,
        )
        const { proposals } = resource.data as { proposals: { handle: string } }
        const response = await this.sdk.client.getTableItem(proposals.handle, {
            key_type: `${this.module}::ProposalKey`,
            value_type: "u64",
            key: {
                oracle,
                hash,
            },
        })
        return BigInt(response)
    }

    async getRelayerVerifyPayload(
        dstAddress: Uint8Array,
        packetBytes: Uint8Array,
        confirmations: aptos.BCS.Uint64 | aptos.BCS.Uint32,
    ): Promise<aptos.Types.EntryFunctionPayload> {
        const uaTypeInfo = await this.sdk.LayerzeroModule.Endpoint.getUATypeInfo(
            Buffer.from(dstAddress).toString("hex"),
        )

        const transaction: aptos.Types.EntryFunctionPayload = {
            function: `${this.module}::relayer_verify`,
            type_arguments: [uaTypeInfo.type],
            arguments: [Array.from(packetBytes), confirmations],
        }
        return transaction
    }

    async relayerVerify(
        signer: aptos.AptosAccount,
        dstAddress: Uint8Array,
        packetBytes: Uint8Array,
        confirmations: aptos.BCS.Uint64 | aptos.BCS.Uint32,
    ): Promise<aptos.Types.Transaction> {
        const transaction = await this.getRelayerVerifyPayload(dstAddress, packetBytes, confirmations)

        return this.sdk.sendAndConfirmTransaction(signer, transaction)
    }

    async oracleProposePayloadMS(
        multisigAccountAddress: string,
        hash: Buffer,
        confirmations: aptos.BCS.Uint64 | aptos.BCS.Uint32,
    ): Promise<aptos.TxnBuilderTypes.TransactionPayload> {
        const serializer = new aptos.BCS.Serializer()
        serializer.serializeBytes(Uint8Array.from(hash))
        const payloadEntryFunction = new aptos.TxnBuilderTypes.TransactionPayloadEntryFunction(
            aptos.TxnBuilderTypes.EntryFunction.natural(
                `${this.module}`,
                "oracle_propose",
                [],
                [serializer.getBytes(), aptos.BCS.bcsSerializeUint64(confirmations)],
            ),
        )
        return payloadEntryFunction
    }

    async oracleProposeTxn(
        multisigAccountAddress: string,
        hash: Buffer,
        confirmations: aptos.BCS.Uint64 | aptos.BCS.Uint32,
    ): Promise<aptos.TxnBuilderTypes.RawTransaction> {
        const payloadEntryFunction = await this.oracleProposePayloadMS(multisigAccountAddress, hash, confirmations)

        const [{ sequence_number: sequenceNumber }, chainId] = await Promise.all([
            this.sdk.client.getAccount(multisigAccountAddress),
            this.sdk.client.getChainId(),
        ])

        return new aptos.TxnBuilderTypes.RawTransaction(
            aptos.TxnBuilderTypes.AccountAddress.fromHex(multisigAccountAddress),
            BigInt(sequenceNumber),
            payloadEntryFunction,
            BigInt(1000),
            BigInt(1),
            BigInt(Math.floor(Date.now() / 1000) + 10),
            new aptos.TxnBuilderTypes.ChainId(chainId),
        )
    }

    getSubmitHashSigningMessage(txn: aptos.TxnBuilderTypes.RawTransaction): aptos.TxnBuilderTypes.SigningMessage {
        return aptos.TransactionBuilderMultiEd25519.getSigningMessage(txn)
    }

    async oracleProposeMS(
        multisigAccountAddress: string,
        multisigAccountPubkey: aptos.TxnBuilderTypes.MultiEd25519PublicKey,
        signFunc: MultipleSignFunc,
        hash: Buffer,
        confirmations: aptos.BCS.Uint64 | aptos.BCS.Uint32,
    ): Promise<aptos.Types.Transaction> {
        const payload = await this.oracleProposePayloadMS(multisigAccountAddress, hash, confirmations)
        return await this.sdk.sendAndConfirmMultiSigTransaction(
            this.sdk.client,
            multisigAccountAddress,
            multisigAccountPubkey,
            payload,
            signFunc,
        )
    }
}

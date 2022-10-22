import * as aptos from "aptos"
import { AptosAccount, CoinClient, HexString, OptionalTransactionArgs, TxnBuilderTypes } from "aptos"
import { FAUCET_URL, NODE_URL } from "../src/constants"
import { Environment } from "../src/types"
import { generateMultisig, makeSignFuncWithMultipleSigners, MultipleSignFunc, multiSigSignedBCSTxn } from "../src/utils"
import invariant from "tiny-invariant"

const env = Environment.LOCAL

describe("auth key rotation", () => {
    const client = new aptos.AptosClient(NODE_URL[env])
    const faucetClient = new aptos.FaucetClient(NODE_URL[env], FAUCET_URL[env])
    const coinClient = new CoinClient(client)

    test("single signer to single signer", async () => {
        let alice = new aptos.AptosAccount()
        await faucetClient.fundAccount(alice.address(), 5000000000000000000)

        // rotate auth key to bob
        const bob = new aptos.AptosAccount()
        const pendingTxn = await client.rotateAuthKeyEd25519(alice, bob.signingKey.secretKey)

        await client.waitForTransaction(pendingTxn.hash)

        const origAddressHex = await client.lookupOriginalAddress(bob.address())

        // Sometimes the returned addresses do not have leading 0s. To be safe, converting hex addresses to AccountAddress
        const origAddress = TxnBuilderTypes.AccountAddress.fromHex(origAddressHex)
        const aliceAddress = TxnBuilderTypes.AccountAddress.fromHex(alice.address())
        expect(HexString.fromUint8Array(aptos.BCS.bcsToBytes(origAddress)).hex()).toBe(
            HexString.fromUint8Array(aptos.BCS.bcsToBytes(aliceAddress)).hex(),
        )

        // new alice account with bob's auth key
        alice = new aptos.AptosAccount(bob.signingKey.secretKey, alice.address())

        // send coins to carol by using bob's auth key
        const carl = new aptos.AptosAccount()
        await faucetClient.fundAccount(carl.address(), 0)

        await client.waitForTransaction(await coinClient.transfer(alice, carl, 11))

        expect(await coinClient.checkBalance(carl)).toBe(BigInt(11))
    })

    test("single signer to multi signers", async () => {
        let alice = new aptos.AptosAccount()
        await faucetClient.fundAccount(alice.address(), 5000000000000000000)

        const signer1 = new aptos.AptosAccount()
        const signer2 = new aptos.AptosAccount()

        // create multi sig account
        const [multisigPubkey, multisigAddress] = await generateMultisig(
            [signer1.signingKey.publicKey, signer2.signingKey.publicKey],
            2,
        )
        const signFuncWithMultipleSigners = makeSignFuncWithMultipleSigners(...[signer1, signer2])
        await faucetClient.fundAccount(multisigAddress, 0)

        // rotate auth key to multi signers
        const payload = await rotateAuthKeyMultiEd25519(client, alice, multisigPubkey, signFuncWithMultipleSigners)
        const pendingTx = await client.submitSignedBCSTransaction(payload)
        await client.waitForTransaction(pendingTx.hash)

        const origAddressHex = await client.lookupOriginalAddress(multisigAddress)

        // Sometimes the returned addresses do not have leading 0s. To be safe, converting hex addresses to AccountAddress
        const origAddress = TxnBuilderTypes.AccountAddress.fromHex(origAddressHex)
        const aliceAddress = TxnBuilderTypes.AccountAddress.fromHex(alice.address())
        expect(HexString.fromUint8Array(aptos.BCS.bcsToBytes(origAddress)).hex()).toBe(
            HexString.fromUint8Array(aptos.BCS.bcsToBytes(aliceAddress)).hex(),
        )

        // send coins to carol using multi signers
        const carl = new aptos.AptosAccount()
        await faucetClient.fundAccount(carl.address(), 0)

        const transferPayload = new aptos.TxnBuilderTypes.TransactionPayloadEntryFunction(
            aptos.TxnBuilderTypes.EntryFunction.natural(
                "0x1::coin",
                "transfer",
                [new aptos.TxnBuilderTypes.TypeTagStruct(aptos.TxnBuilderTypes.StructTag.fromString("0x1::aptos_coin::AptosCoin"))],
                [
                    aptos.BCS.bcsSerializeFixedBytes(carl.address().toUint8Array()),
                    aptos.BCS.bcsSerializeUint64(12),
                ],
            ),
        )
        await sendAndConfirmMultiSigTransaction(client, alice.address().toString(), multisigPubkey, transferPayload, signFuncWithMultipleSigners)

        expect(await coinClient.checkBalance(carl)).toBe(BigInt(12))
    })
})

async function rotateAuthKeyMultiEd25519(
    client: aptos.AptosClient,
    forAccount: AptosAccount,
    multiSigPublicKey: aptos.TxnBuilderTypes.MultiEd25519PublicKey,
    signFunc: MultipleSignFunc,
    extraArgs?: OptionalTransactionArgs,
): Promise<Uint8Array> {
    const { sequence_number: sequenceNumber, authentication_key: authKey } = await client.getAccount(
        forAccount.address(),
    )

    const challenge = new TxnBuilderTypes.RotationProofChallenge(
        TxnBuilderTypes.AccountAddress.CORE_CODE_ADDRESS,
        "account",
        "RotationProofChallenge",
        BigInt(sequenceNumber),
        TxnBuilderTypes.AccountAddress.fromHex(forAccount.address()),
        new TxnBuilderTypes.AccountAddress(new HexString(authKey).toUint8Array()),
        multiSigPublicKey.toBytes(),
    )

    const challengeBytes = aptos.BCS.bcsToBytes(challenge)
    const challengeHex = HexString.fromUint8Array(challengeBytes)

    const proofSignedByCurrentPrivateKey = forAccount.signHexString(challengeHex)

    const items = await signFunc(challengeBytes)
    const signatures = items.map((item) => item.signature)
    const bitmap = items.map((item) => item.bitmap)
    const proofSignedByNewPrivateKey = new aptos.TxnBuilderTypes.MultiEd25519Signature(
        signatures.map((signature) => new aptos.TxnBuilderTypes.Ed25519Signature(signature.toUint8Array())),
        aptos.TxnBuilderTypes.MultiEd25519Signature.createBitmap(bitmap),
    )

    const payload = new TxnBuilderTypes.TransactionPayloadEntryFunction(
        TxnBuilderTypes.EntryFunction.natural(
            "0x1::account",
            "rotate_authentication_key",
            [],
            [
                aptos.BCS.bcsSerializeU8(0), // ed25519 scheme
                aptos.BCS.bcsSerializeBytes(forAccount.pubKey().toUint8Array()),
                aptos.BCS.bcsSerializeU8(1), // multi ed25519 scheme
                aptos.BCS.bcsSerializeBytes(multiSigPublicKey.toBytes()),
                aptos.BCS.bcsSerializeBytes(proofSignedByCurrentPrivateKey.toUint8Array()),
                aptos.BCS.bcsSerializeBytes(proofSignedByNewPrivateKey.toBytes()),
            ],
        ),
    )

    const rawTransaction = await client.generateRawTransaction(forAccount.address(), payload, extraArgs)
    return aptos.AptosClient.generateBCSTransaction(forAccount, rawTransaction)
}

async function sendAndConfirmMultiSigTransaction(
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
}
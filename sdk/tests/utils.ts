import * as nacl from "tweetnacl"
import * as aptos from "aptos"

export function findSecretKeyWithZeroPrefix(length = 0): Uint8Array {
    const prefix = Buffer.alloc(length, "0").toString()
    let address
    let secretKey
    do {
        secretKey = nacl.box.keyPair().secretKey
        const account = new aptos.AptosAccount(secretKey)
        address = account.address().noPrefix()
    } while (!address.startsWith(prefix))
    return secretKey
}

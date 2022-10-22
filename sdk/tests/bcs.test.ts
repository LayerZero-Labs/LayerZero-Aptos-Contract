import * as aptos from "aptos"

export function convertToPaddedUint8Array(str: string, length: number): Uint8Array {
    const value = Uint8Array.from(Buffer.from(aptos.HexString.ensure(str).noPrefix().padStart(length, "0"), "hex"))
    return Uint8Array.from([...Array.from(new Uint8Array(length - value.length)), ...Array.from(value)])
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function argToBytes(argVal: any, argType: aptos.TxnBuilderTypes.TypeTag) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (aptos.TransactionBuilderABI as any).toBCSArgs([{ type_tag: argType }], [argVal])[0]
}

describe("argument of vector<u8>", () => {
    const typeTag = new aptos.TypeTagParser("vector<u8>").parseTypeTag()
    const value = convertToPaddedUint8Array("6d9f1a927cbcb5e2c28d13ca735bc6d6131406da", 32)

    test("Uint8Array value", () => {
        const val = value
        const bytes = argToBytes(val, typeTag)
        expect(bytes.length).toBe(value.length + 1)
        expect(bytes.slice(1)).toEqual(value)
    })

    test("Uint8Array value serialized as JSON object", () => {
        const val = JSON.parse(JSON.stringify(value))
        expect(() => {
            argToBytes(val, typeTag)
        }).toThrowError("Invalid vector args.")
    })

    test("string value", () => {
        const val = Buffer.from(value).toString()
        const bytes = argToBytes(val, typeTag)
        expect(bytes.length).not.toBe(value.length + 1)
        const raw = bytes.slice(1)
        const encoded = Buffer.from(raw).toString("hex")
        expect(encoded).toBe(
            "0000000000000000000000006defbfbd1aefbfbd7cefbfbdefbfbdefbfbdc28d13efbfbd735befbfbdefbfbd131406efbfbd",
        )
    })

    test("hex string value", () => {
        const val = Buffer.from(value).toString("hex")
        const bytes = argToBytes(val, typeTag)
        expect(bytes.length).not.toBe(value.length + 1)
        const raw = bytes.slice(1)
        const encoded = Buffer.from(raw).toString("hex")
        expect(encoded).toBe(
            "30303030303030303030303030303030303030303030303036643966316139323763626362356532633238643133636137333562633664363133313430366461",
        )
    })
})

import { SDK } from "../index"
import * as aptos from "aptos"

export class MsgLibAuth {
    public readonly module
    public readonly moduleName

    constructor(private sdk: SDK) {
        this.module = `${sdk.accounts.msglib_auth}::msglib_cap`
        this.moduleName = "msglib_auth::msglib_cap"
    }

    async isAllowed(msglibReceive: string): Promise<boolean[]> {
        const resource: { data: any } = await this.sdk.client.getAccountResource(
            this.sdk.accounts.msglib_auth!,
            `${this.module}::GlobalStore`,
        )
        const msglibAcl = resource.data.msglib_acl.list
        const lib = aptos.HexString.ensure(msglibReceive).toShortString()
        return msglibAcl.includes(lib)
    }

    denyPayload(msglibReceive: string): aptos.Types.EntryFunctionPayload {
        return {
            function: `${this.module}::deny`,
            type_arguments: [],
            arguments: [msglibReceive],
        }
    }

    allowPayload(msglibReceive: string): aptos.Types.EntryFunctionPayload {
        return {
            function: `${this.module}::allow`,
            type_arguments: [],
            arguments: [msglibReceive],
        }
    }

    async allow(signer: aptos.AptosAccount, msglibReceive: string): Promise<aptos.Types.Transaction> {
        const transaction = this.allowPayload(msglibReceive)
        return this.sdk.sendAndConfirmTransaction(signer, transaction)
    }
}

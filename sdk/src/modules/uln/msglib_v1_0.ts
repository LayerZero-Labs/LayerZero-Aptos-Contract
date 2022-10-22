import { SDK } from "../../index"

export class MsgLibV1_0 {
    public readonly module

    constructor(private sdk: SDK) {
        this.module = `${sdk.accounts.layerzero}::msglib_v1_0`
    }
}

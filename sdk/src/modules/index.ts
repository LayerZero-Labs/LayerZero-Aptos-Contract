import { SDK } from "../index"
import { Channel } from "./channel"
import { Endpoint } from "./endpoint"
import { Executor } from "./executor"
import { Uln } from "./uln"
import { MsgLibConfig } from "./msglib_config"
import { ExecutorConfig } from "./executor_config"
import { MsgLibAuth } from "./msglib_auth"

export * as counter from "./apps/counter"
export * as bridge from "./apps/bridge"
export * as coin from "./apps/coin"
export * as oracle from "./apps/oracle"

export class Layerzero {
    Channel: Channel
    Executor: Executor
    Endpoint: Endpoint
    Uln: Uln
    MsgLibConfig: MsgLibConfig
    MsgLibAuth: MsgLibAuth
    ExecutorConfig: ExecutorConfig

    constructor(sdk: SDK) {
        this.Channel = new Channel(sdk)
        this.Executor = new Executor(sdk)
        this.Endpoint = new Endpoint(sdk)
        this.MsgLibConfig = new MsgLibConfig(sdk)
        this.MsgLibAuth = new MsgLibAuth(sdk)
        this.ExecutorConfig = new ExecutorConfig(sdk)
        this.Uln = new Uln(sdk)
    }
}

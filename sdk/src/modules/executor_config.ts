import { SDK } from "../index"
import * as aptos from "aptos"
import { isErrorOfApiError } from "../utils"

export class ExecutorConfig {
    public readonly module

    constructor(private sdk: SDK) {
        this.module = `${sdk.accounts.layerzero}::executor_config`
    }

    async getDefaultExecutor(remoteChainId: aptos.BCS.Uint16): Promise<[string, aptos.BCS.Uint64]> {
        const resource = await this.sdk.client.getAccountResource(
            this.sdk.accounts.layerzero!,
            `${this.module}::ConfigStore`,
        )

        const { config } = resource.data as { config: { handle: string } }
        try {
            const response = await this.sdk.client.getTableItem(config.handle, {
                key_type: "u64",
                value_type: `${this.module}::Config`,
                key: remoteChainId.toString(),
            })
            return [response.executor, response.version]
        } catch (e) {
            if (isErrorOfApiError(e, 404)) {
                return ["", BigInt(0)]
            }
            throw e
        }
    }

    async getExecutor(
        uaAddress: aptos.MaybeHexString,
        remoteChainId: aptos.BCS.Uint16,
    ): Promise<[string, aptos.BCS.Uint64]> {
        const resource = await this.sdk.client.getAccountResource(uaAddress, `${this.module}::ConfigStore`)
        const { config } = resource.data as { config: { handle: string } }

        try {
            const response = await this.sdk.client.getTableItem(config.handle, {
                key_type: "u64",
                value_type: `${this.module}::Config`,
                key: remoteChainId.toString(),
            })
            return [response.executor, response.version]
        } catch (e) {
            if (isErrorOfApiError(e, 404)) {
                return await this.getDefaultExecutor(remoteChainId)
            }
            throw e
        }
    }

    setDefaultExecutorPayload(
        remoteChainId: aptos.BCS.Uint16,
        version: aptos.BCS.Uint8,
        executor: aptos.MaybeHexString,
    ): aptos.Types.EntryFunctionPayload {
        return {
            function: `${this.module}::set_default_executor`,
            type_arguments: [],
            arguments: [remoteChainId, version, executor],
        }
    }
}

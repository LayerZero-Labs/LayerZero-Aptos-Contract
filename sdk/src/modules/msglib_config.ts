import { SDK } from "../index"
import * as aptos from "aptos"
import { isErrorOfApiError } from "../utils"

export class MsgLibConfig {
    public readonly module
    public readonly moduleName
    public readonly semverModule

    constructor(private sdk: SDK) {
        this.module = `${sdk.accounts.layerzero}::msglib_config`
        this.moduleName = "layerzero::msglib_config"
        this.semverModule = `${sdk.accounts.layerzero}::semver`
    }

    async getDefaultSendMsgLib(
        remoteChainId: aptos.BCS.Uint16,
    ): Promise<{ major: aptos.BCS.Uint64; minor: aptos.BCS.Uint8 }> {
        const resource = await this.sdk.client.getAccountResource(
            this.sdk.accounts.layerzero!,
            `${this.module}::MsgLibConfig`,
        )
        const { send_version } = resource.data as { send_version: { handle: string } }
        try {
            const response = await this.sdk.client.getTableItem(send_version.handle, {
                key_type: "u64",
                value_type: `${this.semverModule}::SemVer`,
                key: remoteChainId.toString(),
            })
            return {
                major: BigInt(response.major),
                minor: Number(response.minor),
            }
        } catch (e) {
            if (isErrorOfApiError(e, 404)) {
                return {
                    major: BigInt(0),
                    minor: 0,
                }
            }
            throw e
        }
    }

    async getDefaultReceiveMsgLib(
        remoteChainId: aptos.BCS.Uint16,
    ): Promise<{ major: aptos.BCS.Uint64; minor: aptos.BCS.Uint8 }> {
        const resource = await this.sdk.client.getAccountResource(
            this.sdk.accounts.layerzero!,
            `${this.module}::MsgLibConfig`,
        )
        const { receive_version } = resource.data as { receive_version: { handle: string } }
        try {
            const response = await this.sdk.client.getTableItem(receive_version.handle, {
                key_type: "u64",
                value_type: `${this.semverModule}::SemVer`,
                key: remoteChainId.toString(),
            })
            return {
                major: BigInt(response.major),
                minor: Number(response.minor),
            }
        } catch (e) {
            if (isErrorOfApiError(e, 404)) {
                return {
                    major: BigInt(0),
                    minor: 0,
                }
            }
            throw e
        }
    }

    setDefaultSendMsgLibPayload(
        remoteChainId: aptos.BCS.Uint16,
        major: aptos.BCS.Uint64,
        minor: aptos.BCS.Uint8,
    ): aptos.Types.EntryFunctionPayload {
        return {
            function: `${this.module}::set_default_send_msglib`,
            type_arguments: [],
            arguments: [remoteChainId.toString(), major.toString(), minor.toString()],
        }
    }

    setDefaultReceiveMsgLibPayload(
        remoteChainId: aptos.BCS.Uint16,
        major: aptos.BCS.Uint64,
        minor: aptos.BCS.Uint8,
    ): aptos.Types.EntryFunctionPayload {
        return {
            function: `${this.module}::set_default_receive_msglib`,
            type_arguments: [],
            arguments: [remoteChainId.toString(), major.toString(), minor.toString()],
        }
    }
}

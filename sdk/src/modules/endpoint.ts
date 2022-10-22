import { SDK } from "../index"
import * as aptos from "aptos"
import { TypeInfoEx } from "../types"
import { fullAddress, hexToAscii } from "../utils"

export class Endpoint {
    public readonly module
    public readonly moduleName

    constructor(private sdk: SDK) {
        this.module = `${sdk.accounts.layerzero}::endpoint`
        this.moduleName = "layerzero::endpoint"
    }

    async initialize(signer: aptos.AptosAccount, localChainId: aptos.BCS.Uint16): Promise<aptos.Types.Transaction> {
        const transaction: aptos.Types.EntryFunctionPayload = {
            function: `${this.module}::init`,
            type_arguments: [],
            arguments: [localChainId],
        }

        return this.sdk.sendAndConfirmTransaction(signer, transaction)
    }

    async getUATypeInfo(uaAddress: aptos.MaybeHexString): Promise<TypeInfoEx> {
        const resource = await this.sdk.client.getAccountResource(
            this.sdk.accounts.layerzero!,
            `${this.module}::UaRegistry`,
        )
        const { ua_infos } = resource.data as { ua_infos: { handle: string } }
        const typesHandle = ua_infos.handle
        const typeInfo = await this.sdk.client.getTableItem(typesHandle, {
            key_type: "address",
            value_type: `0x1::type_info::TypeInfo`,
            key: aptos.HexString.ensure(uaAddress).toString(),
        })

        const account_address = fullAddress(typeInfo.account_address).toString()
        const module_name = hexToAscii(typeInfo.module_name)
        const struct_name = hexToAscii(typeInfo.struct_name)
        return {
            account_address,
            module_name,
            struct_name,
            type: `${account_address}::${module_name}::${struct_name}`,
        }
    }

    async getOracleFee(oracleAddr: aptos.MaybeHexString, dstChainId: aptos.BCS.Uint16): Promise<aptos.BCS.Uint64> {
        const resource = await this.sdk.client.getAccountResource(
            this.sdk.accounts.layerzero!,
            `${this.module}::FeeStore`,
        )
        const { oracle_fees } = resource.data as { oracle_fees: { handle: string } }
        const response = await this.sdk.client.getTableItem(oracle_fees.handle, {
            key_type: `${this.module}::QuoteKey`,
            value_type: "u64",
            key: {
                agent: aptos.HexString.ensure(oracleAddr).toString(),
                chain_id: dstChainId.toString(),
            },
        })
        return BigInt(response)
    }

    async getRegisterEvents(start: bigint, limit: number): Promise<aptos.Types.Event[]> {
        return this.sdk.client.getEventsByEventHandle(
            this.sdk.accounts.layerzero!,
            `${this.module}::UaRegistry`,
            "register_events",
            { start, limit },
        )
    }

    async quoteFee(
        uaAddress: aptos.MaybeHexString,
        dstChainId: aptos.BCS.Uint16,
        adapterParams: aptos.BCS.Bytes,
        payloadSize: number,
    ): Promise<aptos.BCS.Uint64> {
        let totalFee = BigInt(await this.sdk.LayerzeroModule.Uln.Config.quoteFee(uaAddress, dstChainId, payloadSize))

        const [executor] = await this.sdk.LayerzeroModule.ExecutorConfig.getExecutor(uaAddress, dstChainId)

        totalFee += await this.sdk.LayerzeroModule.Executor.quoteFee(executor, dstChainId, adapterParams)

        return totalFee
    }

    registerExecutorPayload(executorType: string): aptos.Types.EntryFunctionPayload {
        return {
            function: `${this.module}::register_executor`,
            type_arguments: [executorType],
            arguments: [],
        }
    }

    async registerExecutor(signer: aptos.AptosAccount, executorType: string): Promise<aptos.Types.Transaction> {
        const transaction = this.registerExecutorPayload(executorType)
        return await this.sdk.sendAndConfirmTransaction(signer, transaction)
    }
}

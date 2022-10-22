import { SDK } from "../../index"
import * as aptos from "aptos"
import { UlnConfigType } from "../../types"
import { fullAddress, isErrorOfApiError, isZeroAddress } from "../../utils"

export class UlnConfig {
    TYPE_ORACLE = 0
    TYPE_RELAYER = 1
    TYPE_INBOUND_CONFIRMATIONS = 2
    TYPE_OUTBOUND_CONFIRMATIONS = 3

    public readonly module
    public readonly moduleName

    constructor(private sdk: SDK) {
        this.module = `${sdk.accounts.layerzero}::uln_config`
        this.moduleName = "layerzero::uln_config"
    }

    setDefaultAppConfigPayload(
        remoteChainId: aptos.BCS.Uint16,
        config: UlnConfigType,
    ): aptos.Types.EntryFunctionPayload {
        return {
            function: `${this.module}::set_default_config`,
            type_arguments: [],
            arguments: [
                remoteChainId,
                config.oracle,
                config.relayer,
                config.inbound_confirmations,
                config.outbound_confirmations,
            ],
        }
    }

    async setDefaultAppConfig(
        signer: aptos.AptosAccount,
        remoteChainId: aptos.BCS.Uint16,
        config: UlnConfigType,
    ): Promise<aptos.Types.Transaction> {
        const transaction = this.setDefaultAppConfigPayload(remoteChainId, config)
        return this.sdk.sendAndConfirmTransaction(signer, transaction)
    }

    setChainAddressSizePayload(
        remoteChainId: aptos.BCS.Uint16,
        addressSize: aptos.BCS.Uint8,
    ): aptos.Types.EntryFunctionPayload {
        return {
            function: `${this.module}::set_chain_address_size`,
            type_arguments: [],
            arguments: [remoteChainId, addressSize],
        }
    }

    async setChainAddressSize(
        signer: aptos.AptosAccount,
        remoteChainId: aptos.BCS.Uint16,
        addressSize: aptos.BCS.Uint8,
    ): Promise<aptos.Types.Transaction> {
        const transaction = this.setChainAddressSizePayload(remoteChainId, addressSize)
        return this.sdk.sendAndConfirmTransaction(signer, transaction)
    }

    async getChainAddressSize(remoteChainId: aptos.BCS.Uint16): Promise<aptos.BCS.Uint8> {
        const resource = await this.sdk.client.getAccountResource(
            this.sdk.accounts.layerzero!,
            `${this.module}::ChainConfig`,
        )
        const { chain_address_size } = resource.data as { chain_address_size: { handle: string } }
        const tableHandle = chain_address_size.handle
        try {
            const response = await this.sdk.client.getTableItem(tableHandle, {
                key_type: "u64",
                value_type: "u64",
                key: remoteChainId.toString(),
            })
            return Number(response)
        } catch (e) {
            if (isErrorOfApiError(e, 404)) {
                return 0
            }
            throw e
        }
    }

    async getDefaultAppConfig(remoteChainId: aptos.BCS.Uint16): Promise<UlnConfigType> {
        const resource = await this.sdk.client.getAccountResource(
            this.sdk.accounts.layerzero!,
            `${this.module}::DefaultUlnConfig`,
        )
        const { config } = resource.data as { config: { handle: string } }
        try {
            return await this.sdk.client.getTableItem(config.handle, {
                key_type: "u64",
                value_type: `${this.module}::UlnConfig`,
                key: remoteChainId.toString(),
            })
        } catch (e) {
            if (isErrorOfApiError(e, 404)) {
                return {
                    inbound_confirmations: BigInt(0),
                    oracle: "",
                    outbound_confirmations: BigInt(0),
                    relayer: "",
                }
            }
            throw e
        }
    }

    async getAppConfig(uaAddress: aptos.MaybeHexString, remoteChainId: aptos.BCS.Uint16): Promise<UlnConfigType> {
        const defaultConfig = await this.getDefaultAppConfig(remoteChainId)
        console.log(`defaultConfig`, defaultConfig)

        let mergedConfig: UlnConfigType = {
            ...defaultConfig,
        }
        try {
            const resource = await this.sdk.client.getAccountResource(
                this.sdk.accounts.layerzero!,
                `${this.module}::UaUlnConfig`,
            )
            const { config } = resource.data as { config: { handle: string } }
            const Config = await this.sdk.client.getTableItem(config.handle, {
                key_type: `${this.module}::UaConfigKey`,
                value_type: `${this.module}::UlnConfig`,
                key: {
                    ua_address: aptos.HexString.ensure(uaAddress).toString(),
                    chain_id: remoteChainId.toString(),
                },
            })

            console.log(`Config: `, Config)
            mergedConfig = this.mergeConfig(Config, defaultConfig)
        } catch (e) {
            if (!isErrorOfApiError(e, 404)) {
                throw e
            }
        }

        // address type in move are reutrned as short string
        mergedConfig.oracle = fullAddress(mergedConfig.oracle).toString()
        mergedConfig.relayer = fullAddress(mergedConfig.relayer).toString()
        mergedConfig.inbound_confirmations = BigInt(mergedConfig.inbound_confirmations)
        mergedConfig.outbound_confirmations = BigInt(mergedConfig.outbound_confirmations)
        return mergedConfig
    }

    async quoteFee(
        uaAddress: aptos.MaybeHexString,
        dstChainId: aptos.BCS.Uint16,
        payloadSize: number,
    ): Promise<aptos.BCS.Uint64> {
        const config = await this.getAppConfig(uaAddress, dstChainId)

        const oracleFee = await this.sdk.LayerzeroModule.Uln.Signer.getFee(config.oracle, dstChainId)
        const relayerFee = await this.sdk.LayerzeroModule.Uln.Signer.getFee(config.relayer, dstChainId)

        const treasuryConfigResource = await this.sdk.client.getAccountResource(
            this.sdk.accounts.layerzero!,
            `${this.sdk.LayerzeroModule.Uln.MsgLibV1.module}::GlobalStore`,
        )
        console.log(`treasuryConfigResource`, treasuryConfigResource.data)
        const { treasury_fee_bps: treasuryFeeBps } = treasuryConfigResource.data as { treasury_fee_bps: string }

        // lz fee
        let totalFee = relayerFee.base_fee + relayerFee.fee_per_byte * BigInt(payloadSize)
        totalFee += oracleFee.base_fee + oracleFee.fee_per_byte * BigInt(payloadSize)
        totalFee += (BigInt(treasuryFeeBps) * totalFee) / BigInt(10000)

        return totalFee
    }

    private mergeConfig(config: UlnConfigType, defaultConfig: UlnConfigType): UlnConfigType {
        const mergedConfig = { ...defaultConfig }
        if (!isZeroAddress(config.oracle)) {
            mergedConfig.oracle = config.oracle
        }
        if (!isZeroAddress(config.relayer)) {
            mergedConfig.relayer = config.relayer
        }
        if (config.inbound_confirmations > 0) {
            mergedConfig.inbound_confirmations = config.inbound_confirmations
        }
        if (config.outbound_confirmations > 0) {
            mergedConfig.outbound_confirmations = config.outbound_confirmations
        }

        return mergedConfig
    }
}

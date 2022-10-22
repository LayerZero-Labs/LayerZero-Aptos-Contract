import { SDK } from "../index"
import * as aptos from "aptos"
import { isErrorOfApiError } from "../utils"

export interface ChannelType {
    outbound_nonce: string
    inbound_nonce: string
    payload_hashs: { handle: string }
}

export class Channel {
    public readonly module

    constructor(private sdk: SDK) {
        this.module = `${sdk.accounts.layerzero}::channel`
    }

    async getOutboundEvents(start: bigint, limit: number): Promise<aptos.Types.Event[]> {
        return this.sdk.client.getEventsByEventHandle(
            this.sdk.accounts.layerzero!,
            `${this.module}::EventStore`,
            "outbound_events",
            { start, limit },
        )
    }

    async getInboundEvents(start: bigint, limit: number): Promise<aptos.Types.Event[]> {
        return this.sdk.client.getEventsByEventHandle(
            this.sdk.accounts.layerzero!,
            `${this.module}::EventStore`,
            "inbound_events",
            { start, limit },
        )
    }

    async getReceiveEvents(start: bigint, limit: number): Promise<aptos.Types.Event[]> {
        return this.sdk.client.getEventsByEventHandle(
            this.sdk.accounts.layerzero!,
            `${this.module}::EventStore`,
            "receive_events",
            {
                start,
                limit,
            },
        )
    }

    async getChannelState(
        uaAddress: aptos.MaybeHexString,
        remoteChainId: aptos.BCS.Uint16,
        remoteAddress: aptos.BCS.Bytes,
    ): Promise<ChannelType> {
        const resource = await this.sdk.client.getAccountResource(uaAddress, `${this.module}::Channels`)
        const { states } = resource.data as { states: { handle: string } }
        const pathsHandle = states.handle

        return this.sdk.client.getTableItem(pathsHandle, {
            key_type: `${this.module}::Remote`,
            value_type: `${this.module}::Channel`,
            key: { chain_id: remoteChainId.toString(), addr: Buffer.from(remoteAddress).toString("hex") },
        })
    }

    async getOutboundNonce(
        uaAddress: aptos.MaybeHexString,
        remoteChainId: aptos.BCS.Uint16,
        remoteAddress: aptos.BCS.Bytes,
    ): Promise<aptos.BCS.Uint64> {
        try {
            const pathInfo = await this.getChannelState(uaAddress, remoteChainId, remoteAddress)
            const outboundNonce = pathInfo.outbound_nonce
            return BigInt(outboundNonce)
        } catch (e) {
            if (isErrorOfApiError(e, 404)) {
                return BigInt(0)
            }
            throw e
        }
    }

    async getInboundNonce(
        uaAddress: aptos.MaybeHexString,
        remoteChainId: aptos.BCS.Uint16,
        remoteAddress: aptos.BCS.Bytes,
    ): Promise<aptos.BCS.Uint64> {
        try {
            const pathInfo = await this.getChannelState(uaAddress, remoteChainId, remoteAddress)
            const inboundNonce = pathInfo.inbound_nonce
            return BigInt(inboundNonce)
        } catch (e) {
            if (isErrorOfApiError(e, 404)) {
                return BigInt(0)
            }
            throw e
        }
    }

    async getPayloadHash(
        uaAddress: aptos.MaybeHexString,
        remoteChainId: aptos.BCS.Uint16,
        remoteAddress: aptos.BCS.Bytes,
        nonce: aptos.BCS.Uint64,
    ): Promise<string> {
        try {
            const pathInfo = await this.getChannelState(uaAddress, remoteChainId, remoteAddress)
            const resource = pathInfo.payload_hashs

            return await this.sdk.client.getTableItem(resource.handle, {
                key_type: "u64",
                value_type: "vector<u8>",
                key: nonce.toString(),
            })
        } catch (e) {
            if (isErrorOfApiError(e, 404)) {
                return ""
            }
            throw e
        }
    }

    async isProofDelivered(
        uaAddress: aptos.MaybeHexString,
        remoteChainId: aptos.BCS.Uint16,
        remoteAddress: aptos.BCS.Bytes,
        nonce: aptos.BCS.Uint64,
    ): Promise<boolean> {
        const inboundNonce = await this.getInboundNonce(uaAddress, remoteChainId, remoteAddress)
        console.log(`inboundNonce: ${inboundNonce}`)
        console.log(`nonce: ${nonce}`)
        if (nonce <= inboundNonce) {
            return true
        }
        const payloadHash = await this.getPayloadHash(uaAddress, remoteChainId, remoteAddress, nonce)
        return payloadHash !== ""
    }
}

import { SDK } from "../../index"
import * as aptos from "aptos"
import BN from "bn.js"

export class PacketEvent {
    public readonly module

    constructor(private sdk: SDK) {
        this.module = `${sdk.accounts.layerzero}::packet_event`
    }

    async getInboundEvents(start: bigint, limit: number): Promise<aptos.Types.Event[]> {
        return this.sdk.client.getEventsByEventHandle(
            this.sdk.accounts.layerzero!,
            `${this.module}::EventStore`,
            "inbound_events",
            { start, limit },
        )
    }

    async getInboundEventCount(): Promise<number> {
        const resource = await this.sdk.client.getAccountResource(
            this.sdk.accounts.layerzero!,
            `${this.module}::EventStore`,
        )
        const { inbound_events } = resource.data as { inbound_events: { counter: string } }
        return new BN(inbound_events.counter).toNumber()
    }

    async getOutboundEvents(start: bigint, limit: number): Promise<aptos.Types.Event[]> {
        return this.sdk.client.getEventsByEventHandle(
            this.sdk.accounts.layerzero!,
            `${this.module}::EventStore`,
            "outbound_events",
            { start, limit },
        )
    }

    async getOutboundEventCount(): Promise<number> {
        const resource = await this.sdk.client.getAccountResource(
            this.sdk.accounts.layerzero!,
            `${this.module}::EventStore`,
        )
        const { outbound_events } = resource.data as { outbound_events: { counter: string } }
        return new BN(outbound_events.counter).toNumber()
    }
}

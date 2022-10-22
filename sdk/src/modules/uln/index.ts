import { SDK } from "../../index"
import { UlnReceive } from "./uln_receive"
import { UlnSigner } from "./uln_signer"
import { UlnConfig } from "./uln_config"
import { MsgLibV1_0 } from "./msglib_v1_0"
import { PacketEvent } from "./packet_event"

export class Uln {
    Receive: UlnReceive
    Signer: UlnSigner
    Config: UlnConfig
    MsgLibV1: MsgLibV1_0
    PacketEvent: PacketEvent

    constructor(sdk: SDK) {
        this.Receive = new UlnReceive(sdk)
        this.Signer = new UlnSigner(sdk)
        this.Config = new UlnConfig(sdk)
        this.MsgLibV1 = new MsgLibV1_0(sdk)
        this.PacketEvent = new PacketEvent(sdk)
    }
}

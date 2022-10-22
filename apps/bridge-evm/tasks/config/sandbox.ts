import { ChainId } from "@layerzerolabs/core-sdk"
import { CoinType } from "../../../../sdk/src/modules/apps/coin"
import { PacketType } from "./types"

export const CONFIG = {
    useCustomAdapterParams: true,
    feeBP: 6,
    minDstGas: {
        [PacketType.SEND_TO_APTOS]: 2500,
    },
    coins: {
        [ChainId.GOERLI_SANDBOX]: [CoinType.WETH, CoinType.USDC],
    },
    // appConfig: {
    //     [ChainId.GOERLI_SANDBOX]: {
    //         [UlnV2ConfigType.OUTBOUND_PROOF_TYPE]: 2,
    //         [UlnV2ConfigType.INBOUND_PROOF_LIBRARY_VERSION]: 1, //inbound proof library on evm from aptos
    //     },
    // },
}

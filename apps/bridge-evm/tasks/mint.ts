import { CoinType } from "../../../sdk/src/modules/apps/coin"

module.exports = async function (taskArgs, hre) {
    const receiver = taskArgs.a
    switch (taskArgs.t) {
        case CoinType.USDC: {
            const usdc = await hre.ethers.getContract("Token")

            await (await usdc.mint(receiver, "5000000000000000000")).wait()
            const balance = await usdc.balanceOf(receiver)
            console.log(`USDC balance of ${receiver}: ${balance.toString()}`)
            break
        }
        default: {
            throw new Error(`Not mintable token type: ${taskArgs.t}`)
        }
    }
}

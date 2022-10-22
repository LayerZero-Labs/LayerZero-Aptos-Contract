import { subtask, task, types } from "hardhat/config"

subtask("deployBridge", "", require("./deployBridge"))
    .addParam("networks", "comma separated list of networks to deploy the bridge on")
    .addOptionalParam("deleteOldDeploy", "whether to delete old deployments", false, types.boolean)

task("testBridge", "", require("./testBridge"))

task("send", "", require("./send"))
    .addParam("a", "amount", "1000000000")
    .addParam("t", "token type", "ETH")
    .addParam("r", "address of receiver at aptos", "0x5d96ae95d5ba826af7a1799d824a9581a4bb75c194556a11bb85ef0f5b6e973a")

task("mint", "", require("./mint")).addParam("t", "token type", "ETH").addParam("a", "address", "0x15e36adEBB0c65217Eab8cdd58BD69cf1FAa24c2")

task("wireAll", "", require("./wireAll"))
    .addParam("e", "the environment ie: mainnet, testnet or sandbox", "sandbox")
    .addOptionalParam("srcNetworks", "comma seperated list of networks to config on", "goerli-sandbox", types.string)
    .addParam("noPrompt", "no prompt", false, types.boolean)

subtask("wireAllSubtask", "", require("./wireAll"))
    .addParam("e", "the environment ie: mainnet, testnet or sandbox", "sandbox")
    .addParam("srcNetworks", "comma seperated list of networks to config on", "goerli-sandbox", types.string)
    .addParam("noPrompt", "no prompt", false, types.boolean)

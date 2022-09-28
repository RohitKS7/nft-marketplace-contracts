// REVIEW \\
// Amount = no. of blocks we want to mine
// sleepAmount = the time between each block mines to resemble the real blockchain

const { network } = require("hardhat")

function sleep(timeInMs) {
    return new Promise((resolve) => setTimeout(resolve, timeInMs))
}

const moveBlocks = async (amount, sleepAmount = 0) => {
    console.log("Moving/Mining blocks....")
    for (let i = 0; i < amount; i++) {
        await network.provider.request({ method: "evm_mine", params: [] })
        if (sleepAmount) {
            console.log(`Sleeping for ${sleepAmount}`)
            await sleep(sleepAmount)
        }
    }
}

module.exports = {
    moveBlocks,
    sleep,
}

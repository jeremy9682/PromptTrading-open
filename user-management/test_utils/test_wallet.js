import { Wallet } from "ethers";

const privateKey = "0x0000000000000000";
const wallet = new Wallet(privateKey);

const message = `Welcome to PromptTrading!

Please sign this message to verify your wallet ownership.

Nonce: 08789f29398b14e2b7b32d0d
Timestamp: 2025-11-19T15:09:41.120Z`;

async function testSign() {
    const signature = await wallet.signMessage(message);

    console.log("address:", wallet.address);
    console.log("signature:", signature);
}

testSign();

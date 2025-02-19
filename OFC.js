require('dotenv').config();
const { Web3 } = require('web3');
const axios = require('axios');

const web3 = new Web3(process.env.INFURA_URL);
const privateKey = process.env.PRIVATE_KEY;
const account = web3.eth.accounts.privateKeyToAccount(privateKey);

const headers = {
    "Content-Type": "application/json",
    "privy-app-id": process.env.PRIVY_APP_ID,
    "origin": "https://ofc.onefootball.com",
    "Referer": "https://ofc.onefootball.com/"
};

async function login() {
    try {
        console.log("🔗 Address:", account.address);

        const initResponse = await axios.post(
            `${process.env.AUTH_API_URL}/siwe/init`,
            { address: account.address},
            { headers }
        );

        if (!initResponse.data.nonce) {
            throw new Error("Nonce tidak dapat ditemukan dalam response API");
        }

        const nonce = initResponse.data.nonce;
        const now = new Date();
        const issuedAt = now.toISOString().replace(/\.\d{3}Z$/, "Z");

        const message = `ofc.onefootball.com wants you to sign in with your Ethereum account:\n${account.address}\n\nBy signing, you are proving you own this wallet and logging in. This does not initiate a transaction or cost any fees.\n\nURI: https://ofc.onefootball.com\nVersion: 1\nChain ID: 1\nNonce: ${nonce}\nIssued At: ${issuedAt}\nResources:\n- https://privy.io`;

        const { signature } = web3.eth.accounts.sign(message, privateKey);

        const authResponse = await axios.post(
            `${process.env.AUTH_API_URL}/siwe/authenticate`,
            {
                chainId: "eip155:1",
                connectorType: "injected",
                message: message,
                signature: signature,
                walletClientType: "metamask"
            },
            { headers }
        );

        console.log("🎉 Login success!");

        return {
            token: authResponse.data.token,
            identityToken: authResponse.data.identity_token,
            refreshToken: authResponse.data.refresh_token
        };
    } catch (error) {
        console.error("❌ Login gagal:", error.response ? error.response.data : error.message);
        return null;
    }
}

async function genBearer(authToken) {
    if (!authToken) {
        console.error("❌ Gagal mendapatkan data autentikasi.");
        return null;
    }

    try {
        console.log("🚀 Preparing...");

        const bearerHeader = {
            "content-type": "application/json",
            "origin": "https://ofc.onefootball.com"
        };

        const payload = {"operationName":"UserLogin","variables":{"data":{"externalAuthToken":authToken}},"query":"mutation UserLogin($data: UserLoginInput!) {\n  userLogin(data: $data)\n}"};
        
        const response = await axios.post(process.env.API_URL, payload, { headers: bearerHeader });

        const bearToken = response.data?.data?.userLogin;
        
        if (!bearToken) {
            throw new Error("Bearer token tidak ditemukan dalam respons API");
        }

        console.log("🎁 Ready for claim the task !!!");
        return bearToken;
    } catch (error) {
        console.error("❌ Generate failed:", error.response ? error.response.data : error.message);
        return null;
    }
}

async function claimDaily(bearerToken, identityToken) {
    
    if (!bearerToken || !identityToken) {
        console.error("❌ Gagal mendapatkan token yang diperlukan.");
        return;
    }

    try {
        console.log("🚀 Claiming daily task...");

        const claimHeaders = {
            "Content-Type": "application/json",
            "Origin": "https://ofc.onefootball.com",
            "Authorization": `Bearer ${bearerToken}`,
            "Privy-Id-Token": identityToken,
            "Referer": "https://ofc.onefootball.com/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
            "x-apollo-operation-name": "VerifyActivity"
        };

        const payload = {"operationName":"VerifyActivity","variables":{"data":{"activityId":"c326c0bb-0f42-4ab7-8c5e-4a648259b807"}},"query":"mutation VerifyActivity($data: VerifyActivityInput!) {\n  verifyActivity(data: $data) {\n    record {\n      id\n      activityId\n      status\n      properties\n      createdAt\n      rewardRecords {\n        id\n        status\n        appliedRewardType\n        appliedRewardQuantity\n        appliedRewardMetadata\n        error\n        rewardId\n        reward {\n          id\n          quantity\n          type\n          properties\n          __typename\n        }\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n}"};

        const response = await axios.post(process.env.API_URL, payload, claimHeaders);
        
        if (response.data.errors && response.data.errors.length > 0) {
            console.error("❌ Error:", response.data.errors[0].message);
        } else {
            console.log("🎁 Klaim berhasil:", response.data);
        }     
             
    } catch (error) {
        console.error("❌ Claim failed:", error.response ? error.response.data : error.message);
    }
}

(async () => {
    const authData = await login();
    if (authData) {
        const bearerToken = await genBearer(authData.token);
        await claimDaily(bearerToken, authData.identityToken);
    }
})();

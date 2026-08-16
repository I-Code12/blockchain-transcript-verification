import { JsonRpcProvider, Wallet, formatEther, getAddress } from "ethers";

const required = ["BLOCKCHAIN_RPC_URL", "REGISTRAR_PRIVATE_KEY"];
const missing = required.filter(name => !process.env[name]?.trim());
if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(", ")}`);

const provider = new JsonRpcProvider(process.env.BLOCKCHAIN_RPC_URL);
const wallet = new Wallet(process.env.REGISTRAR_PRIVATE_KEY, provider);
const network = await provider.getNetwork();
const expectedChainId = Number(process.env.EXPECTED_CHAIN_ID || 0);
if (expectedChainId && Number(network.chainId) !== expectedChainId) {
  throw new Error(`Wrong Ethereum network: expected chain ${expectedChainId}, received ${network.chainId}`);
}

const expectedRegistrar = process.env.EXPECTED_REGISTRAR_ADDRESS?.trim();
if (expectedRegistrar && getAddress(expectedRegistrar) !== getAddress(wallet.address)) {
  throw new Error(`Private key does not belong to the expected registrar wallet ${getAddress(expectedRegistrar)}`);
}

const balance = await provider.getBalance(wallet.address);

if (balance === 0n) throw new Error(`Registrar wallet ${wallet.address} has no test-network ETH`);

console.log(JSON.stringify({
  ready: true,
  deployment: process.env.BLOCKCHAIN_DEPLOYMENT || "public",
  chainId: Number(network.chainId),
  registrarAddress: wallet.address,
  balanceEth: formatEther(balance),
}, null, 2));

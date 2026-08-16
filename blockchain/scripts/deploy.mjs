import { ContractFactory, JsonRpcProvider, Wallet, getAddress } from "ethers";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifact = JSON.parse(await readFile(resolve(root, "artifacts/TranscriptRegistry.json"), "utf8"));
const deploymentName = process.env.BLOCKCHAIN_DEPLOYMENT || "local";
const deploymentPath = resolve(root, `deployments/${deploymentName}.json`);
const rpcUrl = process.env.BLOCKCHAIN_RPC_URL || (deploymentName === "local" ? "http://127.0.0.1:8545" : "");
if (!rpcUrl) throw new Error("BLOCKCHAIN_RPC_URL is required for a public deployment");
const provider = new JsonRpcProvider(rpcUrl);

const privateKey = process.env.REGISTRAR_PRIVATE_KEY?.trim();
if (deploymentName !== "local" && !privateKey) throw new Error("REGISTRAR_PRIVATE_KEY is required for a public deployment");
const signer = privateKey ? new Wallet(privateKey, provider) : await provider.getSigner(0);
const network = await provider.getNetwork();
const expectedChainId = Number(process.env.EXPECTED_CHAIN_ID || 0);
if (expectedChainId && Number(network.chainId) !== expectedChainId) {
  throw new Error(`Wrong Ethereum network: expected chain ${expectedChainId}, received ${network.chainId}`);
}
const expectedRegistrar = process.env.EXPECTED_REGISTRAR_ADDRESS?.trim();
if (expectedRegistrar && getAddress(expectedRegistrar) !== getAddress(await signer.getAddress())) {
  throw new Error(`Deployment signer does not match expected registrar ${getAddress(expectedRegistrar)}`);
}

try {
  const previous = JSON.parse(await readFile(deploymentPath, "utf8"));
  if (Number(previous.chainId) !== Number(network.chainId)) {
    throw new Error(`Existing deployment record is for chain ${previous.chainId}, not ${network.chainId}`);
  }
  if (getAddress(previous.deployer) !== getAddress(await signer.getAddress())) {
    throw new Error("Existing deployment record belongs to a different registrar wallet");
  }
  const code = await provider.getCode(previous.address);
  if (code !== "0x") {
    console.log(`Reusing TranscriptRegistry at ${previous.address}`);
    process.exit(0);
  }
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const factory = new ContractFactory(artifact.abi, artifact.bytecode, signer);
const contract = await factory.deploy();
await contract.waitForDeployment();
const receipt = await contract.deploymentTransaction().wait();
const deployment = {
  contractName: "TranscriptRegistry",
  address: await contract.getAddress(),
  deployer: await signer.getAddress(),
  transactionHash: receipt.hash,
  blockNumber: receipt.blockNumber,
  chainId: Number(network.chainId),
  network: process.env.BLOCKCHAIN_NETWORK_NAME || (deploymentName === "local" ? "NexusVerify Local Ethereum" : deploymentName),
  rpcUrl: deploymentName === "local" ? "http://127.0.0.1:8545" : null,
  explorerBaseUrl: process.env.BLOCK_EXPLORER_URL || "",
  deployedAt: new Date().toISOString(),
  abi: artifact.abi,
};
await mkdir(dirname(deploymentPath), { recursive: true });
await writeFile(deploymentPath, JSON.stringify(deployment, null, 2));
console.log(`Deployed TranscriptRegistry to ${deployment.address} in block ${deployment.blockNumber}`);

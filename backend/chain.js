import { Contract, HDNodeWallet, JsonRpcProvider, Wallet, getBytes, keccak256, toUtf8Bytes, verifyMessage } from "ethers";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let connection;

export async function connectChain() {
  const deploymentName = process.env.BLOCKCHAIN_DEPLOYMENT || "local";
  const deployment = JSON.parse(await readFile(resolve(root, `blockchain/deployments/${deploymentName}.json`), "utf8"));
  const rpcUrl = process.env.BLOCKCHAIN_RPC_URL || deployment.rpcUrl;
  if (!rpcUrl) throw new Error("BLOCKCHAIN_RPC_URL is required for this deployment");
  const provider = new JsonRpcProvider(rpcUrl);
  const privateKey = process.env.REGISTRAR_PRIVATE_KEY?.trim();
  if (process.env.NODE_ENV === "production" && !privateKey) throw new Error("REGISTRAR_PRIVATE_KEY is required in production");
  const signer = privateKey ? new Wallet(privateKey, provider) : await provider.getSigner(0);
  const contract = new Contract(process.env.CONTRACT_ADDRESS || deployment.address, deployment.abi, signer);
  if (await provider.getCode(await contract.getAddress()) === "0x") throw new Error("TranscriptRegistry is not deployed");
  const proofSigner = privateKey
    ? signer
    : HDNodeWallet.fromPhrase(process.env.REGISTRAR_MNEMONIC || "test test test test test test test test test test test junk").connect(provider);
  const onChainRegistrar = await contract.registrar();
  if (onChainRegistrar.toLowerCase() !== (await signer.getAddress()).toLowerCase()) throw new Error("Configured registrar wallet does not own this contract");
  connection = { deployment, provider, signer, proofSigner, contract };
  return connection;
}

const ready = () => { if (!connection) throw new Error("Blockchain connection is not ready"); return connection; };
export const credentialKey = (id) => keccak256(toUtf8Bytes(id));
export const bytes32Hash = (hash) => `0x${hash.replace(/^0x/, "")}`;

export async function issueOnChain(id, documentHash) {
  const { contract } = ready();
  const transaction = await contract.issue(credentialKey(id), bytes32Hash(documentHash));
  const receipt = await transaction.wait();
  return { transactionHash: receipt.hash, blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed.toString() };
}

export async function revokeOnChain(id) {
  const { contract } = ready();
  const transaction = await contract.revoke(credentialKey(id));
  const receipt = await transaction.wait();
  return { transactionHash: receipt.hash, blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed.toString() };
}

export async function verifyOnChain(id, documentHash) {
  const { contract } = ready();
  const [authentic, revoked, issuedAt] = await contract.verify(credentialKey(id), bytes32Hash(documentHash));
  return { authentic, revoked, issuedAt: Number(issuedAt) };
}

export async function chainStatus() {
  const { deployment, provider, signer, contract } = ready();
  const network = await provider.getNetwork();
  return { online: true, network: process.env.BLOCKCHAIN_NETWORK_NAME || deployment.network || "NexusVerify Local Ethereum", chainId: Number(network.chainId), latestBlock: await provider.getBlockNumber(), contractAddress: await contract.getAddress(), registrarAddress: await signer.getAddress(), deploymentTransaction: deployment.transactionHash, explorerBaseUrl: process.env.BLOCK_EXPLORER_URL || deployment.explorerBaseUrl || "" };
}

export async function signProofPayload(payload) {
  const { proofSigner } = ready();
  const canonicalPayload = JSON.stringify(payload);
  const proofHash = keccak256(toUtf8Bytes(canonicalPayload));
  const signature = await proofSigner.signMessage(getBytes(proofHash));
  const registrarAddress = await proofSigner.getAddress();
  const recoveredAddress = verifyMessage(getBytes(proofHash), signature);
  if (recoveredAddress.toLowerCase() !== registrarAddress.toLowerCase()) throw new Error("Registrar signature verification failed");
  return { payload, canonicalPayload, proofHash, signature, registrarAddress, signatureValid: true, algorithm: "Ethereum personal_sign of keccak256(canonical JSON)" };
}

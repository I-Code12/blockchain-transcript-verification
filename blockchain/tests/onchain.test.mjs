import test from "node:test";
import assert from "node:assert/strict";
import { Contract, JsonRpcProvider, keccak256, toUtf8Bytes } from "ethers";
import { readFile } from "node:fs/promises";

const deployment = JSON.parse(await readFile(new URL("../deployments/local.json", import.meta.url), "utf8"));
const provider = new JsonRpcProvider(deployment.rpcUrl);
const signer = await provider.getSigner(0);
const contract = new Contract(deployment.address, deployment.abi, signer);

test("contract is deployed on the persistent local Ethereum chain", async () => {
  assert.notEqual(await provider.getCode(deployment.address), "0x");
  assert.equal(Number((await provider.getNetwork()).chainId), 1337);
});

test("issues, verifies and revokes a genuine on-chain credential", async () => {
  const unique = `TEST-${Date.now()}`;
  const credentialKey = keccak256(toUtf8Bytes(unique));
  const documentHash = `0x${"ab".repeat(32)}`;
  const issueReceipt = await (await contract.issue(credentialKey, documentHash)).wait();
  assert.ok(issueReceipt.blockNumber > 0);
  const issued = await contract.verify(credentialKey, documentHash);
  assert.equal(issued[0], true);
  const revokeReceipt = await (await contract.revoke(credentialKey)).wait();
  assert.ok(revokeReceipt.hash.startsWith("0x"));
  const revoked = await contract.verify(credentialKey, documentHash);
  assert.equal(revoked[0], false);
  assert.equal(revoked[1], true);
});

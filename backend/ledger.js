import { createHash, randomUUID } from "node:crypto";

export const hashDocument = (content) => createHash("sha256").update(content).digest("hex");
export const makeTransaction = (documentHash, issuedAt) =>
  `0x${createHash("sha256").update(`${documentHash}:${issuedAt}:${randomUUID()}`).digest("hex").slice(0, 40)}`;

export function verifyChain(records) {
  return records.every((record, index) => index === 0 || record.previousHash === records[index - 1].recordHash);
}

export function buildRecord(input, previous, blockNumber) {
  const issuedAt = new Date().toISOString();
  const payload = { ...input, issuedAt, blockNumber, previousHash: previous?.recordHash ?? "GENESIS" };
  const recordHash = hashDocument(JSON.stringify(payload));
  return { ...payload, recordHash, transactionHash: makeTransaction(input.documentHash, issuedAt), status: "ACTIVE" };
}

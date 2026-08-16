import test from "node:test";
import assert from "node:assert/strict";
import { buildRecord, hashDocument, verifyChain } from "../ledger.js";

test("SHA-256 hashing is deterministic and tamper-evident", () => {
  assert.equal(hashDocument("official transcript"), hashDocument("official transcript"));
  assert.notEqual(hashDocument("official transcript"), hashDocument("altered transcript"));
});

test("ledger linkage detects a changed previous hash", () => {
  const one = buildRecord({ documentHash: hashDocument("one") }, null, 1);
  const two = buildRecord({ documentHash: hashDocument("two") }, one, 2);
  assert.equal(verifyChain([one, two]), true);
  assert.equal(verifyChain([one, { ...two, previousHash: "tampered" }]), false);
});

import assert from "node:assert/strict";
import test from "node:test";
import { decryptTranscript, encryptTranscript, generateShareCode, hashShareCode, isPdf, sanitizeResults } from "../privacy.js";

const key = "11".repeat(32);

test("encrypted transcripts decrypt exactly and detect tampering", () => {
  const source = Buffer.from("%PDF-1.4\nprivate academic transcript");
  const encrypted = encryptTranscript(source, key);
  assert.notDeepEqual(encrypted.ciphertext, source);
  assert.deepEqual(decryptTranscript({ ...encrypted, auth_tag: encrypted.authTag }, key), source);
  const changed = Buffer.from(encrypted.ciphertext);
  changed[0] ^= 1;
  assert.throws(() => decryptTranscript({ ...encrypted, ciphertext: changed, auth_tag: encrypted.authTag }, key));
});

test("share codes are random and only their hashes need persistence", () => {
  const first = generateShareCode();
  const second = generateShareCode();
  assert.ok(first.length >= 20);
  assert.notEqual(first, second);
  assert.equal(hashShareCode(first), hashShareCode(first));
  assert.notEqual(hashShareCode(first), first);
});

test("academic results are bounded and normalized", () => {
  const result = sanitizeResults({ cgpa: 8, academicYear: " 2025/2026 ", courses: [{ code:" cs101 ", title:" Programming I ", credits:3, grade:"a" }] });
  assert.equal(result.cgpa, 5);
  assert.equal(result.academicYear, "2025/2026");
  assert.deepEqual(result.courses[0], { code:"cs101", title:"Programming I", credits:3, grade:"A", semester:"" });
  assert.equal(isPdf(Buffer.from("%PDF-1.7\n")), true);
  assert.equal(isPdf(Buffer.from("not a pdf")), false);
});

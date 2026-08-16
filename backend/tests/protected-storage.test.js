import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("protected document metadata and expiring shares persist", async () => {
  const directory = mkdtempSync(join(tmpdir(), "nexusverify-protected-"));
  process.env.DATABASE_PATH = join(directory, "test.db");
  delete process.env.DATABASE_URL;
  const db = await import(`../database.js?test=${Date.now()}`);
  await db.insertTranscript({
    id:"NXV-TEST-PROTECTED",studentName:"Test Graduate",matricNumber:"ATU/TEST/0001",
    programme:"B.Sc. Computer Science",award:"First Class Honours",documentHash:"a".repeat(64),
    transactionHash:"0x"+"b".repeat(64),blockNumber:1,gasUsed:"100",contractAddress:"0x"+"c".repeat(40),
    chainId:1337,issuedAt:new Date().toISOString(),
  });
  await db.saveTranscriptDocument({
    transcriptId:"NXV-TEST-PROTECTED",ciphertext:Buffer.from("encrypted"),iv:Buffer.alloc(12),authTag:Buffer.alloc(16),
    contentType:"application/pdf",originalName:"transcript.pdf",sizeBytes:42,
    resultsCiphertext:Buffer.from("encrypted-results"),resultsIv:Buffer.alloc(12),resultsAuthTag:Buffer.alloc(16),
  });
  assert.equal(await db.hasTranscriptDocument("NXV-TEST-PROTECTED"), true);
  const document = await db.getTranscriptDocument("NXV-TEST-PROTECTED");
  assert.equal(document.original_name, "transcript.pdf");
  await db.createTranscriptShare("NXV-TEST-PROTECTED", "share-hash", new Date(Date.now()+60_000).toISOString());
  const share = await db.useTranscriptShare("NXV-TEST-PROTECTED", "share-hash");
  assert.equal(share.transcript_id, "NXV-TEST-PROTECTED");
  assert.equal(await db.useTranscriptShare("NXV-TEST-PROTECTED", "wrong-hash"), undefined);
});

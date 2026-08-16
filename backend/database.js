import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = process.env.DATABASE_PATH
  ? resolve(process.env.DATABASE_PATH)
  : resolve(root, "transcript_storage/nexusverify.db");
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS transcripts (
    id TEXT PRIMARY KEY, student_name TEXT NOT NULL, matric_number TEXT NOT NULL UNIQUE,
    programme TEXT NOT NULL, award TEXT NOT NULL, document_hash TEXT NOT NULL UNIQUE,
    transaction_hash TEXT NOT NULL UNIQUE, block_number INTEGER NOT NULL,
    gas_used TEXT NOT NULL, contract_address TEXT NOT NULL, chain_id INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('Active','Revoked')), checks INTEGER NOT NULL DEFAULT 0,
    issued_at TEXT NOT NULL, revoked_at TEXT, revocation_tx TEXT, revocation_block INTEGER
  );
  CREATE TABLE IF NOT EXISTS audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, transcript_id TEXT,
    detail TEXT NOT NULL, transaction_hash TEXT, block_number INTEGER, created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_transcripts_hash ON transcripts(document_hash);
  CREATE INDEX IF NOT EXISTS idx_transcripts_matric ON transcripts(matric_number);
  CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at DESC);
  PRAGMA optimize;
`);

const meta = db.prepare("SELECT value FROM metadata WHERE key = ?");
export function bindContract(address) {
  const previous = meta.get("contract_address")?.value;
  if (previous && previous.toLowerCase() !== address.toLowerCase()) {
    const records = Number(db.prepare("SELECT COUNT(*) AS count FROM transcripts").get().count);
    if (records > 0) {
      throw new Error(
        `This database is already bound to contract ${previous}. Use a separate DATABASE_PATH for contract ${address}; records were not changed.`
      );
    }
  }
  db.prepare("INSERT INTO metadata(key,value) VALUES('contract_address',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(address);
}

export const countTranscripts = () => Number(db.prepare("SELECT COUNT(*) AS count FROM transcripts").get().count);
export const listTranscripts = () => db.prepare("SELECT * FROM transcripts ORDER BY issued_at DESC").all();
export const findTranscript = (value) => db.prepare("SELECT * FROM transcripts WHERE lower(id)=lower(?) OR lower(matric_number)=lower(?) OR lower(document_hash)=lower(?) LIMIT 1").get(value, value, value);
export const nextCredentialId = () => {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  for (let attempt = 0; attempt < 20; attempt++) {
    let suffix = "";
    for (let index = 0; index < 8; index++) suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
    const id = `NXV-${new Date().getFullYear()}-${suffix}`;
    if (!db.prepare("SELECT 1 FROM transcripts WHERE id=?").get(id)) return id;
  }
  throw new Error("Unable to allocate a unique credential ID");
};

export function insertTranscript(item) {
  db.prepare(`INSERT INTO transcripts(id,student_name,matric_number,programme,award,document_hash,transaction_hash,block_number,gas_used,contract_address,chain_id,status,issued_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(item.id,item.studentName,item.matricNumber,item.programme,item.award,item.documentHash,item.transactionHash,item.blockNumber,item.gasUsed,item.contractAddress,item.chainId,"Active",item.issuedAt);
}
export function markRevoked(id, proof) {
  db.prepare("UPDATE transcripts SET status='Revoked', revoked_at=?, revocation_tx=?, revocation_block=? WHERE id=?").run(new Date().toISOString(), proof.transactionHash, proof.blockNumber, id);
}
export const incrementChecks = (id) => db.prepare("UPDATE transcripts SET checks=checks+1 WHERE id=?").run(id);
export function addAudit(action, transcriptId, detail, proof={}) { db.prepare("INSERT INTO audit_events(action,transcript_id,detail,transaction_hash,block_number,created_at) VALUES(?,?,?,?,?,?)").run(action,transcriptId,detail,proof.transactionHash??null,proof.blockNumber??null,new Date().toISOString()); }
export const listAudit = () => db.prepare("SELECT * FROM audit_events ORDER BY created_at DESC LIMIT 100").all();

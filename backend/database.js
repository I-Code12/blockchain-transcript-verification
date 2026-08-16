import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const usePostgres = Boolean(process.env.DATABASE_URL?.trim());
let sqlite;
let pool;

if (usePostgres) {
  const { Pool } = await import("pg");
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
  });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS transcripts (
      id TEXT PRIMARY KEY, student_name TEXT NOT NULL, matric_number TEXT NOT NULL UNIQUE,
      programme TEXT NOT NULL, award TEXT NOT NULL, document_hash TEXT NOT NULL UNIQUE,
      transaction_hash TEXT NOT NULL UNIQUE, block_number BIGINT NOT NULL,
      gas_used TEXT NOT NULL, contract_address TEXT NOT NULL, chain_id BIGINT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('Active','Revoked')), checks INTEGER NOT NULL DEFAULT 0,
      issued_at TEXT NOT NULL, revoked_at TEXT, revocation_tx TEXT, revocation_block BIGINT
    );
    CREATE TABLE IF NOT EXISTS audit_events (
      id BIGSERIAL PRIMARY KEY, action TEXT NOT NULL, transcript_id TEXT,
      detail TEXT NOT NULL, transaction_hash TEXT, block_number BIGINT, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_transcripts_hash ON transcripts(document_hash);
    CREATE INDEX IF NOT EXISTS idx_transcripts_matric ON transcripts(matric_number);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at DESC);
  `);
} else {
  const dbPath = process.env.DATABASE_PATH
    ? resolve(process.env.DATABASE_PATH)
    : resolve(root, "transcript_storage/nexusverify.db");
  mkdirSync(dirname(dbPath), { recursive: true });
  sqlite = new DatabaseSync(dbPath);
  sqlite.exec(`
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
}

export const databaseEngine = usePostgres ? "PostgreSQL persistent" : "SQLite local";

export async function bindContract(address) {
  if (usePostgres) {
    const previous = (await pool.query("SELECT value FROM metadata WHERE key = $1", ["contract_address"])).rows[0]?.value;
    if (previous && previous.toLowerCase() !== address.toLowerCase()) {
      const records = Number((await pool.query("SELECT COUNT(*) AS count FROM transcripts")).rows[0].count);
      if (records > 0) throw new Error(`This database is already bound to contract ${previous}. Use a separate database for contract ${address}; records were not changed.`);
    }
    await pool.query("INSERT INTO metadata(key,value) VALUES('contract_address',$1) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value", [address]);
    return;
  }
  const previous = sqlite.prepare("SELECT value FROM metadata WHERE key = ?").get("contract_address")?.value;
  if (previous && previous.toLowerCase() !== address.toLowerCase()) {
    const records = Number(sqlite.prepare("SELECT COUNT(*) AS count FROM transcripts").get().count);
    if (records > 0) throw new Error(`This database is already bound to contract ${previous}. Use a separate DATABASE_PATH for contract ${address}; records were not changed.`);
  }
  sqlite.prepare("INSERT INTO metadata(key,value) VALUES('contract_address',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(address);
}

export async function countTranscripts() {
  if (usePostgres) return Number((await pool.query("SELECT COUNT(*) AS count FROM transcripts")).rows[0].count);
  return Number(sqlite.prepare("SELECT COUNT(*) AS count FROM transcripts").get().count);
}

export async function listTranscripts() {
  if (usePostgres) return (await pool.query("SELECT * FROM transcripts ORDER BY issued_at DESC")).rows;
  return sqlite.prepare("SELECT * FROM transcripts ORDER BY issued_at DESC").all();
}

export async function findTranscript(value) {
  if (usePostgres) return (await pool.query("SELECT * FROM transcripts WHERE lower(id)=lower($1) OR lower(matric_number)=lower($1) OR lower(document_hash)=lower($1) LIMIT 1", [value])).rows[0];
  return sqlite.prepare("SELECT * FROM transcripts WHERE lower(id)=lower(?) OR lower(matric_number)=lower(?) OR lower(document_hash)=lower(?) LIMIT 1").get(value, value, value);
}

export async function nextCredentialId() {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  for (let attempt = 0; attempt < 20; attempt++) {
    let suffix = "";
    for (let index = 0; index < 8; index++) suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
    const id = `NXV-${new Date().getFullYear()}-${suffix}`;
    const exists = usePostgres
      ? (await pool.query("SELECT 1 FROM transcripts WHERE id=$1", [id])).rowCount
      : sqlite.prepare("SELECT 1 FROM transcripts WHERE id=?").get(id);
    if (!exists) return id;
  }
  throw new Error("Unable to allocate a unique credential ID");
}

export async function insertTranscript(item) {
  const values = [item.id,item.studentName,item.matricNumber,item.programme,item.award,item.documentHash,item.transactionHash,item.blockNumber,item.gasUsed,item.contractAddress,item.chainId,"Active",item.issuedAt];
  if (usePostgres) {
    await pool.query(`INSERT INTO transcripts(id,student_name,matric_number,programme,award,document_hash,transaction_hash,block_number,gas_used,contract_address,chain_id,status,issued_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, values);
    return;
  }
  sqlite.prepare(`INSERT INTO transcripts(id,student_name,matric_number,programme,award,document_hash,transaction_hash,block_number,gas_used,contract_address,chain_id,status,issued_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(...values);
}

export async function markRevoked(id, proof) {
  const values = [new Date().toISOString(), proof.transactionHash, proof.blockNumber, id];
  if (usePostgres) await pool.query("UPDATE transcripts SET status='Revoked', revoked_at=$1, revocation_tx=$2, revocation_block=$3 WHERE id=$4", values);
  else sqlite.prepare("UPDATE transcripts SET status='Revoked', revoked_at=?, revocation_tx=?, revocation_block=? WHERE id=?").run(...values);
}

export async function incrementChecks(id) {
  if (usePostgres) await pool.query("UPDATE transcripts SET checks=checks+1 WHERE id=$1", [id]);
  else sqlite.prepare("UPDATE transcripts SET checks=checks+1 WHERE id=?").run(id);
}

export async function addAudit(action, transcriptId, detail, proof={}) {
  const values = [action,transcriptId,detail,proof.transactionHash??null,proof.blockNumber??null,new Date().toISOString()];
  if (usePostgres) await pool.query("INSERT INTO audit_events(action,transcript_id,detail,transaction_hash,block_number,created_at) VALUES($1,$2,$3,$4,$5,$6)", values);
  else sqlite.prepare("INSERT INTO audit_events(action,transcript_id,detail,transaction_hash,block_number,created_at) VALUES(?,?,?,?,?,?)").run(...values);
}

export async function listAudit() {
  if (usePostgres) return (await pool.query("SELECT * FROM audit_events ORDER BY created_at DESC LIMIT 100")).rows;
  return sqlite.prepare("SELECT * FROM audit_events ORDER BY created_at DESC LIMIT 100").all();
}

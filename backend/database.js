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
    CREATE TABLE IF NOT EXISTS transcript_documents (
      transcript_id TEXT PRIMARY KEY REFERENCES transcripts(id) ON DELETE CASCADE,
      ciphertext BYTEA NOT NULL, iv BYTEA NOT NULL, auth_tag BYTEA NOT NULL,
      content_type TEXT NOT NULL, original_name TEXT NOT NULL, size_bytes BIGINT NOT NULL,
      results_ciphertext BYTEA NOT NULL, results_iv BYTEA NOT NULL, results_auth_tag BYTEA NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS transcript_shares (
      id BIGSERIAL PRIMARY KEY, transcript_id TEXT NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL,
      revoked_at TEXT, views INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS transcript_access_requests (
      id BIGSERIAL PRIMARY KEY, transcript_id TEXT NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE, requester_name TEXT NOT NULL, organization TEXT NOT NULL,
      purpose TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('Pending','Approved','Denied','Expired')),
      created_at TEXT NOT NULL, expires_at TEXT NOT NULL, decided_at TEXT, access_expires_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_transcripts_hash ON transcripts(document_hash);
    CREATE INDEX IF NOT EXISTS idx_transcripts_matric ON transcripts(matric_number);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_shares_transcript_expiry ON transcript_shares(transcript_id, expires_at);
    CREATE INDEX IF NOT EXISTS idx_access_requests_status_created ON transcript_access_requests(status, created_at DESC);
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
    CREATE TABLE IF NOT EXISTS transcript_documents (
      transcript_id TEXT PRIMARY KEY REFERENCES transcripts(id) ON DELETE CASCADE,
      ciphertext BLOB NOT NULL, iv BLOB NOT NULL, auth_tag BLOB NOT NULL,
      content_type TEXT NOT NULL, original_name TEXT NOT NULL, size_bytes INTEGER NOT NULL,
      results_ciphertext BLOB NOT NULL, results_iv BLOB NOT NULL, results_auth_tag BLOB NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS transcript_shares (
      id INTEGER PRIMARY KEY AUTOINCREMENT, transcript_id TEXT NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL,
      revoked_at TEXT, views INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS transcript_access_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT, transcript_id TEXT NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE, requester_name TEXT NOT NULL, organization TEXT NOT NULL,
      purpose TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('Pending','Approved','Denied','Expired')),
      created_at TEXT NOT NULL, expires_at TEXT NOT NULL, decided_at TEXT, access_expires_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_transcripts_hash ON transcripts(document_hash);
    CREATE INDEX IF NOT EXISTS idx_transcripts_matric ON transcripts(matric_number);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_shares_transcript_expiry ON transcript_shares(transcript_id, expires_at);
    CREATE INDEX IF NOT EXISTS idx_access_requests_status_created ON transcript_access_requests(status, created_at DESC);
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

export async function saveTranscriptDocument(item) {
  const values = [item.transcriptId,item.ciphertext,item.iv,item.authTag,item.contentType,item.originalName,item.sizeBytes,item.resultsCiphertext,item.resultsIv,item.resultsAuthTag,new Date().toISOString()];
  if (usePostgres) {
    await pool.query(`INSERT INTO transcript_documents(transcript_id,ciphertext,iv,auth_tag,content_type,original_name,size_bytes,results_ciphertext,results_iv,results_auth_tag,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT(transcript_id) DO UPDATE SET ciphertext=EXCLUDED.ciphertext,iv=EXCLUDED.iv,auth_tag=EXCLUDED.auth_tag,content_type=EXCLUDED.content_type,original_name=EXCLUDED.original_name,size_bytes=EXCLUDED.size_bytes,results_ciphertext=EXCLUDED.results_ciphertext,results_iv=EXCLUDED.results_iv,results_auth_tag=EXCLUDED.results_auth_tag,created_at=EXCLUDED.created_at`, values);
    return;
  }
  sqlite.prepare(`INSERT INTO transcript_documents(transcript_id,ciphertext,iv,auth_tag,content_type,original_name,size_bytes,results_ciphertext,results_iv,results_auth_tag,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(transcript_id) DO UPDATE SET ciphertext=excluded.ciphertext,iv=excluded.iv,auth_tag=excluded.auth_tag,content_type=excluded.content_type,original_name=excluded.original_name,size_bytes=excluded.size_bytes,results_ciphertext=excluded.results_ciphertext,results_iv=excluded.results_iv,results_auth_tag=excluded.results_auth_tag,created_at=excluded.created_at`).run(...values);
}

export async function getTranscriptDocument(id) {
  if (usePostgres) return (await pool.query("SELECT * FROM transcript_documents WHERE transcript_id=$1", [id])).rows[0];
  return sqlite.prepare("SELECT * FROM transcript_documents WHERE transcript_id=?").get(id);
}

export async function hasTranscriptDocument(id) {
  if (usePostgres) return Boolean((await pool.query("SELECT 1 FROM transcript_documents WHERE transcript_id=$1", [id])).rowCount);
  return Boolean(sqlite.prepare("SELECT 1 FROM transcript_documents WHERE transcript_id=?").get(id));
}

export async function createTranscriptShare(transcriptId, tokenHash, expiresAt) {
  const now = new Date().toISOString();
  if (usePostgres) {
    await pool.query("INSERT INTO transcript_shares(transcript_id,token_hash,expires_at,created_at) VALUES($1,$2,$3,$4)", [transcriptId,tokenHash,expiresAt,now]);
    return;
  }
  sqlite.prepare("INSERT INTO transcript_shares(transcript_id,token_hash,expires_at,created_at) VALUES(?,?,?,?)").run(transcriptId,tokenHash,expiresAt,now);
}

export async function useTranscriptShare(transcriptId, tokenHash) {
  const now = new Date().toISOString();
  if (usePostgres) {
    const row = (await pool.query("SELECT * FROM transcript_shares WHERE transcript_id=$1 AND token_hash=$2 AND revoked_at IS NULL AND expires_at>$3 LIMIT 1", [transcriptId,tokenHash,now])).rows[0];
    if (row) await pool.query("UPDATE transcript_shares SET views=views+1 WHERE id=$1", [row.id]);
    return row;
  }
  const row = sqlite.prepare("SELECT * FROM transcript_shares WHERE transcript_id=? AND token_hash=? AND revoked_at IS NULL AND expires_at>? LIMIT 1").get(transcriptId,tokenHash,now);
  if (row) sqlite.prepare("UPDATE transcript_shares SET views=views+1 WHERE id=?").run(row.id);
  return row;
}

export async function createAccessRequest({transcriptId, tokenHash, requesterName, organization, purpose, expiresAt}) {
  const createdAt = new Date().toISOString();
  const values = [transcriptId,tokenHash,requesterName,organization,purpose,"Pending",createdAt,expiresAt];
  if (usePostgres) {
    return (await pool.query(`INSERT INTO transcript_access_requests(transcript_id,token_hash,requester_name,organization,purpose,status,created_at,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, values)).rows[0];
  }
  const result = sqlite.prepare(`INSERT INTO transcript_access_requests(transcript_id,token_hash,requester_name,organization,purpose,status,created_at,expires_at)
    VALUES(?,?,?,?,?,?,?,?)`).run(...values);
  return sqlite.prepare("SELECT * FROM transcript_access_requests WHERE id=?").get(result.lastInsertRowid);
}

export async function listAccessRequests() {
  const now = new Date().toISOString();
  if (usePostgres) {
    await pool.query("UPDATE transcript_access_requests SET status='Expired' WHERE status='Pending' AND expires_at<=$1", [now]);
    await pool.query("UPDATE transcript_access_requests SET status='Expired' WHERE status='Approved' AND access_expires_at<=$1", [now]);
    return (await pool.query(`SELECT r.*,t.student_name,t.matric_number FROM transcript_access_requests r
      JOIN transcripts t ON t.id=r.transcript_id ORDER BY CASE r.status WHEN 'Pending' THEN 0 ELSE 1 END,r.created_at DESC LIMIT 100`)).rows;
  }
  sqlite.prepare("UPDATE transcript_access_requests SET status='Expired' WHERE status='Pending' AND expires_at<=?").run(now);
  sqlite.prepare("UPDATE transcript_access_requests SET status='Expired' WHERE status='Approved' AND access_expires_at<=?").run(now);
  return sqlite.prepare(`SELECT r.*,t.student_name,t.matric_number FROM transcript_access_requests r
    JOIN transcripts t ON t.id=r.transcript_id ORDER BY CASE r.status WHEN 'Pending' THEN 0 ELSE 1 END,r.created_at DESC LIMIT 100`).all();
}

export async function findAccessRequestByToken(tokenHash) {
  const now = new Date().toISOString();
  if (usePostgres) {
    await pool.query("UPDATE transcript_access_requests SET status='Expired' WHERE token_hash=$1 AND status='Pending' AND expires_at<=$2", [tokenHash,now]);
    await pool.query("UPDATE transcript_access_requests SET status='Expired' WHERE token_hash=$1 AND status='Approved' AND access_expires_at<=$2", [tokenHash,now]);
    return (await pool.query("SELECT * FROM transcript_access_requests WHERE token_hash=$1 LIMIT 1", [tokenHash])).rows[0];
  }
  sqlite.prepare("UPDATE transcript_access_requests SET status='Expired' WHERE token_hash=? AND status='Pending' AND expires_at<=?").run(tokenHash,now);
  sqlite.prepare("UPDATE transcript_access_requests SET status='Expired' WHERE token_hash=? AND status='Approved' AND access_expires_at<=?").run(tokenHash,now);
  return sqlite.prepare("SELECT * FROM transcript_access_requests WHERE token_hash=? LIMIT 1").get(tokenHash);
}

export async function approveAccessRequest(id, accessExpiresAt) {
  const decidedAt = new Date().toISOString();
  if (usePostgres) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const row = (await client.query("SELECT * FROM transcript_access_requests WHERE id=$1 FOR UPDATE", [id])).rows[0];
      if (!row) throw new Error("Access request not found");
      if (row.status !== "Pending") throw new Error(`Access request is already ${row.status.toLowerCase()}`);
      if (row.expires_at <= decidedAt) throw new Error("Access request has expired");
      await client.query("INSERT INTO transcript_shares(transcript_id,token_hash,expires_at,created_at) VALUES($1,$2,$3,$4)", [row.transcript_id,row.token_hash,accessExpiresAt,decidedAt]);
      const updated = (await client.query("UPDATE transcript_access_requests SET status='Approved',decided_at=$1,access_expires_at=$2 WHERE id=$3 RETURNING *", [decidedAt,accessExpiresAt,id])).rows[0];
      await client.query("COMMIT");
      return updated;
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  sqlite.exec("BEGIN IMMEDIATE");
  try {
    const row = sqlite.prepare("SELECT * FROM transcript_access_requests WHERE id=?").get(id);
    if (!row) throw new Error("Access request not found");
    if (row.status !== "Pending") throw new Error(`Access request is already ${row.status.toLowerCase()}`);
    if (row.expires_at <= decidedAt) throw new Error("Access request has expired");
    sqlite.prepare("INSERT INTO transcript_shares(transcript_id,token_hash,expires_at,created_at) VALUES(?,?,?,?)").run(row.transcript_id,row.token_hash,accessExpiresAt,decidedAt);
    sqlite.prepare("UPDATE transcript_access_requests SET status='Approved',decided_at=?,access_expires_at=? WHERE id=?").run(decidedAt,accessExpiresAt,id);
    const updated=sqlite.prepare("SELECT * FROM transcript_access_requests WHERE id=?").get(id);
    sqlite.exec("COMMIT");
    return updated;
  } catch(error) {
    sqlite.exec("ROLLBACK");
    throw error;
  }
}

export async function denyAccessRequest(id) {
  const decidedAt = new Date().toISOString();
  if (usePostgres) {
    const row=(await pool.query("SELECT * FROM transcript_access_requests WHERE id=$1",[id])).rows[0];
    if(!row)throw new Error("Access request not found");
    if(row.status!=="Pending")throw new Error(`Access request is already ${row.status.toLowerCase()}`);
    return (await pool.query("UPDATE transcript_access_requests SET status='Denied',decided_at=$1 WHERE id=$2 RETURNING *", [decidedAt,id])).rows[0];
  }
  const row=sqlite.prepare("SELECT * FROM transcript_access_requests WHERE id=?").get(id);
  if(!row)throw new Error("Access request not found");
  if(row.status!=="Pending")throw new Error(`Access request is already ${row.status.toLowerCase()}`);
  sqlite.prepare("UPDATE transcript_access_requests SET status='Denied',decided_at=? WHERE id=?").run(decidedAt,id);
  return sqlite.prepare("SELECT * FROM transcript_access_requests WHERE id=?").get(id);
}

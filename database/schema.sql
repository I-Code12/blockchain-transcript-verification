CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transcripts (
  id TEXT PRIMARY KEY,
  student_name TEXT NOT NULL,
  matric_number TEXT NOT NULL UNIQUE,
  programme TEXT NOT NULL,
  award TEXT NOT NULL,
  document_hash TEXT NOT NULL UNIQUE,
  transaction_hash TEXT NOT NULL UNIQUE,
  block_number BIGINT NOT NULL,
  gas_used TEXT NOT NULL,
  contract_address TEXT NOT NULL,
  chain_id BIGINT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Active', 'Revoked')),
  checks INTEGER NOT NULL DEFAULT 0,
  issued_at TEXT NOT NULL,
  revoked_at TEXT,
  revocation_tx TEXT,
  revocation_block BIGINT
);

CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  transcript_id TEXT,
  detail TEXT NOT NULL,
  transaction_hash TEXT,
  block_number BIGINT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transcripts_hash ON transcripts(document_hash);
CREATE INDEX IF NOT EXISTS idx_transcripts_matric ON transcripts(matric_number);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at DESC);

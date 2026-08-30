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

CREATE TABLE IF NOT EXISTS transcript_documents (
  transcript_id TEXT PRIMARY KEY REFERENCES transcripts(id) ON DELETE CASCADE,
  ciphertext BYTEA NOT NULL,
  iv BYTEA NOT NULL,
  auth_tag BYTEA NOT NULL,
  content_type TEXT NOT NULL,
  original_name TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  results_ciphertext BYTEA NOT NULL,
  results_iv BYTEA NOT NULL,
  results_auth_tag BYTEA NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transcript_shares (
  id BIGSERIAL PRIMARY KEY,
  transcript_id TEXT NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  views INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transcript_access_requests (
  id BIGSERIAL PRIMARY KEY,
  transcript_id TEXT NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  requester_name TEXT NOT NULL,
  organization TEXT NOT NULL,
  purpose TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Pending', 'Approved', 'Denied', 'Expired')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  decided_at TEXT,
  access_expires_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_transcripts_hash ON transcripts(document_hash);
CREATE INDEX IF NOT EXISTS idx_transcripts_matric ON transcripts(matric_number);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shares_transcript_expiry ON transcript_shares(transcript_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_access_requests_status_created ON transcript_access_requests(status, created_at DESC);

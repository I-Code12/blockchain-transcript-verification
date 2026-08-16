# System architecture

```text
Registrar portal ──► blockchain API ──► persistent SQLite database
       │                    │
       │                    └──► ethers.js ──► TranscriptRegistry contract
       │                                             │
Public verifier ───── credential ID / SHA-256 ───────┘
       │
       └──► scannable QR verification link
```

The on-chain layer stores a credential key, document hash, issuance timestamp and revocation flag. Personal data and transcript documents remain off-chain. A persistent Ganache Ethereum node mines genuine transactions, ethers.js submits registrar operations, SQLite stores searchable academic metadata, and verification reads the deployed contract state rather than trusting the database alone.

## Trust boundary

- The smart contract is authoritative for whether a hash was issued or revoked.
- SQLite is authoritative only for searchable off-chain graduate metadata.
- The browser sends a document to the local API for hashing but the API never stores its contents.
- Transaction hashes and block numbers come from Ethereum receipts.

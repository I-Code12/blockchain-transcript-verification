# NexusVerify - Blockchain Graduate Transcript Verification

NexusVerify is a working blockchain prototype for Accra Technical University. It issues graduate transcript credentials, anchors their SHA-256 document fingerprints on Ethereum Sepolia, verifies them through a public QR link, and records revocations on-chain.

## What the prototype includes

- Public verification portal with no ChatGPT account or university login required
- Registrar-only issuance, revocation, result sharing, and audit controls
- Genuine Sepolia transactions, block numbers, contract address, and explorer links
- SHA-256 fingerprint of the exact approved transcript PDF anchored on-chain
- AES-256-GCM encryption for the off-chain PDF and structured course results
- Random, expiring transcript access links; only the code hash is stored
- Rate limiting and audit logging for denied protected-record requests
- A protected results table and access to the exact encrypted source PDF
- PostgreSQL persistence on Render and SQLite for the local backup
- Scannable QR codes, signed verification certificates, and technical JSON proofs

## Public deployment

- Website: `https://nexusverify-frontend.onrender.com`
- API health: `https://nexusverify-api.onrender.com/health`
- Network: Ethereum Sepolia, chain ID `11155111`
- Contract: `0xbE9980E9DdDb08d4A606B3B89c1048F1fC62f2A4`

Render may take a short time to wake a free service after inactivity.

## How a protected transcript is shared

1. An authorised registrar uploads the approved PDF and enters its structured course results.
2. NexusVerify encrypts the PDF and results before storing them in the database.
3. The exact PDF hash is issued to the Sepolia smart contract.
4. The QR code opens the public verification page, which shows identity, qualification, status, and blockchain proof only.
5. From **Transcript records**, the registrar creates a temporary results link.
6. The link carries its secret access code in the browser URL fragment, which is not sent in ordinary web requests.
7. The recipient can temporarily view the results and original PDF; every successful or denied access attempt is audited.

Only credentials issued after protected storage was added contain viewable results. Older credentials continue to verify normally but do not expose a transcript document.

## Required deployment secrets

Configure these only in the hosting provider; never commit them:

- `DATABASE_URL`
- `ADMIN_API_KEY`
- `TRANSCRIPT_ENCRYPTION_KEY` (32 random bytes, encoded as 64 hexadecimal characters)
- `SEPOLIA_RPC_URL`
- `REGISTRAR_PRIVATE_KEY`

The MetaMask recovery phrase is never used by the application and must never be shared.

## Run locally on Windows

Double-click `START_NEXUSVERIFY.cmd`. It starts the local Ethereum node, deploys or reuses the contract, starts the API and website, then opens the application.

For a first-time installation:

```powershell
cd blockchain
npm install
cd ../backend
npm install
cd ../frontend
npm install
cd ..
START_NEXUSVERIFY.cmd
```

## Verification and tests

```powershell
cd backend
npm test

cd ../frontend
npm test

cd ../blockchain
npm test
```

Cloud deployment and demonstration checks are documented in `documentation/CLOUD_DEPLOYMENT.md`.

## Academic scope

This is a real, presentable blockchain prototype: the smart contract and its transactions run on the public Ethereum Sepolia test network. It is not yet an institutionally commissioned production records system. Production adoption would additionally require university identity integration, key custody procedures, privacy approval, backups, monitoring, accessibility assessment, penetration testing, and an institutional operations policy.

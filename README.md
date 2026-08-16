# NexusVerify — Blockchain Graduate Transcript Verification

NexusVerify is a working local Ethereum system for issuing, hashing, anchoring, verifying and revoking graduate transcripts. Transcript documents remain off-chain while their cryptographic proofs are stored in a deployed Solidity smart contract.

## Included

- Polished registrar dashboard and public verification portal
- SHA-256 hashing with genuine Ethereum issuance and revocation transactions
- Persistent local Ethereum chain with real receipts and block numbers
- Node.js API connected to the smart contract through ethers.js
- Persistent SQLite transcript and audit records
- Real scannable verification QR codes
- One-page signed PDF verification certificates for presentation and sharing
- Registrar-signed technical JSON proofs with locally verified Ethereum signatures
- Public-host configuration with protected registrar operations
- Public-testnet deployment scripts and cloud storage safeguards
- Solidity `TranscriptRegistry` contract and on-chain integration tests

## Start the complete system

On Windows, double-click `START_NEXUSVERIFY.cmd`. It starts the Ethereum node, deploys or reuses the contract, starts the blockchain API and website, then opens the application.

The first launch seeds three genuine on-chain records. The chain, contract and academic records persist across restarts.

Each transcript record can export a signed PDF certificate. The certificate is a portable receipt containing the document hash, issuance transaction, mined block, contract address, chain ID, live-status QR code, proof hash and Ethereum registrar signature. The signed JSON export remains available for technical inspection.

## First-time installation

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

## Verify the contract

With the system running:

```powershell
cd blockchain
npm test
```

The test submits genuine issuance and revocation transactions and checks their mined receipts and contract state.

## Public prototype

The public verifier is available at `https://nexusverify-frontend.onrender.com` and the API health endpoint is `https://nexusverify-api.onrender.com/health`. No ChatGPT login is required. The local system remains the offline backup. For deployment and QR acceptance tests, follow `documentation/CLOUD_DEPLOYMENT.md`. The public configuration uses a Render frontend, secured Node API, PostgreSQL datastore and an Ethereum Sepolia contract. Local mode continues to use SQLite.

## Important scope note

This is a real local-blockchain academic prototype, not a production university records system. It uses a persistent development Ethereum chain (chain ID 1337), a locally controlled registrar wallet and SQLite. Production use requires institutional identity, encrypted document storage, a managed wallet, deployment to an approved EVM network, privacy approval and independent security testing.

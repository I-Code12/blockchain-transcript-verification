# NexusVerify - Accra Technical University Submission

## Project title

Blockchain-Based Graduate Transcript Verification System

## Submission contents

This folder contains the complete source code, Solidity smart contract, local demonstration launcher, public Sepolia deployment evidence, database schema, tests and operating documentation for NexusVerify.

## Recommended demonstration from any PC

1. Double-click `OPEN_NEXUSVERIFY_ONLINE.cmd`, or open `https://nexusverify-frontend.onrender.com` directly.
2. Wait briefly if the free Render service is waking after inactivity.
3. Confirm the interface shows **Ethereum online**, **Ethereum Sepolia** and chain ID `11155111`.
4. Public verification requires no account. Registrar operations require the university's Render `ADMIN_API_KEY`; this secret is deliberately not included in the submitted files.

This online method uses the existing Render frontend, Render API, persistent PostgreSQL database and deployed Ethereum Sepolia contract. It does not depend on the computer used to develop the project.

## Optional local fallback on Windows

1. Extract the submitted ZIP file.
2. Install Node.js 22 or newer from `https://nodejs.org/` if necessary.
3. Double-click `START_NEXUSVERIFY.cmd` only when the hosted system is unavailable or an offline classroom demonstration is required.
4. The first run installs the required components and may take several minutes.
5. When the browser opens, keep the launcher window running.
6. Open the generated `REGISTRAR_ACCESS.txt` file to obtain the local registrar access key.

The launcher starts a private local Ethereum chain, deploys the TranscriptRegistry smart contract, starts the encrypted API and database, and opens the university interface at `http://localhost:3000`.

## Public prototype evidence

- Public application: `https://nexusverify-frontend.onrender.com`
- API health: `https://nexusverify-api.onrender.com/health`
- Ethereum network: Sepolia, chain ID `11155111`
- TranscriptRegistry contract: `0xbE9980E9DdDb08d4A606B3B89c1048F1fC62f2A4`

The public deployment may take a short time to wake after inactivity.

## How an external verifier gets protected results

The QR certificate performs public verification and intentionally does not reveal grades. After verifying, an employer or institution selects **Request temporary transcript access**, supplies their identity, organisation and reason, then keeps the private tracking page. The registrar opens **Access requests** and approves or denies the request. Approval automatically unlocks that same private page for one hour. The registrar can still create a secure link directly from **Transcript records** when appropriate.

## Important submission safety

Use only demonstration records. Never include a wallet recovery phrase, private key, live hosting secret, personal RPC credential or genuine student transcript in the submitted package.

For the complete procedure, read `documentation/SCHOOL_SUBMISSION_GUIDE.md` and the included User and System Handbook.

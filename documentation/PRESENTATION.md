# NexusVerify presentation guide

## Problem

Paper and PDF transcripts are slow to authenticate, easy to alter, and force employers to contact registrars manually.

## Solution

NexusVerify creates a SHA-256 fingerprint of each approved transcript and anchors that proof to a deployed Ethereum smart contract. The document remains private; employers verify its fingerprint, issuer and revocation status in seconds.

## Demonstration flow

1. Start the system with `START_NEXUSVERIFY.cmd`.
2. On **Overview**, show the live Ethereum chain ID, latest block and deployed contract address.
3. Open **Issue transcript**, enter a graduate, select a file, then click **Hash & issue credential**.
4. Show the genuine transaction hash and mined block in **Transcript records**.
5. Open **Public verifier**, select **Use on-chain credential**, and show the scannable QR proof.
6. Download the signed PDF certificate and point out its live-status QR, document hash, transaction, block, contract and registrar signature.
7. Revoke the credential, then verify it again to show the smart-contract warning.
8. Open **Audit trail** to show the persistent event and transaction evidence.

## What makes this a real blockchain prototype

- The Solidity contract is compiled and deployed to an Ethereum-compatible node.
- Issuance and revocation are signed transactions mined into real blocks.
- The dashboard displays receipt-derived transaction hashes and block numbers.
- Verification reads deployed contract state rather than trusting the database alone.
- Portable certificates are cryptographically signed by the registrar's Ethereum account.
- Signed technical JSON allows the proof hash and recovered registrar address to be checked independently.
- Blockchain state and SQLite records persist across restarts.

## Security design

- SHA-256 exposes any change to a transcript.
- The contract restricts issuance and revocation to the registrar account.
- Only document fingerprints are stored on-chain.
- Revocation never deletes blockchain history.
- QR codes contain verification links, not private academic data.

## Production next steps

Connect university identity, use encrypted document storage, protect the registrar key with a managed wallet, deploy to an approved EVM network, commission an independent security review, and complete institutional data-protection approval.

# NexusVerify School Submission Guide

## Submission identity

- Institution: Accra Technical University
- Project: NexusVerify - Blockchain-Based Graduate Transcript Verification System
- Prototype type: Hybrid blockchain application
- Public blockchain: Ethereum Sepolia test network
- Local demonstration blockchain: NexusVerify Local Ethereum

## What to submit

Submit the complete standalone package together with the Chapters Four and Five document and the User and System Handbook. Do not include real student transcripts, wallet recovery phrases, private keys, hosting secrets or personal RPC credentials.

## Recommended hosted demonstration

1. Open `https://nexusverify-frontend.onrender.com` from any computer, or double-click `OPEN_NEXUSVERIFY_ONLINE.cmd`.
2. Allow a short wake-up period if the free Render services have been inactive.
3. Confirm that the interface reports Ethereum Sepolia, chain ID 11155111 and an online contract.
4. Public verification needs no account. Registrar operations use the same `ADMIN_API_KEY` configured privately in Render.

The online application uses Render for the frontend, API and persistent PostgreSQL database. Blockchain evidence is read from and written to the deployed Ethereum Sepolia contract. No local development computer or external identity service is required.

## Optional local fallback

1. Extract the package to a normal folder on a Windows computer.
2. Install Node.js 22 or newer if it is not already installed.
3. Double-click `START_NEXUSVERIFY.cmd`.
4. On first use, allow the launcher to install the project components.
5. Keep the launcher window open while demonstrating the system.
6. The application opens at `http://localhost:3000`.
7. Open `REGISTRAR_ACCESS.txt`, which the launcher creates, and paste the local registrar key into the Registrar access screen.

No third-party account is required for the local demonstration.

## Demonstrating the system

1. Show the Overview and confirm that the blockchain and API are online.
2. Open Issue transcript and enter approved demonstration graduate details.
3. Upload a non-confidential demonstration PDF and add sample course results.
4. Issue the credential and show its transaction, block number and document hash.
5. Download the certificate and scan its QR code to open the public verifier.
6. Explain that the QR proves identity, award, current status and blockchain evidence but deliberately does not expose grades.
7. From the verified record, submit a temporary access request as an external employer or institution and keep the private tracking page open.
8. In the registrar workspace, open **Access requests**, review the requester and reason, then approve access for one hour.
9. Return to the requester's private page and select **Check status now** (or wait for the automatic check) to unlock the protected course results and encrypted source PDF.
10. Return to **Audit trail** to show the request, approval and viewing events. Demonstrate the alternative **Share** action if desired, then revoke the credential and verify it again.

## Understanding the two access keys

The registrar access key protects university administration functions. It is created for the local demonstration when the launcher first runs.

The transcript results access token is different. For an external request it is created in the requester's private tracking link after `#request=`; only its hash is stored. After approval, the same token provides access for one hour, so the registrar does not need to communicate a code manually. The registrar-created **Share** link remains available and carries its token after `#access=`. Both methods expire automatically and are audited.

The public QR never contains grades or the transcript PDF. This separation is an intentional privacy control, not a missing feature.

## Submission boundary

The package is a working academic prototype and a defensible demonstration of blockchain-based verification. Institutional production use would additionally require university single sign-on, managed key custody, privacy and records-retention approval, independent security testing, monitored hosting, backups and formal operational ownership.

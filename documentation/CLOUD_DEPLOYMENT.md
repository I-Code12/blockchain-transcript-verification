# NexusVerify public prototype deployment

This project is prepared for a public verifier, a secured registrar API, persistent storage and an Ethereum public test network. The local launcher remains available as a backup demonstration.

## Security rules

- Use a new demonstration-only Ethereum wallet. Never reuse a personal wallet.
- Keep `REGISTRAR_PRIVATE_KEY`, `ADMIN_API_KEY` and the RPC provider URL in hosting secrets only.
- Never commit `.env`, real transcripts or private keys.
- Do not enable `SEED_DEMO_DATA` in production.
- Use a separate `DATABASE_PATH` for every deployed contract. The application refuses to erase or silently rebind an existing database.

## 1. Prepare the public Ethereum contract

Create a demonstration wallet and fund it with test-network ETH. The project includes `DEPLOY_SEPOLIA.cmd`, which prompts for the rotated RPC URL and private key locally, checks chain ID `11155111`, confirms the key belongs to the expected registrar wallet, deploys the contract and clears the secret environment values. The secrets are not written to the project.

Before double-clicking the launcher:

1. Rotate any RPC key that has been pasted into a chat or screenshot.
2. Confirm the expected wallet in `scripts/deploy-sepolia.ps1` is a dedicated demonstration wallet.
3. Fund that wallet with Sepolia test ETH.

For a manual deployment, set these values temporarily in the terminal session used for deployment:

```text
BLOCKCHAIN_DEPLOYMENT=sepolia
BLOCKCHAIN_NETWORK_NAME=Ethereum Sepolia
BLOCKCHAIN_RPC_URL=<HTTPS RPC endpoint>
BLOCK_EXPLORER_URL=https://sepolia.etherscan.io
REGISTRAR_PRIVATE_KEY=<demonstration wallet private key>
EXPECTED_REGISTRAR_ADDRESS=<public demonstration wallet address>
EXPECTED_CHAIN_ID=11155111
```

From `blockchain`, run `npm run compile`, `npm run preflight:public`, and then `npm run deploy`. The deployer writes `blockchain/deployments/sepolia.json` with the public contract address, ABI, transaction and block. It does not store the public RPC URL or private key.

## 2. Deploy the secured API

The root `render.yaml` describes the Node API and a PostgreSQL datastore. Create the service from the repository and provide these secret values in the hosting dashboard:

- `BLOCKCHAIN_RPC_URL`
- `REGISTRAR_PRIVATE_KEY`
- `ADMIN_API_KEY` using at least 24 random characters
- `PUBLIC_APP_URL`, `FRONTEND_URL` and `FRONTEND_URLS` are configured for `https://nexusverify-frontend.onrender.com`. Change all three together if the public domain changes.

The production server listens on `0.0.0.0`, uses the assigned `PORT`, refuses to start without the registrar key and access key, and uses `DATABASE_URL` for PostgreSQL. Local mode continues to use SQLite. Render's free PostgreSQL service expires after 30 days, so create it close to the submission date or upgrade it for longer availability.

## 3. Publish the website

The public website is deployed as the free Render web service `nexusverify-frontend` at `https://nexusverify-frontend.onrender.com`. It builds from the `frontend` directory with `npm ci && npm run build`, starts with `npm start`, and uses `VITE_API_URL=https://nexusverify-api.onrender.com` and `VITE_PUBLIC_MODE=true`. Public mode opens directly on credential verification; registrar screens remain protected by the access key. The QR generator uses `PUBLIC_APP_URL`, so every newly downloaded certificate points to the public Render website rather than `localhost` or a private hosting URL.

The `.openai/hosting.json` file remains only as an optional development/backup deployment configuration. The submission URL does not require a ChatGPT account.

## 4. Acceptance test

Complete all of these before submission:

1. Open the public website from a phone using mobile data, not the computer's Wi-Fi hotspot.
2. Verify an active credential by typing its credential ID.
3. Download its PDF and scan the QR from a second device.
4. Confirm that the displayed transaction opens on the test-network explorer.
5. Sign in with the registrar access key and issue a new demonstration credential.
6. Verify it, revoke it, and confirm that the same QR now reports revoked.
7. Restart or redeploy the API and confirm the database records remain.
8. Confirm that issuance, revocation, transcript lists and audit history return `401` without the access key.

## Submission evidence

Include the public verifier URL, API health URL, contract address, explorer link, one active credential, one revoked credential, source repository, test output, signed PDF, technical JSON proof, deployment guide and a short demonstration video.

## Production boundary

This is an academic public-testnet prototype. A university production deployment still requires institutional identity, a managed signing key or hardware wallet, encrypted transcript storage, privacy approval, monitoring and an independent security assessment.

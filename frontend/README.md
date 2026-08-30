# NexusVerify frontend

This is the Accra Technical University interface for the NexusVerify blockchain transcript verification prototype.

It provides:

- a public credential verifier that needs no user account;
- a protected registrar workspace for issuance, sharing, revocation and audit review;
- QR verification, certificates and technical blockchain proofs; and
- consent-protected transcript results and source-PDF viewing.

The frontend connects to the NexusVerify API using `VITE_API_URL`. Local startup is handled by the root `START_NEXUSVERIFY.cmd` launcher. Public verification does not require an external identity account.

For development:

```text
npm install
npm run dev
npm test
```

# Contract acceptance tests

1. The deployer becomes the registrar.
2. Only the registrar can issue and revoke credentials.
3. A credential ID cannot be issued twice.
4. A matching document hash verifies successfully.
5. A modified document hash fails verification.
6. A revoked credential remains discoverable but is never reported authentic.

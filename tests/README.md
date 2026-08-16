# End-to-end acceptance checklist

- Dashboard renders correctly at desktop and mobile widths.
- Issuing with and without a file generates a 64-character SHA-256 hash.
- A newly issued credential appears first in the register.
- ID, matriculation number and exact hash all locate a credential.
- Unknown identifiers return a clear failure state.
- Revocation changes future verification results without deleting the record.
- Verification proof downloads as readable JSON.
- Keyboard focus and form labels are present for core flows.

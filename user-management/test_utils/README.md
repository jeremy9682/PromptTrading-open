# test_utils

Local-only developer utilities for the user-management service.

## test_wallet.js

Generates a wallet signature for manual testing of the wallet-based auth flow.
Uses a dummy private key — **not** a real wallet. Run with:

```bash
node test_utils/test_wallet.js
```

The output (address + signature) can be used against the local Strapi auth endpoint
to verify the signature-validation middleware without a real browser wallet.

# cTrader Personal Token Generator and Copy Controls

**Date:** 2026-07-14

## Goal

Make the cTrader personal-edition token easy to create and copy from the existing Indicator Licensing admin page without weakening the current hash-only server storage.

## Approved interaction

The cTrader personal-token card will provide three separate actions:

1. **Generate token** creates a cryptographically random 64-character hexadecimal token in the administrator's browser and fills the existing password field.
2. **Copy token** copies the current plaintext field value and shows a short `COPIED` confirmation. It is disabled when the field is empty.
3. **Rotate token** remains the only action that activates the token on the server.

Generation never activates a token automatically. After a successful rotation, the plaintext field is cleared. The existing instruction to save the plaintext in a password manager remains visible because the server cannot recover it later.

## Security and data flow

- Random bytes come from `globalThis.crypto.getRandomValues`; `Math.random` is prohibited.
- Thirty-two random bytes are encoded as lowercase hexadecimal, producing 64 characters.
- Generation and copying occur only in the browser.
- The rotation endpoint continues to receive plaintext only over HTTPS and stores only its SHA-256 hash.
- No token is written to source code, logs, local storage, Supabase plaintext columns, or API responses.
- Clipboard failure produces an admin-visible error and does not rotate the token.

## Code boundaries

- Add a small pure helper module for generating a token from an injected cryptographic byte source. This keeps the security behavior directly testable in Node.
- Update only the existing cTrader token card in `pages/admin/license.js` for generate/copy controls and feedback.
- Do not change the cTrader feed contract, licensing rules, scoring engine, strategy thresholds, or database schema.

## Testing

- The generator returns exactly 64 lowercase hexadecimal characters from 32 bytes.
- Deterministic injected bytes produce the expected hexadecimal output.
- Missing or invalid cryptographic sources fail closed.
- Existing indicator-feed admin and cTrader overlay tests remain green.
- `check_dupes.py` and the Next.js production build must pass before deployment.

## Account approval location

Commercial cTrader accounts continue to be entered at `/admin/license`: choose **Panda cTrader Dashboard Overlay**, enter the numeric cTrader account number, create the record, then approve it. Broker identity is not required.

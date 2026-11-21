# Production MFA bootstrap — staged pre-migration deployment

## Why this branch exists

The Production schema migration intentionally requires a verified MFA factor for the Super Admin. The current Production login page on `main` does not contain the TOTP enrollment flow. Applying the migration first would block the only Super Admin from accessing privileged features; deploying the full Development frontend first would query the not-yet-existing `profiles.must_change_password` column and could break sign-in.

This branch solves that sequencing problem with a minimal login-only bootstrap, based on the current Production `main` branch:

- `public/login.html` — adds the existing Development MFA enrollment/challenge UI.
- `public/login.js` — adds the Development TOTP enrollment and verification flow.
- `public/brand-logo.js` — supplies the logo module required by the new login page.
- The existing Production `public/supabase-client.js`, `portal.css`, `password-visibility.js`, and other pages remain unchanged.

## Pre-migration compatibility

The login module first attempts to read `profiles.role,must_change_password`. If Production has not yet received the additive profile migration, it falls back to reading `profiles.role` only and treats `must_change_password` as false. This lets the Super Admin complete TOTP enrollment while the current Production schema is still in place. The fallback does not bypass role checks or MFA verification.

The favicon reference was changed to the existing Production `friends-future-vision-logo.svg`. Brand text uses singular **Friends Future Vision Forever**.

## Safe rollout sequence

1. Complete the encrypted backup smoke test, Production backup, checksum verification and isolated restore rehearsal.
2. Owner explicitly approves the bootstrap deployment.
3. Deploy only this branch's login assets to the Production Worker (no database migration yet).
4. Super Admin signs in with the existing Production account. The login page prompts to scan a TOTP QR code and verify a 6-digit code using an authenticator app.
5. Confirm the Production Auth account now has a verified MFA factor and can reach the current dashboard.
6. Apply the ordered Production migrations in the release plan. The MFA preflight must pass.
7. Only then deploy the full `release/ffv-prod-parity-20261122` application and the staged Edge Functions, followed by live QA.

Do not merge or deploy this branch before the backup/restore gate. It is separate from the full parity release branch and is not deployed. The branch has a dedicated CI workflow checking JS syntax, MFA DOM elements, Production Supabase ref, schema fallback and singular brand text.

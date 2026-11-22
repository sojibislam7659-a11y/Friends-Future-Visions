# Production MFA bootstrap — merged pre-migration login

## Current status

- Bootstrap PR #10 was merged into `main`.
- PR #21 integrated the same verified backup/MFA bootstrap files into the staged release branch.
- The login JavaScript includes a compatibility fallback: it reads `profiles.role,must_change_password` when available and falls back to `profiles.role` only before the additive password-state migration.
- CI and the release browser/static checks passed.
- Cloudflare Worker deployment is **not independently confirmed** through the available control connection. The Production login page must be checked before the Super Admin attempts enrollment.
- Production currently has **zero verified TOTP factors**. No real Production MFA factor has been created yet.

## What the bootstrap changes

- `public/login.html` — adds the existing Development MFA enrollment/challenge UI.
- `public/login.js` — adds TOTP enrollment and verification, preserving the existing Production Supabase client and pre-migration schema compatibility.
- `public/brand-logo.js` — provides the shared Friends Future Visions Forever logo.
- The bootstrap does not apply database migrations, modify member/financial rows, or deploy the full portal.

## Verified backup and migration gates

1. Encrypted Drive backup `ffv_backup_45070634542_1` uploaded successfully (workflow run `45070634542`).
2. Isolated PostgreSQL 17 restore passed (workflow run `45070745560`).
3. All nine staged Production migrations applied in exact order and passed final schema/ACL/RLS/Storage/public-summary checks against a second isolated restored database (workflow run `45072671436`).
4. The migration rehearsal used a synthetic verified TOTP factor and AAL2 claim only inside the temporary database. It did not create a real Production factor or modify Production.

## Remaining owner action

1. Open the Production login page from a laptop/PC and sign in with the existing Super Admin account.
2. If the TOTP setup screen appears, scan the QR code using a trusted authenticator app on the phone and enter the 6-digit code on the login page.
3. Do not share the QR code, secret key, recovery material, or one-time code in ChatGPT.
4. After enrollment, the project owner can verify that Production `auth.mfa_factors` contains one `totp` factor with status `verified`. The migration preflight must then pass.

Only after real TOTP enrollment and final owner acceptance should the nine rehearsed migrations, schema-dependent Edge Functions, and full release be applied to Production. Preserve the current Production Worker and data until then.

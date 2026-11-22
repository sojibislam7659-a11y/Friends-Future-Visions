# Production Migration Plan — Friends Future Vision Forever

Date: 2026-11-23
Target: Production Supabase project only (`ugtzmtmsfaajclftfeuz`)
Source of intended application behaviour: Development (`tvdxbyzvkjiebwslmnvj`)

## Release status

**BACKUP AND RESTORE GATE PASSED — FULL PRODUCTION RELEASE STILL BLOCKED ON SUPER ADMIN MFA ENROLLMENT AND FINAL OWNER ACCEPTANCE.**

A fresh encrypted Production backup was uploaded to Google Drive and successfully restored into an isolated temporary PostgreSQL 17 instance. The release login bootstrap PR #10 has been merged to `main`; Cloudflare Worker deployment is not independently confirmed through the available control connection. The Super Admin still has zero verified TOTP factors.

Limited, reversible Production security hardening was applied on 2026-11-23 and is included in the fresh backup/restore rehearsal:
- Anonymous table/sequence grants in `public` were revoked; only `committee_rules SELECT` remains for `anon`.
- `private.has_portal_access()` and `public.get_financial_summary()` now allow only `member` and `super_admin`, removing the legacy `admin` role.
- An aggregate-only, read-only `public.get_public_financial_summary()` RPC was added for the public DATA page. It exposes no member identifiers, personal dues, or individual contribution rows.

No member rows, financial transaction rows, Auth users, Storage objects, or passwords were changed. The full portal/ledger migrations, Edge Function rollout, and full application release remain staged and must not be executed until the Super Admin enrolls TOTP and the owner confirms the production release window.

## Latest Production preflight observations

Read-only checks on 2026-11-22:

- 7 member rows and 8 profile rows.
- 4 notifications.
- 0 financial transaction rows and 0 financial transaction audit rows.
- 0 push subscription rows.
- 8 Production Auth users / profiles; 7 profiles are linked to active members.
- Production has 1 Super Admin profile and 0 verified MFA factors. The schema parity migration intentionally blocks until that account enrolls and verifies MFA.
- The Development-only tables `site_settings`, `admin_change_audit`, `financial_postings`, and `notification_push_deliveries` are absent from Production.
- `private.password_rotation_guards` is absent from Production.
- No current push subscription row violates the Development endpoint/key/user-agent format checks. This check is only a snapshot; repeat it immediately before any migration.
- Existing Production `financial_transactions` has `transfer_group_id`, but not `posting_id` or `reversal_of_id`. Its amount is `numeric(12,2)` (Development uses `numeric(14,2)`); current constraints permit transfers but not reversal transaction types.
- Production `financial_transaction_audit` has an INSERT audit trigger, but its action CHECK currently allows only UPDATE/DELETE. The staged ledger migration corrects this mismatch before new ledger writes.
- Production currently has no `financial_postings`, `site_settings`, `admin_change_audit`, `notification_push_deliveries`, or private password-rotation guard table.
- Production anonymous grants were reduced on 2026-11-23: `anon` now has only SELECT on `committee_rules` in the public schema and no public sequence privileges. Authenticated privilege cleanup and future-object default ACL hardening remain pending; do not infer those phases are complete.
- Existing Production profile update and financial transaction policies are not identical to Development.

These counts and checks are snapshots, not guarantees about future state. The latest read-only recheck still shows 53 Production migrations, 8 Auth users, 7 members, 8 profiles, 0 financial transactions, 0 financial audit rows, 2 Storage objects, 50 public RLS policies and 18 Storage object policies. Development has 59 public RLS policies and the same 18 Storage object policies.

## Latest advisor snapshot

Production Security Advisor after the 2026-11-23 hardening:
- 1 public-schema extension warning (`pg_net`).
- 1 anonymous-executable SECURITY DEFINER warning for `get_public_financial_summary()`. This is intentional: it is a no-argument, read-only RPC returning only aggregate committee totals/monthly trends; no member-level or personal data.
- 5 authenticated-executable SECURITY DEFINER warnings: the four pre-existing wrappers plus the new aggregate summary wrapper. The four original wrappers still require the staged Phase 4 hardening; the aggregate wrapper is intentionally callable by anon/authenticated.
- 1 leaked-password-protection warning. This is an Auth project setting and may be plan-gated; do not claim it can be enabled on the current Free plan without checking account entitlement.

Production Performance/Health advisor snapshots should be refreshed after the coordinated migration. Do not delete unused indexes solely from a short usage snapshot.

## Why Development migrations cannot be copied verbatim

Development and Production have independent migration histories (61 vs 53 applied versions; zero shared version IDs). The Development financial migration adds a NOT NULL `posting_id` without a legacy-row backfill, so it is not safe for a populated Production table. A new Production-specific ledger migration has a hard preflight that refuses to run if any Production financial transaction or audit row exists; it deliberately does not copy Development's three test transactions or three test postings.

The Production release must use a newly authored, Production-specific migration sequence. Never replay the Development migration directory wholesale.

## Production security finding detail

The current Production Security Advisor reports four exposed SECURITY DEFINER RPCs: `get_financial_summary()`, `review_payment_submission(...)`, `review_private_document(...)`, and `set_current_committee_document(...)`. Source review confirmed all four use an empty search_path. The private helper functions for payment and committee-document changes explicitly check Super Admin authorization and are not executable by authenticated clients directly. Nevertheless, public wrappers should become SECURITY INVOKER after confirming their RLS and helper grants. The financial summary wrapper currently accepts the legacy `admin` role; replace this with the intended two-role allow-list during the coordinated migration.

Production also has `pg_net` installed in `public`. Moving it requires checking existing cron/HTTP call dependencies and extension support before any change.

## Phase 0 — Mandatory backup and restore gate

<badge>Passed</badge>

1. **Fresh encrypted backup succeeded:** GitHub Actions run `45070634542`; Drive backup ID `ffv_backup_45070634542_1`. The workflow exported the Production PostgreSQL 17 custom-format database dump, Auth metadata, all Storage object bytes and inventory, non-secret configuration inventory, and Production Edge Function source snapshots. It encrypted and verified the archive, uploaded the encrypted chunk and manifest to Drive, and cleaned its temporary runner workspace.
2. **Actual isolated restore rehearsal succeeded:** GitHub Actions run `45070745560`. It downloaded the exact Drive backup, verified chunk/archive hashes, decrypted the archive, validated the payload, started temporary PostgreSQL 17, seeded only the Auth IDs/metadata needed for FK checks, restored the public/private database dump, and passed the RLS, validated-constraint, valid-index, foreign-key/orphan, member/Auth-reference, and cleanup checks.
3. Storage object bytes were checksum-verified from the backup payload. The rehearsal does not recreate a live Supabase Storage service or prove hosted Storage API recovery; bucket/object inventory and bytes were validated as backup payloads.
4. Hosted Auth provider settings, signing secrets, SMTP/OAuth configuration, Cloudflare secrets, and Edge Function secret values are not all exported by the database dump. Their names/inventory are recorded where available; secret values must remain owner-controlled and must never be copied into Git or chat.
5. The backup/restore rehearsal did not write to the Production database. The fresh backup was created after the limited 2026-11-23 security hardening listed above, so that hardening is included in the verified restore point.
6. The Apps Script receiver remains Version 3. The monthly encrypted Drive backup schedule remains 03:00 UTC on the first day of each month (09:00 Bangladesh time).
7. **MFA bootstrap:** PR #10 (`release/ffv-mfa-bootstrap-20261122`) was merged to `main` after the restore passed. It adds the login-only TOTP enrollment/challenge flow and the pre-migration password-flag fallback. CI passed. Cloudflare Worker deployment status is not independently confirmed; verify the login page reflects this commit before asking the Super Admin to enroll.
8. Production currently has zero verified MFA factors. The Super Admin must sign in and enroll a TOTP factor using an authenticator app. Only after the factor is verified may the AAL2-gated portal migration proceed.
9. **The restore gate is complete; the remaining Phase 0 blocker is Super Admin TOTP enrollment and explicit owner acceptance of the scheduled Production release window.**

## Phase 1 — Additive configuration and audit capabilities

Prepare and test the following before merging:

- Add `public.site_settings` with the Development key allow-list, value length check, RLS + FORCE RLS, and Super Admin-only writes. Seed the ticker keys with `ON CONFLICT DO NOTHING`; never overwrite any existing setting.
- Add `public.admin_change_audit`, read-only for Super Admin through RLS, with the Development audit trigger function and all 11 Development trigger targets: committee_documents, committee_proofs, member_contribution_rates, member_private_documents, members, notices, payment_methods, payment_submissions, profile_change_requests, profiles, and site_settings. Confirm every target table exists in Production and avoid capturing Auth credentials in JSON audit payloads.
- Add the `profiles.must_change_password` and `profiles.password_change_required_at` columns with safe defaults. Do not set existing users to require a password change without a deliberate account-by-account rollout.
- Add `private.password_rotation_guards` and its triggers/functions only after validating hosted Auth table access and confirming the current Auth password update flow. This mechanism fingerprints the stored password hash; it must never expose the hash/fingerprint to clients or logs.

A Production-specific schema migration is staged at `supabase/migrations/20261122113000_add_production_portal_audit_and_password_parity.sql`. It adds the Development site-settings/ticker, admin audit, push-delivery, profile password flags, private password guard, push subscription format constraints, five-device cap trigger, service-role-only delivery claim RPC, RLS/policies, and narrow profile grants. It also changes `private.is_super_admin()` and `private.has_portal_access()` to require AAL2 for Super Admins, matching Development. Its preflight intentionally aborts unless every Production Super Admin has a verified MFA factor. It explicitly removes Production's legacy column-level `profiles.full_name` UPDATE grant, grants only the `must_change_password` self-service column, revokes direct access to the private password guard table, and revokes direct execution of trigger functions. The current Production snapshot has zero verified factors, so this migration is NOT currently executable.
- Tighten profile update grants and policies so only the Super Admin can edit member profile fields, while the member can only complete the controlled password-rotation transition.
- Reconcile private schema USAGE and all table/function grants against Development. In particular, revoke anon private-schema USAGE and broad table privileges only after verifying every application call path.

## Phase 1B — Storage policy parity

The five Production Storage buckets already match Development exactly: all remain private, with the same file-size limits and MIME allow-lists. There are two Production policy differences on `member-private-documents`:

- Production calls the Super Admin upload policy `Private member docs: Super Admin upload`; Development uses `Private member docs: Super Admin insert` with the same Super Admin check.
- Development additionally lets a signed-in member read only the nominee photo whose exact Storage path is stored on that member's own `members.nominee_photo_path` row. Production currently lacks this owner-read branch.

The staged migration `supabase/migrations/20261122115000_align_storage_policy_parity.sql` changes only these two policy definitions. It checks all five bucket configurations first and does not move, overwrite, or delete any Storage objects. The two existing Production objects remain untouched. Verification is in `supabase/verification/verify_production_storage_policy_parity.sql`.

## Phase 1C — Remaining public RLS policy parity

The shared-public-policy comparison found four remaining groups that differ from Development: notifications, committee documents, payment methods, and payment submissions. The staged migration `supabase/migrations/20261122114500_align_public_policy_parity.sql`:

- Replaces Production's broad Super Admin `ALL` policies on committee documents and payment methods with separate insert/update/delete policies.
- Replaces the broad payment-submission policy with the Development update/delete policies; member-owned submission creation remains unchanged.
- Adds the Super Admin read branch to notifications while requiring `private.has_portal_access()` for member reads and own-row updates.
- Removes the old Production-only policy names and preserves all table data and existing member submission rules.

The migration is policy-only and depends on the authorization helpers created in Phase 1. The full public-policy target is 59 policies, matching the current Development snapshot; the combined read-only checks are in `verify_production_portal_parity.sql`.

## Phase 1D — Public table grant hardening

A direct ACL comparison found that Production granted `anon` broad table privileges on multiple public tables. On 2026-11-23, the anonymous portion was applied directly and verified:
- Revoked all `anon` privileges on all tables and sequences in schema `public`.
- Restored only `SELECT` on `public.committee_rules`.
- Rechecked `information_schema.role_table_grants`: `committee_rules SELECT` is the only remaining public-table grant to `anon`.
- Anonymous read tests confirmed published Rules remain accessible while `members` and `member_private_documents` are denied.

The staged migration `20261122124500_revoke_legacy_anon_table_grants.sql` remains in the release sequence as an idempotent declaration of this state. The separate authenticated privilege cleanup in `20261122125000_align_public_table_grants.sql` has NOT been applied. It must still be reviewed and executed after the portal/ledger authorization paths are deployed and tested.

## Phase 1E — Future public-object default privileges

Production's `postgres` default ACL for the `public` schema grants `anon` broad table, sequence, and function privileges on future objects; it also gives `authenticated` unnecessary REFERENCES/TRIGGER/TRUNCATE table privileges. Development's corresponding defaults do not. The staged `20261122125500_align_public_default_privileges.sql` removes those defaults for objects created by `postgres` in `public`, without changing Supabase-managed defaults in other schemas or the existing service-role defaults. The portal verification script checks that future objects will not regain these grants.

## Phase 2 — Push delivery runtime verification

The schema migration in Phase 1 already adds the subscription constraints, five-device cap, `notification_push_deliveries` table, and service-role-only `claim_notification_push_delivery(uuid,uuid)` RPC. Read-only comparison confirms the Production and Development push cron jobs are both active, the `get_push_config()` function definitions match, and the four required Vault secret names are present in both projects.

- After the Phase 1 schema migration, verify `send-push` with a real pending notification and enrolled device. Current Production and Development each have zero push subscriptions; recent cron calls return HTTP 200 with zero messages processed, so this is not yet an end-to-end delivery test.
- Deploy the newer Release `send-push` source only after the schema migration is applied and the restore rehearsal passes.
- Preserve Production `google-sheets-sync`; it has no Development counterpart.

## Phase 3 — Financial ledger migration (highest risk)

Preflight must run immediately before execution:

- Count rows and group existing transfers.
- Abort if any historical transaction has no valid `created_by` Auth user; do not invent an actor for audit history.
- Abort if amounts cannot be represented as numeric(14,2) without rounding/overflow.
- Validate every transfer group has exactly two entries, equal amount, opposite directions, different account types, and compatible actor/date metadata.
- Validate every transaction type against the intended ledger constraints.
- Ensure no existing transaction is already a reversal or has an unsupported relationship.

Backfill design:

1. Create `public.financial_postings` first.
2. Create one legacy standard posting per non-transfer transaction.
3. Create one legacy transfer posting per existing `transfer_group_id`, linking both transfer rows to the same posting.
4. Generate a unique idempotency key for each legacy posting and record a stable legacy-backfill request hash.
5. Populate `financial_transactions.posting_id` and verify every transaction links to exactly one posting.
6. Only after verification, add the NOT NULL and foreign-key constraints.
7. Add `reversal_of_id`, reversal/transfer constraints, indexes, immutable ledger triggers, and deferred transfer-group validation.
8. Replace all financial write paths—including payment approval and manual transaction entry—with the idempotent posting/reversal RPCs.
9. Reduce direct table write grants. Preserve read access through the intended RLS model.
10. Reconcile financial summary functions and member shared financial data RPCs with the exact Development logic, including reversal awareness and date rules. The staged migration now installs `private.get_financial_summary_unchecked()`, the AAL2-gated summary wrapper, and `private/public.get_member_shared_financial_data_v2()` from Development.
11. Replace the old direct-update `private.save_contribution_matrix()` with Development's atomic idempotent workflow, which reverses an existing posting and creates a replacement posting rather than mutating/deleting ledger rows.
12. Remove authenticated access to the legacy shared-financial-data RPC; the DATA page uses the new `get_member_shared_financial_data_v2()` path.
11. Compare before/after balances and transaction counts. No posting or transaction may be duplicated, omitted, or silently changed.

A Production-specific immutable ledger migration is staged at `supabase/migrations/20261122123000_add_production_immutable_financial_ledger.sql`. The Development summary and shared-data function bodies were re-fetched from the live Development database and restored as complete PL/pgSQL definitions; the migration now has one explicit transaction boundary. It uses Development's current idempotent posting, reversal, correction, transfer validation, immutable-ledger, payment-approval, reversal-aware financial summary, and member shared financial data v2 RPC definitions. It adds posting/reversal columns and constraints, widens amount to numeric(14,2), corrects the audit action constraint, removes direct authenticated ledger write policies/grants, disables the Production-only legacy direct-edit RPC, and adds Super Admin read-only posting access. Its preflight refuses to run if Production transactions or financial audit rows are non-zero. The current read-only snapshot is 0 and 0 respectively; repeat immediately before execution. Development's three test transactions and three test postings are explicitly excluded. No Production backfill or data write has been performed. The latest read-only member snapshot shows 7 active members with `monthly_contribution` and `contribution_start_date` currently NULL and no rate-history rows. Development's shared-data function defaults a missing rate to ৳2,000 and derives the initial contribution month from `joined_at`, clamped to January 2027. The portal migration sets the default for future members but does not rewrite existing member rows; do not copy Development's test-member rate rows.

## Phase 4 — SECURITY DEFINER hardening

A Production-specific migration is staged at `supabase/migrations/20261122103000_harden_production_security_definer_wrappers.sql`. It has not been applied.

The 2026-11-23 limited pre-release hardening updated:
- `private.has_portal_access()` to allow only `member` and `super_admin`.
- `public.get_financial_summary()` to reject the legacy `admin` role and accept only `member` / `super_admin`.

Both functions still use SECURITY DEFINER in Production. The four original wrappers remain SECURITY DEFINER until the staged migration is applied and verified. The new `public.get_public_financial_summary()` is a separate, intentionally anonymous-callable SECURITY DEFINER wrapper with an empty search_path; it returns aggregate-only fields and delegates to a private helper. Its advisor warning is expected and must be documented, not blindly revoked.

The staged migration still requires SQL parser/runtime validation plus real member/Super Admin JWT tests after the MFA and backup gates. Test member, Super Admin, unauthenticated, and anon contexts; confirm private helper grants and PostgREST resolution.

## Phase 5 — Edge Functions and application release

Read-only source comparison completed on 2026-11-22:

| Function | Development | Production | Release vs Development | Captured Production baseline vs Release |
|---|---:|---:|---|---|
| `send-push` | v4, JWT off | v3, JWT off | Exact match | Older; deploy after schema migration |
| `review-member-signup` | v5, JWT on | v4, JWT on | Exact match | Older; deploy after schema migration |
| `invite-member` | v3, JWT on | v5, JWT on | Exact match (retired 410) | Already matches; no redeploy needed |
| `create-member-login` | v4, JWT on | v3, JWT on | Exact match | Older; deploy after schema migration |

The four Release-branch `index.ts` files were compared byte-for-byte with the live Development sources; all four match Development exactly. The captured live Production baseline is older for three functions:
- `send-push`: Production snapshot is older and lacks the new delivery-claim/idempotency path.
- `review-member-signup`: Production snapshot is older and lacks the current AAL2/password-rotation safeguards.
- `create-member-login`: Production snapshot is older and lacks the current AAL2/password-rotation safeguards.
- `invite-member`: Production already matches the retired HTTP 410 implementation; no redeploy is required.
The CI baseline check records these expected differences. Deno type-checking is added for the four Release functions and the preserved Production-only Google Sheets function.

Required standard Edge Function environment names are `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; the Production-only `google-sheets-sync` also requires `OIKKO_SYNC_SECRET`. Secret values cannot be read back. The following Vault secret *names* exist in both projects: `ffvf_cron_token`, `ffvf_vapid_private_key`, `ffvf_vapid_public_key`, and `ffvf_vapid_subject`.

The Release browser QA workflow passed 8 Chromium tests across Desktop Chrome and Pixel 7 mobile viewports (run `45071354591`): login controls, unauthenticated dashboard redirect, authenticated member dashboard and read-only matrix, plus anonymous aggregate-only public DATA and public navigation. The Release frontend was served locally and pointed at Development Supabase; Production was not contacted.

Read-only operational comparison found all three cron jobs active in both projects with matching schedules and matching reminder-function definitions: `ffvf-meeting-reminders` (every minute), `ffvf-monthly-due-reminders` (03:00 on day 1), and `ffvf-push-delivery` (every minute). Recent push endpoint calls returned HTTP 200 with zero processed/sent/failed; both projects currently have zero push subscriptions, so an end-to-end device delivery test remains outstanding.

- After the portal and ledger migrations pass in the restore rehearsal, deploy only `create-member-login`, `review-member-signup`, and `send-push` from the Release branch. Do not redeploy `invite-member` unless a future source change requires it.
- Preserve Production `google-sheets-sync`; it has no Development counterpart and must remain deployed.
- Verify the Production `OIKKO_SYNC_SECRET` remains configured through owner-controlled settings; do not copy secret values into Git.
- Confirm `wrangler.jsonc` and `public/supabase-client.js` point to Production only.
- Merge release branch to main and deploy the Worker only after explicit owner approval.

## Migration execution order (after Phase 0 and explicit owner approval)

1. `20261122103000_harden_production_security_definer_wrappers.sql`
2. `20261122113000_add_production_portal_audit_and_password_parity.sql` (blocked until all Production Super Admin accounts have verified MFA)
3. `20261122114500_align_public_policy_parity.sql` (RLS policy metadata only; preserve all existing rows)
4. `20261122115000_align_storage_policy_parity.sql` (Storage policy metadata only; preserve all existing objects)
5. `20261122123000_add_production_immutable_financial_ledger.sql` (blocked if any Production financial transaction or audit row appears before release)
6. `20261122124500_revoke_legacy_anon_table_grants.sql` (retain only anonymous committee-rules SELECT)
7. `20261122125000_align_public_table_grants.sql` (remove non-app privileges and route rate changes through the RPC)
8. `20261122125500_align_public_default_privileges.sql` (prevent future anon grants on public objects)

These files are staged only on the release branch. None has been applied to Development or Production.

## Current validation status

- Fresh encrypted Drive backup run `45070634542` succeeded; manifest ID is `ffv_backup_45070634542_1`.
- Isolated restore rehearsal run `45070745560` succeeded, including PostgreSQL 17 restore and catalog integrity checks.
- Production anonymous ACL hardening was applied and verified: only `committee_rules SELECT` remains for `anon` in schema `public`.
- Production role helper allow-list now contains only `member` and `super_admin`; the full SECURITY DEFINER migration remains pending.
- Development browser QA passed after the public DATA change (run `45070818077`).
- Release static checks passed on the public DATA release commit (run `45071354645`): JavaScript syntax, backup tooling, Deno Edge Function type-checks, Production Edge Function source parity, Wrangler dry-run, SVG validation, PostgreSQL migration parsing, and diff checks.
- Release browser QA passed 8/8 tests across Desktop Chrome and Pixel 7 (run `45071354591`), including anonymous aggregate-only public DATA.
- The release QA uses a locally served frontend and Development Supabase only. It does not prove Production Worker deployment, Production Auth enrollment, live push delivery, or Production acceptance.
- Production currently has 7 member rows, 8 profiles, 0 financial transactions, 0 member contribution-rate rows, 2 Storage objects, and 0 verified MFA factors. The shared matrix returns 420 member-month rows (7 × 60), but all 420 are marked `due_configured=false`; no transaction history or monthly rates have been entered. The 12-member target therefore still needs five member records and owner-confirmed contribution rates. Do not invent these values.
- Production Security Advisor currently reports `pg_net` in public, the intentional aggregate-only anonymous SECURITY DEFINER RPC, five authenticated-executable SECURITY DEFINER wrappers, and leaked-password protection disabled. The staged migration and Auth settings review remain required.
- SQL parsing and Deno type-checking do not execute migrations or replace real Super Admin MFA/JWT tests, live push delivery with an enrolled device, and final Production acceptance tests.

## Required acceptance tests

- Existing 7 Production members and Super Admin still sign in; no identity or password is overwritten.
- Member can access only their own detailed profile and due information.
- Super Admin can access and edit all intended member fields.
- Temporary password rotation cannot be bypassed by directly editing the profile flag.
- Super Admin MFA/AAL2 is required for privileged actions.
- Anonymous user cannot read or mutate private data.
- Payment submission approval creates exactly one ledger posting and one contribution entry.
- Retry with the same idempotency key creates no duplicate.
- Transfer creates exactly two balanced rows under one posting.
- Reversal creates a new immutable posting and never mutates the original.
- Financial summaries match independently calculated balances.
- Push subscription ownership, delivery retry cap, and duplicate notification handling work.
- Private Storage object paths remain isolated; existing Production objects remain downloadable by authorized users.
- Google Sheets integration remains operational.
- Public and authenticated browser QA passes on mobile and desktop.
- Security and performance advisors are reviewed after migration.

## Current release blocker

The encrypted Drive backup and isolated PostgreSQL 17 restore rehearsal are complete. The remaining blockers are:

1. Verify that the merged MFA bootstrap is live on the Production Worker, then have the existing Super Admin enroll and verify a TOTP factor. Current Production verified-factor count is zero.
2. Obtain explicit owner acceptance before the coordinated Production schema/Edge Function/full Worker release.
3. Complete member onboarding and finance setup: Production has 7 member rows (target 12), no financial transaction rows, no contribution-rate history, and no configured due rows. Five member records and the exact member contribution rates must be supplied/confirmed by the owner; do not assume all rates.
4. Complete the ordered Production migrations, Edge Function rollout, and full release only after the above gates and post-migration acceptance tests pass.

The public Data experience is implemented as aggregate-only for anonymous visitors; the member-level contribution matrix remains behind authenticated access. No individual contribution or personal due data is exposed publicly.



The encrypted Production backup and owner-controlled Google Drive authorization are now verified. The isolated restore rehearsal remains pending, and the Production Super Admin currently has zero verified MFA factors. Therefore no Production migration or deployment can be responsibly marked ready or executed yet.

# Production Migration Plan — Friends Future Vision Forever

Date: 2026-11-22
Target: Production Supabase project only (`ugtzmtmsfaajclftfeuz`)
Source of intended application behaviour: Development (`tvdxbyzvkjiebwslmnvj`)

## Release status

**PLANNING ONLY — NOT APPROVED FOR PRODUCTION EXECUTION.**

This document is not an executable migration. No Production SQL, Edge Function deployment, Worker deployment, or user-data change was performed while preparing it.

Production must remain online and retain all current member, profile, Auth, financial, Storage, and integration data until the owner explicitly approves a release after a verified current backup and restore rehearsal.

## Latest Production preflight observations

Read-only checks on 2026-11-22:

- 7 member rows and 8 profile rows.
- 4 notifications.
- 0 financial transaction rows.
- 0 push subscription rows.
- The Development-only tables `site_settings`, `admin_change_audit`, `financial_postings`, and `notification_push_deliveries` are absent from Production.
- `private.password_rotation_guards` is absent from Production.
- No current push subscription row violates the Development endpoint/key/user-agent format checks. This check is only a snapshot; repeat it immediately before any migration.
- Existing Production financial_transactions has `transfer_group_id`, but not `posting_id` or `reversal_of_id`. Its amount is numeric; its current check constraints permit transfers but not reversal transaction types.
- Production currently grants broad table-level privileges on some tables to anon/authenticated, including push_subscriptions and notifications. RLS policies currently constrain row access, but privileges should be reduced as defense in depth. Do not revoke until frontend and function dependencies are verified.
- Existing Production profile update and financial transaction policies are not identical to Development.

These counts and checks are snapshots, not guarantees about future state.

## Latest advisor snapshot

- Production Security Advisor: 1 public-schema extension warning (`pg_net`), 4 authenticated-executable SECURITY DEFINER warnings, and 1 leaked-password-protection warning.
- Production Performance Advisor: 4 multiple-permissive-policy warnings and 19 unused-index informational findings.
- Production Health Advisor: no findings.
- Development Security Advisor: 1 public-schema extension warning and 1 leaked-password-protection warning; Development has no authenticated-executable SECURITY DEFINER warnings in this snapshot.
- Development Performance Advisor: 21 unused-index informational findings; Development Health Advisor: no findings.

Do not delete unused indexes solely from a short usage snapshot; evaluate workload and query plans first. Review the 4 duplicate permissive policy groups for simplification only after checking exact RLS semantics. Leaked-password protection is a project Auth setting and may be plan-gated; do not claim it can be enabled on the current Free plan without checking account entitlement.

## Why Development migrations cannot be copied verbatim

Development and Production have independent migration histories (61 vs 53 applied versions; zero shared version IDs). The Development financial migration adds a NOT NULL posting_id without a legacy-row backfill, so it is not safe for a populated Production table.

The Production release must use a newly authored, Production-specific migration sequence. Never replay the Development migration directory wholesale.

## Production security finding detail

The current Production Security Advisor reports four exposed SECURITY DEFINER RPCs: `get_financial_summary()`, `review_payment_submission(...)`, `review_private_document(...)`, and `set_current_committee_document(...)`. Source review confirmed all four use an empty search_path. The private helper functions for payment and committee-document changes explicitly check Super Admin authorization and are not executable by authenticated clients directly. Nevertheless, public wrappers should become SECURITY INVOKER after confirming their RLS and helper grants. The financial summary wrapper currently accepts the legacy `admin` role; replace this with the intended two-role allow-list during the coordinated migration.

Production also has `pg_net` installed in `public`. Moving it requires checking existing cron/HTTP call dependencies and extension support before any change.

## Phase 0 — Mandatory backup and restore gate

Before any Production write:

1. Export a fresh database backup with Supabase CLI `supabase db dump` (schema, data, and roles as separate outputs where appropriate) from the current Production connection.
2. Verify file integrity and inspect archive/SQL contents.
3. Export Auth users and related Auth rows/configuration. Do not assume a database-only dump reproduces all hosted Auth provider settings or signing secrets.
4. Download the bytes of every Storage object, not just `storage.objects` metadata; record bucket/object metadata and verify object checksums.
5. Export all Production Edge Function source files, function names, JWT verification flags, and required secret *names*. Secret values must be preserved through owner-controlled secure means; they cannot be retrieved from ordinary function listing APIs.
6. Record project URL, publishable key identifiers, Auth redirect settings, SMTP settings, OAuth provider settings, cron jobs, webhooks, Google Apps Script/Sheets integration settings, and other external configuration. Do not put secrets in Git.
7. Create an isolated restore target and perform a restore rehearsal. Verify table/schema counts, Auth user count, Storage object count and sample checksums, function deployment readiness, and sign-in behaviour.
8. Only after the restore rehearsal passes, request explicit owner approval for a scheduled Production maintenance window.

A schema-only backup, old PC dump, or Git branch is not a complete Production backup.

## Phase 1 — Additive configuration and audit capabilities

Prepare and test the following before merging:

- Add `public.site_settings` with the Development key allow-list, value length check, RLS + FORCE RLS, and Super Admin-only writes. Seed the ticker keys with `ON CONFLICT DO NOTHING`; never overwrite any existing setting.
- Add `public.admin_change_audit`, read-only for Super Admin through RLS, with the Development audit trigger function and triggers. Confirm every target table exists in Production and avoid capturing sensitive columns or Auth credentials in JSON audit payloads.
- Add the `profiles.must_change_password` and `profiles.password_change_required_at` columns with safe defaults. Do not set existing users to require a password change without a deliberate account-by-account rollout.
- Add `private.password_rotation_guards` and its triggers/functions only after validating hosted Auth table access and confirming the current Auth password update flow. This mechanism fingerprints the stored password hash; it must never expose the hash/fingerprint to clients or logs.
- Tighten profile update grants and policies so only the Super Admin can edit member profile fields, while the member can only complete the controlled password-rotation transition.
- Reconcile private schema USAGE and all table/function grants against Development. In particular, revoke anon private-schema USAGE and broad table privileges only after verifying every application call path.

## Phase 2 — Push delivery hardening

- Recheck all Production `push_subscriptions` rows against endpoint host, p256dh, auth key, and user-agent rules.
- Add constraints only if the live preflight reports zero violations; otherwise resolve invalid records deliberately before adding constraints.
- Add per-user subscription cap trigger and update own-row policies using the Development `private.has_portal_access()` gate.
- Create `public.notification_push_deliveries` with service_role-only access, the composite key, attempt limits, and subscription index.
- Add `public.claim_notification_push_delivery(uuid,uuid)` restricted to service_role.
- Deploy Development `send-push` only after table/RPC and required VAPID secrets are verified. Preserve Production `google-sheets-sync`.

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
10. Reconcile financial summary functions and member shared financial data RPCs with the exact Development logic, including reversal awareness and date rules.
11. Compare before/after balances and transaction counts. No posting or transaction may be duplicated, omitted, or silently changed.

The latest Production snapshot has zero financial transactions, but this does not remove the need for a transactionally safe backfill; repeat the preflight at release time.

## Phase 4 — SECURITY DEFINER hardening

- Change public wrappers to SECURITY INVOKER where the private helper already enforces authorization.
- Keep privileged work in private SECURITY DEFINER helpers with an empty search_path and explicit role checks.
- Replace the Production financial summary legacy allow-list that includes `admin` with the exact intended roles `member` and `super_admin`.
- Review EXECUTE grants for every public/private helper. Authenticated clients must not directly execute internal helpers that are intended only for trusted wrapper/service-role use.
- Test member, Super Admin, unauthenticated, and anon JWT contexts. SQL tests with no valid JWT are not substitutes for browser/API tests using actual user sessions.

## Phase 5 — Edge Functions and application release

- Deploy `create-member-login` and `review-member-signup` only after password rotation fields, AAL2 checks, role policies, and secrets are ready.
- Deploy `send-push` only after the delivery table and RPC are live.
- Keep `invite-member` aligned with the Production Auth configuration and test invite/approval flows end-to-end.
- Preserve `google-sheets-sync` until its owner confirms replacement or retirement.
- Confirm `wrangler.jsonc` and `public/supabase-client.js` point to Production only.
- Merge release branch to main and deploy the Worker only after explicit owner approval.

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

The required full backup, restore rehearsal, and owner-controlled Google Drive authorization are not available in the current session. Therefore no Production migration or deployment can be responsibly marked ready or executed yet.

# Production Release Plan — Friends Future Vision Forever

Status: PREPARATION ONLY. No Production changes are authorized by this document.

## Critical rule

Do not merge `dev-superadmin-field-editor` directly into `main` and do not deploy the Dev branch to the Production Worker. The Dev branch intentionally uses a different Worker name, Supabase project, VAPID public key, and Edge Function CORS/redirect origin.

A production release must be prepared as an environment-specific release commit after Development browser QA and explicit owner approval.

## Environment-specific application changes

Before Production deployment, prepare and independently review:

1. `wrangler.jsonc`: set Worker name back to `friends-future-visions` only in the Production release branch.
2. `public/supabase-client.js`: point to the Production Supabase project and verified Production publishable/anon key.
3. `public/push-config.js`: use the Production VAPID public key; keep the private key only in Production secret storage.
4. `supabase/functions/invite-member` and `review-member-signup`: set exact Production CORS origin and Production redirect URL.
5. `send-push`: deploy only with the existing Production secret names/values verified; never copy Dev VAPID or cron secrets into Production.
6. `google-sheets-sync`: preserve/review the current Production integration. Development still needs its own form URL, response Sheet, webhook secret and field mapping.
7. Supabase Auth URL configuration: confirm Production site URL and allowed redirect URLs before password recovery or signup is released.

## Database migration strategy

Do not apply the Development baseline migration to an existing Production database. Build a forward-only, idempotent Production migration from the verified Dev-versus-Prod diff.

Required schema/security changes include:

- Add `public.financial_postings` and `private.contribution_matrix_operations`.
- Add the Dev financial posting/reversal columns, constraints, indexes and transfer validation.
- Replace exposed SECURITY DEFINER RPC implementations with private SECURITY DEFINER helpers and public SECURITY INVOKER wrappers, preserving grants and authorization checks.
- Remove direct authenticated writes to `financial_transactions`; route writes through guarded atomic RPCs.
- Preserve transaction audit history and allow INSERT audit actions.
- Update role constraints/policies to the approved role model (`super_admin`, `member`, `pending`, `rejected`).
- Apply the Development Storage policy changes only after verifying each bucket's read/write semantics.
- Preserve all existing member, profile, notification, Storage, Auth and Vault data.

Read-only Production snapshot on 2026-11-11:

- 6 `members`, 3 `profiles` (2 member, 1 super_admin).
- 0 `financial_transactions`, 0 financial audit rows, 0 payment submissions, 0 private-document rows, 0 contribution-rate rows.
- 0 committee documents, 0 committee proofs, 0 notices, 4 notifications, 0 push subscriptions.
- 5 Storage buckets and 17 Storage policies.

The zero transaction count means no existing transaction rows required posting-header backfill at the time of this snapshot. Recheck immediately before any migration; never rely on a stale count. Do not infer that member profile fields or Auth records are empty.

## Required release sequence

1. Complete Development live Worker verification, Auth redirect checks, authenticated Super Admin/member browser QA, Storage tests, accounting tests, and real push delivery.
2. Freeze a tested Development commit and record its SHA.
3. Prepare the Production-specific release branch and reviewed SQL migration; do not change `main` or Production settings during preparation.
4. Review Production migration against a fresh read-only schema/data snapshot and a rollback plan.
5. Obtain explicit owner approval for the exact Production database migration, Edge Function deployment, and Worker deployment.
6. Apply approved database migration first, verify policies/functions/constraints, then deploy approved Edge Functions and Production application assets.
7. Run three independent Production smoke/security checks. Stop and roll back if any check fails.

## Approval boundary

This plan does not authorize Production writes, schema changes, Auth configuration changes, secret rotation, Git merge, or deployment. Each Production action requires explicit approval after Development is release-ready.

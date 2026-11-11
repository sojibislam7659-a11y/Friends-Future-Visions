# Friends Future Vision Forever — Development Readiness

Updated: 2026-11-11  
Scope: Development-only implementation and read-only Production metadata inspection.

## Environment boundaries

- GitHub repository: `sojibislam7659-a11y/Friends-Future-Visions`
- Development branch: `dev-superadmin-field-editor`
- Production branch: `main`
- Development Supabase project: `tvdxbyzvkjiebwslmnvj`
- Production Supabase project: `ugtzmtmsfaajclftfeuz`
- Production website: `https://friends-future-visions.sojibislam7659.workers.dev`
- Development Preview URL listed in prior project configuration: `https://dev-superadmin-field-editor-friends-future-visions.workers.dev/`

Production remains READ-ONLY. This audit queried Production catalog metadata only. No Production rows, Auth users, Storage objects, Vault secrets, or deployment settings were changed.

## Current branch comparison

- Development is 67 commits ahead of `main`, 0 behind.
- Development contains intentional security/accounting architecture changes. Do not blindly copy Main files over Development or merge without review and owner approval.
- Cloudflare dashboard inspection found no deployment for `dev-superadmin-field-editor`; the visible deployment history is for `main` only. The configured Development Preview URL also failed the browser smoke test with `ERR_EMPTY_RESPONSE`. No page title, login form, or menu could be verified. Browser-level feature QA is blocked until a Development deployment exists and the Preview responds.

## Live schema comparison

Counts from read-only catalog queries:

| Component | Production | Development |
|---|---:|---:|
| Public base tables | 15 | 16 |
| Public RLS policies | 47 | 50 |
| Public/private functions | 31 | 41 |
| Public/private triggers | 8 | 11 |
| Storage buckets | 5 | 5 |
| Storage policies | 17 | 17 |

Development's additional table is `financial_postings`, used for immutable posting headers and idempotency. The 15 Development migration-history records are present. The recorded database migration version timestamps do not exactly match the prefixes of the SQL filenames in the repository; reconcile migration history before using CLI migration push/pull or attempting a release.

Development currently has zero rows in `members`, `profiles`, `financial_transactions`, `financial_postings`, `notifications`, `push_subscriptions`, and `payment_submissions`. No production user or financial data was copied.

## Development Edge Functions and scheduled jobs

- Active Development Edge Functions: `invite-member`, `review-member-signup`, and `send-push`.
- Production additionally has `google-sheets-sync`; it is not deployed to Development.
- Development `google-sheets-sync` remains blocked on a separately configured Development-only webhook secret and confirmation of the intended Google Form/Sheet integration. Never reuse Production secrets.
- Three Development cron jobs are active: meeting reminders (every minute), monthly due reminders (03:00 on the first day of each month), and push delivery (every minute).
- Recent push-delivery HTTP requests returned status 200 and cron runs succeeded. This confirms the scheduled endpoint call is accepted; it does NOT prove a real browser push notification was delivered. Development currently has no test users or push subscriptions.
- Development VAPID key pair and cron token were freshly rotated; the public key in `public/push-config.js` matches the Vault public key. The VAPID subject is configured. `get_push_config()` is SECURITY DEFINER but its execute ACL is restricted to `service_role`; it does not grant access to `anon` or `authenticated`.

## Accounting and Contribution Matrix

- Main Contribution Matrix UI is restored in Development using `save_contribution_matrix`.
- Matrix changes are submitted in one atomic batch with idempotency; corrections use compensating reversals. The browser does not directly insert/update/delete financial ledger rows.
- Manual contribution rows are locked in the matrix. Duplicate active matrix rows are surfaced for reconciliation rather than overwritten.
- Super Admin transaction-entry UI calls guarded `post_financial_transaction`; transfers are atomic pairs.
- Financial posting headers and transaction rows are mutation-protected. Private SECURITY DEFINER helpers enforce Super Admin authorization and use an empty search_path. Public RPC wrappers are SECURITY INVOKER.
- Rollback-safe SQL tests previously passed for posting, idempotency, transfer pairs, reversals, payment approval atomicity, matrix corrections/rollback, member isolation, pending-account restrictions, and denial of legacy Admin role access. Re-run these after further schema changes.

## Security and performance findings

- Current Development Security Advisor: one warning — `pg_net` is installed in the `public` schema. Review relocation/remediation carefully because scheduled jobs currently call `net.http_post`; do not move the extension without updating and testing dependent cron SQL.
- Current Performance Advisor: 29 informational unused-index findings. Do not drop these based only on an unused-index report from an empty Development database.
- Storage buckets and policies exist, but upload/download authorization still needs separate-user browser testing.

## Remaining release blockers

1. Fix the Development Cloudflare Worker Preview so it returns a valid response; then run complete browser QA.
2. Deploy/configure Google Sheets Sync with a separate Development-only secret and confirm the actual Google Form/Sheet source URL.
3. Create isolated Development test accounts for Super Admin, Member A, Member B, and Pending signup; test every public/private page and cross-member data isolation in the browser.
4. Test Storage upload/download with separate authenticated users and verify private document isolation.
5. Verify real push delivery with a Development test subscription; cron HTTP 200 alone is not an end-to-end push test.
6. Confirm contribution due-month counting and reconcile monthly rates with the owner.
7. Reconcile migration history timestamps with repository migration filenames and inspect the full schema/function/policy diff before any release.
8. Review the `pg_net` schema warning and run three independent QA passes after fixes.

## Release policy

- Continue only on `dev-superadmin-field-editor`, Development Supabase, and Development Cloudflare Preview.
- Never point Development browser code at Production.
- Never write to Production, run Production migrations, or deploy Production without explicit approval.
- Do not call the project complete until browser flows, Storage access, accounting reconciliation, role isolation, Google Sheets integration, and end-to-end push delivery are verified.

# Friends Future Vision Forever — Development Readiness

Updated: 2026-11-11  
Scope: Development-only implementation and read-only Production metadata inspection.

## Environment boundaries

- GitHub repository: `sojibislam7659-a11y/Friends-Future-Visions`
- Development branch: `dev-superadmin-field-editor`
- Production branch: `main`
- Development Supabase project: `tvdxbyzvkjiebwslmnvj`
- Production Supabase project: `ugtzmtmsfaajclftfeuz`
- Production Worker: `friends-future-visions` — `https://friends-future-visions.sojibislam7659.workers.dev`
- Separate Development Worker: `friends-future-visions-dev` — `https://friends-future-visions-dev.sojibislam7659.workers.dev`

Production remains READ-ONLY. No Production rows, Auth users, Storage objects, Vault secrets, schema, Edge Functions, or deployment settings were changed.

## Branch and Cloudflare deployment

- Development remains ahead of `main`, 0 behind at the latest comparison on 2026-11-11. Main has not been changed; re-check the exact ahead count before release.
- The original Cloudflare project `friends-future-visions` tracks `main` only. Cloudflare's global Preview-branches switch cannot select one branch; it would build all non-production branches, including backups.
- To avoid touching Production, a separate Cloudflare Worker project `friends-future-visions-dev` was created and connected directly to GitHub branch `dev-superadmin-field-editor`.
- The Dev branch `wrangler.jsonc` Worker name was changed to `friends-future-visions-dev`, preventing `npx wrangler deploy` from overwriting the Production Worker.
- Initial Dev deployment completed successfully and uploaded 28 files. Build command is empty, deploy command is `npx wrangler deploy`, root directory is `/`.
- IMPORTANT: only the initial deployment is confirmed. Later Dev commits have been pushed after project creation; the latest deployment status and live asset/source parity still need a fresh browser verification. Do not treat the Dev Worker as release-certified until its live `/login.html`, `/member-profile.js`, and `/portal.js` are confirmed to match the current Git branch.
- The old `dev-superadmin-field-editor-friends-future-visions.workers.dev` alias is legacy and must not be treated as the canonical Development URL.

## Live schema comparison

Latest read-only catalog counts:

| Component | Production | Development |
|---|---:|---:|
| Public base tables | 15 | 16 |
| Public RLS policies | 47 | 50 |
| Public/private functions | 31 | 41 |
| Public/private triggers | 8 | 11 |
| Storage buckets | 5 | 5 |
| Storage policies | 17 | 18 |

Development's additional table is `financial_postings`, used for immutable posting headers and idempotency. Development also has additional financial posting/reversal columns and private helper functions. These are intentional accounting/security improvements; do not remove them merely to match object counts.

### Detailed parity differences

- Development has two additional tables: `public.financial_postings` and `private.contribution_matrix_operations`; there are no Production-only tables or columns. Development has 15 additional columns, including `financial_transactions.posting_id` and `reversal_of_id`.
- Development adds three ledger/transfer triggers, 15 constraints, and 12 indexes. It adds private SECURITY DEFINER helpers and changes several exposed public RPC wrappers from SECURITY DEFINER in Production to SECURITY INVOKER in Development.
- Production still has direct Super Admin INSERT/UPDATE/DELETE policies on `financial_transactions`. Development intentionally removes direct ledger writes and uses guarded RPCs, immutable posting rows, idempotency, and compensating reversals instead. Do not weaken Development to match this older Production model.
- Some broad Production `ALL` policies for committee documents and payment methods are split into explicit INSERT/UPDATE/DELETE policies in Development. The Development payment-submission policy set is narrower than Production's Super Admin full-access policy; verify the intended manual-entry workflow before release.
- Exact schema/security parity therefore requires a separately approved Production migration/release plan. It cannot be achieved safely by copying Production over Development.

Development currently has zero rows in `members`, `profiles`, `financial_transactions`, `financial_postings`, `notifications`, `push_subscriptions`, and `payment_submissions`. No Production user or financial data was copied.

## Migration history

- Development has 17 applied migrations.
- A previous mismatch between database migration versions and SQL filename prefixes was corrected on the Dev branch.
- Latest check confirms all 17 repository migration filename prefixes exactly match the 17 applied Development migration versions.
- The newest migrations `20261111144057_add_super_admin_private_document_upload_policy.sql` and `20261111144731_allow_linked_member_nominee_photo_read.sql` are applied and committed to the Dev branch. The latter lets a linked member read only the nominee photo path stored on their own member row, including photos initially uploaded before their account was linked.
- Rollback-only Development authorization tests passed: Super Admin sees and edits both test members; Member A sees only their own member row, cannot directly update even their own base member row or another member, and cannot change monthly contribution (the RPC raises its Super Admin guard); anon sees zero member rows. Super Admin can insert a private nominee-photo object; the linked owner can read that exact nominee-photo path, while another member sees zero rows. All test Auth users, profiles, members, rates, and Storage object rows were rolled back; a follow-up query confirmed zero QA fixtures remain.
- Do not run migration push/pull or rebase until the exact migration list is rechecked.

## Development Edge Functions and scheduled jobs

- Active Development Edge Functions: `invite-member` (v2), `review-member-signup` (v2), and `send-push` (v1).
- `invite-member` and `review-member-signup` CORS origins now point to the isolated Dev Worker URL. The invite redirect also points to the Dev Worker.
- Source files for all three Dev Edge Functions are now stored in the repository.
- Production additionally has `google-sheets-sync`; it is not deployed to Development.
- Development `google-sheets-sync` remains blocked on a separate Development-only webhook secret and the exact Google Form/Sheet source URL. Prior conversation retrieval did not find a Form URL, response Sheet URL, webhook URL, or field mapping. Never reuse Production secrets.
- Three Development cron jobs are active: meeting reminders (every minute), monthly due reminders (03:00 on the first day of each month), and push delivery (every minute).
- Recent push-delivery HTTP requests returned status 200 and cron runs succeeded. This confirms the scheduled endpoint call is accepted; it does NOT prove a real browser push notification was delivered. Development currently has no test users or push subscriptions.
- Development VAPID key pair and cron token were freshly rotated; the public key in `public/push-config.js` matches the Vault public key. The VAPID subject is configured. `get_push_config()` is SECURITY DEFINER but its execute ACL is restricted to `service_role`.

## Accounting and Contribution Matrix

- Main Contribution Matrix UI is restored in Development using `save_contribution_matrix`.
- Matrix changes are submitted in one atomic batch with idempotency; corrections use compensating reversals. The browser does not directly insert/update/delete financial ledger rows.
- Manual contribution rows are locked in the matrix. Duplicate active matrix rows are surfaced for reconciliation rather than overwritten.
- Super Admin transaction-entry UI calls guarded `post_financial_transaction`; transfers are atomic pairs.
- Financial posting headers and transaction rows are mutation-protected. Private SECURITY DEFINER helpers enforce Super Admin authorization and use an empty search_path. Public RPC wrappers are SECURITY INVOKER.
- The monthly contribution editor calls `set_member_contribution_rate`, preserving effective-date history rather than directly overwriting the contribution-rate history.
- Rollback-safe SQL tests previously passed for posting, idempotency, transfer pairs, reversals, payment approval atomicity, matrix corrections/rollback, member isolation, pending-account restrictions, and denial of legacy Admin role access. Re-run these after further schema changes.

## Super Admin Member Profile Editor

- GitHub Actions workflow `Development Static Checks` latest run `43042515132` completed successfully. Both jobs passed: every public JavaScript module passed Node syntax checking, and all three Development Edge Functions passed Deno type checking. The workflow actions were upgraded to Node 24-compatible releases; the latest run has no Node 20 deprecation warning. This is a source-level check, not a substitute for authenticated browser testing.

- Development's member profile editor now opens from a bottom-right pencil button; all Super Admin edit controls are hidden until that button is used.
- Editable business fields include member identity/contact/address/emergency/nominee details, consent text, joining dates, and Google Form response ID.
- Monthly contribution changes use the guarded rate-history RPC and require an effective date on the first day of a month.
- Profile and nominee photos can be uploaded from the same editor. Images up to 20 MB are resized to a maximum 1600px edge and converted to WebP when browser support is available; quality steps down automatically to fit the selected bucket's 5 MB/10 MB limit. Storage size limits are checked before upload.
- A Development-only Storage INSERT policy was added for Super Admin uploads to `member-private-documents`; Development Storage policy count is now 18.
- System identity fields such as row ID, Auth user link, and creation timestamp are not directly editable. Account linking remains through the invitation workflow.
- These changes have been committed to the Dev branch but still require live browser testing with a real Development Super Admin and member accounts. Do not claim upload/edit flows verified until that test passes.

## Security and performance findings

- Current Development Security Advisor: one warning — `pg_net` is installed in the `public` schema. Review relocation/remediation carefully because scheduled jobs currently call `net.http_post`; do not move the extension without updating and testing dependent cron SQL.
- Read-only Production Security Advisor additionally reports four authenticated-callable `SECURITY DEFINER` functions in the exposed `public` schema (`get_financial_summary`, `review_payment_submission`, `review_private_document`, `set_current_committee_document`) and disabled leaked-password protection. These findings require separate Production-owner approval to remediate; Production was not changed.
- Current Development Performance Advisor: 29 informational unused-index findings. Do not drop these based only on an unused-index report from an empty Development database.
- Development Auth redirect allow-list has not yet been verified for the new Worker URL. Signup, invite, and password-recovery redirects may fail until `https://friends-future-visions-dev.sojibislam7659.workers.dev/**` is allowed in the Development Supabase Auth URL configuration.

## Remaining release blockers

1. Verify the latest Dev Worker deployment and compare its live assets against the current Dev branch source.
2. Verify/add the new Dev Worker URL to Development Supabase Auth redirect allow-list; test signup confirmation and password reset.
3. Create isolated Development test accounts for Super Admin, Member A, Member B, and Pending signup; test every public/private page and cross-member data isolation.
4. Test the Super Admin pencil editor, every editable field, monthly rate history, profile photo upload, nominee photo upload, and old-file cleanup.
5. Test Storage upload/download with separate authenticated users and verify private document isolation.
6. Deploy/configure Google Sheets Sync with a separate Development-only secret and the actual Google Form/Sheet URL and field mapping. The exact historical Form URL has not been recovered.
7. Verify real push delivery with a Development test subscription; cron HTTP 200 alone is not an end-to-end push test.
8. Confirm contribution due-month counting and reconcile monthly rates with the owner.
9. Re-run accounting SQL tests and three independent QA passes after the remaining fixes.
10. Review the `pg_net` warning. Production security remediation and exact schema parity require separate Production approval.

## Release policy

- Continue only on `dev-superadmin-field-editor`, Development Supabase, and the separate Development Worker.
- Never point Development browser code at Production.
- Never write to Production, run Production migrations, or deploy Production without explicit approval.
- Development is not complete or release-certified until latest live code, Auth redirects, role isolation, profile editing, Storage, accounting, Google Sheets integration, and end-to-end push delivery are verified.

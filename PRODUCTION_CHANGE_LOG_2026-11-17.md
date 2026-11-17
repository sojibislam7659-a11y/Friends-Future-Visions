# Production Change Log — 2026-11-17

## Baseline
- Production branch: `main`
- Baseline commit: `d00880028e5f4c077b6e50781fd51bc9285242a7`
- Pre-change code backup: `backup/main-before-production-changes-20261117`
- Production Supabase project: `ugtzmtmsfaajclftfeuz`
- No Production code, database, or deployment changes have been applied as of this log's creation.

## Requested changes
1. Super Admin can edit the structured fields on each relevant page and save through one page-level Save Changes action; member permissions remain unchanged.
2. All authenticated members can view the shared contribution matrix and all-member due list; only Super Admin can edit financial data.
3. Improve mobile contribution-matrix readability without unnecessary data fetching.
4. Add show/hide controls to every password input.
5. Standardize visible branding to `Friends Future Vision Forever`.
6. Fix only verified low-contrast text/background combinations.
7. Add compact, relevant charts to Dashboard and suitable data pages.
8. Preserve responsive performance and concurrent-user behavior.

## Verified Production baseline findings
- 7 active members.
- 0 rows in `financial_transactions`.
- 0 rows in `member_contribution_rates`.
- All 7 active members have null `monthly_contribution` and null `contribution_start_date`.
- `public.get_member_shared_financial_data()` is absent.
- `public.save_contribution_matrix(uuid,jsonb)` is absent.
- The existing contribution-rate wrapper `public.set_member_contribution_rate(uuid,numeric,date)` exists.
- Current Main does not provide shared member contribution matrix to members.

## Change entries
### 2026-11-17 — Contribution matrix default amount correction
- Removed the unsafe hardcoded ৳2,000 default from the Main contribution matrix.
- A member's configured `monthly_contribution` is now used as the default; if no rate exists, the Super Admin is prompted to enter the amount rather than silently assuming one.
- Static verification: confirmed the hardcoded `amount.value = "2000"` and ৳2,000 default notice are absent, and the configured-rate fallback and warning are present.
- Production deployment and authenticated browser verification are pending.

### 2026-11-17 — Password visibility controls
- Added `public/password-visibility.js` to add accessible show/hide buttons to password inputs, including inputs added later by dynamic page rendering.
- Imported the helper from the shared portal, public DATA page, member profile page, login page, and signup page.
- Added responsive styling in `public/portal.css`.
- Static verification: re-fetched all six changed code files from the release branch; confirmed the script import is present in each entry point, the new script contains button type=button and accessible labels, and CSS styles the control.
- Merged into Main; live Worker deployment and browser verification remain unconfirmed.


## Rollback procedure
- Frontend rollback: restore Main to the pre-change commit by reverting the release merge commit (preferred) or moving Main back to baseline SHA only if no later unrelated commits exist. Keep the backup branch immutable.
- Database rollback: only run the exact reverse migration documented alongside each applied Production migration. Do not drop/recreate tables or delete ledger data as a rollback shortcut.
- Before any Production database migration, record the exact existing function definitions, grants, RLS policies, indexes, and row counts. After migration, verify them and run the rollback SQL only if a tested failure requires it.
- A code rollback does not automatically reverse database changes. Track the two separately.

## Implementation entries — 2026-11-17

### Frontend changes (merged into Main; live Worker deployment not independently verified)
- Password visibility: shared accessible show/hide control imported by login, signup, public DATA, member profile, and the shared portal. Static audit of all 25 HTML pages found password inputs only on login and signup; both load the control. Dynamically rendered portal password inputs are covered by the portal import.
- DATA: all authenticated members use the shared read RPC and can view all active members; member edit controls remain disabled. Super Admin retains matrix editing through an atomic batch RPC. Payment day is editable per cell; members see only the day, while Super Admin can click an amount to view the saved timestamp.
- DATA charts: added Pie, Column, and Line chart views using local SVG/CSS; no chart CDN or paid API.
- Dashboard: added compact financial charts from the existing summary data.
- Personal Due: all members see all members' due status; only Super Admin gets the rate editor and one batch Save Changes action. Missing rates display as `Rate not set`, not a fabricated amount.
- Member Profile: Super Admin can open a member's profile editor and save all editable fields, status, Member ID, optional monthly rate, and photos through one Save Changes action. Member permissions remain unchanged.
- Payment: consolidated bKash/Nagad settings into one Save Changes form; existing QR files are replaced only after the DB upsert succeeds.
- Proof: Super Admin can edit proof month, title, note, and publication status in one batch save; members only see published proofs.
- Rules: rules now load from a database table. The Rules page remains publicly readable; Super Admin can edit all rules in one Save Changes action. A static five-rule fallback was added so the page remains readable if dynamic loading is unavailable.
- Admin: added batch editors for recent non-transfer/non-matrix ledger transactions and existing dashboard notices. Matrix entries remain editable only from DATA; paired transfers remain locked.
- Branding: verified the exact requested name `Friends Future Vision Forever` across active pages; updated the 12 legacy member redirect page titles that had no brand.
- Contrast/mobile: added higher-contrast due status chips and improved mobile matrix cell/date readability and editor layouts.
- Performance: charts use inline SVG/CSS; shared DATA/Due reads use one RPC; writes use batched, transactional RPCs; no new third-party libraries or paid services.

### Production database migrations applied
- `20261117075243_shared_member_financial_data_read_rpc`
- `20261117075423_atomic_matrix_and_rate_batch_saves`
- `20261117075844_superadmin_member_profile_batch_editor`
- `20261117075904_fix_profile_editor_jsonb_validation`
- `20261117075925_fix_profile_editor_composite_assignment`
- `20261117080125_use_invoker_wrappers_for_admin_batch_writes`
- `20261117080239_capture_matrix_payment_day_and_original_timestamp`
- `20261117080416_move_shared_finance_logic_to_private_schema`
- `20261117080608_editable_public_committee_rules`
- `20261117080624_separate_public_and_member_rule_read_policies`
- `20261117080748_batch_edit_committee_proof_metadata`
- `20261117080914_batch_edit_financial_transaction_sources`
- `20261117080958_batch_edit_dashboard_notices`
- `20261117081514_index_admin_editor_foreign_keys`
- `20261117081534_allow_superadmin_private_member_doc_upload`
- `20261117081906_limit_member_rate_dates_to_committee_horizon`
- `20261117082154_index_and_clean_matrix_smoke_test_records`

### Verification performed
- Shared read RPC returned 420 rows covering 7 active members × 60 months for both Super Admin and Member.
- Member response returned no exact timestamp values; Super Admin role can receive the timestamp field.
- Super Admin smoke tests succeeded for matrix save, rate batch, member profile batch, rules batch, proof metadata batch, notice batch, and transaction batch using empty/no-op payloads.
- Member write attempts were rejected with SQLSTATE `42501` for matrix, rates, member profile, rules, proof metadata, notices, and ledger transaction editing.
- Public anonymous read test returned the 5 active rules.
- Matrix payment-day validation rejected day 32; day 16 with amount 0 returned `unchanged` and did not create a financial transaction.
- No Production financial transaction rows were inserted or updated. No member rates, notices, proof metadata, payment settings, or member profile values were changed.
- Two temporary no-op matrix idempotency test records were deleted after testing; the operations table is clean. The pre-existing rate helper was given the same Dec 2026–Nov 2031 effective-date guard as the new editors; the rollback SQL restores its exact prior definition.
- Added indexes for all newly observed unindexed foreign keys. The performance advisor no longer reports unindexed foreign keys; remaining unused-index and multiple-permissive-policy notices are pre-existing/expected with the currently empty tables. Remaining security advisor warnings are pre-existing: `pg_net` in public schema, leaked-password protection disabled, and four existing public SECURITY DEFINER workflow/summary RPCs. No new public SECURITY DEFINER editor RPCs remain; exposed batch write wrappers are SECURITY INVOKER.

### Current data limitations
- Production still has 7 active members, 0 financial transactions, and 0 configured contribution rates.
- Until Super Admin sets each member's monthly rate, Personal Due correctly displays `Rate not set`. No ৳2,000 default is assumed.
- Frontend merge confirmed: PR #4 merged at `2026-11-17T08:24:23Z`, Main commit `a01e7f9b3cb24c90029d9832ed93bcfeaf7a6306`. The connected Cloudflare Worker deployment status could not be independently verified in this session; do not treat merge as proof of live deployment.
- The requested editing is implemented as dedicated page-level editors for structured data (DATA matrix, Personal Due rates, member profile, Rules, Payment, Proof, Admin notices and manual ledger transactions). There is not a universal generic editor that can arbitrarily edit every rendered field on every page; the Admin page also has separate Save actions for separate workflows. This remains a scope gap against the request for one uniform bottom-of-page Save Changes system on every page.
- Release branch has a dedicated rollback SQL file: `PRODUCTION_ROLLBACK_2026-11-17.sql`. Code backup branch: `backup/main-before-production-changes-20261117`.


## Reconnection status — 2026-11-17
- GitHub connection: verified working.
- Supabase Production connection: verified working; project status `ACTIVE_HEALTHY`.
- PR #4: confirmed merged, not merely closed. Merge commit: `a01e7f9b3cb24c90029d9832ed93bcfeaf7a6306`.
- Main branch HEAD: `a01e7f9b3cb24c90029d9832ed93bcfeaf7a6306`.
- CI: the release PR's static JavaScript syntax and whitespace check had passed before merge. No separate push-to-Main workflow run was returned for the merge commit.
- Live Production Worker: not independently confirmed from this session. Direct network/browser verification was unavailable; do not claim that the deployment is live until the Worker URL is checked.
- Authenticated Super Admin and Member browser QA remains outstanding.

### Main merge and deployment verification update
- PR #4 (full release) merged to Main.
- PR #5 (static Rules fallback) merged to Main after the live fetch showed the old loading placeholder.
- PR #7 (preserve static Rules fallback when Supabase is unavailable) merged to Main; CI passed.
- Both PRs passed the GitHub Actions JavaScript syntax and committed-diff whitespace checks.
- The live Production Rules URL still returned the previous loading placeholder after PR #5; do not assume Cloudflare has deployed the latest Main commit until the Cloudflare Deployments page confirms the latest Main SHA. Authenticated browser QA remains pending.

### Final performance and concurrency checks
- A full no-op matrix save processed all 420 current cells (7 active members × 60 months) in 0.267 seconds on the Production database; no financial rows were written.
- Two parallel requests using the same idempotency key both returned the same 420-cell result; the idempotency lock prevented duplicate posting.
- All temporary matrix-operation smoke-test records were deleted; the operation table returned to zero rows.
- Live Worker checks: Rules fallback content is served, the password-visibility script asset is served, and the DATA matrix script asset is served. The login page exposes the 8-character recovery-code field and two new-password fields in its static markup. Actual eye-button click testing and authenticated page interactions still need a real logged-in browser session.

# Oikko — Security and Accounting Audit

Updated: 2026-11-08  
Scope: Development schema reconstruction, code review, SQL-level tests, and read-only Production catalog inspection.

## Safety boundary

- All writes in this audit were limited to Development Supabase project \`tvdxbyzvkjiebwslmnvj\` and Git branch \`dev-superadmin-field-editor\`.
- Production Supabase project \`ugtzmtmsfaajclftfeuz\` was queried for catalog metadata only.
- No Production data rows were queried, no Production writes/migrations were run, and no Production deployment was performed.
- No credentials or service-role secrets were placed in browser code or GitHub.

## Development changes

1. Reconstructed the 15-table application schema from read-only Production catalog metadata and committed a versioned Development baseline migration.
2. Added the \`financial_postings\` parent table, posting idempotency, linked reversals, fixed-precision amounts, and two-sided transfer validation.
3. Added trusted \`post_financial_transaction\` and \`reverse_financial_posting\` helpers. Transfers are inserted as a pair in one database transaction.
4. Added UPDATE/DELETE mutation guards for financial postings and financial transaction rows.
5. Removed authenticated direct INSERT/UPDATE/DELETE privileges on \`financial_transactions\`; client writes must use the trusted RPC.
6. Changed payment approval to use the trusted posting helper, preserving one transaction for approval state and ledger insertion.
7. Corrected the Development audit action constraint to permit INSERT, matching its insert-audit trigger.
8. Restricted authenticated function execution to the required RPC wrappers and RLS helpers. Public wrappers now use SECURITY INVOKER; privileged logic remains in private SECURITY DEFINER functions with explicit role checks and empty search_path.
9. Removed the legacy Admin role from Development portal authorization helpers, navigation, and route guards.
10. Updated member due calculation to subtract linked reversals of contribution transactions.
11. Removed the stale \`transactionMember\` reference after disabling the unsafe transaction form.
12. Added foreign-key indexes and consolidated overlapping permissive RLS policies.
13. Set \`preview_urls: true\` in Development \`wrangler.jsonc\`.

## Development database state

- 16 public tables, 50 public policies, 17 Storage policies, 5 private Storage buckets.
- 7 Development migrations applied.
- 0 Edge Functions deployed.
- 0 financial transaction rows, posting rows, audit rows, or test Auth users after rollback-safe tests.
- Security Advisor: 0 lints.
- Performance Advisor: only informational unused-index findings remain; no unindexed foreign keys or multiple permissive-policy findings.

## SQL-level tests passed

- Contribution posting and idempotent retry.
- Two-row transfer posting and deferred pair validation.
- Two-row transfer reversal, idempotent retry, and rejection of a second reversal.
- Contribution reversal linkage.
- Forced rollback leaves no posting behind.
- Payment approval, posting header, ledger row, and INSERT audit record succeed together.
- Member A and Member B cannot read each other's ledger rows.
- Members cannot post transactions.
- Pending accounts cannot read member records or financial summary.
- Legacy Admin role is rejected.
- Public SECURITY INVOKER wrappers successfully call guarded private helpers.

These tests used temporary Auth/member fixtures inside database transactions. All fixtures were rolled back and absence was rechecked.

## Important findings

### Audit schema mismatch
The Production audit table's action CHECK constraint was observed to allow only UPDATE/DELETE while the insert-audit trigger writes INSERT. That can cause ledger inserts to fail when the audit trigger fires. Development now allows all three actions. Production was not changed.

### Ledger integrity
Production's existing financial transaction table permits Super Admin UPDATE/DELETE. Its audit trigger records modifications but does not prevent them. Development now uses immutable ledger entries and linked reversals instead.

### Role model
The profiles role constraint already excludes \`admin\`, but older helper functions still recognized it. Development authorization now recognizes only \`super_admin\` and \`member\` for portal access and financial summary access. Pending/Rejected remain signup states.

### Runtime status
The Development Cloudflare Preview currently returns \`ERR_EMPTY_RESPONSE\`; no title or menu renders. Therefore browser-level UI tests are not complete. The Wrangler config now explicitly enables Preview URLs, but Cloudflare Preview deployment itself is not confirmed.

### Edge Functions and Storage
Development has no Edge Functions deployed. The four Production Edge Functions have not yet been copied or configured with Development-only secrets. Storage buckets and policies were reconstructed, but authenticated upload/download flows remain untested.

### Backup extraction
The active runtime contains the full Production custom-format backup, but \`pg_restore\` is unavailable here and the backup was not extracted. The Development schema was reconstructed from live read-only catalog metadata. No dump was restored.

## Remaining work before release

- Connect the disabled Super Admin transaction UI to the tested RPCs.
- Test the new posting and reversal flows through the actual browser session.
- Deploy and test the four Edge Functions against Development-only secrets.
- Test private Storage access with Super Admin and Member accounts.
- Resolve Cloudflare Preview deployment and verify the homepage, login, menu, and authenticated pages.
- Obtain owner approval for the due-month counting rule and reconcile member rate histories.
- Complete a full financial reconciliation and test backup/restore of Development.
- Keep Production read-only until the owner explicitly approves a specific release.

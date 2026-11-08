# Oikko Supabase and Release Readiness

Updated: 2026-11-08  
Scope: Development-only implementation and read-only Production metadata inspection.

## Environments

- Development Git branch: \`dev-superadmin-field-editor\`
- Development Supabase project: \`tvdxbyzvkjiebwslmnvj\`
- Development Cloudflare Preview URL: \`https://dev-superadmin-field-editor-friends-future-visions.workers.dev/\`
- Production Supabase project: \`ugtzmtmsfaajclftfeuz\`
- Production website: \`https://friends-future-visions.sojibislam7659.workers.dev\`

Production is READ-ONLY. No Production rows were queried, no Production writes or migrations were run, and no Production deployment was performed.

## Backup and schema provenance

- The active runtime contains \`oikko-production-full-20261103(1).dump\` (625,485 bytes) and \`oikko-development-20261103.dump\` (368,656 bytes).
- The separate \`oikko-production-schema-20261103.dump\` is not mounted in the current runtime.
- \`pg_restore\` is not installed in this runtime. The uploaded Production full dump was not extracted or restored.
- Instead, the Development baseline was reconstructed from read-only catalog queries against the live Production database: table columns, constraints, indexes, functions, triggers, RLS policies, Storage policies, bucket metadata, and migration history.
- No Production data rows, Auth users, Storage objects, or Vault secrets were copied.
- Production metadata at the time of inspection: 15 public tables, 36 migration records, 47 public policies, 17 Storage policies, and 5 private Storage buckets.

## Current Development database

- 16 public tables: the 15-table application schema plus \`financial_postings\`.
- 50 public RLS policies.
- 17 Storage policies and 5 private Storage buckets.
- 7 versioned Development migrations applied.
- 0 Development Edge Functions currently deployed.
- 0 financial transaction rows, 0 posting headers, 0 audit rows, and 0 temporary test users after rollback-safe tests.
- Security Advisor: 0 lints.
- Performance Advisor: no unindexed-FK or multiple-permissive-policy findings. It reports 30 informational unused-index findings because the newly reconstructed Development database has not yet had a normal workload.

## Accounting implementation in Development

- \`financial_transactions.amount\` uses fixed precision \`numeric(14,2)\`.
- Each new ledger entry belongs to a \`financial_postings\` header with a unique idempotency key.
- \`post_financial_transaction\` is the trusted posting path. A transfer creates its debit and credit rows in one database transaction.
- A deferred constraint trigger validates each transfer group: exactly two rows, one \`out\`, one \`in\`, equal amounts, two different accounts, and one posting header.
- \`reverse_financial_posting\` creates linked compensating entries. A posting can be reversed only once; a reversal cannot itself be reversed.
- Financial transaction and posting rows have mutation-blocking UPDATE/DELETE triggers. Authenticated users have SELECT only on the ledger tables; direct browser-side ledger writes are not granted.
- Payment approval now calls the same posting helper, so approval status, ledger posting, and insert-audit entry are committed together.
- The audit action constraint now permits INSERT, UPDATE, and DELETE, matching the existing insert-audit trigger.
- Public RPC wrappers use SECURITY INVOKER. Privileged work is in private SECURITY DEFINER helpers with explicit Super Admin checks and an empty search_path.
- The Development due calculation now subtracts linked reversals of contribution entries.
- Legacy Admin role access was removed from Development authorization helpers and browser navigation. Supported roles are Super Admin and Member; Pending/Rejected remain signup states.

## Verified Development checks

Rollback-safe SQL tests passed for:
- Super Admin contribution posting and idempotent retry.
- Atomic two-row transfer posting.
- Two-row transfer reversal and idempotent retry.
- Rejection of a second reversal.
- Contribution reversal linked to its original entry.
- Forced rollback leaving no posting behind.
- Payment approval producing an approved submission, one posting, one contribution row, and one INSERT audit row.
- Member A sees only their own member/ledger rows; Member B cannot see Member A's ledger.
- Members cannot post transactions.
- Pending accounts cannot read member records or the financial summary.
- Legacy \`admin\` role is rejected by the profiles role constraint.
- Public SECURITY INVOKER wrappers successfully delegate to guarded private helpers.

All test Auth users and financial entries were created inside transactions and rolled back. The Development database was rechecked afterward and contains no test data.

## Remaining blockers

1. The Super Admin transaction form remains disabled in the UI. The new RPCs exist and have SQL-level tests, but the UI has not yet been connected to them.
2. The Development Cloudflare Preview currently returns \`ERR_EMPTY_RESPONSE\`; no page title or menu renders. \`wrangler.jsonc\` now explicitly sets \`preview_urls: true\`, but a Cloudflare Preview deployment has not been confirmed.
3. Cloudflare's current Worker Preview workflow uses \`npx wrangler preview\` on the feature branch; Worker Previews require Wrangler 4.135.0 or later. See Cloudflare's official Preview docs.
4. Development has 0 Edge Functions. The four Production functions must be inspected, copied to Development, and configured with Development-only secrets before invite/signup/review workflows can be fully tested.
5. Storage buckets and policies exist, but real upload/download access has not yet been tested with separate authenticated users.
6. The contribution due month-counting rule (especially whether the current month is immediately due) still needs owner approval and reconciliation against each member's approved rate history.
7. The uploaded full Production dump has not been extracted in this runtime because \`pg_restore\` is unavailable. The schema baseline is based on live read-only catalog metadata, not a restore of that dump.

## Release policy

- Continue only on \`dev-superadmin-field-editor\`, Development Supabase, and the Development Cloudflare Preview.
- Never point Development browser code at Production.
- Do not deploy Production or run Production migrations without explicit approval.
- Do not enable financial entry UI until browser-level tests pass against the Development RPCs.
- Do not call the website complete until authenticated browser flows, Storage access, accounting reconciliation, and role isolation are verified.

# Supabase integration readiness

## Verified environment (2026-11-04)

- Development Git branch: `dev-superadmin-field-editor`.
- Development Supabase project: `tvdxbyzvkjiebwslmnvj`.
- Development Cloudflare preview: `https://dev-superadmin-field-editor-friends-future-visions.workers.dev/`.
- Production Supabase project: `ugtzmtmsfaajclftfeuz`.
- Production website: `https://friends-future-visions.sojibislam7659.workers.dev`.
- The browser client on the Development branch is configured for the Development Supabase project and uses a publishable key only.
- Development database audit previously found zero public tables, views, policies, functions, triggers, migrations, Edge Functions, and Storage buckets. Therefore the current app cannot complete an authenticated end-to-end test against Development.
- Production inspection in this review was metadata-only. No production rows were queried or changed, and no Production writes, migrations, or deployment were performed.

## Security boundary

- Browser code may contain only the public anon/publishable key.
- Never add a service-role key, secret key, database password, or privileged credential to browser files or GitHub.
- Client-side page guards are navigation safeguards only. Database grants, RLS, and trusted functions are the actual data-security boundary.
- RLS enabled does not by itself prove policies are correct.
- Keep all Development work isolated from Production. Do not point a Preview build at Production.

## Current Production metadata observations (read-only)

- 15 public tables were found and all 15 have RLS enabled.
- 47 public policies were previously counted. Targeted policy review confirms member-owned access for key member data and Super Admin-only write policies for sensitive workflows.
- Five Storage buckets were found; all are private. Separate Storage policies exist for committee proofs, member documents, member photos, committee documents, and payment QR images.
- The financial summary is exposed through a SECURITY DEFINER function with an empty search_path and an authenticated EXECUTE grant. Its underlying private helper is not directly executable by authenticated users.
- Several workflow functions perform explicit Super Admin checks.
- Important unresolved accounting issue: Production currently has Super Admin UPDATE and DELETE policies on `financial_transactions`. An audit trigger records UPDATE/DELETE events but does not prohibit them. This is not a strictly immutable ledger.
- Important unresolved application issue: the Admin transaction form directly inserts ledger rows. Account transfers are sent as two separate INSERT statements, so the pair is not guaranteed to be atomic.
- These observations are not permission to change Production. They are a list of issues to resolve in Development first.

## Role model

- `super_admin`: committee administration and approved financial posting.
- `admin`: member administration within approved scope and read-only financial reporting; no transaction posting, editing, deletion, role changes, or settings changes.
- `member`: safe aggregate dashboard plus own personal and financial summary; no other member's private data.
- Overall financial dashboard values must be served through a safe aggregate view/RPC. Do not expose raw committee-wide transaction rows to ordinary members.
- A member must never change their own role, approval status, member number, Auth UID link, or financial records.

## Accounting model

- Track cash in hand, bank balances, and investment assets separately.
- Cash-to-bank and bank-to-cash transfers are balance movements, not income or expenses.
- Investment deployment is an asset movement, not an operating expense.
- Record realized project profit/loss separately.
- Use fixed-precision numeric or integer poisha; never use floating-point arithmetic for money.
- Posted transactions should be immutable. Corrections should use linked reversal/correction entries, not silent UPDATE or DELETE.
- Account transfers must be posted atomically by one trusted database function.
- Opening balances must come from owner-verified records; do not invent them.

## Current Development code limitations

- The old contribution matrix module that directly edited financial transactions has been removed from the Development branch.
- The DATA page now routes through the role-guarded portal and its aggregate-summary RPC rather than that matrix module.
- Admin Personal Due navigation and page access are blocked in the portal UI; Members see their own due and Super Admin sees the committee-wide due view.
- The Admin transaction form still contains direct transaction INSERT logic and non-atomic transfer logic. Do not enable it against a live database until a trusted posting RPC exists and is tested.
- Contribution due calculation contains a hard-coded start date and needs to be reconciled with approved member-specific contribution-rate history before operational use.
- The Development database is empty, so none of the application queries, policies, RPCs, or role isolation can currently be end-to-end tested there.
- Old SQL drafts marked superseded must not be executed.

## Required next steps (Development only)

1. Prepare a complete Development schema from the verified, approved migration history—not from superseded SQL drafts.
2. Add and test trusted atomic financial-posting and reversal functions; remove direct UPDATE/DELETE rights for posted transactions once a safe correction path exists.
3. Align the Admin UI with the Admin read-only role and Super Admin-only posting role.
4. Verify every SECURITY DEFINER function: explicit authorization, fixed search_path, minimal EXECUTE grants, and safe object qualification.
5. Verify RLS and Storage policies with separate Super Admin, Admin, and two Member test accounts.
6. Test cross-member access denial, pending-account denial, expired sessions, proof access, and account-transfer rollback.
7. Reconcile contribution due calculations against the approved rate history and member start dates.
8. Only after Development tests pass, request explicit approval before any Production migration or deployment.

## Release policy

- All implementation and testing must occur on `dev-superadmin-field-editor`, Development Supabase, and the Development Cloudflare preview.
- Production remains read-only unless the owner explicitly authorizes a specific change.
- No Production deployment without explicit approval.
- The website must not be called complete until the live database schema, RLS, Storage access, accounting reconciliation, and role-isolation tests have passed.

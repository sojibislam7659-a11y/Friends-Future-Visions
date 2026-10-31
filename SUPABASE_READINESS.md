# Supabase integration readiness

## Current environment
- The browser client in `supabase-client.js` is configured for **Project 1**.
- The GitHub `development` branch and its Preview website therefore use Project 1 unless the client configuration is changed.
- Do not perform database writes from Preview. A Preview page can still read or write the same live database when it uses this client.
- Project 2 is not the active database target for this workflow.

## Security boundary
- The browser client must contain only the public anon/publishable key.
- Never add a `service_role` key, secret key, database password, or privileged credential to browser files or GitHub.
- Client-side page guards are navigation safeguards only. Supabase RLS and database privileges are the actual data-security boundary.
- Do not assume that RLS being enabled means the policies are correct.

## Before any Project 1 database change
1. Take and verify a recoverable backup of the database, including schema and data. Confirm the available restore method before proceeding.
2. Capture the current schema, constraints, indexes, triggers, functions, grants, RLS policies, and Storage policies.
3. Prepare a migration that is narrow, repeatable where practical, and includes a rollback or forward-repair plan.
4. Review the SQL before execution. Do not execute destructive or irreversible statements without explicit approval.
5. Test the change and verify the resulting permissions and data integrity.

## Role model to implement and verify
- `super_admin`: full committee administration, with financial changes and member deletion restricted to this role.
- `admin`: read-only financial access; can view and manage member details within the agreed limits; cannot alter transactions, roles, or settings.
- `member`: aggregate dashboard only, plus their own permitted personal and financial summary; no access to other members' private data.
- Overall financial dashboard values must be served through a safe aggregate view/RPC. Do not expose raw financial transaction rows to ordinary members.

## Accounting model
- Track hand cash and bank balances separately.
- Transfers between cash and bank change account balances but are not income or expense.
- Project investment is an asset movement, not an expense.
- Record project-level profit/loss separately.
- Avoid double-counting transfers and investments in income/expense totals.

## Current code limitations observed on development
- `admin.html` and `member.html` are role-guarded placeholders; they do not yet render committee data.
- No dashboard data queries are implemented in `auth.js` or `auth-guard.js`.
- The current `wrangler.jsonc` sets the repository root as the static asset directory. This can publish repository files that should remain internal; restrict public assets to a dedicated public directory before adding SQL migrations, backups, or internal documentation.
- Do not enable database writes from the Preview site while its browser client points to Project 1.

## Release policy
- Develop and review code on GitHub `development`.
- Preview must not perform writes against Project 1.
- Merge to GitHub `main` and deploy Production only after review and explicit user approval.
- Do not create another Supabase project or branch for this workflow.

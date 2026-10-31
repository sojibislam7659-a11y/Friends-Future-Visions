# Oikko Savings Committee — Completion Plan

Last reviewed: 2026-11-01

## Release boundaries
- All development changes stay on the `development` branch.
- Do not merge to `main` or deploy Production without the owner's explicit approval.
- The Preview browser client currently points to Supabase Project 1. Treat Preview as read-only until the database security audit and isolated test strategy are complete.
- Never place Supabase service-role keys, database passwords, or other privileged secrets in browser code or GitHub.

## Current repository implementation
- Public landing page: `public/index.html`.
- Email/password login screen: `public/login.html`; not connected to sign-in until the security gate passes.
- Shared Supabase browser client: `public/supabase-client.js`; public publishable key only.
- Authentication helpers: `public/auth.js`.
- Role navigation guard: `public/auth-guard.js`; this is not a replacement for RLS.
- Committee overview: `public/dashboard.html`; role guarded, currently displays placeholders rather than financial figures.
- Member portal: `public/member.html`; role-guarded placeholder.
- Admin portal: `public/admin.html`; role-guarded placeholder.
- Read-only metadata audit: `supabase-audit.sql`.
- Security and accounting constraints: `SUPABASE_READINESS.md` and `AUTH_LOGIN_DECISION.md`.
- Static assets are served from `./public` by `wrangler.jsonc`; internal root documentation and SQL are outside the published assets directory.

## Feature completion status

| Area | Status | Remaining work |
|---|---|---|
| Public landing page | UI present | Final owner review |
| Login UI | Present, deliberately not connected | Audit schema/RLS, test auth and role mapping |
| Role guard | Basic client navigation guard present | Verify server-side RLS independently |
| Main dashboard | Layout and empty states present | Secure aggregate views/RPC, real charts and totals |
| Member portal | Placeholder | Own profile, contribution history, due amount, proof access |
| Admin portal | Placeholder | Member administration and approval workflows |
| Member directory | Not implemented | Privacy-safe member list and own-profile access |
| Contributions and dues | Not implemented | Ledger model, monthly schedule, member balances |
| Income/expenses | Not implemented | Validated transaction forms and immutable audit trail |
| Bank/cash accounts | Model specified, not implemented | Separate account balances and transfer handling |
| Projects/investments | Not implemented | Project ledger, capital movement, returns, profit/loss |
| Proof documents | Not implemented | Private storage bucket, object policies, upload/review flow |
| Monthly statements | Not implemented | Verified period reports and export/print |
| Language toggle | Main overview has basic toggle | Consistent localization across all pages |
| Production release | Not approved | Owner review, test, explicit release approval |

## Accounting invariants
1. Member contributions increase cash or bank only according to the actual receiving account.
2. A transfer between cash and bank changes the two account balances but is not income or expense.
3. Project investment moves funds into an investment asset; it is not an operating expense.
4. Returned capital reduces the investment asset and increases the receiving account.
5. Project profit and loss must be recorded separately from returned capital.
6. Every transaction needs date, amount, transaction type, account, description, creator, and audit metadata.
7. Corrections should be traceable; do not silently overwrite historical financial entries.
8. Displayed totals must reconcile to the underlying ledger. Never use manually invented figures.

## Required security model
- `super_admin`: committee-wide administration and financial write authority.
- `admin`: member administration within agreed limits and read-only financial access.
- `member`: aggregate overview plus only their own permitted profile, dues, contribution history, and proofs.
- Ordinary members must not be able to read raw financial transaction rows or another member's private records.
- Private proof files must be stored in a private bucket with policies tied to the authenticated member and approved admin roles.
- Role assignment and approval must not be controlled by browser input.

## Owner-gated steps
These require the owner and cannot safely be guessed or completed by code alone:
1. Run `supabase-audit.sql` in the Supabase SQL Editor and share the result sets. Do not share passwords, tokens, or secret keys.
2. Confirm a recoverable backup and restore method before any schema/policy changes.
3. Confirm the final 12 member identities and their registered email addresses privately in the secure setup flow (do not put them in GitHub).
4. Confirm committee contribution rules, start date, monthly due date, late-payment policy, safety-fund treatment, and approved transaction categories.
5. Provide approved initial opening balances and source documents before real ledger data is entered.
6. Approve any database migration after its exact SQL and rollback plan are reviewed.
7. Test using separate super-admin, admin, and member accounts; approve production release only after cross-member access tests pass.

## Development sequence
1. Complete read-only schema, RLS, grants, function, trigger, and Storage audit.
2. Design a schema-specific migration and rollback plan based on actual audit results.
3. Implement and test RLS and role/profile relationships.
4. Connect email/password login and route users based on trusted role data.
5. Implement the ledger and account reconciliation logic.
6. Implement member, admin, and aggregate dashboard queries using least-privilege views/RPCs.
7. Implement private proof uploads and access controls.
8. Implement monthly statements, export, and final responsive/accessibility review.
9. Owner acceptance test, explicit production approval, then release.

## Current limitation
The project cannot truthfully be called complete until the live database schema and policies are audited, the owner supplies committee-specific rules and verified opening data, and role-isolation tests pass. UI-only placeholders are not operational financial software.

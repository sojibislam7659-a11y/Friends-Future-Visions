# Oikko — Security and Accounting Audit
Date: 2026-11-04
Scope: Development code review plus read-only Production metadata inspection.
Branch under development: `dev-superadmin-field-editor`.
No Production data rows were queried. No Production writes, migrations, or deployments were performed.

## Development environment
- Supabase project `tvdxbyzvkjiebwslmnvj` was previously verified ACTIVE_HEALTHY.
- Public schema was empty at the previous metadata audit: no tables, views, policies, functions, or triggers; no migrations, Edge Functions, or Storage buckets.
- This empty Development database blocks meaningful login, RLS, RPC, Storage, and end-to-end application tests.

## Changes already committed on Development
- Public homepage now presents a landing page rather than auto-redirecting to login.
- A static public rules page was added.
- DATA page routes through `portal.js`, not the former contribution-matrix module.
- The direct-write `public/public-data.js` contribution matrix module was removed.
- Admin Personal Due is blocked in the portal renderer.
- Portal and legacy navigation now show role-appropriate links.
- Latest verified branch commit at the time of this audit: see the Development branch HEAD in GitHub.

## Confirmed code findings
1. `public/portal.js` uses `get_financial_summary` for the aggregate dashboard and DATA page.
2. Member due calculation reads only the signed-in member's row for Member role and all active member rows for Super Admin. It uses contribution rate history and financial transaction rows, but its date calculation contains a hard-coded 2026-12-01 start boundary that must be checked against the approved committee start dates.
3. Super Admin transaction form currently writes directly to `financial_transactions`.
4. Transfer posting currently sends two separate INSERT operations. A failure between the two requests can leave only one side of a transfer posted.
5. The portal's financial transaction entry form does not yet use a single trusted database posting RPC.
6. Admin UI and Admin read-only reporting role need to remain separate from Super Admin transaction posting.
7. Legacy login helper uses Supabase email/password correctly, but successful Auth sign-in alone is not proof of approved committee membership; the profile role lookup and RLS remain mandatory.
8. Client-side role guards are not security controls by themselves.

## Confirmed Production metadata findings (read-only)
1. 15 public tables; RLS enabled on all 15.
2. Five Storage buckets; all are private.
3. Member-scoped RLS policies exist for own member record, own transaction rows, own contribution-rate history, own payment submissions, own profile requests, and own private documents. Super Admin policies cover designated management operations.
4. Aggregate financial summary is served by a SECURITY DEFINER function with an empty search_path and authenticated EXECUTE on the public wrapper; the private summary helper is not directly executable by authenticated users.
5. Workflow functions inspected include Super Admin checks for payment approval, contribution-rate changes, and member signup approval.
6. Critical accounting gap: Super Admin UPDATE and DELETE policies exist on `financial_transactions`. Audit triggers record modifications, but do not prevent them. This is not strict immutability.
7. Production policy set grants authenticated users EXECUTE on the public payment-review and contribution-rate wrappers. Both delegate to private SECURITY DEFINER functions. The payment-review helper explicitly checks `private.is_super_admin()`; the contribution-rate helper also explicitly checks `private.is_super_admin()` before changing rates. The wrappers use an empty search_path and are not SECURITY DEFINER themselves.
8. Storage policies restrict private object access by portal approval, ownership path, or Super Admin role. Policy simulation with real user accounts remains outstanding.

## Required remediation before operational use
- Create the Development schema only from a verified, approved migration sequence.
- Implement one atomic posting RPC for ordinary ledger entries and transfers.
- Add reversal/correction transactions and remove ordinary UPDATE/DELETE capability for posted financial transactions after the correction path is proven.
- Inspect and harden the public contribution-rate RPC authorization.
- Replace hard-coded contribution start assumptions with member-specific approved rate history.
- Test RLS and Storage access with separate Super Admin, Admin, and two Member accounts.
- Test transfer rollback and cross-member data access denial.
- Do not apply any of these changes to Production without explicit owner approval.

## Release boundary
Development-only code changes are permitted within the current branch. Production remains read-only. No deployment is authorized by this audit.

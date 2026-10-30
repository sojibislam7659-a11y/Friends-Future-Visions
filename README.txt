OIKKO SAVINGS COMMITTEE — WEBSITE STARTER

Current files on the development branch:
- index.html: responsive Bangla/English public homepage prototype
- admin.html: administrative dashboard UI preview (not connected)
- member.html: member dashboard UI preview (not connected)
- committee-logo.png: committee logo asset
- oikko_committee_website_starter.zip: original starter archive

IMPORTANT — CURRENT STATUS:
This repository is still a prototype, not a production-ready financial system.
The homepage login is intentionally non-functional. The admin and member pages are static UI previews only.
Do not enter real passwords or financial information into the prototype.
Displayed amounts and dashboard values are placeholders; no real balances or transactions are shown.
No live authentication, role verification, dashboard data query, or payment workflow is connected to these new pages.

Existing backend context:
The project has previously used Supabase tables and a Google Forms/Sheets synchronization workflow. Their current schema, policies, function configuration, and deployment state must be re-verified before frontend integration. Do not assume that a table existing means its access policies are secure.

Production implementation sequence:
1. Re-verify Supabase Auth, table schemas, RLS policies, storage policies, and Edge Function configuration.
2. Define and test role boundaries: only the committee's authorized administrator can approve applicants and assign member IDs; members can read only their own approved profile and transactions.
3. Connect authentication and enforce authorization in the database; never rely on hiding buttons or frontend-only role checks.
4. Connect the admin workflow for pending applications, member approval/ID assignment, and audited financial entries.
5. Connect the member dashboard to the authenticated member's own profile, dues, and transaction history.
6. Keep payment proof files in private storage and authorize access per member/admin.
7. Verify public aggregate totals are calculated from approved/verified records and do not expose private member details.
8. Test with separate admin and member accounts, including attempts to access another member's records.
9. Deploy only after the security and data-integrity tests pass.

Security constraints:
- Never place a Supabase service_role key or other privileged secret in browser code or a public repository.
- Browser code may use only the project's publishable/anon key with correctly configured RLS.
- Do not change production member data, financial records, authentication settings, or security policies without explicit authorization.
- Do not use real member information in static previews.

Hosting:
A free static hosting tier may be sufficient for the frontend prototype, but service limits and terms can change. Production use requires a tested deployment and backup/recovery plan.

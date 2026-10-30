# Oikko — Member login design decision

## Selected approach: Option A — Email + password

The project owner selected email + password for member login.

- Members will sign in using the email address registered to their account.
- Supabase Auth will verify the password.
- After authentication, the application must resolve the signed-in UID to the member profile through a narrowly scoped, RLS-protected relationship.
- The browser must never search or download the full member directory to find a matching email or member number.
- A member must not be able to choose or change their linked member record.
- Member ID remains an administrative identifier; it is not the login credential.

## Security gate — NOT YET PASSED

The login form must remain a non-functional preview until the live Supabase configuration and policies have been inspected and tested.

Required checks:
1. Confirm the actual current schemas and foreign-key relationship between auth.users, profiles, and members.
2. Confirm RLS is enabled on profiles, members, financial_transactions, and payment_submissions.
3. Review every SELECT/INSERT/UPDATE/DELETE policy and verify the authenticated UID is tied to exactly one member account.
4. Confirm pending applicants cannot access member dashboards or private financial information.
5. Confirm members cannot alter their own role, approval status, member number, auth-user link, or financial records.
6. Confirm only the designated administrator can approve applications and assign member IDs.
7. Verify private storage bucket and object policies for payment evidence.
8. Test using separate admin and member accounts, including a deliberate attempt by one member to read another member's records.
9. Review function security, including SECURITY DEFINER functions and fixed search_path where applicable.

## Implementation rules after the gate passes

- Use Supabase Auth's standard email/password sign-in.
- Use only the public anon/publishable key in browser code.
- Never put service_role, database passwords, or privileged secrets in browser files or GitHub.
- Do not query private tables before authentication.
- Do not treat a successful sign-in as proof of committee membership or approval; enforce authorization in RLS and trusted server-side logic.
- Show a generic sign-in error so the UI does not disclose whether an email account exists.
- After sign-in, route users according to a trusted role/profile result; do not trust a role supplied by browser input.
- Add sign-out and handle expired sessions.

## Current implementation status

- Email + password is the selected login method.
- `auth.js` contains email/password helper functions.
- The homepage login remains a non-functional preview.
- No login form is connected.
- No member lookup or dashboard query is implemented.
- No production data, authentication settings, or security policy has been changed.

## Required next action

Run `supabase-audit.sql` in the Supabase SQL Editor and review its output. Share the results (redact project identifiers if preferred; do not share passwords, access tokens, anon keys, or service_role keys). The audit queries are read-only metadata queries, but their output must still be reviewed carefully. Login integration starts only after the security checks above are verified.

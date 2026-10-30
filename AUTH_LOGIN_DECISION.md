# Oikko — Member login design decision

## Current mismatch
The homepage prototype asks for a Member ID, while the prepared Supabase Auth helper uses email + password. These are different login identifiers. Do not connect the current form to Supabase until the identifier flow is chosen.

## Option A — Email + password (recommended for the first secure release)
- Member signs in using the email address registered to their approved account.
- Supabase Auth verifies the password.
- After sign-in, the application resolves the authenticated UID to the member profile through a narrowly scoped, RLS-protected relationship.
- The browser must never search all members by email or member number.
- A member must not be able to choose or change their linked member record.

Advantages: uses Supabase's standard password authentication flow; avoids building a custom identity lookup endpoint.
Trade-off: members must remember/use their registered email rather than only their Member ID.

## Option B — Member ID + password
- Supabase Auth still authenticates a real identity; Member ID is not itself a password-authentication credential.
- A trusted server-side Edge Function must resolve the Member ID to the account's login identity without exposing a public member directory.
- The function must avoid account enumeration, enforce rate limits, return generic failure messages, and verify that the member record is approved and correctly linked.
- Never implement this by querying the members table from an unauthenticated browser client or by embedding a service_role key in frontend code.

Advantages: familiar Member ID login experience.
Trade-off: requires additional server-side code, security review, rate limiting, and testing.

## Required rules for either option
1. Only an administrator approves an applicant and assigns the Member ID.
2. Pending applicants cannot access member dashboards or private financial information.
3. After authentication, RLS—not frontend code—must restrict each member to their own profile and records.
4. Members cannot change their own role, approval status, member number, or auth-user link.
5. Admin privileges must be verified server-side/database-side.
6. Do not reveal whether a particular email or Member ID exists in public error messages.
7. Test with separate admin and member accounts, including cross-member access attempts.

## Current implementation status
- The homepage login remains a non-functional preview.
- auth.js contains email/password helpers only.
- No login form is connected.
- No member lookup or dashboard query is implemented.
- No production data or security policy has been changed.

## Decision required before wiring the login form
Choose one:
- A: Email + password.
- B: Member ID + password (requires a secure server-side lookup flow).

Do not activate login until the current Supabase schema and RLS policies have been audited and tested.
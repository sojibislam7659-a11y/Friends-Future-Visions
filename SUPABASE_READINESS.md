# Supabase integration readiness

## What is prepared
- `supabase-client.js`: browser client scaffold with session persistence and safe placeholders.
- `auth.js`: sign-in, sign-out, session lookup, and auth-state listener helpers.

These files are not active until configured. No credentials have been added and no live database is queried.

## Required before activation
1. Add only the Supabase project URL and anon/publishable key to `supabase-client.js`.
2. Never add the service_role key, database password, or any privileged secret to browser files or GitHub.
3. Inspect the actual current columns, constraints, triggers, RLS policies, and storage policies in Supabase.
4. Verify that a normal member can read only the member row linked to their own authenticated UID and only their own financial records.
5. Verify that a normal member cannot approve members, assign member numbers, alter status, change auth links, or write committee financial transactions.
6. Verify that only the designated committee administrator can approve applications and assign member IDs. Enforce this in database policies or trusted server-side functions, not just in the UI.
7. Test with separate administrator and member accounts, including attempts to read another member's records.
8. Keep payment evidence in a private storage bucket with access policies.

## Current intentional limitation
No table query is implemented here. The schema and RLS policies must be inspected before choosing queries; guessing column names or assuming that RLS is correct could expose private member and financial data.

## Activation checklist
- [ ] Public URL and anon/publishable key configured
- [ ] RLS policy review completed
- [ ] Admin-only approval and member-number assignment verified
- [ ] Member self-access verified
- [ ] Cross-member access denied
- [ ] Financial write permissions verified
- [ ] Private storage access verified
- [ ] Backup and recovery plan confirmed


## Grant audit review (owner-provided output)
The supplied `information_schema.role_table_grants` output shows no table-level privileges (SELECT, INSERT, UPDATE, DELETE, etc.) for `anon` or `authenticated` on `profiles`, `members`, `financial_transactions`, and `payment_submissions`. This is a positive least-privilege signal, but it is not a complete security verdict.

Important:
- Grants and RLS policies are separate controls.
- The output does not show column-level grants, inherited role memberships, function EXECUTE privileges, or storage object policies.
- The `service_role` rows shown as NO in this particular result do not prove service-role access is unavailable; Supabase service-role access is privileged and bypasses RLS. Never expose its key.
- Do not grant broad table access merely to make the browser UI work. If authenticated browser access is needed, grant only the minimum required privileges and rely on tested RLS policies.

Still required before login activation:
- RLS enabled/forced status for all four tables.
- Complete `pg_policies` output for those tables.
- Relevant columns and foreign keys, especially the mapping from `auth.uid()` to exactly one member.
- Function definitions and EXECUTE grants for any security-definer or RPC functions.
- Storage bucket privacy and storage.objects policies.
- Separate-account tests proving cross-member reads and unauthorized writes are denied.

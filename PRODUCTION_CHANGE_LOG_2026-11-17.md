# Production Change Log — 2026-11-17

## Baseline
- Production branch: `main`
- Baseline commit: `d00880028e5f4c077b6e50781fd51bc9285242a7`
- Pre-change code backup: `backup/main-before-production-changes-20261117`
- Production Supabase project: `ugtzmtmsfaajclftfeuz`
- No Production code, database, or deployment changes have been applied as of this log's creation.

## Requested changes
1. Super Admin can edit the structured fields on each relevant page and save through one page-level Save Changes action; member permissions remain unchanged.
2. All authenticated members can view the shared contribution matrix and all-member due list; only Super Admin can edit financial data.
3. Improve mobile contribution-matrix readability without unnecessary data fetching.
4. Add show/hide controls to every password input.
5. Standardize visible branding to `Friends Future Vision Forever`.
6. Fix only verified low-contrast text/background combinations.
7. Add compact, relevant charts to Dashboard and suitable data pages.
8. Preserve responsive performance and concurrent-user behavior.

## Verified Production baseline findings
- 7 active members.
- 0 rows in `financial_transactions`.
- 0 rows in `member_contribution_rates`.
- All 7 active members have null `monthly_contribution` and null `contribution_start_date`.
- `public.get_member_shared_financial_data()` is absent.
- `public.save_contribution_matrix(uuid,jsonb)` is absent.
- The existing contribution-rate wrapper `public.set_member_contribution_rate(uuid,numeric,date)` exists.
- Current Main does not provide shared member contribution matrix to members.

## Change entries
### 2026-11-17 — Password visibility controls
- Added `public/password-visibility.js` to add accessible show/hide buttons to password inputs, including inputs added later by dynamic page rendering.
- Imported the helper from the shared portal, public DATA page, member profile page, login page, and signup page.
- Added responsive styling in `public/portal.css`.
- Static verification: re-fetched all six changed code files from the release branch; confirmed the script import is present in each entry point, the new script contains button type=button and accessible labels, and CSS styles the control.
- Browser verification and Production deployment are pending; this is not yet live.


## Rollback procedure
- Frontend rollback: restore Main to the pre-change commit by reverting the release merge commit (preferred) or moving Main back to baseline SHA only if no later unrelated commits exist. Keep the backup branch immutable.
- Database rollback: only run the exact reverse migration documented alongside each applied Production migration. Do not drop/recreate tables or delete ledger data as a rollback shortcut.
- Before any Production database migration, record the exact existing function definitions, grants, RLS policies, indexes, and row counts. After migration, verify them and run the rollback SQL only if a tested failure requires it.
- A code rollback does not automatically reverse database changes. Track the two separately.

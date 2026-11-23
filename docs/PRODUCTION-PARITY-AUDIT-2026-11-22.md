# Production parity audit — 2026-11-22

## Scope and safety

This is a read-only comparison of the current Development Supabase project (`tvdxbyzvkjiebwslmnvj`) and Production Supabase project (`ugtzmtmsfaajclftfeuz`), plus the staged release branch. It contains no member names, emails, credentials, API keys, or personal financial details.

No Production database, Auth account, Storage object, Edge Function, Worker, or deployment was changed during this audit.

## Verified schema delta

Development has 20 public tables and Production has 16. Development has four public tables absent from Production and one private table absent from Production:

- `public.site_settings`
- `public.admin_change_audit`
- `public.financial_postings`
- `public.notification_push_deliveries`
- `private.password_rotation_guards`

Development-only columns:

- `public.profiles.must_change_password boolean`
- `public.profiles.password_change_required_at timestamptz`
- `public.financial_transactions.posting_id uuid`
- `public.financial_transactions.reversal_of_id uuid`

The only column default/nullability difference among shared columns found in this comparison is:

- `public.members.monthly_contribution`: Development default is `2000`; Production has no default. Both are nullable.

No shared-column data type or nullability mismatch was found in this comparison.

## Migration history

- Development: 61 applied migration records.
- Production: 53 applied migration records.
- Shared migration versions: zero.

These are independent histories. Never apply the Development migration directory wholesale to Production. A Production migration must be authored as a new, idempotent, data-preserving migration based on Production's live catalog, and rehearsed against a disposable clone or isolated test project before Production approval.

## Edge Functions

All listed functions were ACTIVE at audit time.

| Function | Development | Production |
|---|---:|---:|
| create-member-login | v4 | v3 |
| invite-member | v3 | v5 |
| review-member-signup | v5 | v4 |
| send-push | v4 | v3 |
| google-sheets-sync | absent | v3 |

Keep Production's `google-sheets-sync` unless its dependency and business purpose are separately verified. Do not blindly replace Production functions with Development versions.

The Development `create-member-login` and `review-member-signup` enforce AAL2 and use password-rotation profile fields. Production currently lacks those profile fields and the matching database guard logic. Deploying those Development functions before a coordinated database migration would break member-login administration.

Development `send-push` calls `claim_notification_push_delivery` and writes `notification_push_deliveries`; Production currently lacks both the table and RPC. Deploying the Development function alone would break push delivery.

## Production SECURITY DEFINER review

The four advisor findings were inspected against the live function catalog and definitions. All four have an empty `search_path`, which is a positive hardening measure, but it does not remove the need to minimize SECURITY DEFINER exposure.

- `public.get_financial_summary()` is SECURITY DEFINER and executable by authenticated users. It currently accepts legacy role `admin` in addition to `member` and `super_admin`. Current Production profile counts show no `admin` profile, but the function's role allow-list is stale relative to the intended two-role model. It calls `private.get_financial_summary()`, which is also SECURITY DEFINER and restricted to postgres/service_role. Recommended controlled fix: move the caller authorization into a private SECURITY DEFINER helper that explicitly permits only `member` and `super_admin`, then make the public RPC SECURITY INVOKER and grant only the required execute permission.
- `public.review_payment_submission()` is a SECURITY DEFINER wrapper around `private.review_payment_submission()`. The private function explicitly checks `private.is_super_admin()`; its execute ACL is restricted to postgres. Prefer an invoker wrapper with a narrow grant after verifying the exact function dependency chain.
- `public.set_current_committee_document()` is a SECURITY DEFINER wrapper around a private function that explicitly checks `private.is_super_admin()`; its private helper is restricted to postgres.
- `public.review_private_document()` is SECURITY DEFINER and performs the document update itself after checking `private.is_super_admin()`. It has an empty search path. A future hardening migration should move this privileged body into the private schema and expose only a SECURITY INVOKER wrapper.

Do not change these functions in isolation. Their grants, RLS dependencies, helper ownership, and live application RPC calls must be tested together. This review did not modify any function.

## Identity and data preservation

Production currently has 7 `member` profiles and 1 `super_admin` profile. Development has 1 `member` and 1 `super_admin` profile. Development test/sample rows must not be copied over Production identity or financial data.

## Required release gates

1. Create a fresh, complete Production backup, including database data/schema, Auth users and relevant Auth configuration, Storage object bytes and metadata, and Edge Function configuration. Secret values must be captured only through secure owner-controlled channels.
2. Verify backup integrity and perform a restore rehearsal before any Production write.
3. Prepare a Production-specific additive migration. Preserve existing Production rows and IDs; explicitly design any ledger backfill before adding a NOT NULL posting reference.
4. Reconcile RLS policies, grants, triggers, indexes, private schema access, and SECURITY DEFINER functions against the live Production catalog.
5. Update Edge Functions only after their database dependencies and secrets are ready.
6. Test with a real Member and the Super Admin account, including AAL2, signup, password rotation, member profile isolation, financial posting/reversal, private Storage, and notifications.
7. Run mobile and desktop browser QA.
8. Obtain explicit release approval before merging to `main` or deploying the Production Worker.

## Important limitations

A passing static JavaScript/SVG workflow is not end-to-end QA. A schema dump alone is not a complete backup: Storage object bytes, Auth configuration, Edge Function secrets, and external Google integration settings require separate handling. Supabase secret values cannot be read back through the ordinary Edge Function listing API.

# Supabase migration source of truth

The original 61 SQL migrations in this directory are synchronized with the Development project's
`supabase_migrations.schema_migrations` history as of 2026-11-21. They belong to the Development
migration history only.

## Production-specific staged migrations

The following nine files are staged for the Production schema. The first eight are Production-specific parity/ledger migrations; the ninth adds the privacy-safe public DATA summary. **All nine migrations have now been applied successfully to Production** in the exact order below on 2026-11-23, after a verified encrypted Drive backup, isolated PostgreSQL 17 restore rehearsal, verified Super Admin TOTP enrollment, and the coordinated production change. The same sequence also passed a separate isolated restore rehearsal. Do not replay these migrations or apply them to Development:

1. `20261122103000_harden_production_security_definer_wrappers.sql`
2. `20261122113000_add_production_portal_audit_and_password_parity.sql`
3. `20261122114500_align_public_policy_parity.sql`
4. `20261122115000_align_storage_policy_parity.sql`
5. `20261122123000_add_production_immutable_financial_ledger.sql`
6. `20261122124500_revoke_legacy_anon_table_grants.sql`
7. `20261122125000_align_public_table_grants.sql`
8. `20261122125500_align_public_default_privileges.sql`
9. `20261123100000_public_aggregate_data.sql`

Do not apply these files to Development. Do not batch-apply Development migrations to Production:
the two projects have unrelated migration version histories. Migration 2 intentionally blocks until
every Production Super Admin has a verified MFA factor. Migration 4 checks all five private Storage
bucket configurations. Migration 5 refuses to run if Production financial transactions or audit
rows are non-zero. The remaining migrations narrow public table grants and default privileges.

The latest post-migration encrypted Production backup was uploaded to Google Drive by workflow run
`45123841066` (manifest `FFV_ffv_backup_45123841066_1_manifest.json`). The post-migration PostgreSQL 17 restore rehearsal passed in workflow run `45124595947`: the Drive archive hash, Auth metadata, Storage inventory/bytes, five Edge Function snapshots, database restore, RLS, constraints, indexes, triggers, foreign keys, and Auth references were verified. The nine migrations were first rehearsed against an isolated restore and then applied to Production; live schema/ACL/RLS/Storage checks passed. Production currently has one verified Super Admin TOTP factor. Never replay these migrations against Production.

Limited SQL hardening was applied directly on 2026-11-23 and is included in that backup/restore point: `anon` privileges were revoked from public tables/sequences except `committee_rules SELECT`; `private.has_portal_access()` and `public.get_financial_summary()` now accept only `member` and `super_admin`; and an aggregate-only `public.get_public_financial_summary()` RPC was installed. These direct changes did not modify member/financial rows. The ninth migration records the intended post-ledger implementation and private helper.

## Development migration workflow

Before applying a new Development schema change:

1. Create a new timestamped SQL migration.
2. Apply it to the Development project only.
3. Verify the resulting policy/schema state and advisor output.
4. Commit the exact SQL migration file to the `development` branch.
5. Confirm repository migration filenames and database migration versions match.

The baseline migration is a schema-only Development baseline reconstructed from catalog
metadata. It intentionally contains no Production rows, Auth users, Storage objects, or
Vault secrets. Do not re-run the historical migrations against an already initialized
Development database.

## Validation

Release CI parses all standalone SQL migrations and SQL verification scripts. It explicitly skips
one historical non-standalone PL/pgSQL fragment. Grammar validation is not a substitute for
executing migrations in a restored rehearsal database and running the JWT/RLS/browser acceptance
tests.

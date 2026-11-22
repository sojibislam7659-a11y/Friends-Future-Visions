# Supabase migration source of truth

The original 61 SQL migrations in this directory are synchronized with the Development project's
`supabase_migrations.schema_migrations` history as of 2026-11-21. They belong to the Development
migration history only.

## Production-specific staged migrations

The following eight files were authored specifically for the Production schema. **None is applied**
to either Supabase project as of 2026-11-23. Apply them only in this exact order after a verified
backup and isolated restore rehearsal:

1. `20261122103000_harden_production_security_definer_wrappers.sql`
2. `20261122113000_add_production_portal_audit_and_password_parity.sql`
3. `20261122114500_align_public_policy_parity.sql`
4. `20261122115000_align_storage_policy_parity.sql`
5. `20261122123000_add_production_immutable_financial_ledger.sql`
6. `20261122124500_revoke_legacy_anon_table_grants.sql`
7. `20261122125000_align_public_table_grants.sql`
8. `20261122125500_align_public_default_privileges.sql`

Do not apply these files to Development. Do not batch-apply Development migrations to Production:
the two projects have unrelated migration version histories. Migration 2 intentionally blocks until
every Production Super Admin has a verified MFA factor. Migration 4 checks all five private Storage
bucket configurations. Migration 5 refuses to run if Production financial transactions or audit
rows are non-zero. The remaining migrations narrow public table grants and default privileges.

The Production backup was successfully uploaded to Google Drive by workflow run
`45054000337` (backup run ID `ffv_backup_45054000337_1`). The isolated restore rehearsal is still
pending; no Production migration has been applied.

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

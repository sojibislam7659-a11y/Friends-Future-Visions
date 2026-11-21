# Supabase migration source of truth

The original 61 SQL migrations in this directory are synchronized with the Development project's
`supabase_migrations.schema_migrations` history as of 2026-11-21. They belong to the Development
migration history only.

## Production-specific staged migrations

The following three files were created for the Production schema and are **not applied** to either
Supabase project:

1. `20261122103000_harden_production_security_definer_wrappers.sql`
2. `20261122113000_add_production_portal_audit_and_password_parity.sql`
3. `20261122123000_add_production_immutable_financial_ledger.sql`

Do not apply these files to Development. Do not batch-apply Development migrations to Production:
the two projects have unrelated migration version histories. The three Production migrations must
be reviewed and rehearsed, in order, against an isolated restore of Production after a verified
full backup. The second migration intentionally blocks until all Production Super Admins have
verified MFA. The third migration blocks if Production financial transactions or audit rows are
non-zero.

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

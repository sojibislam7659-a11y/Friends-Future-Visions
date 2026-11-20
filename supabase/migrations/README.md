# Supabase migration source of truth

The 46 SQL files in this directory are synchronized with the Development project's
`supabase_migrations.schema_migrations` history as of 2026-11-21.

Before applying a new schema change:

1. Create a new timestamped SQL migration.
2. Apply it to the Development project only.
3. Verify the resulting policy/schema state and advisor output.
4. Commit the exact SQL migration file to the `development` branch.
5. Confirm repository migration filenames and database migration versions match.

The baseline migration is a schema-only Development baseline reconstructed from catalog
metadata. It intentionally contains no Production rows, Auth users, Storage objects, or
Vault secrets. Do not re-run the historical migrations against an already initialized
Development database.

# Production Backup and Restore Design

**Status: Encrypted Production backup uploaded to Google Drive; PostgreSQL 17 restore and all-nine-migration isolated rehearsal passed. Hosted Auth/Storage service restoration remains outside the scope of this rehearsal.**

## 1. Objective

Create an encrypted off-site Production backup in the owner's Google Drive using only free-tier components already selected for this project:

- GitHub Actions for export/encryption orchestration.
- Supabase PostgreSQL and Storage APIs for data export.
- Google Apps Script Web App as a narrow, token-authenticated Drive receiver.
- GPG AES-256 for archive encryption.
- SHA-256 checksums for archive parts and the complete encrypted archive.

This design does not rely on paid Supabase backup/PITR features.

## 2. Current owner setup

The owner has already:

- Created the Google Drive folder `Friends Future Vision Forever Backup`.
- Created the Apps Script project `FFV Encrypted Backup Receiver`.
- Added Script Properties `FFV_BACKUP_FOLDER_ID` and `FFV_BACKUP_TOKEN`.
- Deployed a Web App as **Execute as Me / Anyone** and authorized it.

The deployed Apps Script Web App is now version 3. Its GET endpoint was verified and returned
`{"ok":true,"service":"FFV encrypted backup receiver","version":3}`. The existing Script Properties
`FFV_BACKUP_TOKEN` and `FFV_BACKUP_FOLDER_ID` were preserved. No credential values should be
pasted into ChatGPT or committed to Git.

## 3. Automation now staged

Files on `release/ffv-prod-parity-20261122`:

- `.github/workflows/backup-production-to-drive.yml` — manual workflow dispatch with a harmless `smoke_test` default and a monthly Production schedule (first day of each month, 03:00 UTC / 09:00 Bangladesh time).
- `scripts/export_supabase_backup.mjs` — exports Auth user metadata and downloads Storage object bytes.
- `scripts/upload_encrypted_backup.py` — splits an encrypted archive into 8 MiB chunks, uploads each chunk, then submits a manifest with per-part and whole-archive SHA-256 values.
- `scripts/verify_backup_parts.py` — reassembles manually downloaded Drive chunks and refuses to produce an archive unless every part and the complete encrypted archive match the manifest SHA-256.
- `backup/google-drive-receiver/Code.gs` — Apps Script receiver. It accepts authenticated encrypted chunks, validates sizes and SHA-256 hashes, rejects conflicting duplicates, and publishes a manifest only after every part is verified. Version 3 also exposes token-authenticated `download_manifest` and `download_chunk` recovery actions for one exact run ID; it does not expose generic Drive folder listing or browsing.
- `backup/production-edge-functions/2026-11-22/` — exact source snapshots of all five live Production Edge Functions. Each saved `index.ts` was independently fetched again and compared byte-for-byte with the live source.

The latest Production backup completed successfully in GitHub Actions run `45070634542`. Backup run ID: `ffv_backup_45070634542_1`. Manifest: `FFV_ffv_backup_45070634542_1_manifest.json`. This backup was created after the limited 2026-11-23 Production security hardening and therefore includes those changes.

The successful run validated all five required GitHub Actions secrets and the Production target, created the PostgreSQL 17 custom-format dump, exported Auth metadata and every Storage object byte, cross-checked Storage bucket/object counts against the database, included the preserved Production Edge Function snapshots, created and locally verified the AES-256 encrypted archive, uploaded the encrypted chunk and manifest to Drive, and removed the temporary runner workspace. The successful backup proves the required secrets are present; their values remain unreadable to ordinary workflow logs and must never be pasted into ChatGPT.

**Scheduling:** The monthly encrypted backup workflow is already on `main` and scheduled for 03:00 UTC on the first day of each month (09:00 Bangladesh time). The one-time manual backup branch used to create run `45070634542` is not merged; its push trigger was isolated to that branch.

## 4. Contents of the backup package

The staged workflow is designed to include:

1. PostgreSQL custom-format dump of the `public` and `private` schemas, including application tables, functions, triggers, policies and indexes.
2. Auth user metadata via the Supabase Admin API, including identifiers, email/phone, timestamps, user/app metadata, identities and available MFA factor metadata.
3. Every Storage bucket's metadata and every Storage object byte, with per-object SHA-256 manifest.
4. Non-secret configuration inventory: cron job names/schedules/active flags, Vault secret names only, applied migration versions, and PostgreSQL extension names/versions.
5. The 2026-11-22 Production Edge Function source snapshot and its version/JWT metadata.
6. Export timestamps, counts, byte sizes and checksums.

The database dump is created with PostgreSQL 17 tooling and checked with `pg_restore --list` before packaging. The archive is encrypted before any upload. Plaintext working files are removed at the end of the workflow, including on failure.

## 5. Important restore limitations

This is an encrypted operational backup bundle, **not a complete turnkey Supabase project restore**.

It does not export:

- Auth password hashes, access/refresh tokens, recovery tokens or password-reset secrets. Users will need a password reset/re-authentication process after restore.
- Hosted Auth provider settings, SMTP credentials, redirect URLs, custom domains or other dashboard-level settings.
- Vault secret values or Edge Function secret values. Only Vault secret names are inventoried.
- Cloudflare Worker secrets or DNS/account configuration.
- Google Sheets credentials or the value of `OIKKO_SYNC_SECRET`.

These values must be re-provisioned securely from the owner's password manager or provider dashboards. Never put them in Git or chat.

The Storage object bytes are downloaded separately because database metadata alone is not a Storage backup. The `auth` and `storage` managed schemas are not included in the application database dump; Auth metadata and Storage objects are exported through their supported APIs instead.

## 6. Required GitHub Actions repository secrets

Add these under GitHub → repository Settings → Secrets and variables → Actions. **Never paste their values into ChatGPT.** The first `smoke_test` mode needs only the Drive URL, receiver token and encryption passphrase; the database URL and service-role key are required only for `production` mode.

| Secret name | Required value |
|---|---|
| `FFV_PROD_DATABASE_URL` | Production PostgreSQL direct or session-pooler URI; SSL required; URL must identify project `ugtzmtmsfaajclftfeuz`. Do not use transaction pooling for the dump. |
| `FFV_PROD_SERVICE_ROLE_KEY` | Production Supabase service-role key. |
| `FFV_DRIVE_RECEIVER_URL` | Owner's Apps Script Web App URL ending in `/exec`. |
| `FFV_BACKUP_TOKEN` | Existing Apps Script `FFV_BACKUP_TOKEN` Script Property value. |
| `BACKUP_ENCRYPTION_PASSPHRASE` | Strong random passphrase stored separately in a password manager. |

The workflow checks that the database URL points to the Production project and that the receiver URL is an HTTPS Apps Script `/exec` URL. It never prints secret values.

## 7. Upload and recovery model

- Chunk size: 8 MiB; maximum 100 parts per archive.
- Each part is SHA-256 checked by the receiver.
- The manifest declares ordered part numbers, byte sizes, part hashes, total bytes and encrypted archive SHA-256.
- Duplicate retries are idempotent; conflicting duplicate chunks are rejected.
- The version 3 receiver permits only token-authenticated recovery for an exact run ID through `download_manifest` and `download_chunk`; it does not provide a general Drive listing endpoint. The restore workflow downloads encrypted chunks to an ephemeral GitHub Actions runner, verifies every chunk and the complete archive SHA-256 against the manifest, decrypts the archive, and restores the database dump into a temporary PostgreSQL 17 container. It does not copy the archive to the owner's phone or PC. The workflow verifies Storage object bytes and hashes but does not recreate a live Supabase Storage service or its buckets/objects; that limitation must remain explicit in the restore result.
- Automated 12-month Drive retention is not implemented; the receiver cannot delete files. Manage Drive retention manually until a separately reviewed retention mechanism exists.

A successful upload is not a restore test. Restore rehearsal must use an isolated, owner-approved target and must never overwrite Production.

## 8. Remaining gates

1. **DONE:** Apps Script receiver version 3 is deployed; GET reports version 3.
2. **DONE:** All five backup workflow secrets were validated by the successful Production backup run.
3. **DONE:** Latest encrypted archive and SHA-256 manifest were accepted by the configured Google Drive folder; temporary runner workspace was removed.
4. **DONE:** Isolated restore rehearsal passed in GitHub Actions run `45070745560` using `ffv_backup_45070634542_1`.
5. **DONE WITH LIMITATION:** PostgreSQL 17 restore, RLS, constraints, indexes, foreign keys, Auth ID references, Storage object-byte hashes, Edge Function snapshots, and cleanup checks passed. The workflow does not recreate a live Supabase Storage service or prove hosted Auth provider settings/password recovery.
6. **DONE:** All nine staged Production migrations applied in order to a second isolated restored PostgreSQL 17 database and final checks passed in run `45072671436`. The rehearsal used a synthetic verified MFA factor/AAL2 claim only in the temporary database; it did not create a real Production factor or modify Production.
7. **PENDING:** Verify that the merged Production MFA bootstrap is live on the Cloudflare Worker; the existing Super Admin must enroll and verify a TOTP factor. Production currently has zero verified MFA factors.
8. **PENDING:** Obtain final owner acceptance, apply the already-rehearsed migrations in the documented order, deploy schema-dependent Edge Functions one at a time, preserve Production-only `google-sheets-sync`, and run live Member/Super Admin acceptance tests before the final Worker release.
## 9. Website “Backup Now” button

A direct website button is not implemented. It would require a separate authenticated Cloudflare Worker endpoint that:

- requires a fresh Super Admin session and AAL2;
- enforces CSRF/origin checks and rate limiting;
- dispatches only this fixed GitHub workflow and fixed release ref;
- holds a narrowly scoped GitHub workflow-dispatch token in Cloudflare Worker Secrets;
- never exposes tokens or encryption passphrases to browser JavaScript;
- records only request ID, actor, timestamp and job status.

Do not implement or deploy this button until the manual backup workflow and restore rehearsal pass and the owner explicitly approves the Worker secret and deployment.

**Current conclusion:** encrypted Google Drive backup automation is active and a real restore rehearsal passed. This is not a turnkey hosted Supabase restore: Auth dashboard settings and a live Storage service are not recreated by the test. The remaining Production release is blocked on Super Admin TOTP enrollment, isolated rehearsal of the staged migrations, explicit owner acceptance, and final live acceptance tests. The MFA login bootstrap has been merged to `main`; Cloudflare deployment still needs verification.

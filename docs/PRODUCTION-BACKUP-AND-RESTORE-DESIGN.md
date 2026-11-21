# Production Backup and Restore Design

**Status: AUTOMATION STAGED; NOT YET RUN. No backup archive exists and no restore has passed.**

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

The current deployed Web App is still the earlier version 1. The latest hardened receiver code is in `backup/google-drive-receiver/Code.gs` and reports version 2. The owner must replace the Apps Script code and update the existing deployment:

1. Open Apps Script → `FFV Encrypted Backup Receiver`.
2. Replace `Code.gs` with the complete repository version.
3. Save.
4. Open Deploy → Manage deployments → Edit (pencil) → select **New version** → Deploy.
5. Open the existing `/exec` URL with GET. It must report `"version":2`.

Keep the existing Script Properties. Do not paste the folder ID or token into ChatGPT.

## 3. Automation now staged

Files on `release/ffv-prod-parity-20261122`:

- `.github/workflows/backup-production-to-drive.yml` — manual workflow dispatch with a harmless `smoke_test` default and a monthly Production schedule (first day of each month, 03:00 UTC / 09:00 Bangladesh time).
- `scripts/export_supabase_backup.mjs` — exports Auth user metadata and downloads Storage object bytes.
- `scripts/upload_encrypted_backup.py` — splits an encrypted archive into 8 MiB chunks, uploads each chunk, then submits a manifest with per-part and whole-archive SHA-256 values.
- `backup/google-drive-receiver/Code.gs` — Apps Script receiver. It accepts authenticated POSTs only, validates chunk sizes and hashes, rejects conflicting duplicates, and stores files in the configured Drive folder. It has no read/list/download/delete endpoint.
- `backup/production-edge-functions/2026-11-22/` — exact source snapshots of all five live Production Edge Functions. Each saved `index.ts` was independently fetched again and compared byte-for-byte with the live source.

The workflow has not been run. GitHub Actions repository secrets have not been configured. No encrypted archive has been uploaded. The first manual run is designed to be a harmless smoke test that does not connect to Supabase; only after it succeeds should the owner select Production mode and add the database/service-role secrets.

**Scheduling limitation:** GitHub scheduled workflows run only from the repository's default branch. Manual dispatch can select the release branch now. The monthly schedule will not activate until this workflow is merged to `main` after the restore gate and explicit owner approval. Do not merge solely to activate the schedule.

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
- The receiver intentionally cannot read, list or delete Drive files. For recovery, the owner downloads all chunk files from the Drive folder, reassembles them in part order, verifies the encrypted archive SHA-256, decrypts with the passphrase, and validates the PostgreSQL dump.
- Automated 12-month Drive retention is not implemented; the receiver cannot delete files. Manage Drive retention manually until a separately reviewed retention mechanism exists.

A successful upload is not a restore test. Restore rehearsal must use an isolated, owner-approved target and must never overwrite Production.

## 8. Remaining gates

1. Owner updates the Apps Script deployment to version 2 and verifies its GET response.
2. Owner configures the five GitHub Actions secrets.
3. Run the workflow manually from the release branch.
4. Confirm all encrypted chunks and the manifest appear in the Drive folder.
5. Download the chunks, reassemble and verify the archive checksum.
6. Decrypt and inspect the PostgreSQL dump; restore into an isolated Supabase project or local PostgreSQL rehearsal environment.
7. Verify Auth metadata, Storage object hashes, Edge Function source and required secrets/configuration.
8. Only after a successful restore rehearsal may the owner approve Production migrations, Edge Function deployment and merge to `main`.

## 9. Website “Backup Now” button

A direct website button is not implemented. It would require a separate authenticated Cloudflare Worker endpoint that:

- requires a fresh Super Admin session and AAL2;
- enforces CSRF/origin checks and rate limiting;
- dispatches only this fixed GitHub workflow and fixed release ref;
- holds a narrowly scoped GitHub workflow-dispatch token in Cloudflare Worker Secrets;
- never exposes tokens or encryption passphrases to browser JavaScript;
- records only request ID, actor, timestamp and job status.

Do not implement or deploy this button until the manual backup workflow and restore rehearsal pass and the owner explicitly approves the Worker secret and deployment.

**Current conclusion:** the backup code and automation are staged, but backup is not enabled or complete. No Production database migration, Edge Function deployment or Worker deployment has been performed.

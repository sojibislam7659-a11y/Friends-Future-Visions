# Production Backup and Restore Design — Friends Future Vision Forever

Date: 2026-11-22
Status: DESIGN ONLY — credentials and owner authorization not configured.

## Requirements

- Free services only.
- Monthly automatic backup and a manual backup trigger.
- Destination: the owner's personal Google Drive, folder `Friends Future Vision Forever Backup`.
- Backup must be encrypted before leaving the runner.
- Include database schema/data, Auth account records where safely exportable, Storage object bytes and metadata, Edge Function source, and a configuration inventory.
- Never store database passwords, service-role keys, Supabase access tokens, Google OAuth tokens, SMTP passwords, or VAPID private keys in Git or browser code.
- Retain the last 12 monthly backups by default, plus a rolling set of recent manual backups; confirm Drive capacity before enabling retention.

## Recommended free architecture

1. A GitHub Actions workflow in this repository runs on a monthly cron and on manual `workflow_dispatch`.
2. The workflow uses a pinned Supabase CLI version and the Production database connection secret.
3. It exports database schema, data, and role definitions into separate files. The workflow must explicitly inspect the CLI version's managed-schema exclusions; do not assume the standard `supabase db dump` includes `auth` or `storage`.
4. Auth account export is a separate step. Do not claim that Auth passwords or hosted Auth configuration are restorable from a public Admin API export. If the chosen export method cannot safely preserve Auth user records, record that limitation and design a tested re-authentication/reset procedure instead of fabricating password data.
5. Storage buckets/objects are enumerated recursively and every object byte is downloaded. Save a manifest with bucket, path, content type, size, metadata, and SHA-256 checksum. Database metadata without object bytes is not a complete Storage backup.
6. Edge Function source is downloaded/exported for every deployed function, including Production-only `google-sheets-sync`. Save function names, versions, JWT verification flags, and required secret names.
7. Hosted configuration inventory includes Auth URL/redirect settings, SMTP provider configuration (without passwords), enabled providers (without secrets), CORS, project URL/key identifiers, cron jobs, database webhooks, Storage bucket policies, and Google Sheets integration details.
8. Encrypt the complete backup archive locally in the runner using a strong owner-held encryption passphrase/key stored only in GitHub Actions Secrets. Upload the encrypted archive and a non-sensitive manifest to Google Drive using a dedicated Drive OAuth refresh token.
9. Verify the uploaded Drive file by downloading it again and checking the encrypted archive checksum. A successful upload alone is not a restore test.
10. Perform a scheduled restore rehearsal to an isolated, owner-approved target. Never restore over Production as a test.

## Required owner-controlled secrets

Names are placeholders for GitHub Actions Secrets; values must be supplied through the GitHub UI and must never be pasted into ChatGPT or committed:

- `FFV_PROD_DATABASE_URL` — Production Postgres connection string.
- `FFV_PROD_SERVICE_ROLE_KEY` — only if required by the tested Storage export script; use the minimum required access and rotate if exposed.
- `GOOGLE_DRIVE_CLIENT_ID`
- `GOOGLE_DRIVE_CLIENT_SECRET`
- `GOOGLE_DRIVE_REFRESH_TOKEN`
- `BACKUP_ENCRYPTION_PASSPHRASE` — long random passphrase or key.
- Optional: `SUPABASE_ACCESS_TOKEN` — only if Management API calls are required; store only in Actions Secrets and scope access appropriately.

The GitHub Actions workflow also needs permission to write workflow artifacts and access its own repository. A website "Backup Now" button would require a separate authenticated backend trigger, such as a Cloudflare Worker endpoint holding a narrowly scoped GitHub workflow-dispatch token. That token must never be exposed to browser JavaScript.

## Free-plan backup limitation

Supabase's official backup guide states automatic daily database backups are provided for Pro, Team, and Enterprise projects. Free projects should regularly export their data and maintain off-site backups. This design therefore does not rely on Supabase-managed daily backups or paid PITR.

## Important current Supabase CLI caveat

The current CLI v3 documentation says database commands target the local stack by default unless an explicit `--remote` target is supplied. The CLI backup guide requires Docker Desktop for `supabase db dump`; a GitHub-hosted Linux runner provides Docker support, but the workflow must pin and test the CLI version. The current CLI reference states that `db dump` excludes Supabase-managed schemas including `auth` and `storage`. The `db dump` command excludes Supabase-managed schemas (including `auth` and `storage`) from its normal dump path, and data/roles require explicit flags. Therefore a plain `supabase db dump` is not, by itself, a complete backup of Auth, Storage, or hosted configuration. Pin the CLI version and explicitly test every export component.

Supabase's official backup guide also states Storage object bytes are separate from database metadata and must be transferred separately. It documents downloading Edge Functions with `supabase functions download`; import maps and `deno.json` files may need to be restored manually. Edge Functions can be downloaded with the CLI, but import maps and `deno.json` files may need manual restoration.

## Workflow behaviour and failure rules

- Use a monthly schedule (first day of each month, 03:00 UTC / 09:00 Bangladesh time) and manual dispatch.
- Fail closed: if any export, encryption, upload, checksum, or manifest step fails, mark the run failed and do not delete older backups.
- Never log connection strings, OAuth tokens, encryption passphrases, or private keys.
- Use timestamped directories and a manifest; do not overwrite the previous known-good backup.
- Keep one backup outside the GitHub repository. Do not commit dumps or archives.
- Verify archive integrity after upload and retain a copy of the restore instructions.
- A backup is not considered verified until a restore rehearsal has passed.

## Optional website button

The website button must call an authenticated server-side endpoint. The endpoint should:
- require a fresh Super Admin session and AAL2;
- enforce CSRF/origin checks and rate limiting;
- dispatch only the fixed backup workflow (no arbitrary workflow/ref inputs);
- never receive or return secret values;
- record request ID, time, actor, and result status only;
- return a clear "queued/running/succeeded/failed" state.

The Worker must use a secret stored in Cloudflare Worker Secrets, not a value in `public/*.js`. Do not implement the button until the monthly workflow is tested successfully and the owner authorizes the OAuth connection.

## Current blockers

- No Google Drive OAuth authorization is available in the current ChatGPT connection.
- No owner-controlled GitHub Actions Secrets have been configured for the backup workflow.
- No Production database connection string is available to this session for a real export.
- No encrypted archive has been uploaded or checksum-verified in Drive.
- No restore rehearsal has been performed.

Accordingly, automatic or manual Google Drive backup is **not enabled** and no backup is claimed complete.

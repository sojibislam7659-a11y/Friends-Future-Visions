# FFV Google Drive encrypted backup receiver

This receiver stores encrypted backup chunks in one owner-selected Google Drive folder. It supports authenticated uploads and narrowly scoped recovery reads. It does not provide Drive listing, arbitrary file reads, or delete operations.

## Required existing Script Properties

- `FFV_BACKUP_TOKEN`: the existing random 256-bit bearer token.
- `FFV_BACKUP_FOLDER_ID`: the existing dedicated backup folder ID.

Never put either value in Git, an issue, or ChatGPT.

## Update the existing Apps Script deployment

1. Open the existing `FFV Encrypted Backup Receiver` project at https://script.google.com/.
2. Replace the full contents of `Code.gs` with this repository's `backup/google-drive-receiver/Code.gs`.
3. Save the project.
4. Open **Deploy → Manage deployments**.
5. Find the existing Web App deployment and click its pencil (Edit) icon.
6. Under **Version**, choose **New version**, then click **Deploy**.
7. Keep the same `/exec` URL and existing Script Properties. Do not create a second Web App, a second Drive folder, or a new token.
8. Open the same `/exec` URL in a browser. The health response must show `"version":3`.

If Google asks for authorization, approve the existing script's Drive access while signed in to the Gmail account that owns the backup folder.

## Security model

- Every upload and recovery request must provide the existing 256-bit token.
- Recovery is limited to a caller-supplied run ID matching the strict `[A-Za-z0-9_-]{16,64}` format.
- A manifest is returned only by exact generated manifest filename.
- A chunk is returned only when it is listed in that run's manifest and its stored byte size and SHA-256 match the manifest.
- Chunk reads are limited to 8 MiB, matching the uploader's maximum chunk size.
- The endpoint never lists Drive contents or accepts arbitrary Drive file IDs, names, or paths.
- The endpoint has no delete operation.
- No token, archive bytes, or manifest contents are logged.

## Restore-test workflow

After this receiver version is deployed and reports version 3, the owner can run **Manual Encrypted Production Backup Restore Test** in GitHub Actions.

For the existing first Production backup, the manifest file name is:

`FFV_ffv_backup_45054000337_1_manifest.json`

Enter the run ID only:

`ffv_backup_45054000337_1`

Then type `RESTORE_TEST` as the confirmation. The workflow downloads the encrypted chunks directly from this receiver, verifies every chunk and the whole-archive SHA-256, decrypts inside the temporary GitHub Actions runner, checks every exported Storage object's SHA-256, and restores the application database dump into a disposable PostgreSQL 17 container.

The restore workflow does not use Production database credentials, does not write to Supabase, does not create a GitHub artifact, and does not upload anything back to Drive. The temporary runner files and database container are removed in an always-run cleanup step.

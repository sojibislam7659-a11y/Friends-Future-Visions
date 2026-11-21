# Production-only Google Sheets sync

This function is currently deployed in Production as version 3 with JWT verification disabled.
It has no Development counterpart and must be preserved during the rollout.

Required Supabase Edge Function secrets (values must remain in Supabase secrets, never in Git):
- `OIKKO_SYNC_SECRET` — checked against the `x-oikko-secret` request header.
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

The function inserts Google Form responses into `public.members` with status `pending`.
It was exported read-only from the live Production function on 2026-11-22 and committed here
for source preservation only. Do not deploy this file over the live function without explicit
owner approval and a verified backup.

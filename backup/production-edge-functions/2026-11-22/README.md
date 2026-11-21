# Production Edge Function source snapshot — 2026-11-22

This directory preserves the live Production function source before any rollout.
All five Production functions returned exactly one source file (`index.ts`) during export.
No secret values were returned or committed.

| Function | Version | JWT verification | Environment names observed |
|---|---:|---|---|
| `send-push` | 3 | Off | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `review-member-signup` | 4 | On | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `invite-member` | 5 | On | None |
| `create-member-login` | 3 | On | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `google-sheets-sync` | 3 | Off | `OIKKO_SYNC_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |

Each function directory contains:
- `index.ts` — exact source fetched from the live Production project.
- `metadata.json` — live version, JWT flag, entrypoint and source bundle hash.

These are **source snapshots only**, not database backups and not a restorable copy of Edge Function secrets.
Keep the live Production functions unchanged until a verified full backup and isolated restore rehearsal pass.
In particular, `google-sheets-sync` is Production-only and must not be overwritten by the Development source set.

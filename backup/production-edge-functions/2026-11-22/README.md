# Production Edge Function source snapshot — refreshed 2026-11-23

This directory preserves the live Production function source and metadata as checked on 2026-11-23.
All five Production functions returned exactly one source file (`index.ts`) during export.
All five saved source files were fetched again and compared byte-for-byte against the live Production source; all matched.
No secret values were returned or committed.

| Function | Live version | JWT verification | Environment names observed |
|---|---:|---|---|
| `send-push` | 5 | Off; validates the private cron token before processing | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `review-member-signup` | 6 | On | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `invite-member` | 6 | On | No environment secret read by source |
| `create-member-login` | 5 | On | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `google-sheets-sync` | 4 | Off; validates its own shared secret | `OIKKO_SYNC_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |

Each function directory contains:
- `index.ts` — exact source fetched from the live Production project.
- `metadata.json` — live version, JWT flag, entrypoint and source bundle hash.

These are **source snapshots only**, not database backups and not a restorable copy of Edge Function secrets.
The full encrypted Production backup workflow must include this refreshed snapshot before upload.
Keep the Production-only `google-sheets-sync` function unchanged; do not replace it with Development source.

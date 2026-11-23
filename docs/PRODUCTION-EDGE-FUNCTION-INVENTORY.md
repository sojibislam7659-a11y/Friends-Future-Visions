# Production Edge Function inventory — 2026-11-23

Read-only inventory of the live Production Supabase project `ugtzmtmsfaajclftfeuz`.
No function was deployed or modified during this inventory.

| Function | Live version | JWT verification | Release source |
|---|---:|---|---|
| `send-push` | 5 | Off; checks the private cron token before processing | Exact live source snapshot refreshed |
| `review-member-signup` | 6 | On | Exact live source snapshot refreshed |
| `invite-member` | 6 | On | Production function; exact live source preserved |
| `create-member-login` | 5 | On | Exact live source snapshot refreshed |
| `google-sheets-sync` | 4 | Off; checks its own shared secret | Production-only function; exact live source preserved |

## Required secret names (values are not exported)

| Function | Secret / environment names observed in source |
|---|---|
| `send-push` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; Vault entries `ffvf_vapid_public_key`, `ffvf_vapid_private_key`, `ffvf_vapid_subject`, `ffvf_cron_token` |
| `review-member-signup` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `create-member-login` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `invite-member` | No environment secret read by source |
| `google-sheets-sync` | `OIKKO_SYNC_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |

All five live Production function `index.ts` files were fetched and compared byte-for-byte with
the saved files under `backup/production-edge-functions/2026-11-22/`; all five matched.
Metadata files were refreshed to the live versions and source hashes on 2026-11-23.
No secret values were queried or committed. The `google-sheets-sync` function is Production-only
and must not be overwritten by Development source. Its live version 4 is preserved.

Production also has `public.get_push_config()` restricted to `service_role`, the expected
VAPID/cron Vault secret names, and the `ffvf-push-delivery` pg_cron job. Only secret names were
checked; no decrypted values were queried. Verify required secrets exist before any future
function deployment. Do not replace Production-only integrations without explicit review.

## Deployment gate

Before any future Production Edge Function deployment:
1. Complete and verify a fresh encrypted backup and isolated restore rehearsal.
2. Apply and verify the ordered Production database migrations.
3. Confirm required Production secret names exist without exposing secret values.
4. Verify the push-delivery table and service-role claim RPC.
5. Deploy one function at a time and run authenticated/unauthenticated smoke tests.
6. Keep `google-sheets-sync` unchanged unless separately approved.

A source match in Git is not evidence that a function's runtime secrets are correctly configured.

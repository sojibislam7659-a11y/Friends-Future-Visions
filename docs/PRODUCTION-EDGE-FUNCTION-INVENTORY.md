# Production Edge Function inventory — 2026-11-22

Read-only inventory of the live Production Supabase project `ugtzmtmsfaajclftfeuz`.
No function was deployed or modified during this inventory.

| Function | Live version | JWT verification | Release source |
|---|---:|---|---|
| `send-push` | 3 | Off; function performs its own request checks | Development source staged; rollout waits for schema/secret gate |
| `review-member-signup` | 4 | On | Development source staged |
| `invite-member` | 5 | On | Development source staged; Development implementation is a retired 410 response |
| `create-member-login` | 3 | On | Development source staged |
| `google-sheets-sync` | 3 | Off; checks `x-oikko-secret` | Production-only source snapshot preserved at `supabase/functions/google-sheets-sync/index.ts` |

## Required secret names (values are not exported)

| Function | Secret / environment names observed in source |
|---|---|
| `send-push` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `review-member-signup` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `create-member-login` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `invite-member` | No environment secret read by the retired Development handler |
| `google-sheets-sync` | `OIKKO_SYNC_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |

The source of the Production-only `google-sheets-sync` function was fetched from the live
Production project and committed to this release branch. It contains environment variable
references only; no secret values were included. Its live version 3 must remain deployed until
the owner explicitly approves a replacement. Do not overwrite it with the Development function
set because Development has no counterpart.

## Deployment gate

Before any Production Edge Function deployment:
1. Complete and verify the full backup and isolated restore rehearsal.
2. Apply and verify the ordered Production database migrations.
3. Confirm required Production secret names exist in Supabase without exposing values.
4. Verify the new `send-push` delivery table and service-role claim RPC.
5. Deploy one function at a time and run authenticated/unauthenticated smoke tests.
6. Keep `google-sheets-sync` untouched unless separately approved.

A source match in Git is not evidence that Production has been deployed or that its runtime
secrets are correctly configured.

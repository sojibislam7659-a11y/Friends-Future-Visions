# Friends Future Vision Forever

Mobile-first private committee portal.

## Production

- Cloudflare Worker URL: https://friends-future-visions.sojibislam7659.workers.dev
- GitHub production branch: `main`
- Supabase Main project: `ugtzmtmsfaajclftfeuz`

## Access model

- Only `super_admin` can create, edit, or delete committee and financial records.
- `admin` and `member` roles are read-only.
- Members can view only their own sensitive profile, due information, and transaction entries.
- Members can submit profile-change requests and upload their own photo; changes/photos are published only after Super Admin approval.
- The public member directory contains only member number, name, and approved photo.
- Members cannot submit payments or upload financial proofs.

## Main features

- Live aggregate finance dashboard and monthly summaries.
- Cash, bank, and investment ledgers with paired account transfers.
- Transaction insert/update/delete audit trail.
- Member contribution-rate history and due calculation.
- Monthly committee proof storage.
- Published notices, inbox, monthly due reminders, meeting reminders, and generic web push.
- Super Admin member invitations through the `invite-member` Edge Function.

## Security

- Browser code contains only the Supabase publishable key.
- Service-role credentials and VAPID private key are not stored in GitHub or browser code.
- VAPID secrets are stored in Supabase Vault; `send-push` runs server-side.
- RLS is enabled and all write policies are restricted to Super Admin except member profile-change requests and own-photo uploads.
- Legacy SQL drafts `supabase-security-migration.sql` and `supabase-notifications-migration.sql` are marked superseded. Do not run them.

## Operational setup still requiring owner input

1. Invite each active member using the Super Admin panel; this sends an email invitation.
2. Confirm each member's monthly contribution amount and effective month.
3. Enter verified opening balances and historical/current transactions.
4. Upload monthly bank deposit or investment proofs.
5. Supply the committee's approved written rules and deed details before publishing them.
6. Enable Supabase Auth leaked-password protection in Authentication settings.
7. Confirm Cloudflare has deployed the latest `main` commit and test the live site on mobile and desktop.

## Branch safety

- Before each code change, the current `main` state is snapshotted to `development`.
- The stable backup branch remains untouched until the owner asks to mark a release stable.

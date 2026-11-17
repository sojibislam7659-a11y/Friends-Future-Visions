# Friends Future Vision Forever

Mobile-first private committee portal.

## Production

- Cloudflare Worker URL: https://friends-future-visions.sojibislam7659.workers.dev
- GitHub production branch: `main`
- Supabase Main project: `ugtzmtmsfaajclftfeuz`

## Access model

- Only `super_admin` can create, edit, or delete committee and financial records.
- Only `super_admin` can edit committee, member, payment, proof, notice, and financial records.
- All authenticated members can view the shared monthly contribution matrix (member names, Member IDs, amounts, and payment day) and the all-member Due summary.
- Members cannot edit the shared DATA or Due pages; exact saved timestamps and sensitive profile/document details remain Super Admin-only or limited to the member's own profile as appropriate.
- Members can submit profile-change requests and upload their own photo; changes/photos are published only after Super Admin approval.
- The public member directory contains only member number, name, and approved photo.
- Members can submit payment claims for Super Admin verification, but cannot upload or edit financial proofs.

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

- Production changes are developed on a release branch, checked by GitHub Actions, and merged to `main` through a pull request.
- The pre-release code snapshot is `backup/main-before-production-changes-20261117`.
- Database rollback instructions are in `PRODUCTION_ROLLBACK_2026-11-17.sql`; review data changes before restoring a database backup.


## 2026-11-17 release status

- Main includes the shared DATA/Due views, Super Admin editors, password visibility controls, charts, and the public Rules fallback.
- Production Supabase schema additions are applied, and the Cloudflare Worker has been verified serving the latest Main release assets. Authenticated browser QA remains pending.
- Current Production data at release time: 7 active members, no financial transactions, and no configured contribution rates. Set each member's approved rate before relying on Due totals.

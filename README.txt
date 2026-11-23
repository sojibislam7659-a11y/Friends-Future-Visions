FRIENDS FUTURE VISION FOREVER — WEBSITE

PROJECT STATUS
- Active application code is in the public/ directory.
- The development branch remains the source of ongoing Development work.
- The release/ffv-prod-parity-20261122 branch is a staging branch for reviewing Development changes against Production configuration; it is not deployed.
- The main branch is Production. Do not merge or deploy to Production without a verified current backup, completed tests, and explicit approval.
- Preserve the existing design, logo, navigation, and working features unless a change is specifically approved.

HOSTING
- Development Worker: development-friends-future-visions-dev
- Development URL: https://development-friends-future-visions-dev.sojibislam7659.workers.dev
- Production Worker: friends-future-visions
- Production URL: https://friends-future-visions.sojibislam7659.workers.dev
- wrangler.jsonc on development must keep the Development Worker name.
- wrangler.jsonc on main must keep the Production Worker name.

SUPABASE PROJECTS
- Development uses the separate Supabase project Oikko Development (ref: tvdxbyzvkjiebwslmnvj).
- Production main continues to use its existing Supabase project (ref: ugtzmtmsfaajclftfeuz).
- Browser code may contain only the publishable/anon key.
- Never commit service_role keys, secret keys, database passwords, VAPID private keys, or cron tokens.
- Development migrations must be reviewed and applied only to the Development project unless Production migration approval is explicitly given.

APPLICATION
- Static frontend pages are served from public/.
- Shared browser modules include portal.js, portal.css, supabase-client.js, auth-guard.js, public-data.js, member-profile.js, rules-content.js, rules-documents.js, password-visibility.js, and push.js.
- Supported account roles are member and super_admin. Signup states may also include pending and rejected; these are not access roles.
- Public rules and authenticated member/financial pages must follow the access rules enforced by Supabase RLS and Storage policies.
- Financial transactions must be written through the approved ledger RPCs. Do not add direct client-side writes to the financial_transactions table.
- Corrections must use the reversal-based correction workflow; do not overwrite posted financial entries.

DEVELOPMENT DATABASE
- Current Development project: Oikko Development.
- Migrations in supabase/migrations/ are named to match the applied Development migration versions.
- Keep each new Development migration committed to the development branch.
- Never copy Development schema or data to Production without reviewing the migration and receiving explicit approval.
- Test RLS, RPCs, Storage, Auth, and both Member/Super Admin access before considering a feature complete.

QUALITY CHECKS
- GitHub Actions workflow: .github/workflows/release-static-checks.yml
- Current automated checks: JavaScript syntax, SVG logo validation, and committed-diff whitespace.
- A passing static workflow does not prove browser interaction, Auth, or end-to-end financial workflows.
- Do not claim full QA until real Member and Super Admin accounts have been tested separately.
- Keep private member documents and personal information in private Storage with server-side authorization.
- Do not remove indexes or database functions solely because an advisor marks them unused; check dependencies and workload first.

FREE-TIER REQUIREMENT
- Prefer free plans and built-in tooling.
- Do not enable paid services, create paid projects/branches, or purchase credits without explicit approval.
- If a free-tier limit blocks a task, explain the limit and propose the best no-cost alternative before proceeding.

BACKUP AND RELEASE
- Existing backups are maintained separately by the project owner.
- Before any Production release, verify the latest Development code, database migrations, RLS policies, Storage rules, Auth, mobile layout, and desktop layout.
- Production merge/deployment requires explicit approval.

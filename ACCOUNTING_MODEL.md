# Oikko Committee — Accounting and Data Model

This document defines the intended accounting behaviour. It is a specification, not a database migration. Do not execute it as SQL or use it to invent opening balances.

## Core records

### Members
- Stable internal UUID
- Committee member number (administrative identifier)
- Full name and optional photo
- Registered email mapped to Supabase Auth UID through a protected profile relationship
- Membership status: pending, active, suspended, or exited
- Join date and approved monthly contribution amount
- Created/updated timestamps

A member must never be able to change their own role, approval status, member number, Auth UID link, or financial records.

### Financial transactions
Recommended fields:
- UUID, effective date, created timestamp
- Type and subtype
- Amount in BDT as a fixed-precision decimal or integer poisha; never floating-point arithmetic
- From-account and to-account where applicable
- Related member, project, or payment submission where applicable
- Description and external reference
- Created by, approved by, and audit metadata
- Reversal/correction reference instead of silently erasing a posted transaction

### Accounts
Keep separate balances for:
- Committee cash in hand
- Committee bank account(s)
- Investment/project assets

Do not combine cash and bank into a single untraceable balance.

### Projects
- Project name and status
- Capital deployed
- Capital returned
- Realized profit/loss
- Outstanding amount and supporting evidence

### Payment evidence
- Private storage object
- Related member and/or transaction
- Submitted timestamp, review status, reviewer, and note
- Storage object access governed by Storage RLS policies

## Transaction semantics

| Event | Cash/bank effect | Income/expense effect |
|---|---|---|
| Member deposits contribution | Receiving account increases | Contribution recorded in member ledger; classify according to approved reporting policy |
| Cash-to-bank transfer | Cash decreases, bank increases | Neither income nor expense |
| Bank-to-cash transfer | Bank decreases, cash increases | Neither income nor expense |
| Investment deployed | Cash/bank decreases, investment asset increases | Not an operating expense |
| Return of invested principal | Cash/bank increases, investment asset decreases | Not income |
| Realized project profit | Receiving account increases | Profit/income |
| Realized project loss | Investment asset or receiving account decreases | Loss |

## Reconciliation checks
- Sum of cash and bank movements must reconcile to posted transactions.
- Transfers must net to zero across the committee's cash/bank accounts.
- Investment capital outstanding = deployed principal − returned principal, adjusted for documented write-offs.
- Member contribution ledger must reconcile with received payment transactions.
- Monthly opening balance + period movements = monthly closing balance for each account.
- No chart or summary should be shown as final if its source ledger does not reconcile.

## Access rules
- Members: own personal ledger and own proof submissions only, plus safe aggregate figures.
- Admin: member administration within approved scope and read-only financial reporting.
- Super Admin: approved financial posting, correction, and member administration.
- A browser-hidden element is not a security control. Enforce access in database grants, RLS, and trusted functions.

# Golai — What's Left

Updated 2026-07-22.

**Where we are:** all seven build phases are complete and verified end-to-end
against a live database. U&M Designs is provisioned (13 zones, admin
`merchant@uandm.co.in`), the app is deployed on Netlify, and migrations run
0001 → 0024.

**Shipped since the last revision:** the stock card, the manager stock
dashboard, item labels at receiving, the first-run checklist, the stock-count
blind-spot fix, the Settings screen with a working undo window, empty states
across every list, one-click sample data, and a first load cut from 1.66 MB to
584 KB. Building these also fixed three silent data bugs — see the notes under
A1.

**Part B is down to three items, and all three are decisions rather than
tickets** — WhatsApp needs a commercial call, Hindi needs a real i18n budget,
and multi-warehouse needs a product answer.

This file is **two different roadmaps**, deliberately separated:

- **Part A — Finish U&M.** What stands between "working" and "handed over to the
  first paying client".
- **Part B — Make it a product.** What stands between "one client" and "ten
  clients without DBBS in the room for every setup".

They compete for the same week. Mixing them is how a product becomes a
one-client custom build, so they are kept apart on purpose.

Legend: **★** = also fixes a general product gap, not just a U&M request.

---

# Part A — Finish U&M

**Every feature U&M asked for is now built.** What remains is verification and
their own data — no code.

> **Did building their requests improve the app?** Yes, almost without
> exception. U&M were the first real users, so what they hit were the gaps the
> PRD never noticed, not U&M quirks: codes kept verbatim, client-named
> locations, a mapping walk that needs no barcodes, phone logins, the stock
> card. The test to keep applying to the next client: **would anyone else want
> this without being asked?** If yes it belongs in the product; if no, it
> belongs in settings, or nowhere.

### A1. Verify migrations 0016 → 0024 in production
Module access (0016), its enforcement (0017), the staff ID card (0018), the
movement ledger (0019), the stock overview (0020), settings + undo (0021) and
sample data (0022) and targeted alerts (0023). 0017 rewrote every write path (guarded RPC wrappers, dropped direct-write policies, revoked internal
helpers), so it needs a real regression pass: capture, assign location, GRN
through putaway, release → issuance, dispatch, Users & Roles, and My Account
(photo upload, employee ID, admin-set position).

**0019 changed two write paths** and both deserve a specific check:

- `capture_entry` now records the true change to stock in `entries.qty_delta`.
  Do a capture in **set** mode (recount a shelf down) and confirm the stock card
  shows a negative movement, not the typed number.
- `assign_placements` now writes a `placements` audit row. Run the mapping walk
  and confirm each assignment appears on the stock card as "Located".

**0021 adds `undo_capture_entry`.** Check all four refusals: undoing someone
else's entry as a storekeeper, undoing twice, undoing after the window has
closed, and undoing after the stock has already left the shelf (which would
drive it negative).

**0022 adds sample data.** Load it into an empty tenant, confirm every screen
fills, then remove it and confirm nothing is left behind. Then check it refuses
to load into a tenant that already has products — the guard that stops it ever
touching real stock.

Rows that existed before 0019 have `qty_delta` backfilled from `qty`, which is
right for 'add' captures and unknowable for old 'set' ones — so a stock card may
show one wrong historical figure for any recount done before the migration. The
current balance is always correct; only that one row's delta is suspect.

### A2. Complete the onboarding
- Import their real item master into the **U&M tenant** (currently only loaded
  into the demo tenant for testing).
- Create their locations, print and stick the barcode stickers.
- Do the scan-walk so products get locations.
- Fill the two blanks in `docs/uandm-client-guide.md` (Netlify URL, support
  contact) — and **remove the admin password printed in section 1** before that
  file leaves your hands.

---

# Part B — Make it a product

*None of this is required for U&M. All of it is required before selling to the
tenth client without a DBBS person doing the setup.*

### B1. WhatsApp alerts
The in-app bell assumes people open the app; WhatsApp assumes nothing. In this
market it is the notification channel that actually gets read, and the feature
most likely to be asked for in a sales meeting. Needs a WhatsApp Business API
account and template approval — modest code, real admin overhead. Formally
deferred in the PRD; worth revisiting as a commercial decision, not a technical
one.

### B2. Hindi UI
Halves training time for floor roles and is a visible differentiator against
imported software. Honest cost: an i18n retrofit across every screen, not a
toggle.

### B3. Multi-warehouse — decide the answer before you're asked
Plenty of companies run two or three godowns. Deferred by design (one warehouse
per tenant), but it **will** come up in a sales call. Decide now whether the
answer is "roadmap", "one tenant per godown", or "we'll build it".

---

# Part C — Operational hardening

*Needed once real clients depend on it daily, not before.*

### C1. Offline coverage is incomplete
Only **Capture, Transfer and GRN gate entry** queue offline. The PRD names five
critical screens: **issuance fulfillment** and **dispatch picking** are still
online-only, and **Assign Location** has no offline support either — which
matters because the mapping walk happens deep in the warehouse.

### C2. Missing alerts
Implemented: low stock, out of stock, GRN pending verification, RR pending
approval, RR ready to fulfill, DC pending approval, DC ready for gate-out, count
assigned, count review.

Not implemented (PRD 4.10): GRN at gate > 24h, RR pending approval > 4h, DC
pending approval > 4h, QC hold unresolved > 48h, cycle-count variance over
threshold, failed logins > 5, after-hours gate entry, item not moved in 90 days.
All time-based, so they need C3.

### C3. Scheduler
None of PRD 4.11 exists: recurring cycle-count plans, daily/weekly KPI email to
the manager, monthly compliance pack export, recurring stock-aging report. Needs
pg_cron or a scheduled Edge Function — which would also drive C2.

### C4. Push notifications
Device tokens are collected (`profiles.push_token`, migration 0010) and the
Capacitor plugin is wired, but **nothing sends a push**. Requires a Firebase
project, `google-services.json`, the FCM key as a function secret, and an Edge
Function triggered on `alerts` inserts. In-app bell works today.

### C5. The last two dead settings
0021 gave `tenant_settings` a screen and made `edit_lock_hours` real. Two PRD
behaviours are still written into the schema but not enforced, and are kept
**off** the Settings screen until they are — a switch that does nothing is worse
than no switch:

- **Approval threshold** — `approval_qty_threshold` is unused, so a
  high-quantity transaction is never auto-held for manager sign-off (PRD 4.3).
  Needs a decision first: which transactions does it gate, and does it block or
  merely flag?
- **Manual-entry password gate** — typing a location code instead of scanning is
  audit-flagged but not password-gated (PRD 4.2).

### C6. Field-verify the label and scan work
Confirm on the client's own hardware: item labels at 100 × 50 mm on the TSC
TE244, scanning the printed Code128 with a USB scanner and the QR with a phone,
and the Returns camera scan that originally failed.

---

# Part D — Later

- **More reports** — stock aging, dead stock (no movement in 90 days), variance
  history, exportable activity report for a date range (PRD 8.4).
- **Android APK / Play Store** — the Capacitor project is generated and syncs;
  needs Android Studio to build and sign. iOS requires a Mac.
- **Role user manuals** (PRD 10.3) — bilingual one-pagers per floor role. The
  four guides in `docs/` cover admin, sales, reference and lifecycle; the
  five-minute laminated sheet for a gate guard is missing.
- **Integration tests** — only pure logic is unit-tested (57 tests). Worth adding
  tests against a real database for RLS isolation and the module-access
  enforcement from 0017.
- **ERP integration** — one-way CSV export exists today. If a client pushes for
  live sync, the shape is: masters and open PO/SO flow **in**, stock flows
  **out**, and only one system ever owns quantity. Tally needs an on-premise
  connector; Zoho/SAP are cloud APIs. Do not start before A1.

---

# Deferred by design (PRD v1.5 / v2.0)

Lot / batch / serial tracking · BOM + work orders · FIFO/FEFO and stock aging ·
Tally / SAP / Zoho live API sync · multi-warehouse per tenant · multi-currency ·
customer and vendor portals · open API + webhooks · AI/ML forecasting and
anomaly detection · SOC 2 / ISO 27001 · enterprise SSO.

**The one to actively resist: BOM.** U&M have already circled it ("how much went
into the sofa"). Golai deliberately stops at "10 battens went to Carpentry for
SO-1234" and never claims "10 battens became 2 sofas". Crossing that line makes
Golai an ERP competitor, which is the opposite of how it is sold. Do not build
any of these without Product Owner sign-off.

---

# Maintenance notes

- **`src/lib/modules.ts` and the `modules` table must stay in sync.** The
  database is authoritative for access; a mismatch means the UI offers something
  the server refuses.
- **Migrations run in order 0001 → 0024**, all idempotent. 0017's function
  renames are guarded so a re-run cannot wrap a wrapper.
- **Edge Functions to deploy** on any new environment: `create-user`,
  `delete-user`, `reset-password`, `provision-tenant`.
- **Phone logins** need the Supabase Phone provider enabled with placeholder
  Twilio credentials and phone confirmations OFF — no SMS is ever sent.
- **Demo vs client data**: the demo tenant ("DBBS Demo") and each client tenant
  share the same tables, separated by `tenant_id` + RLS. Any manual SQL must be
  scoped by tenant — never by company name, which is not unique.

---

# Open questions for the client

1. **Quick recount vs formal count** — should a shelf recount still require
   manager approval of variances, or may a storekeeper correct small
   differences directly (audit-logged either way)?
2. **Blank item codes** — the products imported without a code carry
   auto-assigned `ITM-` codes, flagged "auto" in the Items list. Will U&M supply
   real codes to replace them?
3. **Unit of measure** — their master has no UOM column, so everything defaults
   to `pcs`. Do rolls/metres/kg matter for the counts they want?
4. **Undo window length** — Settings defaults to 24 hours. Does U&M want it
   shorter (tighter audit) or longer (kinder to the floor)?
5. **Who prints labels day to day** — both work now (Admin → Items and the
   receiving screen). Worth confirming which one U&M actually adopt.
6. **Employee IDs** — will HR supply them, or do staff enter their own? Both work
   today; only the position is admin-only.

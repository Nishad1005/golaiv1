# Golai — What's Left

Updated 2026-07-22.

**Where we are:** all seven build phases are complete and verified end-to-end
against a live database. U&M Designs is provisioned (13 zones, admin
`merchant@uandm.co.in`), the app is deployed on Netlify, and migrations run
0001 → 0018.

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

> **Does building these actually improve the app?** For almost everything below,
> yes — they are marked ★. U&M are the first real users, so what they hit are
> the gaps the PRD never noticed, not U&M quirks. The test to keep applying:
> **would the next client want this without being asked?** If yes it belongs in
> the product; if no, it belongs in settings, or nowhere.

### A1. Item movement history — the "stock card" ★
*The client's explicit ask, and the single biggest gap.*

A manager cannot see, per item, what came in, what went out, when, and what's
left. The data all exists (GRN putaways, issuances, returns, dispatches,
transfers, captures, approved adjustments) but there is no per-item view — only
**SO Movement**, which traces a sales order, not a product.

**Build:** a database view unioning every movement type (tenant-filtered,
RLS-respecting) plus an **Item Movement** page showing a dated ledger with
quantity in/out, location, person, reference document and a running balance,
reachable from Find Item, the Items list and location contents.

> Build this together with **B3 (stock dashboard)** — the dashboard is mostly
> presentation over this same view, and doing them separately means building the
> query twice.

### A2. Print item labels at receiving ★
Item labels only exist in Admin → Items. When a delivery is verified the
storekeeper cannot print labels for what just arrived, so incoming goods reach
the shelf unlabelled — which breaks the "scan the product" workflow the client
asked for and we already built.

**Build:** a **Print item labels** action on the GRN screen for the received
lines, defaulting copies to the received quantity.

### A3. Stock count blind spot ★
*This is a correctness bug, not a preference.*

The count screen never shows what *should* be at a location — lines appear only
as the storekeeper scans. If they miss one of five products on a shelf, that
item is silently never counted and no variance is raised.

**Build (minimal):** when a location is scanned during a count, list the items
already recorded there with expected quantities and mark off what's been
counted. Reuses the existing approval workflow.

### A4. Settings screen ★
`tenant_settings` exists in the database (edit-lock window, approval quantity
threshold, working hours, photo retention) but **has no UI** — the Admin home
tile is still marked "Phase 2". Several PRD behaviours are written but dead:

- **Edit lock** — `entries.locked_until` is written but never enforced; the
  manager-override password flow doesn't exist.
- **Approval threshold** — `approval_qty_threshold` is unused, so high-quantity
  transactions are never auto-held for manager sign-off (PRD 4.3).
- **Manual-entry password gate** — typing a location code instead of scanning is
  audit-flagged but not password-gated (PRD 4.2).

### A5. Verify migrations 0016 → 0018 in production
Module access (0016), its database-level enforcement (0017) and the staff ID
card (0018) are written and pushed but **not confirmed run**. 0017 rewrote every
write path (guarded RPC wrappers, dropped direct-write policies, revoked
internal helpers), so it needs a real regression pass: capture, assign location,
GRN through putaway, release → issuance, dispatch, Users & Roles, and My Account
(photo upload, employee ID, admin-set position).

### A6. Complete the onboarding
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

### B1. First-run checklist — *highest value item in this file*
A new admin lands in an empty app and must already know the order: zones →
locations → labels → items → the walk. Today that knowledge lives in a PDF and
in your head.

**Build:** a live checklist on the admin home — "3 of 6 done" — each step
linking to the right screen and ticking itself when the data exists. It turns
the client guide into something the app performs itself, and it is what makes
onboarding self-serve.

### B2. Sample data
A prospect should be able to click **Load sample data** and explore a populated
warehouse in ten seconds — zones, locations, items, stock, one GRN, one
issuance. Also the fastest way to reset a demo tenant (see the SQL appendix in
`docs/demo-guide.md`).

### B3. Stock dashboard
Manager home shows *activity* KPIs but nothing about *stock*. The first thing a
buyer says in a demo is "show me my stock" — and today the answer is a CSV. Add
totals (items, items carrying stock, out-of-stock, low-stock, dead stock) and a
live recent-movement feed. Mostly presentation over **A1**.

### B4. Undo window
Floor staff scan the wrong shelf. The only fix today is an Adjust with manager
approval — heavy for a thirty-second-old mistake, and it trains people to be
afraid of the app. `entries.locked_until` already exists; surface it as an
"undo" on a person's own recent entries, inside the configured window.

### B5. Empty states
Every list screen with no data should say what to do next and link there, rather
than sitting blank. Cheap, and it is most of the distance between "unfinished"
and "polished" in a demo.

### B6. Speed on cheap phones
The main bundle is one ~2 MB chunk, loaded over warehouse Wi-Fi on entry-level
Android. Route-level lazy loading is roughly a day and directly affects the
first impression of the people who use the app most (PRD 8.1 targets < 2s).

### B7. WhatsApp alerts
The in-app bell assumes people open the app; WhatsApp assumes nothing. In this
market it is the notification channel that actually gets read, and the feature
most likely to be asked for in a sales meeting. Needs a WhatsApp Business API
account and template approval — modest code, real admin overhead. Formally
deferred in the PRD; worth revisiting as a commercial decision, not a technical
one.

### B8. Hindi UI
Halves training time for floor roles and is a visible differentiator against
imported software. Honest cost: an i18n retrofit across every screen, not a
toggle.

### B9. Multi-warehouse — decide the answer before you're asked
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

### C5. Field-verify the label and scan work
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
- **Migrations run in order 0001 → 0018**, all idempotent. 0017's function
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
4. **Who prints labels day to day** — admin in the office, or the storekeeper at
   receiving? Decides where the print action belongs long-term (see A2).
5. **Employee IDs** — will HR supply them, or do staff enter their own? Both work
   today; only the position is admin-only.

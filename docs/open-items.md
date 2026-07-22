# Golai — Open Items Before Customer Handover

Everything still outstanding, in priority order. Updated 2026-07-22.

**Where we are:** all seven build phases are complete and verified end-to-end
against a live database. U&M Designs is provisioned (13 zones, admin
`merchant@uandm.co.in`) and the app is deployed on Netlify. What follows is what
stands between "working" and "ready to hand over".

Legend: **P0** = blocks handover · **P1** = should land soon after · **P2** =
later · **Deferred** = out of scope by design (PRD v1.5 / v2.0).

---

## P0 — Blocks handover

### 1. Item movement history ("stock card") — *the client's explicit ask*
A manager cannot see, per item, what came in, what went out, when, and what's
left. The data all exists (GRN putaways, issuances, returns, dispatches,
transfers, captures, approved adjustments) but there is no per-item view — only
**SO-wise Movement**, which traces a sales order, not a product.

**Build:** a database view unioning every movement type (tenant-filtered,
RLS-respecting) plus an **Item Movement** page showing a dated ledger with
quantity in/out, location, person, reference document and a running balance,
reachable from Find Item, the Items list and location contents.

### 2. Print item labels at receiving
Item labels only exist in Admin → Items. When a delivery is verified the
storekeeper cannot print labels for what just arrived, so incoming goods reach
the shelf unlabelled — which breaks the "scan the product" workflow the client
wants.

**Build:** a **Print item labels** action on the GRN screen for the received
lines, defaulting copies to the received quantity.

### 3. Stock count blind spot
The count screen never shows what *should* be at a location — lines appear only
as the storekeeper scans. If they miss one of five products on a shelf, that
item is silently never counted and no variance is raised.

**Build (minimal):** when a location is scanned during a count, list the items
already recorded there with expected quantities and mark off what's been
counted. Reuses the existing approval workflow.

### 4. Settings screen
`tenant_settings` exists in the database (edit-lock window, approval quantity
threshold, working hours, photo retention) but **has no UI** — the Admin home
tile is still marked "Phase 2". Several PRD behaviours depend on it:

- **Edit lock** — `entries.locked_until` is written but never enforced; the
  manager-override password flow doesn't exist.
- **Approval threshold** — `approval_qty_threshold` is unused, so high-quantity
  transactions are never auto-held for manager sign-off (PRD 4.3).
- **Manual-entry password gate** — typing a location code instead of scanning is
  audit-flagged but not password-gated (PRD 4.2).

### 5. Verify migrations 0016 + 0017 + 0018 in production
Module access and its database-level enforcement are written and pushed but the
migrations have **not been confirmed run**. 0017 rewrote every write path
(guarded RPC wrappers, dropped direct-write policies, revoked internal helpers),
so it needs a real regression pass: capture, assign location, GRN through
putaway, release → issuance, dispatch, and Users & Roles.

0018 adds the staff ID card (photo, employee ID, position), the public
`avatars` bucket and two RPCs — `set_my_profile` (own photo + employee number)
and `admin_set_user_details` (employee number + position). Check that a
non-admin can upload a photo but cannot set their own position.

### 6. Finish U&M onboarding
- Import their real item master into the **U&M tenant** (currently only loaded
  into the demo tenant for testing).
- Create their locations, print and stick the barcode stickers.
- Do the scan-walk so products get locations.
- Fill in the two blanks in `docs/uandm-client-guide.md` (Netlify URL, support
  contact) and hand it over.

---

## P1 — Soon after handover

### 7. Manager stock overview
Manager home shows activity KPIs but nothing about stock levels. Add totals
(items, items carrying stock, out-of-stock, low-stock) and a live recent-movement
feed — mostly presentation over the item-movement view from P0 #1.

### 8. Offline coverage is incomplete
Only **Capture, Transfer and GRN gate entry** queue offline. The PRD names five
critical screens: **issuance fulfillment** and **dispatch picking** are still
online-only, and **Assign Location** (added later) has no offline support either
— which matters because the mapping walk happens deep in the warehouse.

### 9. Missing alerts
Implemented: low stock, out of stock, GRN pending verification, RR pending
approval, RR ready to fulfill, DC pending approval, DC ready for gate-out, count
assigned, count review.

Not implemented (PRD 4.10): GRN at gate > 24h, RR pending approval > 4h, DC
pending approval > 4h, QC hold unresolved > 48h, cycle-count variance over
threshold, failed logins > 5, after-hours gate entry, item not moved in 90 days.
These are time-based and need a scheduled job (see #10).

### 10. Scheduler
None of PRD 4.11 exists: recurring cycle-count plans, daily/weekly KPI email to
the manager, monthly compliance pack export, recurring stock-aging report. Needs
a scheduled function (pg_cron or a Supabase scheduled Edge Function) — which
would also drive the time-based alerts above.

### 11. Push notifications
Device tokens are collected (`profiles.push_token`, migration 0010) and the
Capacitor plugin is wired, but **nothing sends a push**. Requires a Firebase
project, `google-services.json`, the FCM key as a function secret, and an Edge
Function triggered on `alerts` inserts. In-app bell works today.

### 12. Field-verify the label and scan fixes
Confirm on the client's own hardware: item labels at 100 × 50 mm on the TSC
TE244, scanning the printed Code128 with a USB scanner and the QR with a phone,
and the Returns camera scan that originally failed.

---

## P2 — Later

13. **Code-splitting** — the main bundle is ~1.4 MB in one chunk; route-level
    lazy loading would cut first load on 3G (PRD 8.1 targets < 2s).
14. **More reports** — stock aging, dead stock (no movement in 90 days),
    variance history, exportable activity report for a date range (PRD 8.4).
15. **Android APK / Play Store** — Capacitor project is generated and syncs;
    needs Android Studio to build and sign. iOS requires a Mac.
16. **Role user manuals** (PRD 10.3) — bilingual English/Hindi PDFs per role.
    The client guide covers admin/setup; floor-role one-pagers are missing.
17. **Integration tests** — only pure logic is unit-tested (51 tests). Worth
    adding tests that run against a real database for RLS isolation and the
    module-access enforcement from 0017.
18. **Item label tuning** — if the client wants the name larger still, options
    are shrinking the QR (USB scanners use the Code128) or capping the name to
    one line.

---

## Deferred by design (PRD v1.5 / v2.0)

Lot / batch / serial tracking · BOM + work orders · FIFO/FEFO and stock aging ·
Tally / SAP / Zoho live API sync (v1.0 is one-way CSV export) · WhatsApp
notifications · multi-warehouse per tenant · Hindi UI · multi-currency ·
customer and vendor portals · open API + webhooks · AI/ML forecasting and
anomaly detection · SOC 2 / ISO 27001 · enterprise SSO.

Do not build these without Product Owner sign-off — they overlap the ERP layer
Golai deliberately avoids.

---

## Maintenance notes

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

## Open questions for the client

1. **Quick recount vs formal count** — should a shelf recount still require
   manager approval of variances, or may a storekeeper correct small
   differences directly (audit-logged either way)?
2. **Blank item codes** — the products imported without a code carry
   auto-assigned `ITM-` codes, flagged "auto" in the Items list. Will U&M supply
   real codes to replace them?
3. **Unit of measure** — their master has no UOM column, so everything defaults
   to `pcs`. Do rolls/metres/kg matter for the counts they want?
4. **Who prints labels day to day** — admin in the office, or the storekeeper at
   receiving? Decides where the print action belongs long-term.

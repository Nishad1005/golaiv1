# Golai — Project Log

*Everything built, every decision and why, what's parked, and what's only been
discussed. Updated 2026-07-24.*

This is the memory of the project. `open-items.md` is the live backlog — what to
do next. **This file is the record — how we got here and why**, so that a
decision made in July still makes sense in December, and nothing agreed in
conversation quietly disappears.

If the two ever disagree, `open-items.md` wins on *what's left*; this one wins on
*why it's like that*.

---

## 1. What Golai is

**An operational control system for manufacturing warehouses.** Golai runs the
floor; the client's ERP runs the books.

Someone types a product name → the app points to the exact zone and shelf. Every
movement is recorded with who, when, how much and a photograph, in a log nobody
can edit.

**Four boundaries that define the product.** These are not gaps — they are the
shape of it, and each has been argued at least once:

| Boundary | Why |
|---|---|
| **Quantities only, never values** | The moment Golai shows money it competes with the ERP instead of complementing it, and every sales conversation changes. |
| **No BOM, no assembly** | Golai says "10 battens went to Carpentry for SO-1234", never "10 battens became 2 sofas". Crossing this makes it an ERP. |
| **Existing item codes kept verbatim** | Owner rule, non-negotiable. Renumbering mid-operation delays the floor and breaks ERP reconciliation. |
| **One warehouse per tenant** | Deliberate for v1. See §7 — a sales answer is needed before this is challenged. |

---

## 2. Where we are right now

| | |
|---|---|
| **Build** | All 7 PRD phases complete, plus everything in §3 |
| **Migrations** | 0001 → 0024, all applied to production |
| **Tests** | 63 unit tests, typecheck clean, build green |
| **Deploy** | Netlify, auto-deploys from `main`. PWA installable. |
| **First client** | U&M Designs — provisioned, 13 zones, **3,328 products imported** |
| **Regression pass** | Stages 0–3 **passed**. Stages 4–9 outstanding. |

**U&M, what's left:** create locations → print and stick labels → the mapping
walk → fill the two blanks in their guide (URL, support contact) → **remove the
admin password printed in section 1** before it leaves your hands.

---

## 3. What has been built

### The core promise
- **Find, both ways** — type a product → its zone and shelf; scan a location →
  everything on it with quantities.
- **Assign Location** — the mapping walk. Scan a location, search products *by
  name*, tap to add. **Needs no product barcodes**, which is the only reason a
  client with an unbarcoded warehouse can start on day one.
- **Stock card** (0019) — one product's whole life: received, counted,
  transferred, issued, returned, dispatched, adjusted, with the balance after
  each move.
- **Stock dashboard** (0020) — in stock, low stock, nothing-on-shelf, dead stock,
  mapping progress, live movement feed.

### Workflows
Receiving (gate → verify → putaway) · Release Requests → Issuance · Returns ·
Dispatch (pick → approve → gate-out) · QC Hold · Stock Counts · Transfer ·
Adjust · Capture · SO Movement · ERP Export (CSV, quantities only).

### Identity, access, tenancy
- Multi-tenant: shared tables + `tenant_id` + RLS. **Not** separate databases.
- **Provision Client** — company and its first admin created *together*,
  atomically. Added after a real incident where client data landed in the demo
  tenant.
- Login by **email or mobile** (E.164, +91 default). No SMS, no OTP, no cost.
- Five roles, plus **per-user module access** (0016) **enforced in the database**
  (0017), not just hidden in the UI.
- **Staff ID card** (0018) — photo and employee ID self-editable; **position is
  admin-only**, because nobody should be able to promote themselves on paper.
- **Company Profile** — client's name and logo across their app.

### Setup and onboarding
- **First-run checklist** — seven steps on the admin home, each ticking itself
  off from real data, vanishing when done.
- **Sample data** (0022) — one-click demo warehouse; refuses to load if any
  product exists; removes only what it created.
- CSV import for zones and items; **batched code allocation** (0024).

### Labels and scanning
Location labels · product labels · issuance labels (`FOR: SO-1234`) · carton
labels. Thermal presets (100×50, 75×50, 50×25, **one label per page**) for the
TSC TE244, plus A4 sheets. Every label carries **Code128** (USB scanners) *and*
**QR** (phone cameras).

### Operational quality
- **Undo window** (0021) — fix your own fresh mistake; after that it takes an
  Adjust with a reason and approval.
- **Targeted alerts** (0023) — each alert reaches only the people who act on it.
- **Empty states** everywhere — explain the workflow and offer the next step.
- **First load 1.66 MB → 584 KB** — route-level code splitting; PDF and camera
  libraries load on demand.
- Offline: Capture, Transfer, GRN gate entry queue in IndexedDB and sync.

### Documentation
`demo-guide` (sell it) · `uandm-client-guide` (set it up) · `module-guide` (what
is this screen) · `product-lifecycle` (one product, gate to sofa) ·
`open-items` (what's left) · `regression-checklist` (test after migrations) ·
this file.

---

## 4. Decisions, and why

*The most valuable section. Each of these was a real choice with a live
alternative.*

**Client-named locations.** The app never says "shelf". The client types
`Ghoda`, `Rack`, `Machan` — whatever they call it — and the first letter becomes
the code prefix (`Ghoda` → `Z03-G001`). Their word is echoed back on screen and
on stickers. *This is the single best pattern in the product* and the model for
all future customisation (see §6).

**An item's location is not a property of the item.** It's created when someone
puts the item somewhere. This is why no location column exists in the item
import, and why the mapping walk is a separate activity.

**The database is authoritative for access, not the UI.** 0017 renamed 19 RPCs
to `*_impl`, revoked them, and added guarded wrappers. A crafted API call is
refused even if the screen is hidden. `src/lib/modules.ts` and the `modules`
table **must stay in sync**.

**The running balance is computed backwards from live stock.** Working forwards
from zero would silently drift the moment any movement predated the ledger —
and a silently wrong audit trail is worse than none.

**Alert targeting via a trigger, not by editing the 8 RPCs that raise alerts.**
Those live across four migrations and several were renamed by 0017; touching
them again would have risked verified write paths for a change that belongs in
one place anyway. Future alert sources get correct targeting for free.

**One shared print dialog for item labels.** Admin → Items and Receiving use the
same component — duplication in exactly this place caused the item-label bug
twice.

**Sample data refuses to load into a non-empty warehouse**, and clears strictly
by tag (`SAMPLE-` codes, `ZS` zones, `(sample)` names). Real stock can never be
caught by it.

**Provision company + admin together.** Two separate steps once put a client's
data in the wrong tenant. The two-step is gone.

---

## 5. Bugs found, and the lesson each left

Recorded because the *patterns* repeat.

| Bug | Lesson |
|---|---|
| **`next_sequence` revoked by 0017 → item import failed** for any un-coded row | The demo tenant's products all had codes, so no test could catch it. **Ask what the demo data isn't exercising.** |
| **`entries.qty_delta`** — a "replace the count" recount logged the typed number, not the change | Building a ledger exposed a bug that had been silently wrong for months. |
| **`assign_placements` wrote no audit row** — the mapping walk was invisible in history | Stock appearing from nowhere. |
| **`profiles_self_update` allowed self-granting any role** | Found while writing 0017. Column-level UPDATE revoked. |
| **Stale PWA cache** (recurred ~4×) | Fixed properly with `skipWaiting` + `clientsClaim` + `registerSW({immediate:true})`. |
| **Phone login "invalid credentials"** | The passwords handed out were never the real ones. Built Reset Password. |
| **Labels all on one sticker (TE244)** | An A4 grid sent to a label printer. Thermal presets print one label per page. |
| **Item label duplicated the code** | The *product name itself* contained the code — `nameWithoutCode()`. |
| **Camera wouldn't read Code128** | Added native `BarcodeDetector` + **QR on every label**. |
| **0017 re-run would wrap a wrapper** | Guarded with `to_regprocedure` checks. Every migration must be idempotent. |

---

## 6. Discussed, not yet built

### 6a. Selling to many clients who each want something different
*Discussed 2026-07-24. No code written. This is the agreed shape.*

**The rule: never fork the codebase per client.** Two copies means every
security fix happens twice; by the fifth client there is no product.

Everything else is a ladder — **always solve at the lowest rung that works:**

| Rung | Mechanism | Handles |
|---|---|---|
| **1. Settings** | A value in `tenant_settings.settings` (already free-form `jsonb`) | Windows, thresholds, hours |
| **2. Their words** | Terminology overrides — generalise the *Ghoda* pattern | Most "can you change X" requests, which are really "that's not what we call it" |
| **3. Custom fields** | Per-tenant field definitions on items / GRN lines / dispatches, stored in `jsonb`, rendered dynamically | Most "we need to record the loom number / batch / vehicle type" |
| **4. Custom code, gated** | Same repo, `src/modules/custom/<client>/`, registered against a tenant, **lazy-loaded** so no other client downloads it | Genuinely different workflows |

**The one architectural gap:** `modules` is global — there is no way to say
"this module exists only for company X". A **`tenant_modules`** table separating
*"this company has this module"* from *"this user may use it"* closes it, and
makes modules into SKUs (Basic vs Plus becomes a row, not a branch).

**Recommendation:** build **custom fields + `tenant_modules` before the second
client signs.** Both are small now and expensive to retrofit once three clients
hold live data. Leave rung 4 unbuilt until someone pays for something genuinely
bespoke.

**The non-technical half.** Every request gets the test already used for U&M:

> **Would the next client want this without being asked?**

Yes → core, for everyone. No → rungs 1–3 as configuration. Neither → custom
code, and it should be **paid for**, one-off *plus* ongoing, because it carries
maintenance forever.

### 6b. ERP integration
*Discussed. Deferred until after the stock card was in place — it now is.*

Two one-way pipes, never a live two-way sync. **Only one system may own stock
quantity**, or they drift and every month-end becomes an argument.

- Golai → ERP: stock quantities (CSV today; scheduled file drop is the cheap
  next step).
- ERP → Golai: **the bigger prize** — open POs, open SOs, item/supplier/customer
  masters. Removes most manual typing in the app.

Tally is the likely target and is the hard case: desktop, on a LAN, version-
sensitive XML — needs a small on-site connector. Zoho/SAP are cloud APIs and far
easier.

### 6c. Smaller things raised and agreed, not scheduled
- Manager stock overview → **built**.
- Undo window → **built**.
- Role one-pagers for floor staff (bilingual) — the four guides cover
  admin/sales; the laminated sheet for a gate guard doesn't exist.

---

## 7. Parked, with the reason

Full detail in `open-items.md`. Summary of *why* each is parked:

| Item | Why it's parked |
|---|---|
| **Approval threshold**, **manual-entry password gate** | Schema exists, behaviour doesn't. Kept **off** the Settings screen — a switch that does nothing is worse than no switch. Needs a product decision first. |
| **Offline for issuance / dispatch / assign** | Only Capture, Transfer, gate entry queue today. Real gap; needs the sync queue extended. |
| **Time-based alerts** (SLA breaches, dead stock) | All need a scheduler that doesn't exist. |
| **Scheduler** (pg_cron / scheduled function) | Would unlock the alerts above plus recurring counts and KPI emails. |
| **Push notifications** | Tokens collected, nothing sends. Needs Firebase. In-app bell works. |
| **WhatsApp alerts** | A **commercial** decision, not technical — Business API account + template approval. Most likely feature to be asked for in a sales meeting. |
| **Hindi UI** | Real i18n retrofit across every screen, not a toggle. Halves floor training time. |
| **Multi-warehouse** | **Decide the sales answer before you're asked**: "roadmap", "one tenant per godown", or "we'll build it". |
| **BOM / work orders** | **Actively resist.** U&M have already circled it. Crossing this line makes Golai an ERP competitor. |

---

## 8. Open questions for the client

1. **Quick recount vs formal count** — may a storekeeper correct small
   differences directly, or does every variance need manager approval?
2. **Blank item codes** — 500 of U&M's 3,328 carry auto `ITM-` codes, flagged
   "auto". Will they supply real ones?
3. **Unit of measure** — their master has no UOM column; everything defaults to
   `pcs`. Do rolls/metres/kg matter?
4. **Undo window length** — 24 h default. Shorter (tighter audit) or longer
   (kinder to the floor)?
5. **Who prints labels day to day** — office admin, or storekeeper at receiving?
   Both work now.
6. **Employee IDs** — supplied by HR, or entered by staff?

---

## 9. Where to look for what

| Question | File |
|---|---|
| What's left to do? | `open-items.md` |
| Why is it built this way? | **this file** |
| How do I test after a migration? | `regression-checklist.md` |
| What is this screen for? | `module-guide.md` |
| How does a client set up? | `uandm-client-guide.md` |
| How do I demo it? | `demo-guide.md` |
| How does it all connect? | `product-lifecycle.md` |
| What does the schema do? | `supabase/migrations/` — the source of truth |

**Migrations at a glance:** 0001 identity/masters · 0002 stock/movements ·
0003–0004 workflows, QC, counts, alerts, audit · 0005–0009 atomic RPCs ·
0010 push tokens · 0011 flexible fixtures · 0012 assign placements · 0013 item
type · 0014 auto-code flag · 0015 company branding · 0016 module access ·
**0017 database-level enforcement** · 0018 staff ID card · **0019 movement
ledger** · 0020 stock overview · 0021 settings + undo · 0022 sample data ·
0023 targeted alerts · 0024 item-code allocation.

---

*Keep this file honest. When something is built, move it from §6 to §3 and put
the reasoning in §4. When something breaks, add the lesson to §5 — that table
has already stopped us repeating two mistakes.*

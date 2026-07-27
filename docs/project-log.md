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
| **Migrations** | 0001 → 0029, all applied to production |
| **Tests** | 63 unit tests, typecheck clean, build green |
| **Deploy** | Netlify, auto-deploys from `main`. PWA installable. |
| **First client** | U&M Designs — provisioned, 13 zones, **3,328 products imported** |
| **Regression pass** | Stages 0–3 **passed**. Stages 4–9 outstanding. |
| **Platform console** | Live. Company-level module access enforced (0026). |
| **Costing** | **Phase 1 complete.** Phase 2 (import + item matching) next. |

**U&M, what's left:** ~~import their master~~ (**done — 3,328 products**) →
create locations → print and stick labels → the mapping walk → fill the two blanks in their guide (URL, support contact) → **remove the
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
  mapping progress, live movement feed, and a **Total stock** drill-down (zone →
  shelf → product → stock card), same source as the ERP stock-by-shelf export.

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

### Platform (DBBS only)
- **Platform Console** (0025) — every client with usage at a glance (users,
  products, locations, setup progress, last active), **module licences** granted
  or revoked per company, and suspend / reactivate.
- **`tenant_modules`** — the company-level licence layer above per-user access,
  covering **every** module, not just paid add-ons. Switch one off for a company
  and it disappears for all of its users regardless of their personal access.
  A client **cannot grant itself** a licence; only DBBS can. This is what lets a
  module be proven on the demo tenant while being unreachable for a live client.
- **`has_module()` now checks company then person** (0026). Chosen so that with
  no explicit grants and no add-ons the result is *identical* to before: a base
  module with no row is allowed (`not requires_license`), an add-on with no row
  is denied. Existing companies were unaffected the moment it shipped.
- Cross-tenant reads go through **security-definer RPCs that check
  `is_platform_admin()` first**. No existing RLS policy was widened — the
  isolation rule from the costing plan applied here too.

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

**One unit per product, picked where you enter quantity.** Units (metre, roll,
kg, sq.ft…) are set on the product, but the picker lives on the quantity screens
too (Assign, Capture, Adjust, Counts) via a guarded `set_item_uom` RPC (0029), so
a storekeeper can set it without admin rights. Kept to one unit per product on
purpose — mixing units on one product makes its stock un-totalable without a
conversion feature (1 roll = 50 m), which is deliberately out of scope for now.

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

**Company access is a deny-list for the base product, an allow-list for
add-ons.** One table, two readings: `modules.requires_license` decides which.
That is what made it safe to rewrite `has_module()` — the function that guards
every write path — without changing what any existing company could do.

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
| **Adjustments was scan-only** — no name search, so unbarcoded products couldn't be found | The barcode assumption hides in one screen at a time. When a client hits it, check the *others* — Find, Assign, Counts and now Adjust all had to learn to search by name. |
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

### 6b. Costing module (U&M request)
*Discussed 2026-07-24. Awaiting their Excel file before design. No code written.*

U&M cost each sofa in an Excel sheet — product photo, every component, and
formulas scattered through it — and want it in Golai so the spreadsheet can be
retired.

**This moves a founding boundary, deliberately.** "Quantities only, never
values" becomes **"Golai does not value stock and does not post accounting
entries."** The distinction that makes it safe:

| Allowed | Never |
|---|---|
| Costing as **calculation** — a recipe + rates → an estimated cost | Costing as **accounting** — stock valuation, COGS, WIP on the balance sheet |

If Golai ever asserts what inventory is *worth*, two systems claim that number,
they drift, and month-end becomes an argument — the same failure that rules out
two-way ERP sync. Tally keeps valuation.

**The BOM boundary survives** because what it protected against was
*auto-consumption* — Golai deducting material against a recipe and becoming a
production controller. A costing sheet is a reference document: it may
**pre-fill** a release request for a human to confirm, but never auto-issues and
never auto-deducts.

**Placement: core module, licensed — not bespoke.** Every manufacturer costs
products in a fragile Excel; this passes "would the next client want it without
being asked?" So it belongs in the core behind `tenant_modules`, which makes it
**the first paid add-on** and the commercial trigger to build that table.

**Design decision: model the structure, do not rebuild Excel.** Free-text
formulas would make the data opaque — you could never answer "which products use
this fabric?" because it would be buried in a string. Nearly every "formula" in
a costing sheet is one of a handful of universal shapes (line = qty × rate,
wastage %, section subtotals, overhead as % of material, margin → price). Those
become structure. Only dimension-driven quantities are genuinely arbitrary.

**Where the value actually is: rates.** Their sheet is hard to maintain because a
price change means editing it in twenty places. Recreating the same structure
inherits the same problem. Rates must live **once on the item**, referenced
everywhere, with effective dates — so one change reprices every sheet, and last
March's cost is still visible.

**Snapshot on use.** A produced quotation must store the computed numbers, not
recompute from today's rates — otherwise history silently rewrites itself. Same
lesson as the stock-card ledger.

**Known risk:** their component names almost certainly do not match the item
master exactly. Mapping costing lines to real item records is genuine migration
work and should be scoped, not assumed.

**Their sheet, analysed 2026-07-24** (`costing sheet.xlsx`, a real built chair,
Buyer "DF 24", version 1, dated 30-Jan-2024):

- **One sheet, laid out horizontally** — 142 columns. **31 material categories**
  (Wood, Plywood, Metal, Spring, Belt, Foam, Fabric, Thread, Piping, Button,
  Chain, Carton, Packing, Labour, Finishing, CNF, misc…), each occupying its own
  column block with **its own parameter set**. Rows 3–15 are line items, row 16
  is the per-category total, and `EG17:EI42` is a summary of category → amount →
  **% of total**. Then GST %, **Overhead + Margin 40 %**, Total Price.
- **The key structural insight: formulas are per-CATEGORY, not per-cell.** Every
  Wood row uses `(L×W×T/144)×qty` for cft; every Foam row uses
  `VLOOKUP(sheet size) / pieces-per-sheet × qty`. That is ~31 formula shapes to
  model, not a formula engine. **This is what makes the module tractable.**
- **Embedded rate tables** — foam price by supplier / FR / sheet size /
  thickness, plywood by thickness, corrugated sheet price, container loading.
  These are exactly the "rates must live once" case.
- **Genuinely derived quantities exist** and must be supported: timber volume,
  plywood yield, foam pieces-per-sheet, CBM from inches, carton board area
  `(L+W+3)×2×(W+H+2)×60/1550`, packing and CNF allocated per container.
- The "photo" is a **dimensioned design sketch**, not a product shot — and its
  dimensions duplicate the sheet's own size fields.

**Errors found in their live sheet — the business case for the module:**

| Finding | Effect |
|---|---|
| **"katapati" ₹100 computed, orphaned** — not referenced by the summary | Under-costed |
| **VLOOKUP ranges not absolute** and inconsistent per row (`BQ27:BR38`, `BQ28:BR39`, …) | One row silently cannot find the smallest foam size; a landmine |
| **Foam total `SUM(BW12:BW15)`** while its lines are `BW3:BW8` | Correct only by accident |
| **Rate entered with no quantity → silent ₹0** (Belt, Hassian, Piping, Button) | Cannot distinguish "not used" from "forgotten" |
| **External link to `D:\…\Betsy Skirted Counter Stool.xlsx`** | Each product is made by copying the previous product's sheet — which is exactly how all of the above propagate |

**Everything about this module now lives in `costing.md`** — every formula with
its Excel original and a verified figure from the real chair, the schema as
built, defects found, decisions, progress and known gaps. Keep that one current;
this section stays a summary.

**Progress:** migration 0027 ships the schema, RLS gated on the costing licence,
and `seed_costing_template()` — U&M's 31 categories as a per-tenant template so
the next client can diverge. `src/lib/costing/formulas.ts` implements the nine
shapes with **16 tests written against the real chair sheet**, so we reproduce
their numbers rather than something merely plausible. Next: the sheet editor.

**Full build plan: `costing-module-plan.md`** (drafted, not approved). Built on
the **demo tenant only** behind a new `tenant_modules` licence gate; the
migrations are **additive only** — no existing table, RPC or policy is altered —
so no code path U&M touches can behave differently after it ships. `has_module()`
is deliberately left alone in phase 1 because it guards every write path.

**Answered 2026-07-24:** CNF is **deliberately excluded** for now — not a bug;
it comes back when that part is built. **Costing is bundled for U&M**, priced as
an add-on for everyone after them.

**Still open:** are the two manual final prices (WITH / WITHOUT FABRIC) always
hand-rounded · who may see rates (expected: manager/admin only).

> The CNF line was originally recorded here as a defect. It is not — corrected
> after checking with the client. The other five findings stand.

### 6c. ERP integration
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

### 6c-2. Platform console — **built** 2026-07-24
Moved to §3. See `tenant_modules` and the platform RPCs (0025).

### 6d. Smaller things raised and agreed, not scheduled
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

**Recent regression findings** (2026-07-24): the pass surfaced three real
defects — dashboard tiles with no destination, alerts going to everyone
regardless of role (0023), and item import failing on any un-coded row because
0017 had revoked `next_sequence` (0024). All fixed. The last one is the reason
Stage 1 now includes an un-coded CSV import.

**Migrations at a glance:** 0001 identity/masters · 0002 stock/movements ·
0003–0004 workflows, QC, counts, alerts, audit · 0005–0009 atomic RPCs ·
0010 push tokens · 0011 flexible fixtures · 0012 assign placements · 0013 item
type · 0014 auto-code flag · 0015 company branding · 0016 module access ·
**0017 database-level enforcement** · 0018 staff ID card · **0019 movement
ledger** · 0020 stock overview · 0021 settings + undo · 0022 sample data ·
0023 targeted alerts · 0024 item-code allocation · **0025 platform console +
tenant_modules** · **0026 company-level module access** · **0027 costing schema** ·
**0028 foam rate seed**.

---

*Keep this file honest. When something is built, move it from §6 to §3 and put
the reasoning in §4. When something breaks, add the lesson to §5 — that table
has already stopped us repeating two mistakes.*

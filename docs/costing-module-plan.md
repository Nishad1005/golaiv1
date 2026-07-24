# Golai — Costing Module: Build Plan

*Drafted 2026-07-24. Approved; phase 1 in progress.*

> **This file is the agreed scope** — phasing, estimates and the isolation
> guarantees. The living record (every formula, the schema as built, progress
> and gaps) is **`costing.md`**.

Replaces U&M's costing spreadsheet with a module inside Golai. Built and proven
**on the demo tenant only**; U&M cannot see it, cannot switch it on, and nothing
they use today changes.

---

## 1. The isolation guarantee

This is the first requirement, not a footnote. Everything below is designed
around it.

**Three independent layers, each of which alone would be sufficient:**

| Layer | What it does |
|---|---|
| **1. Licence gate (database)** | A new `tenant_modules` table lists which companies have which licensed modules. Costing's RPCs refuse outright unless the caller's tenant holds a costing licence. A U&M admin ticking every box they can see still gets nothing. |
| **2. Empty data** | Every costing table is tenant-scoped with RLS. U&M has no rows. Even without layers 1 and 3, there is nothing to read. |
| **3. Separate chunk** | The screens lazy-load (route splitting is already in place). A U&M user never downloads the code. |

**The hard rule for this build — additive only:**

> The migrations **create** new tables, functions and policies. They do not
> `ALTER`, `DROP` or `REPLACE` a single existing table, function, policy or RPC.

That means there is no code path a U&M user touches that can behave differently
after this ships than before it. Not "unlikely to" — *cannot*.

### Why not a feature branch?

You asked for it working on the demo account, which means deployed. A long-lived
branch would diverge from `main` for weeks and be painful to merge — and it
would give a *weaker* guarantee than the licence gate, because merging is a
one-shot risk while the gate is enforced continuously by the database.

**Ship to `main`, gate at the tenant.** Safer, and testable immediately.

### `has_module()` is deliberately left alone

The obvious move is to extend `has_module()` to consult `tenant_modules`. **I am
not doing that in phase 1.** That function guards every write path in the app —
0017's work — and changing it would touch everything U&M does daily, which is
exactly what you asked to avoid.

Instead costing gets **its own guard**, `require_costing()`. Two mechanisms
temporarily coexist. Once costing is proven, phase 4 can unify them as a
deliberate, separately-tested change.

---

## 2. Schema (migrations 0025 + 0026)

### 0025 — the licence gate *(generic, not costing-specific)*

```
tenant_modules
  tenant_id      uuid  → tenants
  module_key     text
  enabled        bool
  granted_at     timestamptz
  note           text            -- "paid add-on", "trial to 31-Mar"
  primary key (tenant_id, module_key)
```

Plus `tenant_has_module(p_key text) → boolean`, and RLS so a tenant can read
its own row but **never write it** — licences are granted by a platform admin
(DBBS), not by the client. That is the point.

This table is worth having regardless of costing: it is how Basic vs Plus
becomes a row instead of a branch.

### 0026 — costing

```
costing_categories        -- the 31 blocks (Wood, Plywood, Foam, …)
  id, tenant_id, key, name, sort_order, formula_kind, config jsonb, is_active

costing_category_fields   -- the columns inside each block
  id, category_id, key, label, data_type, sort_order, is_input, required

costing_rate_tables       -- foam grid, plywood by thickness, sheet price
  id, tenant_id, key, name, note
costing_rate_entries
  id, rate_table_id, lookup_key, attributes jsonb, rate numeric,
  effective_from, effective_to          -- rate history, so old sheets stay explicable

costing_sheets            -- one product, one version
  id, tenant_id, code, name, version, status(draft|final|archived),
  buyer, sheet_date, dimensions jsonb, photo_url,
  gst_pct, margin_pct,
  computed jsonb,                        -- the snapshot (see §5)
  finalised_at, created_by

costing_lines
  id, sheet_id, tenant_id, category_id, item_id → items (nullable),
  sort_order, inputs jsonb, amount numeric, note
```

**`item_id` is a read-only reference into the existing item master.** Costing
reads items; it never writes them. Their 3,328 products stay untouched.

**Rates live in `costing_rate_entries`, not on `items`.** Deliberate: putting a
rate column on `items` would touch the table U&M uses every day. This way, if
costing is off, the tables are simply empty.

---

## 3. The formula shapes

Their 31 categories collapse to **nine shapes**. Each category names one; there
is no formula engine and no free-text expressions.

| Kind | Formula | Used by |
|---|---|---|
| `fixed` | amount entered directly | Labour, Finishing, misc, Other |
| `qty_rate` | `qty × rate` | Belt, clips, tie wire, Hassian, Satan, non-woven, fibre wadding, poly fibre, thread, fabric, piping, button, chain, chain puller, brass cup |
| `length_rate` | `length × qty × rate` | Spring |
| `volume_rate` | `(L×W×T ÷ 144) × qty` → cft, `× rate` | Wood |
| `area_yield` | `rate × area × qty ÷ pieces_per_sheet` | Plywood |
| `sheet_yield` | `lookup(sheet size) ÷ pieces_per_sheet × qty` | Foam |
| `cbm` | `0.0000163871 × L × W × H` | Carton |
| `carton_area` | `(L+W+3)×2×(W+H+2)×60 ÷ 1550` and variants | Box types |
| `container_alloc` | `(2000 ÷ qty_per_container) + (150 × CBM) + 150` | Packing, CNF |

Each shape is a named, unit-tested function. Adding a shape later is a small,
reviewable change — unlike accepting arbitrary formulas, which would make the
data opaque and unqueryable.

---

## 4. Screens

All under `/costing`, all lazy-loaded, all behind the licence gate.

1. **Costing Sheets** — list, search, filter by status, "New sheet", clone from
   an existing sheet *(the safe version of their copy-the-file habit — clones
   the structure, re-reads live rates, and cannot inherit a broken reference)*.
2. **Sheet editor** — header (product, buyer, version, dimensions, drawing) ·
   collapsible **category blocks**, each rendering only its own fields ·
   **live summary** panel: category → amount → % of total, then GST %,
   Overhead + Margin %, Total.
3. **Rate tables** — the foam grid, plywood, sheet prices. Edit once, everything
   reprices. **This is the actual product.**
4. **Sheet PDF** — what they hand to a buyer.

**Access:** costing shows rates and margin, so default it to **manager + admin
only**, with the per-user Access checkboxes applying on top as usual.

---

## 5. The three rules that fix their spreadsheet

**Every category is in the summary, always.** The summary is *computed*, not a
list of hand-written cell references. The ₹1,071 CNF and ₹100 katapati that fall
out of their total today become structurally impossible to lose.

**A rate with no quantity is flagged, not silently zero.** Their sheet cannot
tell "not used in this chair" from "someone forgot the number". The editor will,
and the sheet cannot be finalised with unresolved lines.

**Finalising snapshots the numbers.** `computed jsonb` stores every line amount,
category total and the rates used. Re-open a March sheet in December and it
still says what it said in March. Same principle as the stock-card ledger: a
record states what happened; it does not recalculate the past.

---

## 6. Phasing

| Phase | Scope | Estimate |
|---|---|---|
| **1** | `tenant_modules` + licence gate + costing schema + U&M's 31 categories seeded + the 9 formula shapes + rate tables + sheet editor + live summary + snapshot + PDF | **3–4 weeks** |
| **2** | Import their existing sheets; map component names → item master (a confirm-once matching screen) | 1 week |
| **3** | **Pre-fill a Release Request from a sheet** — the first thing that touches existing workflow, deliberately last | 3–4 days |
| **4** | Category editor (per-tenant customisation) → this is what makes it sellable to the next client; unify `has_module()` | 1–2 weeks |

**Phase 1 ships to the demo tenant only.** U&M get nothing until they have seen
it working and you have agreed commercial terms.

---

## 7. What this explicitly does not touch

Stated so it can be checked in review:

- ❌ No change to `items`, `stock_balances`, `entries`, `grns`, `release_requests`,
  `issuances`, `dispatches`, `alerts`, `profiles`, `tenant_settings`
- ❌ No change to any existing RPC, including everything 0017 rewrote
- ❌ No change to any existing RLS policy
- ❌ No change to `has_module()` / `require_module()`
- ❌ No change to Find, Capture, Assign Location, Receiving, Dispatch, Counts
- ✅ One additive line in `src/lib/modules.ts` for the nav entry, licence-gated
- ✅ New files only, under `src/pages/costing/` and `src/lib/costing/`

---

## 8. How we prove the isolation

Before phase 1 is called done:

1. **Stage 0 query** extended — the costing tables exist, `tenant_modules` has a
   row for the demo tenant and **none for U&M**.
2. **Sign in as U&M admin** → no Costing in the menu; `/costing` typed directly
   does not open; the costing RPCs return "not licensed".
3. **Re-run regression Stages 1–3** on the demo tenant — every existing write
   path still passes. This is the real proof that additive-only held.
4. **Network check** — a U&M session never requests the costing chunk.

---

## 9. Risks, honestly

| Risk | Handling |
|---|---|
| **The 31-block editor is a big UI** — the largest single screen in the app | Build one category block component driven by `costing_category_fields`; it renders all 31. If that abstraction fails, the estimate moves. |
| **Their component names won't match the item master** | Phase 2's matching screen. Scoped separately, not assumed away. |
| **Scope creep into an ERP** | The boundary holds: costing **calculates**; it never values stock and never posts entries. Any request to "post this to accounts" is refused. |
| **Two access mechanisms coexist** | Deliberate and temporary. Unified in phase 4, tested on its own. |

---

## 10. Open questions

1. Is **CNF deliberately excluded** for domestic orders, or is its absence from
   the total the bug it appears to be?
2. Are the final **WITH / WITHOUT FABRIC** prices always hand-rounded from the
   computed total, or set by other judgement?
3. Do they need **more than one costing sheet per product** (per buyer, per
   season), or is version-per-product enough?
4. Who may see rates and margin — **manager + admin** assumed.
5. Commercial: is costing **bundled** for U&M as the first client, or priced as
   the add-on it will be for everyone after them?

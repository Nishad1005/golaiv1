# Golai — Costing Module

*The living record for this module only. Every formula, the schema as built,
what is done and what is not. Updated 2026-07-24.*

| Where to look | For |
|---|---|
| **this file** | formulas, schema as built, progress, decisions |
| `costing-module-plan.md` | the agreed scope, phasing, estimates, isolation guarantees |
| `project-log.md` | the whole product; costing is one section of it |

---

## 1. What this module is, and the line it must not cross

Replaces U&M's costing spreadsheet: a product's components, their rates, and
what it costs to make.

**Allowed — costing as calculation.** A recipe plus rates gives an estimated
cost. An estimating tool.

**Never — costing as accounting.** No stock valuation, no COGS, no WIP, no
posting to books. The moment Golai asserts what inventory is *worth*, two
systems claim that number and every month-end becomes an argument. Tally keeps
valuation.

**The BOM boundary still holds.** What it protected against was
*auto-consumption* — Golai deducting material against a recipe and quietly
becoming a production controller. A costing sheet is a reference document. It
may one day **pre-fill** a release request for a human to confirm; it never
auto-issues and never auto-deducts.

**Enforcement:** costing tables carry `has_module('costing')` in their RLS on
top of `tenant_id`, and nothing in the module reads or writes `stock_balances`.

---

## 2. The source spreadsheet

`costing sheet.xlsx` — one real built chair. Buyer `DF 24`, version 1,
30-Jan-2024. Dimensions 30 × 31 × 31 in, seat height 18 in.

- **One sheet, 142 columns**, laid out **horizontally**. 31 material categories,
  each occupying a block of columns **with its own parameter set**.
- Rows 3–15 line items · row 16 per-category totals · `EG17:EI42` summary
  (category → amount → % of total) · GST % · Overhead + Margin 40 % · Total.
- Lookup tables embedded in the same sheet: foam price grid, plywood by
  thickness, corrugated sheet price, container loading.
- The "photo" is a **dimensioned design sketch**, not a product shot.

**Result for this chair:** cost **₹16,759.71** → +40 % → **₹23,463.59**, rounded
by hand to **₹23,500** (₹19,300 without fabric).

Wood 28 % · Fabric 25 % · Foam 16 % — three categories are 69 % of the cost.

---

## 3. Every formula

### 3.1 The nine shapes

Their 31 categories reduce to nine. `src/lib/costing/formulas.ts`,
16 tests in `formulas.test.ts` using the real chair's numbers.

| Shape | Formula | Excel original | Verified |
|---|---|---|---|
| `fixed` | `amount` | typed directly | 950 ✓ |
| `qty_rate` | `qty × rate` | `=BI3*BH3` | 4185 ✓ |
| `length_rate` | `length × qty × rate` | `=AR3*AP3*AN3` | 125 ✓ |
| `volume_rate` | `(L×W×T ÷ 144) × qty × rate` | `=(O3*P3*Q3/144)*R3` then `=T3*S3` | 1575.52 ✓ |
| `area_yield` | `rate × area × qty ÷ per_sheet` | `=AB3*Z3*X3/AA3` | 1206 ✓ |
| `sheet_yield` | `(sheet_rate ÷ per_sheet) × qty` | `VLOOKUP(...)` then `=(BV3/BT3)*BS3` | 1050 ✓ |
| `cbm` | `0.0000163871 × L × W × H` | `=0.0000163871*(DM3*DN3*DO3)` | 0.606749 ✓ |
| `carton_area` | `(L+W+3) × 2 × (W+H+2) × gsm ÷ 1550` | `=(DM33+DN33+3)*2*(DN33+DO33+2)*60/1550` | 368.59 ✓ |
| `container_alloc` | `freight ÷ per_container + rate × cbm + handling` | `=((2000/DT3)+(150*DU3))+150` | 264.82 ✓ |

### 3.2 Category → shape

| Category | Shape | Inputs | Worked example from the chair |
|---|---|---|---|
| Wood | `volume_rate` | L, W, T, qty, price/cft | `(2.75×3×2.5÷144)×5 = 0.7161 cft × 2200 = 1575.52` |
| Plywood | `area_yield` | cutting size, thickness, qty, sq ft, pcs/sheet, price/sqft | `67 × 24 × 3 ÷ 4 = 1206` |
| Metal | `qty_rate` | weight, price/kg | not used on this chair (0) |
| Spring | `length_rate` | length, qty, price/ft | `2.5 × 5 × 10 = 125` |
| Belt | `qty_rate` | length, price/m | `7 × 15 = 105` |
| Spring clips | `qty_rate` | qty, price | `10 × 5 = 50` |
| Tie paper wire | `qty_rate` | length, price | `50` |
| Hessian / jute | `qty_rate` | m, price/m | 0 — rate set, no qty ⚠ |
| Satin / dacking | `qty_rate` | m, price/m | `0.5×50 + 3.5×61 = 238.50` |
| Non woven | `qty_rate` | colour, gsm, consumption, price/m | `0.5 × 26 = 13` |
| **Foam** | `sheet_yield` | colour, L, W, qty, pcs/sheet, **sheet size (lookup)** | `2100 ÷ 2 × 1 = 1050` (total 2700.83) |
| Fibre wadding | `qty_rate` | gsm, m, price/m | `3 × 55 = 165` |
| Poly fibre | `qty_rate` | grams, price/g | `1400 × 0.15 = 210` |
| Thread | `fixed` | type, code, amount | `50 + 50 = 100` |
| Fabric | `qty_rate` | code, width, consumption, price/m | `4.65 × 900 = 4185` |
| Piping | `qty_rate` | code, size, length, price/m | 0 — rate set, no qty ⚠ |
| Button | `qty_rate` | code, size, pcs, price/pc | 0 — rate set, no qty ⚠ |
| Chain | `qty_rate` | code, consumption, price/ft | `2 × 20 = 40` |
| Chain puller | `qty_rate` | code, qty, price | `10` |
| Brass cup | `qty_rate` | size, qty, price/pc | 0 |
| Carton | `cbm` + `carton_area` | type, L, W, H, qty, ply | CBM 0.6067; board 368.59 |
| Packing | `container_alloc` | freight, per container, CBM, handling | `2000/84 + 150×0.6067 + 150 = 264.82` |
| Labour | `fixed` | amount | `950` |
| Finishing | `fixed` | amount | `400` |
| CNF | `fixed` | amount | `90000/84 = 1071.43` — **excluded on purpose**, §6 |
| Miscellaneous | `fixed` | amount | `150` |
| Other | `fixed` | label, amount | `150` |

### 3.3 The summary

```
category_total   = Σ lines in that category
category_pct     = category_total ÷ subtotal × 100
subtotal         = Σ category totals                     16,759.71
gst              = subtotal × gst%  ÷ 100                         0
overhead+margin  = (subtotal + gst) × margin% ÷ 100   40% → 6,703.88
total            = subtotal + gst + overhead+margin       23,463.59
```

Excel: `EH44 = SUM(EH17:EH43)` · `EH45 = (EH44*EI45)/100` ·
`EH46 = ((EH44+EH45)*EI46)/100` · `EH47 = SUM(EH44:EH46)`.

**Note margin is charged on subtotal + GST**, not subtotal alone. Reproduced as
they have it.

### 3.4 Rate tables

**Foam sheet price** — `BQ26:BR38`, driven off a base rate (`BS26 = 21`):

```
72×36 sheet:  price = thickness_mm × 21      →  72x36x50  = 1050
72×48 sheet:  price = (72×36 price ÷ 18) × 24 →  72x48x50 = 1400
```

Full grid at `BQ19:BX24` — supplier (Agarval / Shila) × Non-FR / FR ×
6′×3′ / 6′×4′ × six thicknesses (6, 10, 25, 50, 75, 100 mm).

**Plywood** — `V18:AB20`: 8′×4′ 18 mm = 4160 · 12 mm = 2880 · 6 mm = 1728.

**Container loading** — `DM20:DP26`: how many boxes fit a 20′ or 40′ HQ, e.g.
40′ HQ `472/33 × 92/33 × 105/34 → 14 × 2 × 3 = 84`. Note the 20′ figure is
**hand-overridden** to `5 × 2 × 4 = 40` rather than the computed 6 × 2 × 2.

---

## 4. Defects found in their live sheet

Five confirmed. The sixth (CNF) turned out to be deliberate — see §6.

| Defect | Effect | Fixed by |
|---|---|---|
| **"katapati" ₹100 computed, orphaned** — not referenced by the summary | Under-costed | Summary is computed, not hand-referenced |
| **VLOOKUP ranges not absolute** and inconsistent per row (`BQ27:BR38`, `BQ28:BR39`, …) | One row cannot find the smallest foam size — a silent landmine | Rate lookup by key, no ranges |
| **Foam total `SUM(BW12:BW15)`** while its lines are `BW3:BW8` | Correct only by accident | Totals derived from lines |
| **Rate with no quantity → silent ₹0** (Hessian, Piping, Button) | Cannot tell "not used" from "forgotten" | `zeroCheck()` warns on the line |
| **External link to `D:\…\Betsy Skirted Counter Stool.xlsx`** | Each product is made by copying the previous file — how all of the above propagated | Clone re-reads live rates; no inherited references |

---

## 5. Schema as built (0027)

```
costing_categories       per tenant; key, name, sort_order, formula_kind, config
costing_category_fields  per category; key, label, data_type, unit, is_input
costing_rate_tables      foam grid, plywood, sheet price
costing_rate_entries     lookup_key, attributes, rate, effective_from/to
costing_sheets           product, version, status, buyer, dimensions, photo,
                         gst_pct, margin_pct, computed (snapshot), finalised_at
costing_lines            sheet, category, item_id?, inputs jsonb, amount
```

**Three decisions worth remembering:**

**Categories are per-tenant data, seeded from a template.** U&M start with their
31; the next client can diverge with no code change. `seed_costing_template()`
is idempotent and never overwrites a category the client has edited.

**Rates live in `costing_rate_entries`, not on `items`.** Putting a rate column
on `items` would touch the table U&M use every day. With costing off, these
tables are simply empty. `effective_from` keeps history, so a March sheet stays
explicable in December.

**`costing_lines.item_id` is a read-only reference into the item master.** This
is what lets Golai answer *"which products use this fabric?"* — impossible in a
spreadsheet — and later pre-fill a release request. Costing never writes items.

---

## 6. Decisions taken

**CNF is deliberately excluded** from the total for now (client confirmed
2026-07-24). It computes at ₹1,071 in their sheet but the summary points at an
empty cell — intentional, not a bug. Revisit when that part is built.

**Costing is bundled for U&M** as the first client; priced as an add-on for
everyone after. `modules.requires_license = true` for `costing`, so it is
opt-in per company and invisible to anyone not granted it.

**Margin applies to subtotal + GST**, matching their sheet.

**Finalising snapshots the numbers** into `costing_sheets.computed`. Re-open a
March sheet in December and it still says what it said. Same principle as the
stock-card ledger: a record states what happened, it does not recompute.

**Every category appears in the summary, always** — computed, never a list of
hand-written cell references. The orphaned-line defects become impossible.

---

## 7. Progress

| | |
|---|---|
| ✅ Source sheet analysed — every formula extracted and verified | |
| ✅ Plan agreed, isolation guarantees fixed | `costing-module-plan.md` |
| ✅ Licence gate proven (company-level, DBBS-granted only) | 0025, 0026 |
| ✅ Schema, licence-gated RLS, category template | 0027 |
| ✅ Nine formula shapes + 16 tests against the real chair | `src/lib/costing/` |
| ✅ Sheet editor — header, category blocks, live summary | `src/pages/costing/` |
| ✅ Sheet list, new sheet, clone, first-run category seeding | |
| ⬜ Rate table admin — currently seeded empty, so foam lookups find nothing | next |
| ⬜ Snapshot on finalise + PDF export | |
| ⬜ Import their existing sheets; map names → item master | phase 2 |
| ⬜ Pre-fill a release request | phase 3 — first thing to touch existing workflow |
| ⬜ Category editor (per-tenant) → makes it sellable to the next client | phase 4 |

---

### 7.1 How the editor is built

**One `CategoryBlock` component renders all 31 categories.** Columns come from
that category's `costing_category_fields` rows, so adding or reshaping a
category is a data change, not a code change — and the next client can have
completely different blocks with no new UI. This was the abstraction the
estimate depended on, and it held.

**The editor holds the sheet in memory and saves on demand**, like a
spreadsheet, rather than committing per keystroke. Saving replaces the line set
wholesale — simpler and safer than diffing, and a costing sheet is small.

**Clone copies the structure and re-reads live rates.** It is the safe version
of their copy-the-last-file habit: no inherited references, no stale lookups.

**Licence-gated modules hide until proven granted.** `canAccess()` requires an
explicit `true` for anything with `requiresLicense`, so Costing never flashes
into the nav while the licence map loads.

---

## 8. Known gaps

**Only one carton formula is implemented.** Their sheet has three, and the other
two are materially different:

```
Regular box   (L+W+3)×2×(W+H+2)×60/1550                          → 368.59  ✅ built
Sleeve + lid  (L+W+3)×2×(H+2)×75/1550
              + (W+2·lid+2)×(L+2·lid+3)×2×60/1550                → 386.86  ⬜
Full flap     (L+W+3)×2×(W+H+W+2)×60/1550                        → 544.88  ⬜
```

Add as `carton_area` variants selected by box type, not as new shapes.

**Rate lookup is not wired to the formula engine yet.** `sheet_yield` takes a
rate as an argument; resolving it from `costing_rate_entries` by
`lookup_key` + date happens in the editor.

**Rate tables have no admin screen yet**, so `foam_sheet` exists but is empty
and a foam line's size dropdown will be blank. Next task.

**Wastage %** does not appear in their chair sheet, but is near-universal in
costing. Ask before assuming it is not needed.

---

## 9. Open questions

1. Are the final **WITH / WITHOUT FABRIC** prices always hand-rounded from the
   computed total, or set by other judgement? (23,463.59 → 23,500)
2. Do they need **more than one sheet per product** — per buyer, per season — or
   is version-per-product enough?
3. Who may see rates and margin? **Manager + admin** assumed.
4. Is **wastage %** used on any other product?
5. The 20′ container figure is hand-overridden. Is that per-product judgement,
   or a fixed correction?

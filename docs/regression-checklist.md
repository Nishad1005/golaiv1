# Golai — Regression Checklist

*Run this after applying migrations, before handing anything to a client.*

**Where to run it:** the **demo tenant**, never a client's. Sign in with the
`@test.com` accounts. Stage 6 needs a throwaway empty company — create one with
**Provision Client** and delete it afterwards.

**Before you start:** hard-refresh the browser (Ctrl+Shift+R). The app is a PWA
and will otherwise serve you the previous build.

Mark each row pass/fail. Anything that fails, stop and report it — a half-passing
write path is worse than a broken one, because it fails quietly.

---

## Stage 0 — Did the migrations actually run?

Two minutes, and it catches the most common failure: a migration that was
scrolled past rather than executed. Paste into the Supabase SQL Editor.

```sql
select
  to_regclass('public.modules')                       is not null as t_modules,
  to_regclass('public.placements')                    is not null as t_placements,
  to_regclass('public.item_movements')                is not null as v_item_movements,
  to_regclass('public.stock_overview')                is not null as v_stock_overview,
  to_regprocedure('public.undo_capture_entry(uuid)')  is not null as f_undo,
  to_regprocedure('public.tenant_edit_lock_hours()')  is not null as f_edit_lock,
  to_regprocedure('public.load_sample_data()')        is not null as f_sample_load,
  to_regprocedure('public.clear_sample_data()')       is not null as f_sample_clear,
  (select count(*) from modules)                                  as module_count,
  exists(select 1 from information_schema.columns
          where table_name = 'entries'  and column_name = 'qty_delta')   as c_qty_delta,
  exists(select 1 from information_schema.columns
          where table_name = 'profiles' and column_name = 'designation') as c_designation;
```

**Expect:** every boolean `true`, and `module_count` = **19**.

Then the subtle one — the views must run as the *caller*, or they read across
every tenant:

```sql
select relname, reloptions
from pg_class
where relname in ('item_movements', 'stock_overview');
```

**Expect:** both rows show `{security_invoker=true}`. If either is `null`,
**stop** — that view is leaking other companies' stock. Re-run 0019 / 0020.

---

## Stage 1 — Every write path still works (migration 0017)

0017 renamed 19 functions, dropped the direct-write policies and revoked the
internal helpers. If it half-applied, writes fail with a permission error. Run
each of these once as the role named.

| # | As | Do | Expect |
|---|---|---|---|
| 1.1 | storekeeper | **Capture** → scan a location → scan a product → qty → save | Saves; Find shows the new quantity |
| 1.2 | storekeeper | **Assign Location** → scan a location → search a product by name → save | Saves; progress counter goes up |
| 1.3 | storekeeper | **Transfer** → move some stock between two locations | Both locations update |
| 1.4 | storekeeper | **Adjust** → submit a correction with a reason | Goes to PENDING, not applied yet |
| 1.5 | manager | Approve that adjustment | Stock changes; appears on the stock card |
| 1.6 | security | **Receiving → New Gate Entry** with photos | GRN created, storekeeper alerted |
| 1.7 | storekeeper | Verify it, with a **deliberate variance** | Refuses to submit until you type a reason |
| 1.8 | storekeeper | Putaway to a location | GRN turns COMPLETED, stock appears |
| 1.9 | planner | **Release Request** against an SO reference | Created, awaiting approval |
| 1.10 | manager | Approve it | Storekeeper alerted |
| 1.11 | storekeeper | Fulfil it — scan, photo, signature | Issuance created, labels download |
| 1.12 | storekeeper | **Returns** → scan that issuance → return part of it | Stock goes back up |
| 1.13 | storekeeper | **Dispatch → New** → pick, photo | Carton labels download |
| 1.14 | manager | Approve the dispatch | Status moves on |
| 1.15 | security | Gate-out → **scan a wrong carton first** | Refused; then the right one completes it |
| 1.16 | admin | **Users & Roles** → create a user, reset their password, deactivate them | All three succeed |

> A permission error anywhere in 1.1–1.16 means 0017 did not fully apply.

---

## Stage 2 — The stock card and dashboard read correctly (0019, 0020)

| # | Do | Expect |
|---|---|---|
| 2.1 | **Find** a product you moved in Stage 1 → click its name | Stock card opens |
| 2.2 | Compare the **top row's "left"** figure with the **In stock** tile | They match exactly |
| 2.3 | Read the ledger | Every Stage 1 action appears: received, issued, returned, adjusted |
| 2.4 | Check a movement's person and document | Real name, real GRN/ISS number |
| 2.5 | Manager home → **Stock right now** | Counts look sane; low-stock tile matches reality |
| 2.6 | Click a product in **Last movements** | Opens that product's stock card |

> 2.2 is the one that matters. The running balance is computed backwards from
> live stock, so if the top row disagrees with the tile, a movement type is
> being double-counted.

---

## Stage 3 — The two write paths 0019 changed

| # | Do | Expect |
|---|---|---|
| 3.1 | **Capture** the same product on the same location again, choosing **replace the count**, with a number **lower** than current | Stock drops to the number you typed |
| 3.2 | Open the stock card | The movement is **negative** (the difference), **not** the number you typed |
| 3.3 | **Assign Location** a product onto a location | Stock card shows a **"Located"** movement |

> 3.2 is the bug this fixed. If it shows the typed number as a positive, the
> ledger is wrong and `entries.qty_delta` is not being written.

---

## Stage 4 — Undo and the edit window (0021)

| # | As | Do | Expect |
|---|---|---|---|
| 4.1 | admin | **Settings** → set the undo window to **1 hour** → save | Saves |
| 4.2 | storekeeper | **Capture** something | Green confirmation shows **Undo this** and the time left |
| 4.3 | storekeeper | Press **Undo this** | Stock returns to what it was; the movement leaves the stock card |
| 4.4 | storekeeper | Capture again, then **issue that stock** to production, then try to undo the capture | **Refused** — it would drive the shelf negative |
| 4.5 | manager | Try to undo a capture made by *someone else* | Allowed (managers can) |
| 4.6 | storekeeper | Try to undo *another person's* capture | **Refused** |
| 4.7 | — | In SQL, age an entry past the window, then try to undo it | **Refused**, pointing at Adjust |

For 4.7:

```sql
update entries set locked_until = now() - interval '1 hour'
where id = '<entry-id>';
```

---

## Stage 5 — Stock counts see what they should

| # | Do | Expect |
|---|---|---|
| 5.1 | Put **three different products** on one location | — |
| 5.2 | manager: create a count plan, assign it to a storekeeper | Storekeeper alerted |
| 5.3 | storekeeper: open it, **scan that location** | All **three** products listed, "0 of 3 counted" |
| 5.4 | Tap one, enter the same number as the system | Ticks; badge reads "1 of 3" |
| 5.5 | Tap another, enter a **different** number | Demands a reason |
| 5.6 | Tap the third, enter **0** | Accepted as a real count, with a variance |
| 5.7 | Leave nothing uncounted, finish, manager approves | Stock corrected; adjustments on each stock card |

> 5.3 is the fix. If the location opens empty, the blind spot is still there.

---

## Stage 6 — Sample data (0022) — *use a throwaway company*

**Provision Client** → make a company called e.g. "Test Sandbox" with an admin
login. Sign in as that admin.

| # | Do | Expect |
|---|---|---|
| 6.1 | Admin home | Setup checklist showing 0–1 of 7, and the **Load sample data** card |
| 6.2 | **Load sample data** | Confirms "3 zones, 6 locations, 7 products…" |
| 6.3 | Find → search "cupcake" | Found, with a location and quantity |
| 6.4 | Manager/admin home → Stock right now | Populated; **Thread** shows as low stock |
| 6.5 | Open a product's stock card | Received / issued movements present |
| 6.6 | Receiving | The sample GRN, COMPLETED, with its variance reason |
| 6.7 | **Remove sample data** → confirm | Everything gone; lists show their empty states |
| 6.8 | Now go to the **demo tenant** as admin and look for the card | **Not offered** — it already has products |

> 6.8 is the safety guard. If the card appears on a tenant with real stock,
> stop and report it.

---

## Stage 7 — Access control (0016, 0017)

| # | Do | Expect |
|---|---|---|
| 7.1 | admin: **Users & Roles → Access** on a storekeeper → untick **Dispatch** | Saves with a "custom" tag |
| 7.2 | Sign in as that storekeeper | Dispatch is **absent from the menu**, not greyed out |
| 7.3 | Type `/dispatch` in the address bar | Does not open the screen |
| 7.4 | admin: **ID card** → set an employee ID and position | Saves |
| 7.5 | Sign in as them → **My Account** | Photo upload works; position shown but **not editable** |
| 7.6 | Their **What you can use** list | Dispatch is missing from it |

---

## Stage 8 — Labels and printing

| # | Do | Expect |
|---|---|---|
| 8.1 | Zones & Locations → **Labels** → thermal 100 × 50 | PDF with **one label per page** |
| 8.2 | Items → select a few → **Print labels** | Name and code large; barcode + QR |
| 8.3 | Receiving → a verified GRN → **Print item labels** | Defaults to one per unit received |
| 8.4 | Print 8.1 on the TSC TE244 at **Actual size / 100%** | One sticker per label, not squeezed |
| 8.5 | Scan a printed label with a USB scanner, and the QR with a phone | Both resolve to the right record |

---

## Stage 9 — Offline and first load

| # | Do | Expect |
|---|---|---|
| 9.1 | On a phone, airplane mode → **Capture** | Offline banner; the capture queues |
| 9.2 | Restore connection | Syncs; appears in Find and on the stock card |
| 9.3 | Open the app fresh on a phone | Login appears quickly; screens load as you visit them |
| 9.4 | Go offline, then visit a screen you have **not** opened before | Still loads — the service worker precached it |

> 9.4 is the risk introduced by code-splitting. If it fails, the precache is not
> covering every chunk.

---

## If something fails

Record which row, what you did, and the exact error text. The error message
matters — "permission denied for function X" points at 0017, while a wrong
number points at the ledger. Both are fixable quickly with that detail; neither
is fixable from "it didn't work".

# Golai — Sales Demo Manual

*Golai runs the floor. Your ERP runs the books.*

This guide lets anyone run a complete client demo in ~15 minutes with no technical knowledge. Follow it top to bottom the first time; after two run-throughs you won't need it.

---

## 1. What you are selling (the 30-second pitch)

> "Most factory warehouses run on Excel, paper challans, and memory. Material gets lost, wrong fabric goes to production, and when a customer disputes a delivery there's no proof. **Golai puts a barcode on every shelf, a scan on every movement, and a photo on every transaction.** Anyone can type an item's name and see exactly which shelf it's on. And it doesn't touch your ERP — Tally still does the accounts; Golai does the floor."

Three facts to memorize:

1. **It never shows money.** Quantities only. It complements the client's ERP, never competes with it.
2. **Existing item codes are kept exactly as they are.** No renumbering, no migration pain.
3. **Every movement has evidence**: who, when, which shelf, and a photograph — in a tamper-proof log even the admin cannot edit.

---

## 2. Demo environment

| | |
|---|---|
| **Web app** | `https://YOUR-SITE.netlify.app` *(fill in your Netlify URL)* |
| **Works on** | Any phone or laptop browser. On a phone, the browser offers **"Add to Home Screen"** — it installs like an app. |
| **Demo company** | U&M Designs Pvt Ltd (furniture manufacturer) |

### Demo accounts (one per role — each sees a different home screen)

| Login | Role | Plays | Home screen shows |
|---|---|---|---|
| `user1@test.com` | **Admin** | IT / setup person | Masters: zones, shelves, items, users |
| `manager@test.com` | **Manager** | Owner / MD ("Suhel") | Approvals, reports, QC, exports |
| `planner@test.com` | **Production Planner** | Production head ("Amit") | Release requests, dept status |
| `store@test.com` | **Storekeeper** | Store in-charge ("Rajesh") | Scan-first task tiles |
| `security@test.com` | **Security Guard** | Gate operator ("Suresh") | Gate entries and gate-outs |

**Password for all accounts:** `user10` *(fill in — do not print this sheet with the password on it if it leaves your hands)*

### Before the client arrives (5 minutes)

1. Open **two browser windows** (one normal, one incognito) so you can switch roles fast without logging in and out.
2. Log in as `store@test.com` in one and `manager@test.com` in the other.
3. Check the item locator finds something: type `cupcake` in the search bar — a fabric with shelf locations should appear. If the database is empty, run the **Appendix B seed** first.
4. Have one printed **shelf label** and one printed **issuance label** on the table if possible (print from the app: Admin → Zones & Shelves → Labels). Physical labels make the demo tangible.
5. Phone charged — the phone camera scan and "Add to Home Screen" moments land better on a phone than a laptop.

---

## 3. The 15-minute demo script

The demo tells one story: **"A sofa order, from gate to gate."** Material arrives for sales order SO-5001, goes to a shelf, goes to production, and the finished sofa is dispatched — with proof at every step.

> Tip: keep quantities small and type codes by hand using the **keyboard toggle** on scan fields (real customers will use ₹2,000 USB scanners or the phone camera — say exactly that when you type).

### Act 1 — "Find anything in five seconds" (2 min, as any role)

1. On the home screen, click the search bar: **"Find any item… name, code or barcode."**
2. Type `cupcake` → the fabric appears with **zone, shelf, and quantity**.
3. **Say:** *"This is the whole product in one screen. Your storekeeper retires or goes on leave — the knowledge doesn't leave with him. Anyone can find any material instantly."*

### Act 2 — Material arrives at the gate (3 min, as `security@test.com`)

1. **New Gate Entry** → fill: vehicle `RJ14 GC 5001`, driver name + phone + license (anything), supplier from dropdown, PO ref `PO-5001`, material `Fabric`, cartons `1`.
2. Take the photos with the device camera — vehicle, driver, invoice (photograph anything; the point is the *habit*).
3. Try to submit **without a document photo** → it refuses. **Say:** *"The guard cannot skip evidence. It's not training — the system won't allow it."*
4. Submit → a GRN number like `GRN/2026-07/0002` is created and the storekeeper is alerted automatically.

### Act 3 — Verify and put away (3 min, as `store@test.com`)

1. Point at the **bell icon** — the storekeeper was notified the moment the truck arrived.
2. **Receiving (GRN)** → open the draft → scan/type `AU162590` → enter PO qty `20`, invoice qty `20`, **received qty `18`**.
3. A **variance reason** field appears and blocks submission until filled. **Say:** *"Short deliveries get caught at the gate, with a reason on record — not discovered three weeks later during a stock-take."*
4. Submit → **Place** → qty 18 → shelf `Z01-S003` → GRN turns **COMPLETED**.
5. Search `cupcake` again → the new shelf and quantity are already there.

### Act 4 — Production requests material (4 min, planner → manager → storekeeper)

1. As `planner@test.com`: **New Release Request** → SO ref `SO-5001`, customer note `Demo Client Mumbai`, department `Upholstery`, any foreman → add `cupcake` qty `10` → submit.
2. As `manager@test.com`: bell alert → open → **Approve**. **Say:** *"Material only leaves the store with a manager's approval — from his phone, wherever he is."*
3. As `store@test.com`: open the request — **it tells him exactly which shelves have the fabric and how much**. Pick 10 from a shelf, take the staging photo, and have the *client* sign in the signature box — people love signing.
4. Submit → labels PDF downloads. **Open it. This is the money shot.** Every roll leaving the store gets a label: **FOR: SO-5001**, customer, department, foreman, date, barcode + QR.
5. **Say:** *"Six weeks later nobody asks 'whose foam is this?' — it's written on it. And when production returns the surplus, they scan this same label and it goes back against the same order."*

### Act 5 — Dispatch with proof (3 min, storekeeper → manager → security)

1. As `store@test.com`: **Dispatch → New** → SO `SO-5001`, pick `2` of anything in stock → carton photo → submit → **carton labels** download.
2. As `manager@test.com`: approve.
3. As `security@test.com`: open the DC → enter vehicle → scan the carton code — **type a wrong code first**: *"does not belong to this DC."* **Say:** *"The wrong carton physically cannot leave the gate."* Then the right code → green tick → departure photo → **DISPATCHED**.

### Act 6 — The owner's view (2 min, as `manager@test.com`)

1. **SO-wise Movement** → type `SO-5001` → the full timeline appears: receipt → release → issuance → dispatch, each entry opening to its photos and signatures.
2. **Say:** *"Customer disputes the delivery? This is your answer — every step, every person, every photo, timestamped. And your auditor gets the same trail; even the admin cannot edit this log."*
3. Optionally show **ERP Export** → download the CSV → *"this reconciles against Tally monthly. Quantities only — Golai never touches your valuations."*

### Act 7 — The clincher (1 min, on the phone)

1. Turn on **airplane mode** → the amber **Offline** banner appears → do a capture anyway → it saves.
2. Turn Wi-Fi back on → watch it sync. **Say:** *"Factory Wi-Fi dies; work doesn't."*
3. Show **Add to Home Screen** → the Golai icon lands next to WhatsApp. No app store needed.

---

## 4. Questions clients will ask (and the answers)

| Question | Answer |
|---|---|
| "Does it replace Tally / our ERP?" | **No — deliberately.** Your ERP keeps accounts, GST, invoices. Golai runs the physical floor and exports quantity CSVs for reconciliation. |
| "We already have item codes everywhere." | **They stay exactly as they are.** Golai imports your CSV verbatim — it only generates a code when an item has none at all. |
| "What if the internet goes down?" | Scanning, capture, and gate entry keep working offline and sync automatically when the network returns. |
| "Can my staff handle it?" | Each role sees only their own screens, with big buttons designed for a 5-second interaction. The guard's screen is photos and one button. |
| "Is our data safe? We have competitors." | Each company's data is isolated at the database level (row-level security), photos are private with expiring links, and the audit log is append-only — nobody, including us, can rewrite history. |
| "What about our existing barcodes on products?" | Any existing barcode scans straight in — it's stored alongside the item and both work. |
| "iPhone / Android app?" | It installs from the browser today (PWA); native Play Store / App Store builds are on the roadmap. |
| "Costing, valuation, stock value reports?" | Out of scope by design — that's ERP territory. Golai shows units only. |

**Do not promise** (log the request instead): BOM/auto-issuance, stock reservation against SO, work-order management, valuation, vendor portals, multi-warehouse. These are ERP scope or later versions.

---

## 5. Onboarding a real client

When a demo turns into a sale, this is how a client goes live — a repeatable
process you'll follow the same way for every client.

### 5.1 Who creates the logins?

- **You (DBBS) create ONE account: the client's Admin.** (Supabase Auth → add
  user, then insert their `profiles` row with role `admin` and their tenant id —
  the same two-step you used for the demo accounts.)
- **The client's Admin creates everyone else from inside the app** — no Supabase
  access needed. Admin → **Users & Roles → New User** → name, email, role →
  **Create & send invite**. The staff member gets an email to set their own
  password and appears in the list right away. The client adds and removes their
  own managers, storekeepers, guards, and planners as their team changes.
- Each client is a separate **tenant**: their data is invisible to every other
  client, enforced at the database level.

### 5.2 Migrating the client's existing data (Excel → Golai)

A client usually has two things: a **zone/shelf list** (often with barcodes
already) and an **item master** (usually with no locations). That's the ideal
input — in Golai an item's location isn't a field in the item master, it's
created when someone scans the item onto a shelf. So:

1. **Zones & shelves** — create them from the client's list (Admin → Zones &
   Shelves), keeping their existing shelf codes/barcodes. If they have none,
   print Golai's shelf-label PDFs (**Labels** button per zone) and stick them.
2. **Item master** — import their Excel/CSV (Admin → Items → **Import CSV**).
   Existing item codes are kept **exactly as-is**; only items with no code get an
   auto `ITM-` code. At this point every item exists but sits on **no shelf** —
   that's expected, not a problem to fix.
3. **Print item barcode labels** (see 5.3) and stick one on each physical piece.
4. **The client assigns locations by scanning** — a storekeeper walks the floor
   with the app: **Capture → scan shelf → scan each item on it → enter quantity**.
   Every scan places that item on that shelf with its real quantity. After one
   walk-through, the item locator finds everything. This is the client's own work
   (they know their floor) and doubles as staff training — and it's more accurate
   than importing planned locations from a spreadsheet, because it records where
   stock *actually* is.

> Optional: if the client wants rough default zones in the import, we can map a
> "default zone" per item — but actual stock still comes from the scan-walk.

### 5.3 Printing item barcode labels

For items that arrive without a barcode, Golai generates one from the item's
code. Admin → **Items** → tick the items (or **Select all**) → **Print labels**:

- **Label size**: A4 sticker sheets (24 or 12 per page) for an office printer, or
  50×25mm for a thermal label printer (the daily-use option at scale).
- **Copies per item**: one sticker per physical piece — e.g. 12 for 12 rolls of
  the same fabric.

Each label carries the item name, its code, a **Code128 barcode** (USB laser
scanners) and a **QR code** (phone cameras). (Printing works on the currently
listed items — use the search box to filter to a category/zone, then Select all,
for large masters.)

*Migration-day order:* import zones → stick shelf labels → import items → bulk
print item labels → team walks the floor sticking item labels and scanning each
onto its shelf.

---

## 6. Appendix A — Reset between demos (Admin, Supabase SQL Editor)

Wipes all *transactions* but keeps zones, shelves, items, users. Run when the demo data gets messy:

```sql
delete from return_lines; delete from returns;
delete from issuance_lines; delete from issuances;
delete from release_request_lines; delete from release_requests;
delete from dispatch_gate_exits; delete from dispatch_lines; delete from dispatches;
delete from grn_putaways; delete from grn_lines; delete from grn_gate_entries; delete from grns;
delete from qc_holds; delete from stock_count_lines; delete from stock_counts;
delete from adjustments; delete from transfers; delete from entries;
delete from stock_balances; delete from alerts;
truncate activity_log;  -- audit log is append-only; truncate is the reset-only exception
update sequences set current_value = 0;
```

## 7. Appendix B — Minimum seed data for a fresh demo

If the item locator finds nothing, do this once (5 minutes, as `user1@test.com`):

1. **Zones & Shelves**: zone `Z01` "Fabric Store" with shelves S001–S010; zone `Z02` "Foam Store" with S001–S005.
2. **Items**: `AU162590` / "Cupcake Fabric" / unit `m`, and one with a blank code → "Test Foam Block" / `pcs` (shows auto-coding).
3. **Parties**: supplier "Cupcake Fabric Supplier", customer "Demo Client Mumbai", departments "Upholstery" and "Carpentry".
4. **Stock**: as `store@test.com` → Capture → shelf `Z01-S001` → item `AU162590` → qty `25`; and foam onto `Z02-S001` → qty `10`.
5. Verify: search `cupcake` finds it. You're demo-ready.

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
| **Web app** | `https://golaiv1.netlify.app/`  |
| **Works on** | Any phone or laptop browser. On a phone, the browser offers **"Add to Home Screen"** — it installs like an app. |
| **Demo company** | DBBS Demo — a furniture manufacturer |

> **Never demo on a real client's account.** The demo tenant and every client
> tenant share the same tables, separated at the database level. Log in with the
> `@test.com` accounts below and you are always in demo data.

### Demo accounts (one per role — each sees a different home screen)

| Login | Role | Plays | Home screen shows |
|---|---|---|---|
| `user1@test.com` | **Admin** | IT / setup person | Masters: zones & locations, items, parties, users, company |
| `manager@test.com` | **Manager** | Owner / MD ("Suhel") | Approvals, reports, QC, exports |
| `planner@test.com` | **Production Planner** | Production head ("Amit") | Release requests, dept status |
| `store@test.com` | **Storekeeper** | Store in-charge ("Rajesh") | Scan-first task tiles |
| `security@test.com` | **Security Guard** | Gate operator ("Suresh") | Gate entries and gate-outs |

**Password for all accounts:** `user10` *(fill in — do not print this sheet with the password on it if it leaves your hands)*

### Before the client arrives (5 minutes)

1. Open **two browser windows** (one normal, one incognito) so you can switch roles fast without logging in and out.
2. Log in as `store@test.com` in one and `manager@test.com` in the other.
3. Check the item locator finds something: type `cupcake` in the search bar — a fabric with shelf locations should appear. If the database is empty, run the **Appendix B seed** first.
4. Have printed labels on the table if possible — one **location label**, one **product label**, one **issuance label** (Admin → Zones & Locations → Labels, and Admin → Items → Print labels). Physical labels make the demo tangible.
5. Phone charged — the phone camera scan and "Add to Home Screen" moments land better on a phone than a laptop.

---

## 3. The 15-minute demo script

The demo tells one story: **"A sofa order, from gate to gate."** Material arrives for sales order SO-5001, goes to a shelf, goes to production, and the finished sofa is dispatched — with proof at every step.

> Tip: keep quantities small and type codes by hand using the **keyboard toggle** on scan fields (real customers will use ₹2,000 USB scanners or the phone camera — say exactly that when you type).

### Act 1 — "Find anything in five seconds" (2 min, as any role)

1. Open **Find Item** (or the search bar on the home screen): **"Find any item… name, code or barcode."**
2. Type `cupcake` → the fabric appears with **zone, location, and quantity**.
3. Now do it **the other way round**: scan (or type) a location code like `Z01-S003` → Golai lists **everything on that spot with quantities**. **Say:** *"At the rack, your man sees all five things stored there and how many of each."*
4. **Say:** *"This is the whole product in one screen. Your storekeeper retires or goes on leave — the knowledge doesn't leave with him. Anyone can find any material instantly."*

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
| "What about our existing barcodes on products?" | Any existing barcode scans straight in — it's stored alongside the item and both work. And for products with none, Golai prints labels from their own code. |
| "Our products aren't barcoded at all — how long before we can search?" | **One walk of the floor.** Locations get stickers, then a storekeeper scans a spot and types product names to record what's on it. No product barcodes needed to start. |
| "Can it carry our company name and logo?" | Yes — the client's admin uploads it under Company Profile, and it appears in the app for their whole team. Golai's name stays in the menu. |
| "Can we control what each person sees?" | Beyond the five roles, the admin can tick individual sections on or off **per person**. Unticked sections disappear from that person's menu entirely — and the database refuses them too, not just the screen. |
| "Half our floor staff have no email." | They log in with their **mobile number** and a password. No SMS, no OTP, no cost. |
| "iPhone / Android app?" | It installs from the browser today (PWA); native Play Store / App Store builds are on the roadmap. |
| "Costing, valuation, stock value reports?" | Out of scope by design — that's ERP territory. Golai shows units only. |

**Do not promise** (log the request instead): BOM/auto-issuance, stock reservation against SO, work-order management, valuation, vendor portals, multi-warehouse. These are ERP scope or later versions.

---

## 5. Onboarding a real client

When a demo turns into a sale, this is how a client goes live — a repeatable
process you'll follow the same way for every client.

### 5.1 Who creates the logins?

- **You (DBBS) create the client in one step, inside the app.** Log in as a
  platform admin → **Provision Client** → enter the company name and the admin's
  name, email/mobile and password → submit. Golai creates the **company and its
  first admin login together**, so a client's data can never land in the wrong
  company by accident. No Supabase dashboard, no SQL.
- **The client's Admin creates everyone else from inside the app.** Admin →
  **Users & Roles → New User** → name, email **or mobile number** (staff without
  email log in with their 10-digit mobile), role → **Create**. Golai shows a
  **temporary password on screen** — the admin hands it over, and the staff
  member changes it under **My Account**. No email is ever sent.
  - Forgotten password? **Reset password** next to their name issues a new one
    in seconds.
  - Staff left? **Deactivate** (login blocked, history preserved). Permanent
    Delete is only for accounts created by mistake.
- **The client brands it as their own.** Admin → **Company Profile** → company
  name + logo, which then appear top-right for their whole team.
- Each client is a separate **tenant**: their data is invisible to every other
  client, enforced at the database level.

### 5.2 Migrating the client's existing data (Excel → Golai)

A client usually has two things: a **zone list** and an **item master with no
locations in it**. That's the normal, expected input — in Golai an item's
location isn't a field on the item, it's created when someone puts that item on
a spot. The order below matters:

1. **Zones** — Admin → **Zones & Locations**. Create them, or **Import zones
   CSV** for a long list (a template is provided). Any zone can be renamed later.
2. **Locations** — inside each zone, add the spots and **let the client name
   them**: they type `Ghoda`, `Shelf`, `Rack` — whatever they call it — and Golai
   builds codes from the first letter (`Ghoda` → `Z03-G001…`). Print the labels
   (**Labels** button) and stick one on each physical spot. *It doesn't matter
   which sticker goes where* — that gets recorded in step 4.
3. **Item master** — Admin → Items → **Import CSV**. Existing item codes are kept
   **exactly as-is**; items with no code get an auto `ITM-` code, **flagged
   "auto"** in the list so the client can replace it with a real one later. The
   client's own grouping column (U&M call theirs "Definition") maps to **Type**,
   which is searchable — typing "Thread" finds every thread.
4. **The location walk — the step that makes search work.** A storekeeper walks
   the floor with a phone: **Assign Location → scan the location sticker → type a
   product's name → tap to add** → repeat for everything on that spot → **Next
   location**. Quantity is optional; leave it blank if they're not counting yet.

> **Say this clearly, because it's the objection that comes up:** the walk needs
> **no product barcodes at all** — products are found by name. That's why it can
> start on day one, before a single product label is printed. A progress counter
> ("312 of 4,565 products located") means it can be done over several days.

5. **Product labels** (see 5.3) — optional but recommended wherever one spot
   holds several similar things. Stick one on each bin/box so the floor can scan
   the product, not just the shelf.
6. **Quantities** — either entered during the walk, or filled in later with a
   **Stock Count**. Knowing *where* things are starts paying off immediately.

### 5.3 Printing product barcode labels

For items that arrive without a barcode, Golai generates one from the item's
code. Admin → **Items** → tick the items (search first, then use the header
checkbox to take a whole group) → **Print labels**:

- **Label size** — match it to the client's hardware:
  - **Thermal roll**: 100 × 50 mm, 75 × 50 mm or 50 × 25 mm. Each label prints
    on **its own page**, which is what a label printer (e.g. TSC TE244) expects.
  - **A4 sheet**: only for sticker sheets in an office printer.
- **Copies per item**: one sticker per physical bin, box or roll.

Each label carries the **product name and its number in large type**, a
**Code128 barcode** (USB laser scanners) and a **QR code** (phone cameras).

> If a label prints tiny or several land on one sticker, the print dialog is set
> to "Fit to page" — switch it to **Actual size / 100%**.

*Migration-day order:* zones → locations → **stick location labels** → import
items → **the location walk** → print and stick product labels → counts.

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

1. **Zones & Locations**: zone `Z01` "Fabric Store" → add locations named `Shelf`, 1–10 (`Z01-S001…`); zone `Z02` "Foam Store" → `Shelf` 1–5.
2. **Items**: `AU162590` / "Cupcake Fabric" / unit `m`, and one with a blank code → "Test Foam Block" / `pcs` (shows auto-coding).
3. **Parties**: supplier "Cupcake Fabric Supplier", customer "Demo Client Mumbai", departments "Upholstery" and "Carpentry".
4. **Stock**: as `store@test.com` → Capture → shelf `Z01-S001` → item `AU162590` → qty `25`; and foam onto `Z02-S001` → qty `10`.
5. Verify: search `cupcake` finds it. You're demo-ready.

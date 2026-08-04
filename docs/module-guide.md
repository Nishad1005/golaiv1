# Golai — Module Guide

*What every part of the app is for, who uses it, and when.*

This is a reference — read the part you need, when you need it. For first-time
setup follow the **Getting Started guide** instead; for a sales walkthrough see
the **Demo guide**.

---

## How it all fits together

```
   MATERIAL IN                 IN STORAGE                  MATERIAL OUT
   ───────────                 ──────────                  ────────────
   Receiving (GRN)  ──►  Capture · Assign Location  ──►  Release → Issuance
   (gate → verify        Transfer · Adjust                Dispatch (to customer)
    → putaway)           Stock Counts · QC Hold           Returns (comes back in)
                              │
                              ▼
          Find · Stock Card · Alerts · SO Movement · ERP Export
```

Everything is built on one simple fact: **every product sits at a location, and
every movement is recorded** — who, when, how much, with photos.

---

## Which module do I use? (quick answer)

| Your situation | Use this |
|---|---|
| "Where is this product?" | **Find** |
| "What came in and what went out of this product?" | **Stock Card** (click any product name) |
| "How much stock do we have overall?" | **Manager home** — Stock right now |
| "What is in each zone and on each shelf?" | **Total stock** (tile on the manager home) |
| "What does this product cost to make?" | **Costing** *(add-on)* |
| A material price has changed | **Costing → Rate tables** |
| "What's on this shelf?" | **Find** (scan the location sticker) |
| A truck has arrived at the gate | **Receiving** (Gate Entry) |
| Delivery needs checking against the invoice | **Receiving** (Verify) |
| Goods need to go onto a shelf | **Receiving** (Putaway) |
| Recording what already sits on a shelf (first-time setup) | **Assign Location** |
| Found stock nobody had recorded | **Capture** |
| Moving stock from one shelf to another | **Transfer** |
| Just scanned the wrong shelf | **Undo** on the confirmation — for a short window |
| Stock came in or out, or the count is wrong | **Adjust** (add / remove / set total) |
| Production needs material (formal, approved) | **Release Requests** |
| Quick issue over the counter (10 screws to Furniture) | **Issuance** |
| "What was issued under work order WO-1234?" | **Issuance → History** |
| Production is returning unused material | **Returns** |
| Goods are going to a customer | **Dispatch** |
| Something is waiting for quality inspection | **QC Hold** |
| Time for a physical stock check | **Stock Counts** |
| "What happened with sales order SO-1234?" | **SO Movement** |
| Accounts want the numbers for Tally | **ERP Export** |
| New shelf / ghoda / rack needs a barcode | **Zones & Locations** |
| New product, or printing product labels | **Items** |
| Labelling goods that just arrived | **Receiving** (Print item labels) |
| Setting the warehouse up for the first time | **Admin home** — the setup checklist |
| New staff member needs a login | **Users & Roles** |
| Change the undo window or working hours | **Settings** |

---

# Everyday floor tools

## Find
**Who:** everyone except the gate guard · **The most-used screen in Golai.**

Works in both directions:
- **Type or scan a product** (name, code, barcode, or its type like "Thread") →
  shows every location it sits at, with quantities.
- **Scan a location sticker** → shows everything on that spot with quantities.

> **Use case.** A foreman needs 0.75 mm wire. He types "wire", sees
> *Main Store (Z01) · Shelf 4 — 118 m*, walks straight there. No asking around,
> no hunting. At the rack he scans the shelf sticker and sees all five wire
> thicknesses stored there, so he picks the right one.

**Good to know:** an item can show "not counted yet" — that means its location is
known but nobody has counted the quantity. Still useful; the count comes later.

**Click any product name** to open its **Stock Card** — its whole history.

---

## Stock Card
**Who:** everyone who can use Find · *Open it by clicking a product name
anywhere — Find, the Items list, or a location's contents.*

One product's whole life: how much is in stock, where it sits, and a dated
ledger of every movement — received, counted, transferred, issued, returned,
dispatched, adjusted, released from QC, located — with who did it, against which
document, **the note or reason behind it** (the Adjust reason and note, a GRN's
variance, an issue's work order and recipient), and **what was left after each
move**.

> **Use case.** The manager is sure 50 foam blocks were bought but only 38 are on
> the shelf. He opens the stock card: *received 50 on 12 July · issued 8 to
> Upholstery for SO-1180 · issued 4 for SO-1192 · 38 left.* Question answered in
> ten seconds, with the issuance documents one tap away. No stock-take, no
> argument.

**Good to know:** the running balance is calculated back from today's real
count, so the top line always matches what is physically in stock.

---

## Assign Location
**Who:** storekeeper · **Used heavily during setup, occasionally afterwards.**

Records *what sits where*. Scan a location sticker once, then search products by
name and tap to add them. Quantity is optional.

> **Use case.** Setting up the warehouse for the first time. Ramesh walks Zone 3
> with a phone: scans `Z03-G001`, types "foam", taps *Foam Sheet 40D*, adds two
> more products on that ghoda, saves, presses **Next location**. A progress
> counter shows "312 of 4,565 products located", so he can stop and continue
> tomorrow.

**Good to know:** products **don't need barcodes** for this — you find them by
name. That's what makes it possible before any product labels are printed. If the
*location* can't be scanned either — a pallet with no reachable sticker — tap
**Can't scan? Pick location**, choose the zone, and tap the pallet on its
car-park map. The same option is on Capture and on Adjust's *By location*.

**Product photos.** To end "which one is this?" confusion, every product can carry
a **photo**. Its thumbnail shows in every product list — Find, Assign, Stock
Counts, Adjust, Issuance, Transfer — and full-size on the stock card. Staff add or
replace it **right where they work**: the camera button on a staged product in
Assign Location, on the item being counted in Stock Counts, or on the product's
stock card (tap any product name). Products with no photo show a neutral
placeholder.

---

## Capture
**Who:** storekeeper

Scan a location, scan a product, enter the quantity. If the barcode isn't
recognised, it offers to create the product on the spot.

> **Use case.** Rajesh finds a carton of hinges on a rack that isn't in the
> system. He scans the shelf, scans the carton's barcode, and since it's unknown
> Golai offers to create it — keeping the supplier's code exactly as printed.
> He enters 200 pcs, snaps a photo, saved.

**Good to know:** if the product is already recorded on that shelf, you choose
**add on top** or **replace the count** — so re-counting never doubles a figure
by accident. There's a **unit dropdown** beside the quantity — pick metre, roll,
kg, whatever this product is measured in; it's remembered for the product
everywhere. (A product keeps one unit so its stock still totals up.)

**Made a mistake?** The confirmation carries an **Undo this** button with the
time remaining. Scanning the wrong shelf is the commonest slip on the floor, and
inside the window you can put it right yourself. Once the window closes — your
admin sets how long in Settings — the only correction is an **Adjust**, with a
reason and a manager approval. You cannot undo someone else's entry, or one
whose stock has already been issued.

---

## Transfer
**Who:** storekeeper

Moves stock between locations: pick the source, **pick the product off that
shelf** (tap it, or search its name — no barcode needed), enter the quantity,
pick the destination.

> **Use case.** Zone 2 is overflowing, so 8 rolls of fabric move to a spare ghoda
> in Zone 3. Both shelves update instantly, and anyone searching that fabric now
> sees the new spot.

**Good to know:** you cannot move more than is actually on the source shelf —
Golai refuses. Typing a location instead of scanning it is allowed but recorded
in the audit log.

---

## Adjust
**Who:** storekeeper raises it, manager approves

Corrects a quantity when stock comes in or goes out outside the normal flows.
Find the product **two ways — by location or by product** — then say how it
changes and give a mandatory reason (miscount, damage, theft, system error…).
**No barcode needed:** *By location* lists the products on a spot to tap, *By
product* searches by name and shows where it sits.

**Three ways to change it — you don't do the maths:**
- **Add** — type what came in (10 m of fabric); Golai adds it to what's there.
- **Remove** — type what left (3 damaged); Golai subtracts it.
- **Set total** — type the exact new count after a recount.

It shows the result live as you type — *10 → 20 m (+10 stock in)* — and won't let
you remove more than is on the shelf.

> **Use case.** 10 m of fabric arrives outside a formal GRN. Rajesh opens Adjust,
> picks the shelf, chooses **Add**, types 10, reason "stock in" — and the shelf
> reads 20 m, no mental arithmetic. Later a recount finds 47 foam blocks against
> the system's 50: he chooses **Remove 3** (or **Set total 47**), reason
> "miscount". Suhel sees it in his approvals, taps approve, and it's corrected —
> with a permanent record of who changed what and why.

**Good to know:** a manager or admin making the correction themselves applies it
immediately. Nothing is ever changed silently. Your reason **and** any note you
add both show on the product's **stock card**, so the history explains itself.

---

# Material coming in

## Receiving (GRN)
**Who:** security guard → storekeeper · **Three stages, one document.**

1. **Gate Entry** (security) — vehicle number and photos, driver name/phone/
   licence and photos, supplier, PO reference, material type, cartons, and at
   least one **document photo** (invoice / e-way bill / LR / PO). Creates
   `GRN/2026-07/0001` and alerts the storekeeper. Material types include Fabric,
   Foam, Wood, **Leather**, Hardware and Packing Material.
   **Hand delivery:** if goods are walked in with just a PO — no vehicle, no
   driver — switch the toggle at the top to **Hand delivery**; the vehicle and
   driver-licence sections drop away, you note who brought it (optional) and
   still snap the document photo. The GRN detail then shows a *Hand delivery*
   badge instead of vehicle/driver details.
2. **Verify** (storekeeper) — scan each product, enter **PO qty / Invoice qty /
   Received qty**. Any difference demands a written reason. Mark each line
   **OK / Hold for QC / Reject**, with photos for damage.
3. **Putaway** (storekeeper) — scan the destination location for each line;
   stock updates. Can be split across several locations. When everything is
   placed the GRN closes automatically.

**Print item labels** sits on the verified lines, defaulting to **one label per
unit received** — so goods get their barcode stickers before they reach the
shelf, rather than arriving unlabelled and needing a second trip. Rejected lines
are skipped, since they never go on a shelf.

> **Use case.** A fabric delivery arrives. Suresh photographs the vehicle,
> driver and invoice at the gate — the system won't let him submit without the
> document photo. Rajesh gets an alert, checks the cartons, finds 18 rolls
> against an invoice of 20, and must type a reason ("2 short — supplier
> informed"). He puts the 18 away on `Z02-S003`. Six weeks later, when the
> supplier disputes it, the photos and the reason are still there.

**Good to know:** if the declared material type doesn't match the product's type,
Golai shows a warning — catching "fabric" trucks carrying foam.

---

# Material going out

## Issuance
**Who:** whoever holds the Issuance module (a storekeeper, or a dedicated
"issuance clerk" role) · **The quick counter issue.**

Issue stock straight out against a work order — no request, no approval. Enter
the **work order number**, **department**, **who it's going to**, then pick the
**product** (by name) and the **location** it comes from, and the **quantity**.
On **Issue**, the stock drops immediately and the movement lands on the product's
stock card.

> **Use case.** Someone from Furniture comes to the store for 10 screws. The
> issuance clerk types work order `WO-1234`, picks Furniture, enters the person's
> name, searches "screw", picks the shelf it's on, enters 10, and issues. Ten
> screws leave stock there and then — the count is right without anyone raising a
> formal request.

**Requisitions tab.** For requisitions raised in the client's *own* ERP, the
**Requisitions** tab brings that pick-list into Golai. **Upload just the
requisition PDF — Golai reads the lines straight out of it** (product, requested
qty, PR no., work order, department); a CSV export works too. You get a quick
review screen (fix a quantity, change a product, delete a stray row) before
saving. Golai matches each product to your master and pulls **where it sits
(zone · shelf)**; anything it can't match, you map by hand. The issuer then works a **"To issue"
list** of everything still pending — with a photo, its location, department,
type, category and work order — and can **filter by department, type, category
or zone** so, standing in one section, they clear all its pending items at once.
Tapping **Issue** on a line drops the stock (a normal issuance, so it shows on
the stock card and History with its work order) and advances that line. Each
requisition shows its progress, keeps the PDF one tap away, and its issued list
can be **exported to CSV** to update the ERP.

**History tab.** Alongside **Issue** sits a **History** tab: past issues, newest
first, searchable by **work order number** (or issue number, or the person it
went to). Each entry shows the work order, the issue number, when, the
department, who received it and who issued it — then the products, with their
quantity and the location each came off.

> **Use case.** A foreman asks what his team has already drawn against `WO-1234`.
> The clerk opens **History**, types `WO-1234`, and sees every issue under it —
> 10 screws, 2 m fabric, 4 foam blocks — without opening each product's card.

**Good to know:**
- You can't issue more than is on the chosen location — Golai refuses.
- Several products can go on one issue (one work order, many lines).
- A work order issued over several visits shows as several dated entries in
  History, each listing its own products.
- This is the *quick* path. For planned production draws that need a manager's
  sign-off, use **Release Requests** below.

---

## Release Requests → Issuance
**Who:** planner → manager → storekeeper · **The core production flow.**

The planner requests material against a sales-order reference; the manager
approves; the storekeeper picks it and hands it over.

> **Use case.** Amit needs material for SO-1234 (two sofas): 13 m fabric, 8 foam
> blocks, 2 wood frames. He raises the request naming the department and the
> receiving foreman. Suhel approves from his phone. Rajesh opens it — Golai
> shows him **which shelves hold each item and how much** — walks and scans each
> one, photographs the staged material, the foreman signs on screen, and
> **labels print for every item reading "FOR: SO-1234"**. Those labels go on the
> rolls and blocks, so six weeks later nobody asks whose foam this is.

**Good to know:** partial issues are fine — the request stays open showing what's
still outstanding. You can never issue more than was requested.

---

## Returns
**Who:** storekeeper (or foreman)

Material coming back from production, from a customer (RMA), or going back to a
supplier (RTV).

> **Use case.** Upholstery used 11 m of the 13 m issued. Rajesh scans the
> issuance label still stuck on the roll, Golai recognises the original issue,
> he enters 2 m with reason "surplus", photographs it, and scans the shelf it
> goes back to. Stock increases, and the sales order's history shows the return.

**Good to know:** you cannot return more than was issued and not yet returned —
Golai tracks the outstanding balance per product.

---

## Dispatch (DC)
**Who:** storekeeper → manager → security · **Three stages, mirrors Receiving.**

1. **Pick** — enter the SO reference and customer, scan items off their shelves,
   each picked line gets a **carton barcode**, photograph the packed cartons.
   Carton labels print for sealing.
2. **Approve** — the manager reviews and approves, or rejects with a reason
   (which puts the stock back on the shelves automatically).
3. **Gate-out** — security captures vehicle, driver, LR number, e-way bill and
   departure photos, then **scans every carton**. A carton from another DC is
   refused outright, and the gate-out won't complete until all cartons match.

> **Use case.** Two finished sofas leave for ESPL Mumbai. At the gate the guard
> scans three cartons but one belongs to a different order — Golai rejects it on
> the spot, before the truck leaves.

---

# Keeping stock accurate

## QC Hold
**Who:** storekeeper flags it, manager decides

Products marked **Hold for QC** during receiving sit in a quarantine state:
still physically on the shelf, but **not available to issue or dispatch**.

> **Use case.** A batch of adhesive looks off. It's marked Hold at verification.
> Suhel opens QC Hold, records his observations with photos, and either
> **releases** it back into normal stock or **rejects** it as scrap/return to
> vendor. Either way the decision, reason and photos are permanent.

---

## Stock Counts
**Who:** manager plans, storekeeper counts, manager approves

Periodic physical verification, in units only.

When a location is scanned, Golai lists **everything it believes is there** with
a tick against each one counted and a running "4 of 7 counted" badge. Products
without a barcode are counted by **tapping the row** — no scanning needed.

> **Use case.** Monthly count of Zone 1. Suhel creates a plan and assigns it to
> Rajesh, who gets an alert. Rajesh scans a ghoda and sees the seven products
> Golai expects on it. He works down the list entering what he actually sees;
> one product is missing entirely, so he enters **0**. Every difference needs a
> reason. He finishes, Suhel reviews the variances and approves — stock is
> corrected and each correction is written as an adjustment record.

**Good to know:** anything left uncounted **keeps its old figure** — so the
screen flags what you have not reached yet. If something is not there, enter
**0**; that is a real count, not a skip. Rejecting a count sends it back for a
recount; approving posts real adjustments, so the audit trail explains every
change.

---

# Reports and visibility

## Stock overview *(manager home)*
**Who:** manager, admin — it's the top of your home screen, not a menu item

The answer to "how much do we have?" at a glance: products in stock, products
**low** (at or below their reorder point), products with **nothing on the
shelf**, and **dead stock** — still holding material but untouched for 90 days.
Below that, how far the location mapping has got, and a live feed of the last
movements in the warehouse.

> **Use case.** Suhel opens Golai with his morning tea. Four products are below
> reorder point and eleven have not moved in three months. He taps the low-stock
> tile, sees exactly which, and forwards the list to purchasing before the
> factory notices.

**Total stock** (the tile below) is the way in to *where* it all sits: tap it to
see every zone that holds stock, tap a zone to see its shelves with the products
and quantities on each, and tap a product to open its **stock card**. Same
figures as the ERP "stock by shelf" export. A zone laid out as a **pallet area**
opens as a **Map** — the car-park grid with a stock count on each pallet; tap a
pallet to see what's on it (switch to **List** for the plain view).

---

## Alerts
**Who:** everyone (the bell, top right)

Golai raises alerts automatically: low stock and out of stock, a vehicle waiting
at the gate, a release request needing approval, an approved request ready to
fulfil, a dispatch awaiting approval or gate-out, and stock counts assigned or
awaiting review.

**Each alert goes only to the people who act on it** — the gate guard is told a
dispatch is ready to leave, not that thread is running low; the manager is asked
for approvals, not told to verify a delivery. Work assigned to one person (a
stock count) goes to that person alone.

| Alert | Who is told |
|---|---|
| Vehicle at the gate | Storekeeper, Manager, Admin |
| Request or dispatch awaiting approval · count to review | Manager, Admin |
| Approved request ready to fulfil | Storekeeper, Manager, Admin |
| Dispatch ready for gate-out | Security, Manager, Admin |
| Low stock / out of stock | Planner, Manager, Admin |
| Stock count assigned | The person it was assigned to |

> **Use case.** Suhel is at a meeting. The bell shows a release request pending;
> he opens it on his phone and approves — production isn't held up waiting for
> him to reach the office.

---

## SO Movement
**Who:** manager, admin

Type a sales-order number and see **everything** that touched it, in order:
receipts against that PO, release requests, issuances (with quantities),
returns, and the dispatch — each opening to its photos and signatures.

> **Use case.** A customer disputes a delivery. Suhel types SO-1234 and walks
> back through the entire journey with photographic evidence and timestamps.

---

## ERP Export
**Who:** manager, admin

Three CSV downloads, quantities only, never values:
- **Stock by shelf** — every item on every location with on-hand and hold qty.
- **Current stock** — one row per item *recorded in Golai* (placed somewhere),
  with its total and how many locations it sits on. Excludes the untouched master,
  so it's the "what's actually in the warehouse" file; an item located but not yet
  counted shows with a total of 0.
- **Item totals** — one row per item across the *whole* master (the full
  reconciliation file, including items with no stock).

> **Use case.** Month-end. The accountant needs stock figures to reconcile
> against Tally. Suhel downloads item totals and hands over the file. Golai never
> touches valuation — that stays in the ERP.

---

# Setup and administration

## Setup checklist *(admin home)*
**Who:** admin — appears automatically on a new company's home screen

Seven steps in the order that works: company name and logo → zones → locations →
print location labels → product list → staff logins → record where products sit.
Each ticks itself off when the work is actually done, and the next step is
highlighted.

> **Use case.** A new admin logs in on day one and doesn't have to remember any
> of it. They follow the highlighted step, and when the seventh is done the
> whole panel **disappears** — a running warehouse shouldn't be nagged by a
> setup guide.

---

## Sample data *(admin home)*
**Who:** admin — shown only while the warehouse is empty

**Load sample data** fills Golai with a small demo warehouse: three zones, six
locations, seven products, stock, a completed delivery and an issuance. Every
screen has something in it, so you can try the app before entering anything
real. **Remove sample data** takes it all out again.

> **Use case.** A new admin wants to see what Receiving looks like before their
> first truck arrives. They load the samples, walk through Find, the stock card
> and a stock count, then remove it and start with their own zones.

**Good to know:** it refuses to load if you already have products, so it can
never mix into real stock — and removing it only deletes rows it created.

---

## Zones & Locations
**Who:** admin (manager can view/edit)

Zones are the areas of the warehouse; **locations** are the spots inside them —
shelves, ghodas, racks, whatever your team calls them. Golai builds codes like
`Z03-G001` from the name you type and prints the barcode stickers.

> **Use case.** A new rack arrives for Zone 4. The admin adds locations named
> "Rack" numbered 1–10, prints the labels on the thermal printer, and someone
> sticks them on. They're immediately scannable.

**Pallet areas (car-park layout).** Some stock — long wood on pallets — overhangs
the pallet, so a barcode can't be stuck where anyone could scan it. For these,
**Add locations → Pallet area** lays out **blocks** of pallets, like a car park:
add a **block**, set its **rows × columns**, and add more blocks — Golai draws the
**roads (aisles)** between them automatically. Each pallet is addressed by
coordinate **Block B · Row 2 · Col 3**, with a live map preview. No stickers to
scan: the floor finds a pallet by its coordinate on the map.

> **Use case.** A wood store has three blocks of pallets separated by roads — two
> outer blocks 5×2 and a middle block 5×3. The admin opens Pallet area, adds the
> three blocks with their rows and columns, sees the car-park preview with the
> roads between them, and creates the pallets. Wood searched by name now reads
> "Zone 5 · Block B · Row 3 · Col 2", and the storekeeper walks straight to it.

**Good to know:** many zones at once can be imported from a CSV (a template is
provided), and any zone can be renamed later.

---

## Items
**Who:** admin (manager can view/edit)

The product master, plus **product barcode labels**.

- Import your list from CSV — **existing codes are kept exactly as they are**;
  products with no code get an automatic `ITM-` code, flagged "auto" so you can
  replace it with a real one later.
- **Type** groups products broadly (Thread, Foam, Fabric) and is searchable.
- **Unit** — every product has one: pieces, packet, roll, sheet, metre, yard,
  litre, kg, gram, sq.ft, sq.mt, inch, feet and more. Set it from the dropdown
  when adding a product, change it inline in the list, or pick it right on the
  quantity screen (below). Imported units like "Metre" or "KG" are matched
  automatically.
- Select products → **Print labels** → pick the label size and copies per item.

> **Use case.** One shelf holds five kinds of screws. The admin selects those
> five, prints one label each at 50 × 25 mm, and the storekeeper sticks them on
> the bins. Now the floor can tell them apart and scan the right one.

**Good to know:** the same print dialog also sits on the **Receiving** screen, so
day to day the storekeeper labels goods as they arrive rather than the admin
doing a batch afterwards. Either works — use whichever suits your team.

---

## Costing *(paid add-on)*
**Who:** manager, admin · *Only appears if your company has this module.*

What a product costs to make, and what it should sell for. Replaces the costing
spreadsheet.

A **costing sheet** is one product: its components grouped into categories
(wood, plywood, foam, fabric, labour, packing…), each with its own quantities
and rates. The cost builds up as you type — category totals, each one's share of
the whole, then GST and your overhead + margin, and the final price.

**Rate tables** are the point of it. A price lives **once**: change foam, and
every draft sheet reprices. No more editing twenty cells and missing three.

> **Use case.** A new chair. The costing manager creates a sheet, works down the
> categories entering timber sizes, foam pieces and fabric metres, and watches
> the total build. Wood turns out to be 28 % of the cost. Two months later the
> fabric supplier raises prices — one edit in Rate tables, and every draft sheet
> shows the new cost. The chair they quoted in March still shows March's number,
> because finalising froze it.

**Good to know:**
- **Finalising locks the sheet** and freezes both the numbers and the rates
  behind them, so a quotation cannot silently re-price itself later.
- **Clone** starts a new product from an existing one — it copies the structure
  and re-reads today's rates, so nothing stale is carried over.
- A line can be **linked to a real product** from your item list, which is what
  lets Golai answer "which products use this fabric?".
- If a rate is missing or a quantity is blank, the line **says so** instead of
  quietly costing nothing.
- Costing **never values your stock and never posts to accounts** — that stays
  with your ERP. It works out what something costs; it does not do your books.

---

## Suppliers, Customers & Departments
**Who:** admin

Simple contact lists used by the other modules: suppliers appear at gate entry,
customers on dispatches, departments on release requests. **Names and contacts
only — no payments, credit or pricing.** That's ERP territory.

---

## Users & Roles
**Who:** admin only

Create staff logins, set roles, control access.

- Staff log in with an **email or a mobile number** — useful for floor staff
  with no email.
- You set a password (or Golai generates one) and hand it over; **Reset
  password** issues a new one any time.
- **Deactivate** when someone leaves — their login stops but their history
  stays. **Delete** is only for accounts created by mistake.
- **Access** lets you tick or untick individual modules per person, on top of
  their role.
- **ID card** sets someone's **employee ID** and **position** (job title). Staff
  can add their own photo and employee number, but **only an admin can set the
  position** — nobody can give themselves a title.
- **Custom roles** — beyond the five built-in roles, the admin can define a role
  with any name (e.g. *Issuance Clerk*) and tick which sections it may use.
  Assigning it to a person restricts them to exactly those sections and shows the
  role name as their title. Handy for a login that should only do one job.

> **Use case.** A new storekeeper joins but shouldn't handle dispatches yet. The
> admin creates him as a storekeeper, opens **Access**, and unticks Dispatch —
> it disappears from his menu entirely.

**The five roles:** Security (gate only, no stock), Storekeeper (the floor),
Planner (requests material), Manager (approvals and reports), Admin (everything
plus setup).

---

## Company Profile
**Who:** admin

Your company name, **logo**, GST number and contact details. The name and logo
appear top-right for everyone in your company.

---

## Settings
**Who:** admin

The few company-wide rules that change how the floor behaves:

- **Undo window** — how long someone can undo their own capture before it can
  only be fixed with an Adjust. Default 24 hours.
- **Working hours** — your normal shift, so activity outside it can be told
  apart in the audit trail.
- **Photo retention** — how long gate, damage and handover photographs are kept.
  Two years covers most disputes.

> **Use case.** A warehouse running two shifts finds 24 hours too generous —
> yesterday's mistakes should not be quietly undone today. The admin sets the
> window to 6 hours. Anything older now needs a reason and a manager.

---

## My Account
**Who:** everyone · Click your name at the bottom of the menu.

Your ID card — photo, employee ID, position, role and contact details — plus
shortcuts to every section you can open, and your password.

You can set **your own photo and employee ID**. Your **position and role are
assigned by your admin** and cannot be changed here, exactly as they can't be on
a printed ID card.

> **Use case.** A new storekeeper adds his photo and types his employee number
> so the sidebar shows his face rather than initials. He also glances at "What
> you can use" and sees Dispatch isn't there — so he asks the admin instead of
> assuming the app is broken.

---

## Platform Console *(DBBS only)*
**Who:** DBBS platform admins — not visible to customers

Every client company on one screen: users, products, locations, setup progress
and when they were last active. From here DBBS can **onboard a new client**
(company and its first admin created together), **grant or revoke modules** for
a company, and **suspend or reactivate** an account.

> **Two layers of access.** DBBS decides what a *company* has; that company's own
> admin then decides who *inside* it may open each part. Both must pass — so
> turning a module off for a company removes it for all of their people, whatever
> their personal settings say. A client cannot grant themselves a module.

---

*Prepared by DBBS Group · Golai v1.0*

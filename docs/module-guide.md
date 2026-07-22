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
| "What's on this shelf?" | **Find** (scan the location sticker) |
| A truck has arrived at the gate | **Receiving** (Gate Entry) |
| Delivery needs checking against the invoice | **Receiving** (Verify) |
| Goods need to go onto a shelf | **Receiving** (Putaway) |
| Recording what already sits on a shelf (first-time setup) | **Assign Location** |
| Found stock nobody had recorded | **Capture** |
| Moving stock from one shelf to another | **Transfer** |
| Just scanned the wrong shelf | **Undo** on the confirmation — for a short window |
| The count is wrong and needs correcting | **Adjust** |
| Production needs material | **Release Requests** |
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
document, and **what was left after each move**.

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
name. That's what makes it possible before any product labels are printed.

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
by accident.

**Made a mistake?** The confirmation carries an **Undo this** button with the
time remaining. Scanning the wrong shelf is the commonest slip on the floor, and
inside the window you can put it right yourself. Once the window closes — your
admin sets how long in Settings — the only correction is an **Adjust**, with a
reason and a manager approval. You cannot undo someone else's entry, or one
whose stock has already been issued.

---

## Transfer
**Who:** storekeeper

Moves stock between locations: scan the source, scan the product, enter the
quantity, scan the destination.

> **Use case.** Zone 2 is overflowing, so 8 rolls of fabric move to a spare ghoda
> in Zone 3. Both shelves update instantly, and anyone searching that fabric now
> sees the new spot.

**Good to know:** you cannot move more than is actually on the source shelf —
Golai refuses. Typing a location instead of scanning it is allowed but recorded
in the audit log.

---

## Adjust
**Who:** storekeeper raises it, manager approves

Corrects a wrong quantity. Scan the location and product, enter the correct
number, choose a mandatory reason (miscount, damage, theft, system error…).

> **Use case.** The system says 50 foam blocks; there are 47. Rajesh submits the
> correction with reason "miscount". Suhel sees it in his approvals, taps
> approve, and the stock is corrected — with a permanent record of who changed
> what and why.

**Good to know:** a manager or admin making the correction themselves applies it
immediately. Nothing is ever changed silently.

---

# Material coming in

## Receiving (GRN)
**Who:** security guard → storekeeper · **Three stages, one document.**

1. **Gate Entry** (security) — vehicle number and photos, driver name/phone/
   licence and photos, supplier, PO reference, material type, cartons, and at
   least one **document photo** (invoice / e-way bill / LR). Creates
   `GRN/2026-07/0001` and alerts the storekeeper.
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

---

## Alerts
**Who:** everyone (the bell, top right)

Golai raises alerts automatically: low stock and out of stock, a vehicle waiting
at the gate, a release request needing approval, an approved request ready to
fulfil, a dispatch awaiting approval or gate-out, and stock counts assigned or
awaiting review.

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

Two CSV downloads — **stock by location** and **item totals**. Quantities only,
never values.

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

## Zones & Locations
**Who:** admin (manager can view/edit)

Zones are the areas of the warehouse; **locations** are the spots inside them —
shelves, ghodas, racks, whatever your team calls them. Golai builds codes like
`Z03-G001` from the name you type and prints the barcode stickers.

> **Use case.** A new rack arrives for Zone 4. The admin adds locations named
> "Rack" numbered 1–10, prints the labels on the thermal printer, and someone
> sticks them on. They're immediately scannable.

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
- Select products → **Print labels** → pick the label size and copies per item.

> **Use case.** One shelf holds five kinds of screws. The admin selects those
> five, prints one label each at 50 × 25 mm, and the storekeeper sticks them on
> the bins. Now the floor can tell them apart and scan the right one.

**Good to know:** the same print dialog also sits on the **Receiving** screen, so
day to day the storekeeper labels goods as they arrive rather than the admin
doing a batch afterwards. Either works — use whichever suits your team.

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

## Provision Client *(DBBS only)*
**Who:** DBBS platform admins — not visible to customers

Creates a new customer company together with its first admin account, in one
step. Each company's data is completely isolated from every other.

---

*Prepared by DBBS Group · Golai v1.0*

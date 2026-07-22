# Golai — Life of a Product

*Following one piece of wood from the gate to a finished sofa.*

This guide follows a single product — **Wood 50×20 (Sheesham batten)** — through
every stage of its life at U&M Designs, so you can see exactly what happens in
Golai, who does it, and what gets recorded. Every number, code and screen below
is what you'll actually see.

**The cast**

| Person | Role | Their part |
|---|---|---|
| Suresh | Security | The gate — what comes in, what goes out |
| Rajesh | Storekeeper | The store — receiving, putaway, issuing, dispatch |
| Amit | Production Planner | Asks the store for material |
| Suhel | Manager | Approves, reviews, reports |
| Nishad | Admin | Setup, masters, staff |

**Our product**

| | |
|---|---|
| Name | Wood 50×20 Sheesham Batten |
| Code | `UM-000221` *(U&M's own code, kept exactly as it is)* |
| Type | Wood · Unit: pcs |
| Lives in | Zone 4 — Wood |

---

## Before it ever arrives — one-time setup

Two things must exist first (done once, not per delivery):

1. **The location has a barcode.** Nishad added locations to Zone 4 — he typed
   "Rack", Golai made codes `Z04-R001 … Z04-R010`, printed the stickers, and
   someone stuck them on the racks.
2. **The product exists in the master.** It came in with the item list import,
   keeping U&M's code `UM-000221`.

*Purchasing itself happens in your ERP.* Golai never raises the PO — it only
carries `PO-0089` as a written reference.

---

## Day 1 — The truck reaches the gate
### Security · Receiving → New Gate Entry

A truck arrives with 100 battens. **Suresh** doesn't touch stock — he records
who and what turned up:

- Vehicle number + photos of the vehicle
- Driver's name, phone, licence number + photos
- Supplier (picked from the list), transporter
- **PO-0089** typed as a reference
- Material type "Wood", 5 cartons declared
- **Photos of the invoice / e-way bill** — Golai refuses to submit without at
  least one document photo

Golai creates **`GRN/2026-07/0014`**, status *At gate*, and **alerts Rajesh**.

> Nothing has entered stock yet. Balance: **0**

---

## Day 1 — Checking the delivery
### Storekeeper · Receiving → open the GRN → Verify

Rajesh opens the cartons and counts. For each product he scans it (or searches
by name) and fills three columns:

| PO qty | Invoice qty | Received qty |
|---|---|---|
| 100 | 100 | **98** |

Two battens are cracked. Because received ≠ invoice, **Golai demands a reason**
— he types *"2 cracked in transit — supplier informed"* and photographs the
damage. He marks the line **OK** (had he marked it *Hold for QC*, it would have
gone to quarantine instead — see "What if" below).

Status becomes *Awaiting putaway*.

> Still not in stock — verified, but not yet on a shelf. Balance: **0**

---

## Day 1 — Onto the rack
### Storekeeper · Receiving → Putaway

Rajesh carries the wood to Zone 4, **scans the rack sticker `Z04-R003`**,
confirms 98 pcs, and submits. The GRN closes automatically.

> **Stock: 98 pcs at Z04-R003.** From this moment anyone can find it.

---

## Day 1 — Giving the product its own barcode
### Storekeeper · Receiving → Print item labels

Zone 4 holds several timber sizes that look alike, so before the wood leaves his
bench Rajesh presses **Print item labels** on the GRN. It offers **one label per
unit received** — 98 stickers, each carrying the name, code `UM-000221`, a
barcode and a QR code.

> Now a worker can scan the *product*, not just the rack. (The same print
> dialog also lives in Admin → Items if the office prefers to batch it.)

---

## Day 2–7 — Sitting in stock

Nothing happens to the wood, but it is **visible**:

- **Find** → type "wood 50" → *Wood (Z04) · Rack 3 — 98 pcs*
- **Find** → scan `Z04-R003` → lists every timber on that rack with quantities,
  so nobody grabs the wrong size
- **Click the name** → the **stock card**: everything that has ever happened to
  this wood, with the balance after each move
- Suhel's home shows it in **Stock right now**; if it drops below its reorder
  point it appears under **low stock**, and if it sits untouched for 90 days it
  turns up as **dead stock**

**If it moves:** Rajesh uses **Transfer** — scan source rack, scan the wood,
quantity, scan the new rack. The location updates everywhere instantly.

**If the count is wrong:** **Adjust** — enter the true count with a reason
(miscount / damage / theft). Suhel approves it, and the correction is recorded
permanently.

---

## Day 8 — Production asks for it
### Planner · Release Requests → New Request

**Amit** is building 2 Aara sofas for **SO-1234** (ESPL Mumbai). He raises a
request:

- SO reference **SO-1234**, customer note *ESPL Mumbai*
- Department **Carpentry**, receiving foreman **Mukesh Yadav**
- Line: Wood 50×20 — **12 pcs**

Golai creates **`RR-2026-07-0031`**, status *Awaiting approval*, and alerts
Suhel.

> Stock unchanged: **98**. A request is not a movement.

---

## Day 8 — Manager approves
### Manager · Release Requests

Suhel opens it on his phone, sees what's being asked and for which order, and
approves. Rajesh is alerted.

---

## Day 8 — Handing it over
### Storekeeper · Release Requests → Fulfil

Golai tells Rajesh **where the wood is and how much is there** — *Z04-R003, 98
pcs*. He:

1. Walks to the rack, **scans `Z04-R003`**, picks 12
2. Photographs the staged material
3. Has **Mukesh sign on screen**
4. Submits

Golai creates **`ISS-2026-07-0058`**, decrements the rack, and **prints a label
for the bundle**:

```
        Wood 50×20 Sheesham Batten
        12 pcs
        FOR: SO-1234
        ESPL Mumbai · Carpentry
        Foreman: Mukesh Yadav · 29-Jul-2026
        ▌▌║▌▌▌║▌▌▌  ISS-2026-07-0058
```

That label goes on the bundle before it leaves the store.

> **Stock: 86 pcs at Z04-R003.** 12 pcs are now with Carpentry, tagged to
> SO-1234.

---

## Day 10 — Surplus comes back
### Storekeeper · Returns

Carpentry used 10 and has 2 left over. Rajesh **scans the issuance label still
stuck on the bundle** — Golai recognises `ISS-2026-07-0058` and shows what's
still outstanding. He enters 2 pcs, reason **surplus**, photographs it, and
scans `Z04-R003` to put it back.

Golai creates **`RET-2026-07-0012`**.

> **Stock: 88 pcs.** 10 pcs were genuinely consumed by production.

---

## Day 10 — The end of this product's life

**Those 10 battens are now inside a sofa.** In Golai they are consumed — issued
to Carpentry against SO-1234 and never returned. Their story ends there, and
it's fully traceable.

> **Important boundary.** Golai tracks material *leaving the store*; it does not
> model assembly. There is no bill of materials, so Golai never says "10 battens
> became 2 sofas" — it says "10 battens went to Carpentry for SO-1234". The
> finished sofa is recorded as its own product. That's deliberate: production
> costing and BOM belong to your ERP.

---

## Day 15 — The sofa goes out
### Storekeeper → Manager → Security · Dispatch

The 2 finished sofas are recorded into **Zone 13 (Finished Goods)** using
**Capture**, then dispatched:

1. **Pick** — Rajesh enters SO-1234 and ESPL Mumbai, scans the sofas off their
   location, seals the cartons; Golai assigns **carton barcodes** and prints
   carton labels. He photographs the packed cartons. → `DC/2026-07/0041`
2. **Approve** — Suhel reviews and approves. *(A rejection would put the stock
   straight back on the shelf.)*
3. **Gate-out** — Suresh captures vehicle, driver, LR number, e-way bill and
   departure photos, then **scans each carton**. A carton belonging to another
   order is refused on the spot. Status: **Dispatched.**

---

## Day 40 — The customer disputes the order
### Manager · SO Movement

Suhel types **SO-1234** and sees the entire journey in one timeline:

| When | What | Reference | Detail |
|---|---|---|---|
| 22 Jul | GRN (PO ref) | GRN/2026-07/0014 | Received, 2 short with reason + photos |
| 29 Jul | Release Request | RR-2026-07-0031 | Carpentry · approved by Suhel |
| 29 Jul | Issuance | ISS-2026-07-0058 | 12 pcs Wood 50×20 · signed by Mukesh |
| 31 Jul | Return | RET-2026-07-0012 | 2 pcs surplus |
| 05 Aug | Dispatch | DC/2026-07/0041 | 2 cartons · gate-out with photos |

Every entry opens to its photos, signatures and timestamps. **Nobody can edit
this history** — not even the admin.

The same journey read the other way — **by product instead of by order** — is the
**stock card**: open Wood 50×20 from Find and the ledger below shows every one of
these movements with the running balance, so "we bought 100, where did they go?"
is a ten-second answer.

---

## The ledger at a glance

*This is exactly what the **stock card** shows on screen — open Wood 50×20 from
Find and it is all there, newest first.*

| Day | Event | Change | Balance at Z04-R003 |
|---|---|---|---|
| — | Nothing recorded | — | 0 |
| 1 | Putaway from GRN/2026-07/0014 | **+98** | 98 |
| 8 | Issued to Carpentry (ISS-…0058, SO-1234) | **−12** | 86 |
| 10 | Surplus returned (RET-…0012) | **+2** | 88 |
| 20 | Stock count found 87 — approved adjustment | **−1** | 87 |

---

## What if it doesn't go smoothly?

| Situation | What happens |
|---|---|
| **Delivery is short or damaged** | Verification demands a written reason and damage photos before it can be submitted |
| **Quality is doubtful** | Mark the line **Hold for QC** at verification — the stock sits in quarantine and **cannot be issued or dispatched** until Suhel inspects and releases or rejects it |
| **Wrong rack scanned when picking** | Golai refuses — it only allows picking from a location that actually holds that product |
| **Someone tries to issue more than requested** | Refused. The request stays open showing what's still outstanding |
| **Physical count doesn't match** | **Stock Count** (planned) or **Adjust** (one-off) — both need a reason and manager approval, and both leave an audit record |
| **Wrong carton at the gate** | Scanning refuses it, and gate-out won't complete until every carton matches the DC |
| **Wi-Fi drops in the warehouse** | Receiving at the gate, Capture and Transfer keep working offline and sync automatically when the connection returns |

---

## What Golai gave U&M in this one story

- **Where it is** — at any moment, anyone could find the wood in seconds
- **What came in** — 98 received against 100 invoiced, with the reason and photos
- **What went out, when and why** — 12 pcs to Carpentry for SO-1234, signed for
- **What came back** — 2 pcs surplus, against the original issue
- **What's left** — a live balance, corrected only through approved adjustments
- **The whole story on one screen** — the stock card, for any product, in seconds
- **Proof** — photos, signatures and timestamps that cannot be altered

*Prepared by DBBS Group for U&M Designs Pvt Ltd · Golai v1.0*

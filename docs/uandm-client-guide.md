# Golai — Getting Started Guide for U&M Designs

*Golai runs the floor. Your ERP runs the books.*

Welcome! This guide walks you through setting up and running Golai at your
warehouse (Store Tanawada, Jodhpur) — on your own, step by step. No technical
knowledge needed.

---

## 1. Logging in

| | |
|---|---|
| **Web address** | `golaiv1.netlify.app` *(DBBS will fill this in)* |
| **Admin user ID** | `merchant@uandm.co.in` *(user ID = email or mobile number)* |
| **Password** | dn6#iVCS@azp+EN *(provided separately by DBBS)* |

Open the address in any browser — computer or phone. On a phone, your browser
will offer **"Add to Home Screen"**: accept it, and Golai installs like an app
with its own icon. It even keeps working when the warehouse Wi-Fi drops
(everything syncs automatically when the connection returns).

> **Change your password after first login.** Click your name at the bottom of
> the menu (or **My account** in the phone menu) → **Change password**. Every
> user can do this for themselves — staff should do it as soon as they receive
> their temporary password.

Your 13 warehouse zones are **already set up** from your Zone Master sheet
(Z01 Main Store Hardware … Z13 Sample Hold + Finished Goods). You can rename
them or add more anytime — see section 3.

---

## 2. Create logins for your team (5 minutes)

You (the Admin) create every staff login yourself — no need to contact DBBS.

1. Log in → home screen → **Users & Roles** → **New User**
2. Enter their name, their **email or mobile number** (either works — staff
   without email can use their 10-digit mobile to log in), and pick a **role**:

| Role | Who it's for | What they can do |
|---|---|---|
| **Security** | Gate guard | Vehicle gate entries, dispatch gate-out. Cannot see stock. |
| **Storekeeper** | Store in-charge | Scanning, receiving, issuing, returns, dispatch picking |
| **Planner** | Production head | Request material against sales orders |
| **Manager** | Owner / ops head | Approvals, reports, full visibility |
| **Admin** | You / your IT person | Everything + settings, users, masters |

3. Click **Create & send invite** → Golai shows a **temporary password** on
   screen. Write it down and hand it to that person — they log in with it.
4. If someone leaves: **Deactivate** (their login stops working, their history
   stays). Use **Delete** only for accounts created by mistake.

---

## 3. Zones and storage places (one-time setup, ~an hour)

Your zones exist already. Now tell Golai what's *inside* each zone — the
shelves, ghodas, racks — in **your own words**.

1. **Zones & Shelves** → tap a zone (e.g. `Z03 Foam`) to expand it
2. **Add storage places** → type what you call it: `Ghoda`, `Shelf`, `Rack` —
   anything. Set the numbers (e.g. from 1 to 6) → **Add**
3. Golai creates codes like `Z03-G001 … Z03-G006` (you'll see a preview first)
4. Press **Labels** → a PDF downloads with one sticker per place, showing:
   your company name, the code, a barcode + QR, and "Ghoda 1 — Foam (Zone 3)"
5. Print on A4 sticker paper, stick each label on its ghoda/shelf/rack

To rename a zone or change its notes, use the **pencil icon** next to it.
To add more zones later: **New Zone**, or **Import zones CSV** for many at once
(**CSV template** button gives you the exact sheet to fill).

> **Important:** the sticker's code is what scanners read. Stick each label on
> the right place — the label says which zone and place it belongs to.

---

## 4. Bring in your item list (one-time, ~30 minutes)

1. **Items** → **CSV template** → a file downloads with example rows
2. Fill it in Excel — one row per item:
   - **Item Code** — your existing code, if the item has one. *It will be kept
     exactly as you wrote it.* Leave blank if the item has no code — Golai
     assigns one automatically (ITM-00001, ITM-00002…)
   - **Barcode** — only if the item already has a printed barcode on it
   - **Item Name** — required
   - **Category / Sub Category / UOM** — UOM is the unit you count in
     (pcs, m, kg, set…)
3. Save as CSV → **Items → Import CSV** → pick the file
4. Golai shows a preview ("X items, Y keeping your codes, Z getting new
   codes") → confirm

**Then print item labels:** tick the items (or Select all) → **Print labels**
→ choose A4 stickers or thermal printer, and **copies per item** = number of
physical pieces (12 rolls = 12 copies). Stick one label on every roll / box /
piece that doesn't already have a barcode.

---

## 5. Put your stock into Golai (the scan-walk)

This is how Golai learns where everything is. A storekeeper walks the floor
with a phone (or USB scanner + laptop):

1. **Capture** → scan the **place label** (the sticker from section 3)
2. Scan an **item** on that place → Golai recognizes it → type the quantity
3. Repeat for every item on that place, then scan the next place

That's it. Each scan records "this much of this item sits here." If you scan a
barcode Golai doesn't know, it offers to create the item on the spot.

**The payoff:** from any screen, type an item's name in the search bar —
Golai shows exactly which zone and which ghoda/shelf it's on, and how much.
Anyone can find anything in five seconds.

---

## 6. Daily operations (after setup)

- **Material arrives** → Security does **New Gate Entry** at the gate (photos
  of vehicle, driver, invoice) → Storekeeper **verifies** quantities against
  the invoice → **puts away** to a place by scan. Stock updates instantly.
- **Production needs material** → Planner makes a **Release Request** with the
  sales order number → Manager **approves** from their phone → Storekeeper
  issues it by scan; the foreman signs on screen; **labels print showing which
  SO the material is FOR**.
- **Unused material comes back** → **Returns** → scan the issuance label →
  enter quantity → scan the place it goes back to.
- **Goods go out** → Storekeeper picks and seals cartons (labels print) →
  Manager approves → Security scans every carton at the gate. A wrong carton
  is refused automatically.
- **Stock checking** → Manager creates a **Stock Count**, storekeeper counts by
  scan, differences need a reason and Manager approval.
- **For your accountant / Tally** → Manager → **ERP Export** → download the
  quantity CSV anytime.

Every action is recorded — who, when, where, with photos — in a log nobody
can edit. If there's ever a dispute, **SO-wise Movement** shows a sales
order's entire journey with all the evidence.

---

## 7. If something goes wrong

| Problem | What to do |
|---|---|
| Want to change your password | Click your name at the bottom of the menu → **My Account** → Change password |
| Forgot password | Ask your Admin to delete and re-create the login (they get a fresh temporary password), or contact DBBS |
| Scanner won't read a label | Type the code by hand using the keyboard button next to the scan box, or use the QR square with a phone camera |
| "Offline" banner showing | Keep working — everything saves on the device and syncs when internet returns |
| Wrong quantity somewhere | **Adjust Quantity** with a reason — Manager approves it |
| Screen looks outdated / odd | Refresh the page (pull down on phone, Ctrl+Shift+R on computer) |
| Anything else | Contact DBBS: ____________________ *(support contact)* |

---

*Prepared by DBBS Group for U&M Designs Pvt Ltd · Golai v1.0*

# Aksure v1.0 — Build Design

Date: 2026-07-07 · Source: `Aksure v1.0 Developer Brief` PRD (DBBS Group) plus owner clarifications.

## Product in one paragraph

Aksure is a mobile-first operational control system for manufacturing warehouses: it captures, labels, scans, photographs, and audits every physical material movement. It never shows money — quantities only. SO/PO numbers are free-text tags, never foreign keys. The ERP keeps the books; Aksure keeps the floor.

## Owner clarifications (override/emphasize PRD)

1. **One-stop solution for warehouse people** — the daily driver for everyone on the floor, not a companion app.
2. **Zones and shelves are created from client input**, and the app generates printable barcode labels for every shelf.
3. **Scan-first item onboarding**: every item enters stock by being scanned at a shelf. If the scanned barcode matches a known item code/barcode, use it; if unknown, the app auto-assigns a code (`ITM-NNNNN` via the `sequences` table) and creates the item in the master on the spot. The `items` table therefore has both `code` (canonical) and `barcode` (physical label if different).
4. **The killer feature is the item locator**: type an item name/code/barcode anywhere → see exact zone + shelf + quantity. Implemented as `ItemLocator` component on every role's home screen, querying `items → stock_balances → shelves → zones`.

## Architecture

- **Frontend**: React 18 + TypeScript 5.6 + Vite 5 + Tailwind 3 (PRD-locked stack, confirmed on disk). Zustand (local state), TanStack Query v5 (server state), React Hook Form + Zod, lucide-react, Recharts, jsPDF + jsbarcode (labels), html5-qrcode (web scanning). Capacitor added in Phase 7 for iOS/Android.
- **Backend**: Supabase only — Postgres + Auth + Storage + Realtime + RLS. No custom server. Edge Functions later for label PDFs / ERP CSV export if client-side generation proves insufficient.
- **Tenant isolation**: every table carries `tenant_id`; RLS policies filter through `current_tenant_id()` (security-definer function reading `profiles`). Roles enforced in RLS per the PRD 3.1 permission matrix (coarse) + app logic (fine).
- **Invariants encoded in the DB**: `stock_balances` is the single source of truth, mutated only via `move_stock()` (atomic, rejects negative stock); `next_sequence()` allocates document numbers under row lock; `activity_log` has a trigger rejecting UPDATE/DELETE (append-only even for Admin).

## Phase plan

| Phase | Scope | Status |
|---|---|---|
| 1 | Foundation: scaffold, full schema + RLS, auth, role-segregated home shells, masters CRUD (zones/shelves/items/suppliers/customers/departments/users), CSV item import, audit plumbing | **In progress** — scaffold/schema/auth/homes done; masters CRUD next |
| 2 | Stock core: Capture (scan-first, auto item codes), Internal Transfers, Adjustments, edit lock, **item locator live**, shelf label PDF generation, USB + camera scanning | Pending |
| 3 | GRN 3-stage receiving (gate → verify → putaway) with photos | Pending |
| 4 | Release Requests → manager approval → Issuance (e-signature, SO labels) → Returns | Pending |
| 5 | Dispatch 3-stage + QC Hold/Quarantine | Pending |
| 6 | Cycle counts, alerts, scheduler, SO-wise movement report, ERP CSV export, cross-module search | Pending |
| 7 | Offline queue + sync (5 critical screens), Capacitor iOS/Android builds, FCM push | Pending |

Each phase ends deployable. Phases 1–5 deliver the PRD's three flagship end-to-end workflows.

## Data model

Authoritative DDL lives in `supabase/migrations/0001–0004`. Deviations from PRD §5, all deliberate:

- `users` table → `profiles` (1:1 with Supabase `auth.users`; Supabase owns credentials/sessions, so PRD's `sessions`/`password_hash` are not replicated).
- `items.barcode` added (scan-first onboarding); `items.uom` added (qty units: pcs/m/kg/set).
- `grns.supplier_name_freetext` added (PRD: "dropdown from master + free text fallback").
- `transfers.manual_entry` flag added (password-gated typed entry is audit-visible).
- `tenant_settings` table added for edit-lock window, thresholds, working hours.

## Key decisions log

- **Stack versions**: PRD-locked React 18 / Vite 5 / TS 5.6 / Tailwind 3 (what's installed and building).
- **Auth**: email+password to start; phone OTP can be enabled in Supabase later without code restructuring.
- **Roles**: single `role` enum on profile (five roles, PRD hard rule: no new roles).
- **Manager unlock password** (edit lock, manual entry): stored in `tenant_settings.settings`, checked app-side, every use audit-logged. Default set during tenant onboarding, changeable in Settings.

## Testing & acceptance

- Type-safe build (`npm run build`) green at every commit.
- Per-phase: manual walkthrough of that phase's workflow + RLS cross-tenant denial check.
- Final: PRD §10 acceptance (3 flagship workflows end-to-end, offline on 5 screens, append-only verified by attempted UPDATE).

# Golai

**Operational control system for manufacturing warehouses.**
Golai runs the floor. Your ERP runs the books.

Scan-first stock control: zones and storage places (shelves, ghodas, racks — whatever the client calls them) get barcode labels, every item enters the system through the scanner (pre-assigned codes recognized verbatim, unknown items auto-coded), and anyone can type an item's name to find the exact zone and place it sits on. Staff log in with **email or mobile number**.

## Stack

React 18 · TypeScript · Vite · Tailwind CSS · Zustand · TanStack Query · Supabase (Postgres, Auth, Storage, Realtime, RLS, Edge Functions)

## Getting started

1. **Install dependencies**

   ```sh
   npm install
   ```

2. **Create a Supabase project** at [supabase.com](https://supabase.com) (free tier is fine).

3. **Apply the database migrations** — in the Supabase dashboard open *SQL Editor* and run the files in `supabase/migrations/` **in order (0001 → 0024)**, or use the Supabase CLI:

   ```sh
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push
   ```

4. **Configure environment** — copy `.env.example` to `.env` and fill in your project URL and anon key (dashboard → Project Settings → API).

5. **Deploy the Edge Functions** — these power in-app client onboarding and user management (no Supabase dashboard needed):

   ```sh
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase functions deploy create-user      # admins create staff logins
   npx supabase functions deploy delete-user      # admins remove staff
   npx supabase functions deploy reset-password   # admins reset staff passwords
   npx supabase functions deploy provision-tenant # platform admins create client companies
   ```

6. **Enable phone logins** — dashboard → Authentication → Sign In / Providers → **Phone → Enable**. The form requires Twilio credentials to save; fill them with placeholders, because Golai never sends SMS (logins are phone + password, accounts are created pre-confirmed with an admin-issued temporary password):

   - Account SID: `AC00000000000000000000000000000000`
   - Auth Token: `0000000000000000000000000000000000`
   - Message Service SID: `MG00000000000000000000000000000000`
   - Keep **"Enable phone confirmations" OFF** (turning it on would make Supabase try to send real SMS at sign-in and logins would fail).
   - Real Twilio/MSG91 credentials only become necessary if you later add OTP-by-SMS login.

7. **Create the first tenant + admin** — in the SQL Editor:

   ```sql
   insert into tenants (name) values ('Your Company Pvt Ltd') returning id;
   -- Create a user in Authentication → Users (Auto Confirm), then:
   insert into profiles (id, tenant_id, email, full_name, role)
   values ('<auth-user-uuid>', '<tenant-uuid>', 'admin@example.com', 'Admin', 'admin');
   ```

   Mark this first user as a **platform admin** so they can create client companies from inside the app:

   ```sql
   update profiles set is_platform_admin = true where email = 'admin@example.com';
   ```

   **Onboarding real clients:** log in as the platform admin → **Provision Client** → enter the company + admin details → Golai creates the company and its admin login together (atomically). The client's admin then sets their **Company Profile** (name + logo, shown across the app) and creates all their own staff (Users & Roles → New User, email or mobile). The older `supabase/seeds/uandm_tenant.sql` is kept only as a reference for the first tenant.

8. **Run**

   ```sh
   npm run dev
   ```

## Deploy (web)

Connect the repo to Netlify — `netlify.toml` in the repo sets the build command, publish directory, and the SPA fallback redirect (so deep links like `/grn/123` survive refresh). Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables in Netlify, and set the Netlify URL as the **Site URL** under Supabase → Authentication → URL Configuration. Every push to `main` auto-deploys. The app is an installable PWA (Add to Home Screen on phones).

## Project layout

```
supabase/migrations/     Database schema, RLS policies, SQL functions (source of truth)
supabase/functions/      Edge Functions: create-user, delete-user, reset-password, provision-tenant
supabase/seeds/          Client onboarding seeds (tenant + admin + zones)
src/lib/                 Supabase client, domain types, phone/CSV/label/audit helpers
src/lib/modules.ts       Single source of truth for nav + routes + per-user access
src/lib/offline/         IndexedDB queue + sync engine + cached masters (offline mode)
src/stores/              Zustand stores (auth/session/role)
src/components/          Shared UI (Layout shell, ItemLocator, ScanInput, StatCard, …)
src/pages/               Login + role-segregated screens (home, store, grn, release, dispatch, counts, admin, manager)
docs/demo-guide.md          Sales demo manual (accounts, 15-min script, FAQ, reset)
docs/uandm-client-guide.md  Client self-service guide — setup, in order (U&M)
docs/module-guide.md        Reference: every module, who uses it, and a use case
docs/product-lifecycle.md   One product's journey from gate to finished sofa
docs/project-log.md         Full record: built, decided, parked, discussed
docs/open-items.md          Backlog before customer handover
docs/regression-checklist.md  Post-migration test pass, stage by stage
docs/superpowers/specs/     Design documents
```

## Offline mode

The app is a PWA: the shell loads with no connectivity, and the floor screens
(Capture, Internal Transfer, GRN gate entry) keep working offline — scans are
validated against a locally cached shelf/item master, transactions and photos
queue in IndexedDB, and everything syncs automatically (in order, server-side
re-validated) when the connection returns. A banner shows offline state,
pending count, and any sync rejections.

## Mobile builds (Capacitor)

```sh
npm run build && npx cap sync android   # refresh native project after web changes
npx cap open android                    # opens Android Studio to run/build
```

- Android Studio (with SDK) is required to produce an APK / Play Store bundle.
- iOS requires a Mac: `npm i @capacitor/ios && npx cap add ios`.
- Push notifications need a Firebase project: place `google-services.json` in
  `android/app/`, store the FCM server key as a Supabase Edge Function secret,
  and deploy an edge function that sends pushes on `alerts` inserts
  (tokens are collected in `profiles.push_token` by migration 0010).

## The five roles

Each role lands on its own home screen: **Security** (gate dashboard), **Storekeeper** (task list), **Production Planner** (department status), **Manager** (KPIs + approvals), **Admin** (masters + settings).

On top of the role, an admin can switch individual modules on or off **per person** (Users & Roles → Access). `src/lib/modules.ts` and the `modules` table must stay in sync — the database enforces access independently of the UI (migration 0017), so a mismatch means the app offers something the server will refuse.

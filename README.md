# Golai

**Operational control system for manufacturing warehouses.**
Golai runs the floor. Your ERP runs the books.

Scan-first stock control: zones and shelves get barcode labels, every item enters the system through the scanner (pre-assigned codes recognized, unknown items auto-coded), and anyone can type an item's name to find the exact zone and shelf it sits on.

## Stack

React 18 · TypeScript · Vite · Tailwind CSS · Zustand · TanStack Query · Supabase (Postgres, Auth, Storage, Realtime, RLS)

## Getting started

1. **Install dependencies**

   ```sh
   npm install
   ```

2. **Create a Supabase project** at [supabase.com](https://supabase.com) (free tier is fine).

3. **Apply the database migrations** — in the Supabase dashboard open *SQL Editor* and run the files in `supabase/migrations/` in order (0001 → 0004), or use the Supabase CLI:

   ```sh
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```

4. **Configure environment** — copy `.env.example` to `.env` and fill in your project URL and anon key (dashboard → Project Settings → API).

5. **Create the first tenant + admin** — in the SQL Editor:

   ```sql
   insert into tenants (name) values ('U&M Designs Pvt Ltd') returning id;
   -- Create a user in Authentication → Users, then:
   insert into profiles (id, tenant_id, email, full_name, role)
   values ('<auth-user-uuid>', '<tenant-uuid>', 'admin@example.com', 'Admin', 'admin');
   ```

6. **Run**

   ```sh
   npm run dev
   ```

## Project layout

```
supabase/migrations/    Database schema, RLS policies, functions (source of truth)
src/lib/                Supabase client, domain types, audit-log helper
src/stores/             Zustand stores (auth/session/role)
src/components/         Shared UI (Layout, ItemLocator, ModuleTile)
src/pages/              Login + role-segregated home screens
docs/superpowers/specs/ Design documents
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

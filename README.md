# Aksure

**Operational control system for manufacturing warehouses.**
Aksure runs the floor. Your ERP runs the books.

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

## The five roles

Each role lands on its own home screen: **Security** (gate dashboard), **Storekeeper** (task list), **Production Planner** (department status), **Manager** (KPIs + approvals), **Admin** (masters + settings).

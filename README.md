# ProTrack

Production tracking dashboard built with Next.js, with Supabase-backed shared
storage and realtime updates.

## Supabase setup

1. Create a Supabase project.
2. In the Supabase SQL Editor, run [`supabase/schema.sql`](./supabase/schema.sql).
   This creates the production, product, and employee tables and enables
   realtime updates.
3. Copy `.env.example` to `.env.local` and set the Supabase project URL and
   anon/publishable key from **Project Settings → API**.
4. Add the same environment variables to the Vercel project's Production
   environment (and Preview/Development if you use those deployments), then
   redeploy.

The dashboard uses the Supabase anon key in the browser. The included SQL
intentionally allows anyone with the app URL to read, insert, update, and delete
all records without signing in. Do not store confidential or sensitive personal
information in this configuration. For private team data, replace these
policies with authenticated access before deployment.

When Supabase is configured, the app syncs productions, products, and employees
between visitors in realtime. If the Supabase tables are empty, the app copies
existing records from that browser's local storage into Supabase. Without
Supabase configuration, it continues to use local storage in that browser only.
All database and storage errors are shown in the dashboard instead of silently
discarding failed writes.

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

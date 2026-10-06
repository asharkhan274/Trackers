create table if not exists public.productions (
  id uuid primary key,
  record jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key,
  record jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.employees (
  id uuid primary key,
  record jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.productions enable row level security;
alter table public.products enable row level security;
alter table public.employees enable row level security;

grant select, insert, update, delete on public.productions to anon, authenticated;
grant select, insert, update, delete on public.products to anon, authenticated;
grant select, insert, update, delete on public.employees to anon, authenticated;

drop policy if exists "Public shared access" on public.productions;
create policy "Public shared access" on public.productions
  for all to anon, authenticated
  using (true) with check (true);

drop policy if exists "Public shared access" on public.products;
create policy "Public shared access" on public.products
  for all to anon, authenticated
  using (true) with check (true);

drop policy if exists "Public shared access" on public.employees;
create policy "Public shared access" on public.employees
  for all to anon, authenticated
  using (true) with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'productions'
  ) then
    execute 'alter publication supabase_realtime add table public.productions';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'products'
  ) then
    execute 'alter publication supabase_realtime add table public.products';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'employees'
  ) then
    execute 'alter publication supabase_realtime add table public.employees';
  end if;
end $$;

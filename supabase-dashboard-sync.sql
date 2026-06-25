create table if not exists public.dashboard_sync (
  sync_id text primary key,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.dashboard_sync enable row level security;

drop policy if exists "dashboard_sync_read" on public.dashboard_sync;
drop policy if exists "dashboard_sync_insert" on public.dashboard_sync;
drop policy if exists "dashboard_sync_update" on public.dashboard_sync;

create policy "dashboard_sync_read"
on public.dashboard_sync
for select
to anon
using (true);

create policy "dashboard_sync_insert"
on public.dashboard_sync
for insert
to anon
with check (true);

create policy "dashboard_sync_update"
on public.dashboard_sync
for update
to anon
using (true)
with check (true);

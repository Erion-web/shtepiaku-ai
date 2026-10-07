-- Price versions edited by staff on the dashboard's "Çmimet" page.
-- Append-only: every save adds a row, the newest row is the active pricing,
-- and restoring an old version saves a copy of it as a new row.
-- Same lock-down as the lead tables: RLS on, no policies, no public privileges.

create table if not exists public.pricing_versions (
  version     bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  status      text not null check (status in ('demo','approved')),
  note        text not null default '',
  author      text not null default '',
  config      jsonb not null
);

alter table public.pricing_versions enable row level security;
revoke all on table public.pricing_versions from anon, authenticated;

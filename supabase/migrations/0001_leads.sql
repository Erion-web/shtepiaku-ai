-- Shtepiaku AI lead storage.
-- Real and demo leads live in separate tables. Row-level security is enabled with
-- NO policies, and table privileges are revoked from the public roles, so leads are
-- only reachable with the server-side service-role key — never from the browser.

create or replace function public.shtepiaku_create_leads_table(tbl text) returns void
language plpgsql as $fn$
begin
  execute format($sql$
    create table if not exists public.%I (
      id               uuid primary key,
      idempotency_key  uuid not null unique,
      fingerprint      text not null,
      created_at       timestamptz not null default now(),
      updated_at       timestamptz not null default now(),
      status           text not null default 'new'
                       check (status in ('new','contacted','visit_planned','offer_sent','won','lost')),
      request_type     text not null check (request_type in ('offer','visit')),
      company_name     text not null,
      city             text not null,
      workspace_type   text not null,
      contact          jsonb not null,
      answers          jsonb not null,
      plan             jsonb not null,
      plan_tier        text not null,
      plan_customized  boolean not null,
      services         jsonb not null,
      pricing_id       text,
      pricing_status   text,
      estimate         jsonb,
      monthly_min      numeric,
      monthly_max      numeric,
      lang             text not null,
      booth            boolean not null default false,
      staff_notes      text not null default '',
      contact_search   text generated always as (
                         coalesce(contact->>'fullName','') || ' ' ||
                         coalesce(contact->>'email','') || ' ' ||
                         coalesce(contact->>'phone','')) stored
    )$sql$, tbl);
  execute format('create index if not exists %I on public.%I (created_at desc)', tbl || '_created', tbl);
  execute format('create index if not exists %I on public.%I (fingerprint, created_at)', tbl || '_fp', tbl);
  execute format('alter table public.%I enable row level security', tbl);
  execute format('revoke all on table public.%I from anon, authenticated', tbl);
end;
$fn$;

select public.shtepiaku_create_leads_table('leads');
select public.shtepiaku_create_leads_table('demo_leads');
drop function public.shtepiaku_create_leads_table(text);

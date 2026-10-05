-- Tour guiado: progresso por usuário + locadora + tour + versão, e eventos de uso (sem dados digitados).
-- Rodar uma vez no SQL Editor do Supabase. Idempotente.

create table if not exists public.tour_progress (
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  tour_id            text not null check (char_length(tour_id) between 1 and 80),
  version            int  not null default 1 check (version > 0),
  status             text not null check (status in ('active', 'paused', 'done', 'skipped')),
  mode               text not null default 'full' check (mode in ('quick', 'full')),
  step               int  not null default 0 check (step between -1 and 500),
  furthest           int  not null default 0 check (furthest between 0 and 500),
  completed_versions int[] not null default '{}',
  feedback           jsonb check (feedback is null or pg_column_size(feedback) < 2048),
  updated_at         timestamptz not null default now(),
  primary key (user_id, organization_id, tour_id)
);
alter table public.tour_progress enable row level security;

-- Cada pessoa só vê e grava o próprio progresso, e só na locadora ativa dela.
drop policy if exists tour_progress_own on public.tour_progress;
create policy tour_progress_own on public.tour_progress for all to authenticated
  using (user_id = (select auth.uid()) and organization_id = (select public.current_org_id()))
  with check (user_id = (select auth.uid()) and organization_id = (select public.current_org_id()));

create table if not exists public.tour_events (
  id              bigint generated always as identity primary key,
  organization_id uuid not null default public.current_org_id() references public.organizations (id) on delete cascade,
  user_id         uuid not null default auth.uid(),
  tour_id         text not null check (char_length(tour_id) between 1 and 80),
  version         int  not null default 1,
  event           text not null check (event in ('tour_started', 'tour_step_viewed', 'tour_skipped', 'tour_completed', 'tour_abandoned', 'help_opened')),
  step            int,
  step_id         text check (char_length(step_id) <= 80),
  created_at      timestamptz not null default now()
);
create index if not exists tour_events_tour_idx on public.tour_events (tour_id, event, step);
alter table public.tour_events enable row level security;

drop policy if exists tour_events_insert on public.tour_events;
create policy tour_events_insert on public.tour_events for insert to authenticated
  with check (user_id = (select auth.uid()) and organization_id = (select public.current_org_id()));
drop policy if exists tour_events_platform_read on public.tour_events;
create policy tour_events_platform_read on public.tour_events for select to authenticated
  using ((select public.is_platform_admin()));

-- Funil para o Super Admin: onde as pessoas abandonam cada tour.
create or replace function public.platform_tour_funnel()
returns table (tour_id text, version int, event text, step int, total bigint)
language sql stable security definer set search_path = '' as $$
  select e.tour_id, e.version, e.event, e.step, count(*)
    from public.tour_events e
   where public.is_platform_admin()
   group by 1, 2, 3, 4
   order by 1, 2, 4 nulls first, 3;
$$;
revoke all on function public.platform_tour_funnel() from public, anon;
grant execute on function public.platform_tour_funnel() to authenticated;

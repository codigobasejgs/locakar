-- LOCAKAR SaaS — Central de Ajuda: feedback dos artigos e buscas sem resultado.
-- Sem usuário, e-mail ou IP: só o artigo/consulta, a locadora (para separar volume) e o público.
-- Gravação e leitura somente pelo servidor (service_role). A rota /api/help confere a sessão antes de gravar;
-- o Super Admin lê o agregado em /api/platform/admin.

begin;

create table if not exists public.help_events (
  id              bigint generated always as identity primary key,
  kind            text not null check (kind in ('feedback', 'search', 'view')),
  audience        text not null check (audience in ('admin', 'tenant')),
  organization_id uuid,                         -- sem FK: o agregado sobrevive à exclusão da locadora
  article         text check (article is null or article ~ '^[a-z0-9-]{3,80}$'),
  query           text check (query is null or char_length(query) <= 80),
  results         int check (results is null or results between 0 and 500),
  helpful         boolean,
  comment         text check (comment is null or char_length(comment) <= 300),
  created_at      timestamptz not null default now()
);
create index if not exists help_events_kind_created_idx on public.help_events (kind, created_at desc);
alter table public.help_events enable row level security;
revoke all on public.help_events from anon, authenticated;
grant all on public.help_events to service_role;
grant usage on sequence public.help_events_id_seq to service_role;

-- Agregado para o Super Admin (últimos N dias): artigos mais vistos, avaliação e buscas sem resultado.
create or replace function public.help_report(p_days int default 30) returns jsonb
language sql stable security definer set search_path = '' as $$
  with e as (select * from public.help_events where created_at >= now() - make_interval(days => greatest(1, least(p_days, 365))))
  select jsonb_build_object(
    'views', coalesce((select jsonb_agg(x order by x.n desc) from (
      select article, count(*) as n from e where kind = 'view' group by article order by n desc limit 20) x), '[]'::jsonb),
    'feedback', coalesce((select jsonb_agg(x order by x.no desc, x.yes desc) from (
      select article, count(*) filter (where helpful) as yes, count(*) filter (where not helpful) as no,
             (array_agg(comment order by created_at desc) filter (where comment is not null and comment <> ''))[1:5] as comments
        from e where kind = 'feedback' group by article) x), '[]'::jsonb),
    'zeroResults', coalesce((select jsonb_agg(x order by x.n desc) from (
      select query, count(*) as n from e where kind = 'search' and results = 0 group by query order by n desc limit 30) x), '[]'::jsonb),
    'searches', (select count(*) from e where kind = 'search')
  );
$$;
revoke all on function public.help_report(int) from public, anon, authenticated;
grant execute on function public.help_report(int) to service_role;

commit;

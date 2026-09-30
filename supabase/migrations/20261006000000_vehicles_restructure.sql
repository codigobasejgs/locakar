-- LOCAKAR — Reestruturação do cadastro de veículos
-- Adiciona colunas para chassi, hodômetro, cor, vencimento do licenciamento, fotos múltiplas e documento CRLV.

alter table public.vehicles
  add column if not exists chassis text,
  add column if not exists odometer int not null default 0 check (odometer >= 0),
  add column if not exists color text,
  add column if not exists licensing_due_date date,
  add column if not exists photos jsonb not null default '[]'::jsonb,
  add column if not exists crlv_url text;

-- Índice único para chassi (quando preenchido e não-vazio)
create unique index if not exists vehicles_chassis_unique_idx
  on public.vehicles (upper(trim(chassis)))
  where chassis is not null and trim(chassis) <> '';

-- Garante que o bucket 'documentos' aceita PDF e imagens para o CRLV
update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
 where id = 'documentos';

-- Garante que o bucket 'veiculos' aceita imagens e é público para fotos da frota
insert into storage.buckets (id, name, public, allowed_mime_types)
values ('veiculos', 'veiculos', true, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true;

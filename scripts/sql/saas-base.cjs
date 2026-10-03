/* eslint-disable @typescript-eslint/no-require-imports -- testes SQL offline (PGlite): npx -p @electric-sql/pglite node scripts/sql/saas-tenancy.cjs */
// Banco PGlite com stubs do Supabase + todas as migrations do projeto em ordem.
const { PGlite } = require('@electric-sql/pglite');
const { btree_gist } = require('@electric-sql/pglite/contrib/btree_gist');
const { pgcrypto } = require('@electric-sql/pglite/contrib/pgcrypto');
const fs = require('fs');
const M = '' + require('path').resolve(__dirname, '../../supabase/migrations') + '/';

const STUBS = `
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema extensions; create schema storage;
create extension pgcrypto with schema extensions;
create table auth.users(id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create table storage.buckets(id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'),1)-1] $$;
grant usage on schema auth, storage, extensions to authenticated, anon, service_role;
grant select, insert, update, delete on storage.objects to authenticated, anon;
grant all on all tables in schema storage to service_role;
create publication supabase_realtime;
`;

async function makeDb({ upTo } = {}) {
  const db = new PGlite({ extensions: { btree_gist, pgcrypto } });
  await db.exec(STUBS);
  const files = fs.readdirSync(M).filter(f => f.endsWith('.sql')).sort().filter(f => !upTo || f <= upTo);
  for (const f of files) {
    try { await db.exec(fs.readFileSync(M + f, 'utf8')); }
    catch (e) { e.message = `[${f}] ${e.message}`; throw e; }
  }
  return db;
}

/** Executa fn como usuário autenticado (RLS ativa). */
async function as(db, userId, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId ?? ''}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}

module.exports = { makeDb, as, M };

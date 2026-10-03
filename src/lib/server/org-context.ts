import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PLATFORM } from "@/lib/platform";
import { SUPABASE_URL } from "@/lib/supabase/env";
import type { OrgBranding, Organization } from "@/types";

/**
 * Locadora da requisição atual. Cada rota roda dentro de `scoped()` (um contexto novo por requisição);
 * a entrada (sessão da equipe, token do locatário, registro do webhook, laço do cron) define a locadora
 * UMA vez com setOrg/runWithOrg e tudo abaixo — serviceDb(), e-mail, WhatsApp, PDF — usa ela.
 * A locadora nunca vem do corpo/URL do request. `after()` do Next preserva o contexto (bindSnapshot).
 */
export interface OrgContext {
  org: Organization;
  userId?: string;
  role?: string;
}

// Singleton por processo: o mesmo contexto mesmo se o módulo for carregado duas vezes (chunks/aliases).
const KEY = Symbol.for("locakar.org-context");
const g = globalThis as unknown as Record<symbol, AsyncLocalStorage<{ ctx?: OrgContext }> | undefined>;
const als = (g[KEY] ??= new AsyncLocalStorage<{ ctx?: OrgContext }>());

/** Envolve um handler de rota: contexto isolado por requisição (sem vazamento entre requisições). */
export function scoped<A extends unknown[], R>(handler: (...args: A) => Promise<R>) {
  return (...args: A) => als.run({}, () => handler(...args));
}

export function setOrg(ctx: OrgContext) {
  const store = als.getStore();
  if (!store) throw new Error("Rota sem escopo de locadora (envolva com scoped()).");
  if (store.ctx && store.ctx.org.id !== ctx.org.id) throw new Error("Locadora já definida nesta requisição.");
  store.ctx = ctx;
}

export const currentOrg = () => als.getStore()?.ctx;
export const runWithOrg = <T>(ctx: OrgContext, fn: () => Promise<T>) => als.run({ ctx }, fn);

export function requireOrg(): OrgContext {
  const ctx = currentOrg();
  if (!ctx) throw new Error("Operação de locadora fora do contexto de organização.");
  return ctx;
}

/** Service role SEM escopo: só para descobrir a locadora (webhook, cron, cadastro) e dados da plataforma. */
export function globalDb(): SupabaseClient {
  return createClient(SUPABASE_URL, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
}

const ORG_COLS = "id,slug,name,legal_name,document,email,phone,whatsapp,website,address,city,state,cep,status,branding,texts,onboarding,created_at";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadOrg(id: string): Promise<Organization | null> {
  if (!UUID.test(id)) return null;
  const { data } = await globalDb().from("organizations").select(ORG_COLS).eq("id", id).maybeSingle();
  return (data as Organization | null) ?? null;
}

export async function loadOrgBySlug(slug: string): Promise<Organization | null> {
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return null;
  const { data } = await globalDb().from("organizations").select(ORG_COLS).eq("slug", slug).maybeSingle();
  return (data as Organization | null) ?? null;
}

/** Locadora dos dados legados (LOCAKAR): webhooks/links antigos sem identificação de locadora. */
export async function legacyOrgId(): Promise<string | null> {
  const { data } = await globalDb().from("platform_config").select("default_organization_id").eq("id", 1).maybeSingle();
  return (data?.default_organization_id as string | undefined) ?? null;
}

/** Roda fn no contexto da locadora `id` (webhook/cron/link público). null = locadora inexistente. */
export async function withOrgId<T>(id: string | null | undefined, fn: () => Promise<T>): Promise<T | null> {
  const org = id ? await loadOrg(id) : null;
  return org ? runWithOrg({ org }, fn) : null;
}

/* ---------- Marca da locadora atual (sem contexto: marca da plataforma) ---------- */

export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || PLATFORM.siteUrl).replace(/\/+$/, "");

export function brand() {
  const org = currentOrg()?.org;
  const b: OrgBranding = org?.branding ?? {};
  const site = siteUrl();
  const abs = (u?: string) => (!u ? `${site}${PLATFORM.logoLight}` : /^https:\/\//.test(u) ? u : `${site}${u.startsWith("/") ? "" : "/"}${u}`);
  return {
    name: b.displayName || org?.name || PLATFORM.name,
    legalName: org?.legal_name || org?.name || PLATFORM.name,
    logo: abs(b.logoLight || b.logo),
    primary: /^#[0-9a-f]{6}$/i.test(b.primary ?? "") ? b.primary! : PLATFORM.primary,
    whatsapp: (org?.whatsapp || org?.phone || "").replace(/\D/g, ""),
    email: org?.email || "",
    site: org?.website || site,
    slug: org?.slug ?? null,
  };
}

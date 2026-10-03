import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Tabelas de dados da locadora (organization_id NOT NULL + RLS por organização). */
export const TENANT_TABLES = new Set([
  "vehicles", "clients", "rentals", "reservations", "expenses", "maintenance", "fines", "notes",
  "contracts", "email_log", "contract_templates", "contract_template_versions", "contract_ai_config",
  "payment_receipts", "vehicle_incidents", "tenant_devices", "antifraud_telemetry", "tenant_consents",
  "tenant_inspections", "tenant_documents", "rental_requests",
  "payment_transactions", "asaas_config", "asaas_customers", "asaas_webhook_events",
  "notifications", "client_push_subscriptions", "vehicle_fipe_history", "audit_log", "selsyn_requests", "settings",
]);

const ORG = Symbol.for("locakar.organizationId");
type Row = Record<string, unknown>;
const stamp = (orgId: string, v: Row | Row[]) => (Array.isArray(v) ? v.map((r) => ({ ...r, organization_id: orgId })) : { ...v, organization_id: orgId });

/**
 * Service role escopado a UMA locadora, com a mesma interface do SupabaseClient (as funções existentes
 * continuam recebendo `db`). Em tabelas da locadora: select/update/delete ganham `organization_id = orgId`
 * e insert/upsert gravam o orgId. O banco ainda recusa pai de outra locadora (trigger inherit_org).
 * O orgId vem sempre do banco (sessão, token interno, registro), nunca do corpo/URL do request.
 */
export function orgDb(db: SupabaseClient, orgId: string): SupabaseClient {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orgId)) throw new Error("Locadora inválida.");
  const from = (table: string) => {
    const q = db.from(table);
    if (!TENANT_TABLES.has(table)) return q;
    return new Proxy(q, {
      get(target, prop) {
        if (prop === "select") return (...a: Parameters<typeof q.select>) => target.select(...a).eq("organization_id", orgId);
        if (prop === "update") return (...a: Parameters<typeof q.update>) => target.update(...a).eq("organization_id", orgId);
        if (prop === "delete") return (...a: Parameters<typeof q.delete>) => target.delete(...a).eq("organization_id", orgId);
        if (prop === "insert") return (v: Row | Row[], o?: Parameters<typeof q.insert>[1]) => target.insert(stamp(orgId, v) as Row, o);
        if (prop === "upsert") return (v: Row | Row[], o?: Parameters<typeof q.upsert>[1]) => target.upsert(stamp(orgId, v) as Row, o);
        return Reflect.get(target, prop);
      },
    });
  };
  return new Proxy(db, {
    get(target, prop) {
      if (prop === "from") return from;
      if (prop === ORG) return orgId;
      const v = Reflect.get(target, prop);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}

/** Locadora de um client escopado (undefined = service role global). */
export const orgIdOf = (db: SupabaseClient): string | undefined => (db as unknown as Record<symbol, string | undefined>)[ORG];

export function requireOrgId(db: SupabaseClient): string {
  const id = orgIdOf(db);
  if (!id) throw new Error("Operação de locadora sem contexto de organização.");
  return id;
}

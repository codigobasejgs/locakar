import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { infinitePayState, methodStatus, pixState, type PaymentMethodId, type PaymentMethodState } from "@/lib/payment-methods";
import { envCols, loadAsaasConfig, readyForCharges, type AsaasConfigRow } from "@/lib/server/asaas";
import { requireOrg } from "@/lib/server/org-context";
import { loadSettings } from "@/lib/server/push";
import { HttpError } from "@/lib/server/supabase";
import { audit } from "@/lib/server/tenant";
import type { CompanySettings } from "@/types";

/** Estado dos três meios a partir das fontes reais (settings + asaas_config). Sem segredos. */
export function asaasState(cfg: AsaasConfigRow | null): PaymentMethodState {
  if (!cfg) return { id: "asaas", enabled: false, configured: false, status: "not_configured", detail: "Aplique a migration do Asaas no Supabase." };
  const c = envCols(cfg.environment);
  const configured = Boolean(cfg[c.keyEnc] && cfg[c.verified] && cfg[c.webhookHash]);
  const detail = !cfg[c.keyEnc] ? "Salve a API Key do Asaas." : !cfg[c.verified] ? "Teste a conexão com o Asaas." : !cfg[c.webhookHash] ? "Webhook não registrado: teste a conexão de novo." : undefined;
  return { id: "asaas", enabled: cfg.enabled, configured, status: methodStatus(cfg.enabled, configured, cfg[c.keyEnc] ? (cfg.last_error ?? detail) : null), detail };
}

export async function getPaymentMethods(db: SupabaseClient, settings?: CompanySettings) {
  const [s, cfg] = await Promise.all([settings ?? loadSettings(db), loadAsaasConfig(db)]);
  const ip = infinitePayState(s.infinitepay);
  return { settings: s, asaasConfig: cfg, methods: [asaasState(cfg), ip, pixState(s.pix)] as PaymentMethodState[], infinitepay: ip };
}

/** Disponível para NOVA operação = ligado e configurado. Lifecycle de operações existentes não passa por aqui. */
export const usable = (m: PaymentMethodState) => m.enabled && m.configured;

export async function assertMethodEnabled(db: SupabaseClient, id: PaymentMethodId, settings?: CompanySettings) {
  const { methods } = await getPaymentMethods(db, settings);
  const m = methods.find((x) => x.id === id)!;
  if (!usable(m)) throw new HttpError(409, id === "pix_manual" ? "Pagamento por Pix com comprovante está desativado no momento." : `${id === "asaas" ? "Asaas" : "InfinitePay"} está desativado para novas cobranças.`);
}

/** Cobranças/análises em aberto do meio (aviso antes de desativar). */
export async function openCount(db: SupabaseClient, id: PaymentMethodId) {
  const q =
    id === "pix_manual"
      ? db.from("payment_receipts").select("id", { count: "exact", head: true }).eq("status", "pending_review")
      : db.from("payment_transactions").select("id", { count: "exact", head: true }).eq("provider", id).in("status", id === "asaas" ? ["started", "link_created"] : ["link_created", "awaiting_confirmation"]);
  const { count } = await q;
  return count ?? 0;
}

/**
 * Liga/desliga um meio. Ligar exige configuração válida; desligar nunca apaga credenciais, IDs ou histórico.
 * PIX/InfinitePay vivem no JSON de settings (merge só da chave `enabled`); Asaas em asaas_config.
 */
export async function setMethodEnabled(db: SupabaseClient, id: PaymentMethodId, enabled: boolean, actor: { id: string; ip?: string | null }) {
  const { methods } = await getPaymentMethods(db);
  const m = methods.find((x) => x.id === id)!;
  if (enabled && !m.configured) throw new HttpError(409, `Configure este meio de pagamento antes de ativá-lo. ${m.detail ?? ""}`.trim());
  if (m.enabled !== enabled) {
    if (id === "asaas") {
      const { error } = await db.from("asaas_config").update({ enabled, updated_by: actor.id });
      if (error) throw new HttpError(500, "Não foi possível salvar.");
    } else {
      const { error } = await db.rpc("set_payment_method_enabled", { p_org: requireOrg().org.id, p_method: id, p_enabled: enabled });
      if (error) throw new HttpError(503, "Aplique as migrations multiempresa (20261013*) para salvar os switches.");
    }
    await audit({ actorType: "staff", actorId: actor.id, action: enabled ? "payment_method_enabled" : "payment_method_disabled", entity: "payment_methods", entityId: id, details: { method: id }, ip: actor.ip ?? null });
  }
  return (await getPaymentMethods(db)).methods;
}

export { readyForCharges };

/**
 * Meios de pagamento oferecidos aos clientes — regras puras (painel, servidor, testes).
 * Fonte de verdade da disponibilidade:
 *  - PIX manual  → settings.data.pix.enabled      (ausente = ligado, comportamento anterior)
 *  - InfinitePay → settings.data.infinitepay.enabled
 *  - Asaas       → asaas_config.enabled            (só servidor; credenciais nunca saem de lá)
 *  - Mercado Pago, PagBank, Pagar.me → payment_gateways.enabled (só servidor)
 * Desligar só impede NOVAS cobranças/escolhas; cobranças, webhooks, comprovantes e histórico continuam.
 */
import { isPixReady } from "./billing";
import { GATEWAYS, GATEWAY_IDS, type GatewayId } from "./gateways";
import { normalizeHandle, type InfinitePaySettings } from "./infinitepay";
import type { PixSettings } from "@/types";

export type PaymentMethodId = "asaas" | "infinitepay" | "pix_manual" | GatewayId;
export const PAYMENT_METHOD_IDS: PaymentMethodId[] = ["asaas", "infinitepay", ...GATEWAY_IDS, "pix_manual"];
export const isGatewayMethod = (id: PaymentMethodId): id is GatewayId => (GATEWAY_IDS as string[]).includes(id);

export const PAYMENT_METHODS: Record<PaymentMethodId, { label: string; description: string; client: string }> = {
  asaas: { label: "Asaas", description: "Automatize cobranças e confirmações de pagamento através do Asaas.", client: "Pagamento online · confirmação automática" },
  infinitepay: { label: "InfinitePay", description: "Aproximação no celular (InfiniteTap) e link de pagamento Pix/cartão (Checkout).", client: "Cartão ou Pix pela InfinitePay" },
  pix_manual: { label: "PIX QR Code", description: "Receba via Pix diretamente na conta cadastrada. O cliente envia o comprovante e o pagamento é aprovado manualmente.", client: "Pix · envio de comprovante" },
  ...(Object.fromEntries(GATEWAY_IDS.map((id) => [id, { label: GATEWAYS[id].label, description: GATEWAYS[id].description, client: GATEWAYS[id].client }])) as Record<GatewayId, { label: string; description: string; client: string }>),
};

export type MethodStatus = "active" | "inactive" | "not_configured" | "error";
export interface PaymentMethodState {
  id: PaymentMethodId;
  enabled: boolean;
  configured: boolean;
  status: MethodStatus;
  /** Motivo quando não configurado/erro (nunca contém segredo). */
  detail?: string;
}

export function methodStatus(enabled: boolean, configured: boolean, error?: string | null): MethodStatus {
  if (!configured) return error ? "error" : "not_configured";
  return enabled ? "active" : "inactive";
}

export const pixEnabled = (pix?: Partial<PixSettings> | null) => pix?.enabled !== false;

export function pixState(pix?: PixSettings | null): PaymentMethodState {
  const configured = Boolean(pix && isPixReady(pix));
  const enabled = pixEnabled(pix);
  return { id: "pix_manual", enabled, configured, status: methodStatus(enabled, configured), detail: configured ? undefined : "Cadastre chave Pix, nome e cidade do recebedor." };
}

/** InfiniteTap funciona sem InfiniteTag; o Checkout precisa dela. */
export function infinitePayState(ip?: InfinitePaySettings | null): PaymentMethodState & { checkout: boolean; tap: boolean } {
  const handle = normalizeHandle(ip?.handle ?? "");
  const tap = Boolean(ip && ip.mode !== "checkout");
  const checkout = ip?.mode !== "tap" && Boolean(handle);
  const configured = tap || checkout;
  const enabled = Boolean(ip?.enabled);
  const detail = configured ? undefined : "Informe a InfiniteTag (handle) para o link de pagamento.";
  return { id: "infinitepay", enabled, configured, status: methodStatus(enabled, configured, ip?.mode === "checkout" && !handle ? detail : null), detail, checkout: enabled && checkout, tap: enabled && tap };
}

export const STATUS_LABEL: Record<MethodStatus, string> = { active: "Ativo", inactive: "Desativado", not_configured: "Não configurado", error: "Erro de configuração" };

/**
 * Asaas — regras puras (sem rede, sem segredo), compartilhadas por servidor, painel e testes.
 * Fonte: docs.asaas.com (autenticação, cobranças, webhooks, estornos e chargeback; consultado em 2026-10).
 */

export type AsaasEnvironment = "sandbox" | "production";
export type AsaasBillingType = "PIX" | "BOLETO" | "CREDIT_CARD" | "UNDEFINED";

export const ASAAS_BASE: Record<AsaasEnvironment, string> = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  production: "https://api.asaas.com/v3",
};
export const ASAAS_METHODS = ["PIX", "BOLETO", "CREDIT_CARD"] as const;
export const BILLING_LABEL: Record<string, string> = { PIX: "Pix", BOLETO: "Boleto", CREDIT_CARD: "Cartão de crédito", UNDEFINED: "Cliente escolhe", DEBIT_CARD: "Cartão de débito" };

/** Eventos de cobrança assinados no webhook (lista oficial de PAYMENT_*). Outros eventos são registrados e ignorados. */
export const ASAAS_WEBHOOK_EVENTS = [
  "PAYMENT_CREATED", "PAYMENT_UPDATED", "PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_OVERDUE", "PAYMENT_DELETED", "PAYMENT_RESTORED",
  "PAYMENT_REFUNDED", "PAYMENT_PARTIALLY_REFUNDED", "PAYMENT_REFUND_IN_PROGRESS", "PAYMENT_REFUND_DENIED", "PAYMENT_RECEIVED_IN_CASH_UNDONE",
  "PAYMENT_CHARGEBACK_REQUESTED", "PAYMENT_CHARGEBACK_DISPUTE", "PAYMENT_AWAITING_CHARGEBACK_REVERSAL",
  "PAYMENT_AWAITING_RISK_ANALYSIS", "PAYMENT_APPROVED_BY_RISK_ANALYSIS", "PAYMENT_REPROVED_BY_RISK_ANALYSIS", "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED",
  "PAYMENT_BANK_SLIP_CANCELLED",
] as const;

/** Prefixos oficiais: produção `$aact_prod_`, sandbox `$aact_hmlg_`. Chave de outro ambiente é recusada antes de salvar. */
export function keyEnvironment(key: string): AsaasEnvironment | null {
  if (key.startsWith("$aact_prod_")) return "production";
  if (key.startsWith("$aact_hmlg_")) return "sandbox";
  return null;
}
export function validateApiKey(raw: unknown, environment: AsaasEnvironment): string {
  const key = typeof raw === "string" ? raw.trim() : "";
  if (!key || /\s/.test(key) || key.length < 20 || key.length > 500) throw new Error("Informe a API Key completa, sem espaços.");
  const env = keyEnvironment(key);
  if (env && env !== environment) throw new Error(env === "production" ? "Esta chave é de Produção. Selecione o ambiente Produção." : "Esta chave é de Sandbox. Selecione o ambiente Sandbox.");
  return key;
}
export const last4 = (key: string) => key.slice(-4);
export const maskKey = (l4?: string | null) => (l4 ? `••••••••••••${l4}` : null);

/** Referências determinísticas para reconciliação (nunca a descrição humana). */
export const txReference = (txId: string) => `locakar-tx:${txId}`;
export const clientReference = (clientId: string) => `locakar-client:${clientId}`;
export function parseTxReference(ref: unknown): string | null {
  const m = typeof ref === "string" ? /^locakar-tx:([0-9a-f-]{36})$/i.exec(ref) : null;
  return m ? m[1] : null;
}

/** Estado interno da tentativa (payment_transactions.status) a partir do snapshot atual da cobrança no Asaas. */
export type TxState = "link_created" | "paid" | "refunded" | "chargeback" | "cancelled";
export interface PaymentSnapshot {
  id: string;
  status?: string;
  deleted?: boolean;
  value?: number;
  billingType?: string;
  invoiceUrl?: string | null;
  bankSlipUrl?: string | null;
  dueDate?: string;
  paymentDate?: string | null;
  clientPaymentDate?: string | null;
  confirmedDate?: string | null;
  externalReference?: string | null;
  customer?: string;
  refunds?: { status?: string; value?: number }[] | null;
  chargeback?: { status?: string } | null;
}

/**
 * Regra de negócio documentada:
 *  - CONFIRMED = cliente pagou (saldo ainda não disponível); RECEIVED = valor disponível na conta.
 *    Ambos quitam a parcela (o cliente efetivamente pagou); provider_status preserva a diferença.
 *  - Pix vai direto a RECEIVED; boleto/cartão passam por CONFIRMED.
 *  - REFUNDED reabre a parcela (histórico mantido); estorno parcial mantém paga e registra o valor.
 *  - CHARGEBACK_* nunca vira "não pago": estado próprio, a parcela segue paga até a disputa terminar.
 * Decisões usam o snapshot atual (GET /payments/{id}), não a ordem dos eventos: evento atrasado não rebaixa status.
 */
export function stateFromSnapshot(p: PaymentSnapshot): TxState {
  const s = p.status ?? "";
  if (s === "CHARGEBACK_REQUESTED" || s === "CHARGEBACK_DISPUTE" || s === "AWAITING_CHARGEBACK_REVERSAL") return "chargeback";
  if (s === "REFUNDED") return "refunded";
  if (["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH", "DUNNING_RECEIVED", "REFUND_REQUESTED", "REFUND_IN_PROGRESS"].includes(s)) return "paid";
  if (p.deleted) return "cancelled";
  return "link_created"; // PENDING, OVERDUE, AWAITING_RISK_ANALYSIS, DUNNING_REQUESTED e status futuros desconhecidos
}

/** Soma só estornos concluídos (docs: o array refunds não significa devolução; vale `status = DONE`). */
export function refundedCents(p: PaymentSnapshot): number {
  return (p.refunds ?? []).filter((r) => r?.status === "DONE" && typeof r.value === "number").reduce((s, r) => s + Math.round(r.value! * 100), 0);
}

export const PROVIDER_STATUS_LABEL: Record<string, string> = {
  PENDING: "Aguardando pagamento",
  OVERDUE: "Vencida",
  CONFIRMED: "Confirmado",
  RECEIVED: "Recebido",
  RECEIVED_IN_CASH: "Recebido em dinheiro",
  REFUND_REQUESTED: "Estorno solicitado",
  REFUND_IN_PROGRESS: "Estorno em processamento",
  REFUNDED: "Estornado",
  CHARGEBACK_REQUESTED: "Chargeback",
  CHARGEBACK_DISPUTE: "Chargeback em disputa",
  AWAITING_CHARGEBACK_REVERSAL: "Chargeback · aguardando repasse",
  DUNNING_REQUESTED: "Negativação solicitada",
  DUNNING_RECEIVED: "Recebido (negativação)",
  AWAITING_RISK_ANALYSIS: "Em análise de risco",
  DELETED: "Cancelada",
};
export function statusLabel(tx: { status: string; provider_status?: string | null; refunded_cents?: number | null }) {
  if (tx.status === "cancelled") return "Cancelada";
  if (tx.status === "failed") return "Falhou";
  if (tx.status === "started") return "Criando…";
  if (tx.status === "paid" && (tx.refunded_cents ?? 0) > 0) return "Estorno parcial";
  return PROVIDER_STATUS_LABEL[tx.provider_status ?? ""] ?? (tx.status === "paid" ? "Pago" : "Em aberto");
}
export type BadgeTone = "success" | "danger" | "warning" | "neutral" | "brand";
export function statusTone(tx: { status: string; provider_status?: string | null }): BadgeTone {
  if (tx.status === "paid") return "success";
  if (tx.status === "chargeback" || tx.status === "failed" || tx.provider_status === "OVERDUE") return "danger";
  if (tx.status === "cancelled" || tx.status === "refunded") return "neutral";
  return "warning";
}

export interface ChargeRules {
  finePercent?: number | null;
  interestPercent?: number | null;
  discountPercent?: number | null;
  discountDays?: number | null;
}

/** Corpo do POST /payments: só envia multa/juros/desconto quando configurados (não sobrescreve padrões da conta com vazios). */
export function chargePayload(i: { customer: string; billingType: AsaasBillingType; cents: number; dueDate: string; description: string; externalReference: string; rules: ChargeRules }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.dueDate)) throw new Error("Vencimento inválido.");
  if (!Number.isInteger(i.cents) || i.cents < 100) throw new Error("Valor inválido.");
  const body: Record<string, unknown> = {
    customer: i.customer,
    billingType: i.billingType,
    value: i.cents / 100,
    dueDate: i.dueDate,
    description: i.description.slice(0, 500),
    externalReference: i.externalReference,
  };
  const r = i.rules;
  if (r.finePercent && r.finePercent > 0) body.fine = { value: r.finePercent, type: "PERCENTAGE" };
  if (r.interestPercent && r.interestPercent > 0) body.interest = { value: r.interestPercent };
  if (r.discountPercent && r.discountPercent > 0) body.discount = { value: r.discountPercent, dueDateLimitDays: r.discountDays ?? 0, type: "PERCENTAGE" };
  return body;
}

/** Cliente Asaas mínimo a partir do cadastro LOCAKAR. CPF/CNPJ é obrigatório na API. */
export function customerPayload(c: { id: string; name?: string | null; cpf?: string | null; email?: string | null; phone?: string | null; cep?: string | null; street?: string | null; number?: string | null; complement?: string | null; neighborhood?: string | null }, notificationDisabled: boolean) {
  const doc = (c.cpf ?? "").replace(/\D/g, "");
  if (doc.length !== 11 && doc.length !== 14) throw new Error("Cadastre o CPF/CNPJ do cliente para cobrar pelo Asaas.");
  if (!c.name?.trim()) throw new Error("Cadastre o nome do cliente para cobrar pelo Asaas.");
  const phone = (c.phone ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  const body: Record<string, unknown> = { name: c.name.trim().slice(0, 100), cpfCnpj: doc, externalReference: clientReference(c.id), notificationDisabled };
  if (c.email?.includes("@")) body.email = c.email.trim();
  if (phone.length === 10 || phone.length === 11) body.mobilePhone = phone;
  const cep = (c.cep ?? "").replace(/\D/g, "");
  if (cep.length === 8) {
    body.postalCode = cep;
    if (c.street) body.address = c.street.slice(0, 120);
    if (c.number) body.addressNumber = c.number.slice(0, 20);
    if (c.complement) body.complement = c.complement.slice(0, 255);
    if (c.neighborhood) body.province = c.neighborhood.slice(0, 120);
  }
  return body;
}

/** Mensagem de erro segura a partir da resposta { errors: [{ code, description }] } do Asaas. */
export function asaasErrorMessage(status: number, json: unknown): string {
  const first = (json as { errors?: { code?: string; description?: string }[] })?.errors?.[0];
  if (status === 401) return first?.code === "invalid_environment" ? "A API Key não pertence ao ambiente selecionado." : "Não foi possível autenticar no Asaas. Confira a API Key.";
  if (status === 403) return "A API Key não tem permissão para esta operação no Asaas.";
  if (status === 404) return "Registro não encontrado no Asaas.";
  if (status === 429) return "Limite de requisições do Asaas atingido. Aguarde alguns instantes.";
  const desc = typeof first?.description === "string" ? first.description.replace(/\$aact_\S+/g, "[chave]").slice(0, 300) : "";
  if (status >= 400 && status < 500 && desc) return `Asaas: ${desc}`;
  return `Asaas indisponível (HTTP ${status}).`;
}

/** Remove segredos de qualquer objeto antes de log/auditoria. */
export function redact<T>(value: T, depth = 0): T {
  if (depth > 6) return "[…]" as T;
  if (typeof value === "string") return value.replace(/\$aact_[A-Za-z0-9_\-$:.]+/g, "[chave]") as T;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, /access_?token|api_?key|auth_?token|password|secret|creditCardNumber|ccv|cvv|creditCardToken/i.test(k) ? "[oculto]" : redact(v, depth + 1)]),
    ) as T;
  }
  return value;
}

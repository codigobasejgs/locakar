/**
 * Gateways de link de pagamento (Mercado Pago, PagBank, Pagar.me/Stone) — regras puras, sem rede.
 * Cada cobrança é uma tentativa em payment_transactions (id = referência enviada ao gateway).
 * A baixa só acontece depois de o servidor CONSULTAR o gateway (webhook e retorno só avisam).
 * Documentação usada:
 *  - Mercado Pago Checkout Pro: POST /checkout/preferences, GET /v1/payments/{id}, x-signature (HMAC-SHA256)
 *  - PagBank Checkout: POST /checkouts, GET /orders/{id}, x-authenticity-token = sha256(token-payload)
 *  - Pagar.me v5 (Stone): POST /paymentlinks, GET /orders?code=, Basic auth com a secret key
 * Valores sempre em centavos inteiros.
 */

export type GatewayId = "mercadopago" | "pagbank" | "pagarme";
export const GATEWAY_IDS: GatewayId[] = ["mercadopago", "pagbank", "pagarme"];
export type GatewayEnv = "sandbox" | "production";
export type PaidMethod = "pix" | "credit_card" | "debit" | "boleto";

export const GATEWAYS: Record<GatewayId, { label: string; description: string; credential: string; credentialHint: string; client: string }> = {
  mercadopago: {
    label: "Mercado Pago",
    description: "Link do Checkout Pro: Pix, cartão de crédito/débito (até 12x) e boleto, com baixa automática.",
    credential: "Access Token",
    credentialHint: "Mercado Pago Developers → Suas integrações → Credenciais (APP_USR-… em produção, TEST-… em teste).",
    client: "Pix ou cartão pelo Mercado Pago",
  },
  pagbank: {
    label: "PagBank (PagSeguro)",
    description: "Link do Checkout PagBank: Pix, cartão e boleto, com baixa automática.",
    credential: "Token de autenticação",
    credentialHint: "PagBank → Vendas → Integrações → Gerar token (Sandbox: Portal do Desenvolvedor → Tokens).",
    client: "Pix ou cartão pelo PagBank",
  },
  pagarme: {
    label: "Pagar.me (Stone/Ton)",
    description: "Link de pagamento Pagar.me (grupo Stone): Pix, cartão e boleto, com baixa automática.",
    credential: "Secret Key",
    credentialHint: "Dashboard Pagar.me → Configurações → Chaves (sk_live_… ou sk_test_…).",
    client: "Pix ou cartão pela Pagar.me",
  },
};

export const GATEWAY_API: Record<GatewayId, Record<GatewayEnv, string>> = {
  mercadopago: { sandbox: "https://api.mercadopago.com", production: "https://api.mercadopago.com" },
  pagbank: { sandbox: "https://sandbox.api.pagseguro.com", production: "https://api.pagseguro.com" },
  pagarme: { sandbox: "https://sdx-api.pagar.me/core/v5", production: "https://api.pagar.me/core/v5" },
};

export const isGateway = (v: unknown): v is GatewayId => typeof v === "string" && (GATEWAY_IDS as string[]).includes(v);

/** Formato da credencial (só sanidade: o teste real é a chamada à API ao salvar). */
export function credentialProblem(id: GatewayId, env: GatewayEnv, raw: string): string | null {
  const v = raw.trim();
  if (v.length < 20 || v.length > 500 || /\s/.test(v)) return `${GATEWAYS[id].credential} inválido.`;
  if (id === "mercadopago" && !/^(APP_USR|TEST)-/.test(v)) return "O Access Token do Mercado Pago começa com APP_USR- (ou TEST- no ambiente de testes).";
  if (id === "pagarme" && !/^sk_/.test(v)) return "A Secret Key da Pagar.me começa com sk_.";
  if (id === "pagarme" && env === "sandbox" && !v.startsWith("sk_test_")) return "No ambiente de testes use a chave sk_test_….";
  return null;
}

export interface LinkInput {
  txId: string;
  cents: number;
  title: string;
  customer: { name?: string | null; email?: string | null; phone?: string | null; cpf?: string | null };
  returnUrl: string;
  notifyUrl: string;
  /** ISO-8601 com fuso. */
  expiresAt: string;
}

const digits = (v?: string | null) => (v ?? "").replace(/\D/g, "");
const cpfOk = (v?: string | null) => digits(v).length === 11 || digits(v).length === 14;
const phoneParts = (v?: string | null) => {
  let d = digits(v);
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  return d.length === 10 || d.length === 11 ? { area: d.slice(0, 2), number: d.slice(2) } : null;
};

function check(i: LinkInput) {
  if (!/^[A-Za-z0-9-]{8,64}$/.test(i.txId)) throw new Error("Referência inválida.");
  if (!Number.isInteger(i.cents) || i.cents < 100) throw new Error("O valor mínimo da cobrança é R$ 1,00.");
}

/** Mercado Pago Checkout Pro: preferência de um item, referência = id da tentativa. */
export function mercadoPagoPreference(i: LinkInput) {
  check(i);
  return {
    items: [{ id: i.txId, title: i.title.slice(0, 120), quantity: 1, currency_id: "BRL", unit_price: i.cents / 100 }],
    external_reference: i.txId,
    notification_url: i.notifyUrl,
    back_urls: { success: i.returnUrl, pending: i.returnUrl, failure: i.returnUrl },
    auto_return: "approved",
    expires: true,
    expiration_date_to: i.expiresAt,
    statement_descriptor: "LOCACAO",
    payment_methods: { installments: 12 },
    ...(i.customer.email || i.customer.name ? { payer: { ...(i.customer.name ? { name: i.customer.name.slice(0, 120) } : {}), ...(i.customer.email ? { email: i.customer.email } : {}) } } : {}),
  };
}

/** PagBank Checkout: reference_id = id da tentativa; avisos de pagamento na URL do LocaKar. */
export function pagBankCheckout(i: LinkInput) {
  check(i);
  const phone = phoneParts(i.customer.phone);
  const full = Boolean(i.customer.name && i.customer.email && cpfOk(i.customer.cpf) && phone);
  return {
    reference_id: i.txId,
    expiration_date: i.expiresAt,
    customer_modifiable: true,
    ...(full ? { customer: { name: i.customer.name!.slice(0, 120), email: i.customer.email, tax_id: digits(i.customer.cpf), phone: { country: "+55", area: phone!.area, number: phone!.number } } } : {}),
    items: [{ reference_id: i.txId, name: i.title.slice(0, 100), quantity: 1, unit_amount: i.cents }],
    payment_methods: [{ type: "PIX" }, { type: "CREDIT_CARD" }, { type: "BOLETO" }],
    redirect_url: i.returnUrl,
    return_url: i.returnUrl,
    notification_urls: [i.notifyUrl],
    payment_notification_urls: [i.notifyUrl],
  };
}

/** Pagar.me: link de um pedido só (max_paid_sessions = 1); order_code = id da tentativa. */
export function pagarmeLink(i: LinkInput) {
  check(i);
  const doc = digits(i.customer.cpf);
  return {
    is_building: false,
    type: "order",
    name: i.title.slice(0, 64),
    order_code: i.txId,
    expires_at: i.expiresAt,
    max_paid_sessions: 1,
    payment_settings: {
      accepted_payment_methods: ["credit_card", "pix", "boleto"],
      credit_card_settings: { operation_type: "auth_and_capture", installments_setup: { interest_type: "simple", max_installments: 12, amount: i.cents, interest_rate: 0 } },
      pix_settings: { expires_in: 86_400 },
      boleto_settings: { due_in: 3 },
    },
    ...(i.customer.name && (doc.length === 11 || doc.length === 14)
      ? { customer_settings: { customer: { name: i.customer.name.slice(0, 64), type: doc.length === 11 ? "individual" : "company", document: doc, document_type: doc.length === 11 ? "CPF" : "CNPJ", ...(i.customer.email ? { email: i.customer.email.slice(0, 64) } : {}) } } }
      : {}),
    cart_settings: { items: [{ name: i.title.slice(0, 64), description: `${i.title.slice(0, 100)} · ref ${i.txId}`, amount: i.cents, default_quantity: 1 }] },
    flow_settings: { success_url: i.returnUrl },
  };
}

/** URL de pagamento na resposta da criação (cada gateway devolve num campo diferente). */
export function linkFromResponse(id: GatewayId, env: GatewayEnv, r: Record<string, unknown>): { url: string; providerId: string } | null {
  const https = (v: unknown) => (typeof v === "string" && /^https:\/\//.test(v) ? v : null);
  const pid = typeof r.id === "string" || typeof r.id === "number" ? String(r.id) : "";
  let url: string | null = null;
  if (id === "mercadopago") url = (env === "sandbox" ? https(r.sandbox_init_point) : null) ?? https(r.init_point);
  if (id === "pagbank") url = https(((r.links as { rel?: string; href?: string }[] | undefined) ?? []).find((l) => l.rel === "PAY")?.href);
  if (id === "pagarme") url = https(r.url);
  return url && pid ? { url, providerId: pid } : null;
}

export interface PaidInfo {
  paid: boolean;
  /** Valor da venda (sem acréscimo de parcelamento) em centavos. */
  cents: number;
  method: PaidMethod | null;
  installments: number | null;
  paymentId: string | null;
  /** Referência que voltou do gateway (tem que ser o id da tentativa). */
  reference: string | null;
  refunded: boolean;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const cents = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0);

/** GET /v1/payments/{id} do Mercado Pago. */
export function readMercadoPagoPayment(p: Record<string, unknown>): PaidInfo {
  const type = String(p.payment_type_id ?? "");
  const methodId = String(p.payment_method_id ?? "");
  const method: PaidMethod | null = methodId === "pix" || type === "bank_transfer" ? "pix" : type === "credit_card" ? "credit_card" : type === "debit_card" ? "debit" : type === "ticket" ? "boleto" : null;
  const amount = typeof p.transaction_amount === "number" ? Math.round(Number((p.transaction_amount * 100).toFixed(2))) : 0;
  return {
    paid: p.status === "approved",
    cents: amount,
    method,
    installments: Number.isInteger(p.installments) ? (p.installments as number) : null,
    paymentId: p.id != null ? String(p.id) : null,
    reference: typeof p.external_reference === "string" ? p.external_reference : null,
    refunded: p.status === "refunded" || p.status === "charged_back",
  };
}

/** GET /orders/{id} do PagBank: pago quando alguma cobrança está PAID. */
export function readPagBankOrder(o: Record<string, unknown>): PaidInfo {
  const charges = (Array.isArray(o.charges) ? o.charges : []) as Record<string, unknown>[];
  const paid = charges.find((c) => c.status === "PAID");
  const amount = (paid?.amount ?? {}) as { value?: number; summary?: { paid?: number; total?: number } };
  const pm = (paid?.payment_method ?? {}) as { type?: string; installments?: number };
  const method: PaidMethod | null = pm.type === "PIX" ? "pix" : pm.type === "CREDIT_CARD" ? "credit_card" : pm.type === "DEBIT_CARD" ? "debit" : pm.type === "BOLETO" ? "boleto" : null;
  return {
    paid: Boolean(paid),
    cents: cents(amount.value ?? amount.summary?.total),
    method: paid ? method : null,
    installments: Number.isInteger(pm.installments) ? pm.installments! : null,
    paymentId: typeof o.id === "string" ? o.id : null,
    reference: typeof o.reference_id === "string" ? o.reference_id : null,
    refunded: charges.some((c) => c.status === "CANCELED") && !paid,
  };
}

/** GET /orders/{id} (ou item de GET /orders?code=) da Pagar.me. */
export function readPagarmeOrder(o: Record<string, unknown>): PaidInfo {
  const charges = (Array.isArray(o.charges) ? o.charges : []) as Record<string, unknown>[];
  const paid = charges.find((c) => c.status === "paid");
  const pm = String(paid?.payment_method ?? "");
  const method: PaidMethod | null = pm === "pix" ? "pix" : pm === "credit_card" ? "credit_card" : pm === "debit_card" ? "debit" : pm === "boleto" ? "boleto" : null;
  const last = (paid?.last_transaction ?? {}) as { installments?: number };
  return {
    paid: o.status === "paid" || Boolean(paid),
    cents: cents(paid?.amount ?? o.amount),
    method,
    installments: Number.isInteger(last.installments) ? last.installments! : null,
    paymentId: typeof o.id === "string" ? o.id : null,
    // order_code do link vira o code do pedido; a descrição do item leva "ref <id>" como reserva.
    reference: [o.code, (o.metadata as Record<string, unknown> | undefined)?.order_code, ...((Array.isArray(o.items) ? o.items : []) as { description?: unknown }[]).map((x) => x.description)]
      .map((v) => (typeof v === "string" ? v.match(UUID)?.[0] ?? null : null))
      .find(Boolean) ?? null,
    refunded: charges.some((c) => c.status === "refunded"),
  };
}

/**
 * Decide a baixa depois da consulta ao gateway. A referência TEM que ser a da tentativa
 * (um pagamento de outra cobrança nunca quita esta parcela) e o valor não pode ser menor que o cobrado.
 */
export function decideGateway(tx: { id: string; status: string; amount_cents: number }, info: PaidInfo | null): "already" | "paid" | "mismatch" | "pending" | "foreign" {
  if (tx.status === "paid") return "already";
  if (!info || !info.paid) return "pending";
  if (info.reference !== tx.id) return "foreign";
  if (info.cents < tx.amount_cents) return "mismatch";
  return "paid";
}

/** Rótulo gravado na parcela e no recibo. */
export function gatewayMethodLabel(id: GatewayId, method?: string | null, installments?: number | null) {
  const parcel = installments && installments > 1 ? ` ${installments}x` : "";
  const how = method === "pix" ? "Pix" : method === "boleto" ? "Boleto" : method === "debit" ? "Cartão de Débito" : method === "credit_card" ? `Cartão de Crédito${parcel}` : "Link de pagamento";
  return `${GATEWAYS[id].label.replace(/ \(.*\)$/, "")} · ${how}`;
}

/**
 * InfinitePay — regras puras (sem rede), conforme a documentação oficial:
 * - InfiniteTap (Tap to Pay): https://www.infinitepay.io/checkout-tap  → deeplink, sem API key.
 * - Checkout Integrado: https://www.infinitepay.io/checkout-documentacao → POST /links, /payment_check, webhook.
 * Valores sempre em centavos inteiros (100 = R$ 1,00).
 */

export const INFINITEPAY_API = "https://api.checkout.infinitepay.io";
export const TAP_DEEPLINK = "infinitepaydash://infinitetap-app";
export const MIN_CENTS = 100;
export const MAX_INSTALLMENTS = 12;

export type TapMethod = "credit" | "debit";
export type InfinitePayMode = "tap" | "checkout" | "both";
export type TransactionFlow = "tap" | "checkout";
export type TransactionStatus = "started" | "link_created" | "awaiting_confirmation" | "paid" | "failed" | "cancelled" | "amount_mismatch";

export interface InfinitePaySettings {
  enabled: boolean;
  /** InfiniteTag sem o "$" do início. */
  handle: string;
  /** CNPJ/CPF da conta (só dígitos). Opcional: o Tap confere se o app está logado na conta certa. */
  docNumber: string;
  mode: InfinitePayMode;
  /** Envia handle/doc_number no Tap para o app recusar se o operador estiver em outra conta. */
  tapCheckAccount: boolean;
}

export const DEFAULT_INFINITEPAY: InfinitePaySettings = { enabled: false, handle: "", docNumber: "", mode: "both", tapCheckAccount: true };

/** "$Loja.Teste " → "loja.teste". Vazio se tiver caractere fora do padrão de InfiniteTag. */
export function normalizeHandle(raw: string) {
  const h = raw.trim().replace(/^\$/, "").toLowerCase();
  return /^[a-z0-9._-]{2,40}$/.test(h) ? h : "";
}

/** R$ → centavos sem erro de ponto flutuante (arredonda meio centavo para cima). Aceita número ou "1.234,56". */
export function toCents(value: number | string): number {
  const n = typeof value === "number" ? value : Number(value.trim().replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n)) return NaN;
  return Math.round(Number((n * 100).toFixed(2)));
}

export const fromCents = (cents: number) => cents / 100;

/** Maior número de parcelas permitido: até 12 e cada parcela com pelo menos R$ 1,00. */
export function maxInstallments(cents: number) {
  return Math.max(0, Math.min(MAX_INSTALLMENTS, Math.floor(cents / MIN_CENTS)));
}

export function validateTap(cents: number, method: TapMethod, installments: number): string | null {
  if (!Number.isInteger(cents) || cents < MIN_CENTS) return "O valor mínimo é R$ 1,00.";
  if (method !== "credit" && method !== "debit") return "Forma de pagamento inválida.";
  if (method === "debit" && installments !== 1) return "Débito é sempre à vista.";
  if (!Number.isInteger(installments) || installments < 1 || installments > maxInstallments(cents)) {
    return `Parcelamento inválido: até ${maxInstallments(cents)}x para este valor (mínimo R$ 1,00 por parcela).`;
  }
  return null;
}

const ORDER_RE = /^[A-Za-z0-9-]{8,64}$/;
/** order_id (Tap) e order_nsu (Checkout): o id da tentativa em payment_transactions (UUID). */
export const isValidOrderId = (v: unknown): v is string => typeof v === "string" && ORDER_RE.test(v);

/** Deeplink do InfiniteTap com exatamente os parâmetros da documentação. */
export function buildTapDeeplink(p: {
  cents: number;
  method: TapMethod;
  installments: number;
  orderId: string;
  resultUrl: string;
  referrer: string;
  handle?: string;
  docNumber?: string;
  ios?: boolean;
}) {
  const err = validateTap(p.cents, p.method, p.installments);
  if (err) throw new Error(err);
  if (!isValidOrderId(p.orderId)) throw new Error("order_id inválido.");
  const q = new URLSearchParams({
    amount: String(p.cents),
    payment_method: p.method,
    installments: String(p.method === "credit" ? p.installments : 1),
    order_id: p.orderId,
    result_url: p.resultUrl,
    app_client_referrer: p.referrer,
  });
  if (p.handle) q.set("handle", p.handle);
  if (p.docNumber) q.set("doc_number", p.docNumber.replace(/\D/g, ""));
  if (p.ios) q.set("af_force_deeplink", "true");
  return `${TAP_DEEPLINK}?${q.toString()}`;
}

const TAP_RESULT_KEYS = ["order_id", "nsu", "aut", "card_brand", "user_id", "access_id", "handle", "merchant_document", "warning"] as const;
export type TapResult = Partial<Record<(typeof TAP_RESULT_KEYS)[number], string>>;

/** Lê o retorno do result_url (sucesso ou erro com `warning`). Só as chaves documentadas, limitadas em tamanho. */
export function parseTapResult(params: URLSearchParams | Record<string, unknown>): TapResult {
  const get = (k: string) => (params instanceof URLSearchParams ? params.get(k) : params[k]);
  const out: TapResult = {};
  for (const k of TAP_RESULT_KEYS) {
    const v = get(k);
    if (typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 120);
  }
  return out;
}

export interface CheckoutItem {
  quantity: number;
  price: number;
  description: string;
}

/** Corpo do POST /links (campos documentados; opcionais só quando houver valor). */
export function checkoutPayload(p: {
  handle: string;
  orderNsu: string;
  items: CheckoutItem[];
  redirectUrl: string;
  webhookUrl: string;
  customer?: { name?: string; email?: string; phone?: string };
}) {
  if (!p.handle) throw new Error("Configure a InfiniteTag em Configurações → InfinitePay.");
  if (!isValidOrderId(p.orderNsu)) throw new Error("order_nsu inválido.");
  if (!p.items.length || p.items.some((i) => !Number.isInteger(i.price) || i.price < MIN_CENTS || !Number.isInteger(i.quantity) || i.quantity < 1)) {
    throw new Error("Itens inválidos (valor mínimo R$ 1,00).");
  }
  const phone = p.customer?.phone ? e164(p.customer.phone) : null;
  const customer = {
    ...(p.customer?.name ? { name: p.customer.name.slice(0, 120) } : {}),
    ...(p.customer?.email ? { email: p.customer.email } : {}),
    ...(phone ? { phone_number: phone } : {}),
  };
  return {
    handle: p.handle,
    order_nsu: p.orderNsu,
    items: p.items.map((i) => ({ quantity: i.quantity, price: i.price, description: i.description.slice(0, 120) })),
    redirect_url: p.redirectUrl,
    webhook_url: p.webhookUrl,
    ...(Object.keys(customer).length ? { customer } : {}),
  };
}

/** Telefone BR → "+5519999887766" (formato do exemplo da documentação). */
function e164(phone: string) {
  const d = phone.replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `+55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return `+${d}`;
  return null;
}

export interface CheckoutWebhook {
  invoice_slug: string;
  amount: number;
  paid_amount: number;
  installments: number;
  capture_method: string;
  transaction_nsu: string;
  order_nsu: string;
  receipt_url?: string;
}

/** Valida o corpo do webhook documentado. null = payload inválido. */
export function parseWebhook(body: unknown): CheckoutWebhook | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const str = (k: string) => (typeof b[k] === "string" && (b[k] as string).trim() ? (b[k] as string).trim().slice(0, 200) : null);
  const int = (k: string) => (Number.isInteger(b[k]) ? (b[k] as number) : null);
  const orderNsu = str("order_nsu");
  const transactionNsu = str("transaction_nsu");
  const slug = str("invoice_slug");
  const amount = int("amount");
  if (!isValidOrderId(orderNsu) || !transactionNsu || !slug || amount === null) return null;
  const receipt = str("receipt_url");
  return {
    invoice_slug: slug,
    amount,
    paid_amount: int("paid_amount") ?? amount,
    installments: int("installments") ?? 1,
    capture_method: str("capture_method") ?? "",
    transaction_nsu: transactionNsu,
    order_nsu: orderNsu,
    receipt_url: receipt && /^https:\/\//.test(receipt) ? receipt : undefined,
  };
}

export interface PaymentCheck {
  success: boolean;
  paid: boolean;
  amount?: number;
  paid_amount?: number;
  installments?: number;
  capture_method?: string;
}

/**
 * Decide o que fazer com uma tentativa de Checkout após o payment_check (fonte da verdade, servidor → InfinitePay).
 * `amount` é o valor da venda sem acréscimos de parcelamento (paid_amount pode ser maior).
 */
export function decideCheckout(tx: { status: TransactionStatus; amount_cents: number }, check: PaymentCheck): "already" | "paid" | "mismatch" | "pending" {
  if (tx.status === "paid") return "already";
  if (!check.success || !check.paid) return "pending";
  if (!Number.isInteger(check.amount) || (check.amount as number) < tx.amount_cents) return "mismatch";
  return "paid";
}

/** Rótulo da forma de pagamento gravado na parcela (e no recibo). */
export function methodLabel(flow: TransactionFlow, method?: string | null, installments?: number | null) {
  const parcel = installments && installments > 1 ? ` ${installments}x` : "";
  if (method === "pix") return "InfinitePay · Pix";
  if (method === "debit") return "InfinitePay · Cartão de Débito";
  if (method === "credit" || method === "credit_card") return `InfinitePay · Cartão de Crédito${parcel}`;
  return flow === "tap" ? "InfinitePay · Aproximação" : "InfinitePay · Checkout";
}

export const TX_STATUS_LABEL: Record<TransactionStatus, string> = {
  started: "Iniciado",
  link_created: "Link criado",
  awaiting_confirmation: "Aguardando confirmação",
  paid: "Pago",
  failed: "Falhou",
  cancelled: "Cancelado",
  amount_mismatch: "Valor divergente",
};

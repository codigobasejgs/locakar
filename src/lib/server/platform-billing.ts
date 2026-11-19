import "server-only";
import { randomBytes } from "node:crypto";
import { customerPayload, stateFromSnapshot, type PaymentSnapshot } from "@/lib/asaas";
import { checkoutPayload, decideCheckout, normalizeHandle } from "@/lib/infinitepay";
import { invoiceAmount, invoiceReference } from "@/lib/platform-billing";
import { PLATFORM } from "@/lib/platform";
import type { PlanRow } from "@/lib/plans";
import { asaasFetch, apiKeyFor, loadAsaasConfig, readyForCharges } from "./asaas";
import { createCheckoutLink, paymentCheck } from "./infinitepay";
import { globalDb, legacyOrgId, loadOrg, runWithOrg, siteUrl } from "./org-context";
import { loadSettings, serviceDb } from "./push";
import { HttpError } from "./supabase";

/**
 * Cobrança da assinatura Frota Easy. O dinheiro cai nas contas InfinitePay/Asaas já configuradas na locadora
 * padrão da plataforma (platform_config.default_organization_id); a locadora assinante é o cliente.
 * Valor sempre calculado aqui (plano + promoção vigente). Baixa só após consultar o provedor.
 */

type Provider = "infinitepay" | "asaas";

/** Roda `fn` com as credenciais de recebimento da plataforma. */
async function asPlatform<T>(fn: () => Promise<T>): Promise<T> {
  const org = await loadOrg((await legacyOrgId()) ?? "");
  if (!org) throw new HttpError(503, "Recebimento da plataforma não configurado.");
  return runWithOrg({ org }, fn);
}

/** Meios de pagamento da assinatura disponíveis agora (conta da plataforma ligada e verificada). */
export async function billingProviders(): Promise<{ infinitepay: boolean; asaas: boolean }> {
  if (!process.env.SUPABASE_SECRET_KEY) return { infinitepay: false, asaas: false };
  return asPlatform(async () => {
    const db = serviceDb();
    const [s, cfg] = await Promise.all([loadSettings(db), loadAsaasConfig(db)]);
    return { infinitepay: Boolean(s.infinitepay?.enabled && normalizeHandle(s.infinitepay.handle ?? "")), asaas: readyForCharges(cfg) };
  });
}

async function planOf(planId: string): Promise<PlanRow> {
  const { data } = await globalDb().from("plans").select("id,name,price_cents,promo_price_cents,promo_active,promo_label,promo_ends_at,highlight,sort,entitlements,active").eq("id", planId).maybeSingle();
  if (!data || data.active === false) throw new HttpError(404, "Plano indisponível.");
  return data as PlanRow;
}

/** Cria (ou reaproveita) a fatura do mês do plano e devolve o link de pagamento. */
export async function createPlanInvoice(p: { orgId: string; planId: string; provider: Provider; userId: string }) {
  const g = globalDb();
  const [plan, org] = await Promise.all([planOf(p.planId), loadOrg(p.orgId)]);
  if (!org) throw new HttpError(404, "Locadora não encontrada.");
  if (org.status === "cancelled") throw new HttpError(409, "Locadora cancelada. Fale com o suporte.");
  const amount = invoiceAmount(plan);
  if (amount == null) throw new HttpError(422, "Este plano não é cobrável.");

  // Fatura em aberto igual (mesmo plano, valor e meio): reaproveita o link.
  const { data: open } = await g
    .from("platform_invoices")
    .select("id,checkout_url")
    .eq("organization_id", org.id)
    .eq("plan_id", plan.id)
    .eq("provider", p.provider)
    .eq("amount_cents", amount)
    .eq("status", "pending")
    .not("checkout_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (open?.checkout_url) return { id: open.id as string, url: open.checkout_url as string, amountCents: amount };

  const token = randomBytes(24).toString("base64url");
  const { data: inv, error } = await g
    .from("platform_invoices")
    .insert({ organization_id: org.id, plan_id: plan.id, amount_cents: amount, provider: p.provider, webhook_token: token, created_by: p.userId })
    .select("id")
    .single();
  if (error || !inv) throw new HttpError(500, "Não foi possível registrar a fatura.");
  const description = `${PLATFORM.name} · Plano ${plan.name} · 30 dias · ${org.name}`;

  try {
    const url = await asPlatform(async () => {
      const db = serviceDb();
      if (p.provider === "infinitepay") {
        const s = await loadSettings(db);
        const handle = normalizeHandle(s.infinitepay?.handle ?? "");
        if (!s.infinitepay?.enabled || !handle) throw new HttpError(409, "InfinitePay da plataforma desativada.");
        const link = await createCheckoutLink(
          checkoutPayload({
            handle,
            orderNsu: inv.id,
            items: [{ quantity: 1, price: amount, description }],
            redirectUrl: `${siteUrl()}/admin/assinatura?fatura=${inv.id}`,
            webhookUrl: `${siteUrl()}/api/webhooks/platform-billing?o=${inv.id}&t=${token}`,
            customer: { name: org.legal_name || org.name, email: org.email ?? undefined, phone: org.whatsapp || org.phone || undefined },
          }),
        );
        await g.from("platform_invoices").update({ checkout_url: link.url, invoice_slug: link.slug, handle }).eq("id", inv.id);
        return link.url;
      }
      const cfg = await loadAsaasConfig(db);
      if (!readyForCharges(cfg)) throw new HttpError(409, "Asaas da plataforma não está pronto.");
      const key = apiKeyFor(cfg);
      const env = cfg.environment;
      // Cliente Asaas = a locadora (CNPJ/CPF obrigatório pelo Asaas). Busca por documento antes de criar.
      const body = customerPayload({ id: org.id, name: org.legal_name || org.name, cpf: org.document, email: org.email, phone: org.whatsapp || org.phone, cep: org.cep }, true);
      const found = await asaasFetch<{ data?: { id: string; deleted?: boolean }[] }>(env, key, "GET", `/customers?cpfCnpj=${body.cpfCnpj}&limit=10`);
      const customer = found.data?.find((c) => !c.deleted)?.id ?? (await asaasFetch<{ id: string }>(env, key, "POST", "/customers", body)).id;
      const due = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
      const pay = await asaasFetch<{ id: string; invoiceUrl?: string }>(env, key, "POST", "/payments", {
        customer,
        billingType: "UNDEFINED", // a locadora escolhe Pix, boleto ou cartão na fatura do Asaas
        value: amount / 100,
        dueDate: due,
        description,
        externalReference: invoiceReference(inv.id),
      });
      if (!pay.invoiceUrl) throw new HttpError(502, "O Asaas não devolveu o link da fatura.");
      await g.from("platform_invoices").update({ checkout_url: pay.invoiceUrl, provider_payment_id: pay.id }).eq("id", inv.id);
      return pay.invoiceUrl;
    });
    return { id: inv.id as string, url, amountCents: amount };
  } catch (e) {
    const message = (e as Error).message;
    await g.from("platform_invoices").update({ status: "failed", last_error: message.slice(0, 300) }).eq("id", inv.id);
    throw e instanceof HttpError ? e : new HttpError(502, message);
  }
}

/** Baixa atômica + período +30 dias. Retorna o novo fim do período (null = já estava paga). */
async function settle(id: string) {
  const { data, error } = await globalDb().rpc("platform_invoice_paid", { p_id: id });
  if (error) throw new Error(`Baixa da fatura: ${error.message}`);
  return (data as string | null) ?? null;
}

/** InfinitePay: confirma só depois do payment_check (servidor → InfinitePay). */
export async function reconcileInfinitePayInvoice(input: { id: string; transactionNsu: string; slug: string }) {
  const g = globalDb();
  const { data: inv } = await g.from("platform_invoices").select("id,status,amount_cents,handle,provider").eq("id", input.id).maybeSingle();
  if (!inv || inv.provider !== "infinitepay") return "unknown" as const;
  if (inv.status === "paid") return "already" as const;
  if (!inv.handle || !input.transactionNsu || !input.slug) return "pending" as const;
  const check = await paymentCheck({ handle: inv.handle, order_nsu: inv.id, transaction_nsu: input.transactionNsu, slug: input.slug });
  const decision = decideCheckout({ status: inv.status === "pending" ? "link_created" : "failed", amount_cents: inv.amount_cents }, check);
  if (decision === "paid") {
    await g.from("platform_invoices").update({ transaction_nsu: input.transactionNsu, invoice_slug: input.slug }).eq("id", inv.id);
    return (await settle(inv.id)) ? ("paid" as const) : ("already" as const);
  }
  if (decision === "mismatch") await g.from("platform_invoices").update({ last_error: `Valor pago ${check.amount} menor que ${inv.amount_cents}.` }).eq("id", inv.id);
  return decision;
}

/** Asaas: evento de cobrança da assinatura (externalReference frotaeasy-inv:). Consulta a cobrança antes de baixar. */
export async function reconcileAsaasInvoice(invoiceId: string, snapshot: PaymentSnapshot) {
  const g = globalDb();
  const { data: inv } = await g.from("platform_invoices").select("id,status,amount_cents,provider_payment_id").eq("id", invoiceId).eq("provider", "asaas").maybeSingle();
  if (!inv) return "unknown" as const;
  if (inv.status === "paid") return "already" as const;
  const paymentId = inv.provider_payment_id ?? snapshot.id;
  const live = await asPlatform(async () => {
    const cfg = await loadAsaasConfig(serviceDb());
    if (!cfg) throw new Error("Asaas da plataforma ausente.");
    return asaasFetch<PaymentSnapshot>(cfg.environment, apiKeyFor(cfg), "GET", `/payments/${encodeURIComponent(paymentId)}`);
  });
  if (stateFromSnapshot(live) !== "paid") return "pending" as const;
  if (Math.round((live.value ?? 0) * 100) < inv.amount_cents) {
    await g.from("platform_invoices").update({ last_error: "Valor pago menor que o da fatura." }).eq("id", inv.id);
    return "mismatch" as const;
  }
  return (await settle(inv.id)) ? ("paid" as const) : ("already" as const);
}

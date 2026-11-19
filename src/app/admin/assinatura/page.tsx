"use client";

import { CheckCircle2, CreditCard, ExternalLink, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useOrganization } from "@/hooks/use-organization";
import { daysToRenew } from "@/lib/platform-billing";
import { brl, planPrice, type PlanRow } from "@/lib/plans";
import { can } from "@/lib/permissions";
import { PLATFORM } from "@/lib/platform";
import { formatDate } from "@/lib/utils";

interface Invoice { id: string; plan_id: string; amount_cents: number; provider: "infinitepay" | "asaas"; status: string; checkout_url: string | null; paid_at: string | null; period_end: string | null; created_at: string }
interface Data {
  subscription: { plan_id: string; trial_ends_at: string | null; current_period_end: string | null } | null;
  plans: PlanRow[];
  invoices: Invoice[];
  providers: { infinitepay: boolean; asaas: boolean };
}

const PROVIDER = { infinitepay: "InfinitePay · Pix ou cartão", asaas: "Asaas · Pix, boleto ou cartão" } as const;
const INV_STATUS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  pending: { label: "Aguardando pagamento", tone: "warning" },
  paid: { label: "Paga", tone: "success" },
  failed: { label: "Falhou", tone: "danger" },
  cancelled: { label: "Cancelada", tone: "neutral" },
};

/** Assinatura da locadora no Frota Easy: escolher plano, pagar (InfinitePay ou Asaas) e ver faturas. */
export default function AssinaturaPage() {
  const { role, status, reload } = useOrganization();
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const canPay = can(role ?? undefined, "settings");

  const load = useCallback(async () => {
    const res = await fetch("/api/billing", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(json.error || "Não foi possível carregar a assinatura.");
    setData(json);
  }, []);

  // Volta do checkout InfinitePay (?fatura=&transaction_nsu=&slug=): o servidor confirma no payment_check.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const invoiceId = q.get("fatura");
    const check = invoiceId
      ? fetch("/api/billing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "check", invoiceId, transactionNsu: q.get("transaction_nsu"), slug: q.get("slug") }) })
          .then((r) => r.json())
          .then((j) => {
            if (j.decision === "paid" || j.decision === "already") {
              toast.success("Pagamento confirmado! Sua assinatura foi renovada.");
              reload();
            } else toast.info("Pagamento em processamento. Assim que confirmar, a assinatura é renovada sozinha.");
            window.history.replaceState(null, "", "/admin/assinatura");
          })
          .catch(() => {})
      : Promise.resolve();
    check.finally(load);
  }, [load, reload]);

  const pay = async (planId: string, provider: "infinitepay" | "asaas") => {
    setBusy(`${planId}:${provider}`);
    try {
      const res = await fetch("/api/billing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "checkout", planId, provider }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Não foi possível gerar o pagamento.");
      window.location.assign(json.url);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(null);
    }
  };

  if (!data) return <div className="h-64 animate-pulse rounded-2xl bg-white/[0.04]" />;
  const sub = data.subscription;
  const current = data.plans.find((p) => p.id === sub?.plan_id);
  const days = daysToRenew(sub?.current_period_end ?? null);
  const trialDays = daysToRenew(sub?.trial_ends_at ?? null);
  const anyProvider = data.providers.infinitepay || data.providers.asaas;

  return (
    <>
      <PageHeader title="Assinatura" description={`Seu plano ${PLATFORM.name}, pagamento e faturas.`} />

      <section className="mb-6 grid gap-3 rounded-2xl border border-line bg-surface p-5 sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted">Plano atual</p>
          <p className="mt-1 font-display text-xl font-semibold">{current?.name ?? (sub?.plan_id === "trial" ? "Teste grátis" : sub?.plan_id ?? "—")}</p>
        </div>
        <div>
          <p className="text-xs text-muted">{sub?.current_period_end ? "Pago até" : "Teste grátis até"}</p>
          <p className="mt-1 font-semibold">{formatDate((sub?.current_period_end ?? sub?.trial_ends_at ?? "").slice(0, 10)) || "—"}</p>
          {(days ?? trialDays) != null && <p className="text-xs text-muted">{(days ?? trialDays)! >= 0 ? `faltam ${days ?? trialDays} dia(s)` : "vencido"}</p>}
        </div>
        <div>
          <p className="text-xs text-muted">Situação</p>
          <p className="mt-1">
            <Badge tone={status === "active" ? "success" : status === "trial" ? "warning" : "danger"}>
              {status === "active" ? "Ativa" : status === "trial" ? "Em teste" : status === "past_due" ? "Pagamento pendente" : status === "suspended" ? "Suspensa" : "—"}
            </Badge>
          </p>
        </div>
      </section>

      {!canPay && <p className="mb-4 rounded-xl border border-line bg-surface p-4 text-sm text-muted">Somente o proprietário ou um administrador pode pagar a assinatura.</p>}
      {canPay && !anyProvider && <p className="mb-4 rounded-xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm text-amber-200">Pagamento online indisponível no momento. Fale com a equipe {PLATFORM.name} no WhatsApp {PLATFORM.whatsapp.display}.</p>}

      <div className="grid gap-4 lg:grid-cols-3">
        {data.plans.map((p) => {
          const price = planPrice(p);
          return (
            <article key={p.id} className={`flex flex-col rounded-2xl border bg-surface p-5 ${p.highlight ? "border-[#a64dff]/60" : "border-line"}`}>
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-lg font-semibold">{p.name}</h2>
                {sub?.plan_id === p.id && <Badge tone="success">Seu plano</Badge>}
              </div>
              {price.fromCents != null && <p className="mt-3 text-xs text-muted">De <s>{brl(price.fromCents)}</s> por</p>}
              <p className="mt-1 text-3xl font-bold">{brl(price.cents)}<span className="text-sm font-medium text-muted">/mês</span></p>
              {price.promo && p.promo_label && <p className="mt-1 text-xs text-brand-soft">{p.promo_label}</p>}
              {canPay && (
                <div className="mt-5 grid gap-2">
                  {(["infinitepay", "asaas"] as const).filter((k) => data.providers[k]).map((k) => (
                    <Button key={k} variant={p.highlight ? "primary" : "outline"} disabled={!!busy} onClick={() => pay(p.id, k)}>
                      {busy === `${p.id}:${k}` ? <Loader2 className="animate-spin" /> : <CreditCard />} Pagar com {PROVIDER[k]}
                    </Button>
                  ))}
                </div>
              )}
              <p className="mt-3 text-[11px] text-muted">Cada pagamento libera 30 dias. Pagando antes do vencimento, os dias se somam.</p>
            </article>
          );
        })}
      </div>

      <section className="mt-8 rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold">Faturas</h2>
        {!data.invoices.length ? (
          <p className="mt-3 text-sm text-muted">Nenhuma fatura ainda.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line text-sm">
            {data.invoices.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span>
                  <span className="font-medium">{data.plans.find((p) => p.id === i.plan_id)?.name ?? i.plan_id} · {brl(i.amount_cents)}</span>
                  <span className="block text-xs text-muted">{formatDate(i.created_at.slice(0, 10))} · {i.provider === "asaas" ? "Asaas" : "InfinitePay"}{i.period_end ? ` · válido até ${formatDate(i.period_end.slice(0, 10))}` : ""}</span>
                </span>
                <span className="flex items-center gap-2">
                  <Badge tone={INV_STATUS[i.status]?.tone ?? "neutral"}>{i.status === "paid" && <CheckCircle2 className="size-3" />} {INV_STATUS[i.status]?.label ?? i.status}</Badge>
                  {i.status === "pending" && i.checkout_url && (
                    <a href={i.checkout_url} className="inline-flex items-center gap-1 text-xs text-brand-soft underline" target="_blank" rel="noopener noreferrer">
                      Pagar <ExternalLink className="size-3" />
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

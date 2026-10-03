import type { Metadata } from "next";
import { CheckCircle2, Clock, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { WhatsAppIcon } from "@/components/ui/whatsapp-icon";
import { reconcileCheckout } from "@/lib/server/infinitepay";
import { serviceDb } from "@/lib/server/push";
import { brand, globalDb, runWithOrg, loadOrg } from "@/lib/server/org-context";
import { isValidOrderId } from "@/lib/infinitepay";

export const metadata: Metadata = {
  title: "Pagamento",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.slice(0, 200) : "");

/**
 * Retorno do Checkout InfinitePay (redirect_url). Os parâmetros da URL NÃO confirmam nada sozinhos:
 * o servidor consulta o payment_check e só então quita a parcela (o webhook faz o mesmo em paralelo).
 */
export default async function InfinitePayReturn({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const receiptUrl = one(q.receipt_url);
  const orderNsu = one(q.order_nsu);
  // Locadora: a do pedido interno (id gerado por nós). Sem pedido válido, nada é consultado.
  const { data: owner } =
    process.env.SUPABASE_SECRET_KEY && isValidOrderId(orderNsu)
      ? await globalDb().from("payment_transactions").select("organization_id").eq("id", orderNsu).eq("flow", "checkout").maybeSingle()
      : { data: null };
  const org = owner ? await loadOrg(owner.organization_id as string) : null;
  const { decision, company } = org
    ? await runWithOrg({ org }, async () => ({
        decision: await reconcileCheckout(serviceDb(), { orderNsu, transactionNsu: one(q.transaction_nsu), slug: one(q.slug), receiptUrl }).catch(() => "unknown" as const),
        company: brand(),
      }))
    : { decision: "unknown" as const, company: null };
  const paid = decision === "paid" || decision === "already";
  const name = company?.name ?? "locadora";
  const whatsapp = company?.whatsapp ? `https://wa.me/${company.whatsapp}?text=${encodeURIComponent(`Olá, ${name}! Acabei de pagar pelo link da InfinitePay.`)}` : null;

  return (
    <main className="grid min-h-dvh place-items-center bg-ink px-4 py-10 text-center">
      <div className="w-full max-w-md">
        {/* eslint-disable-next-line @next/next/no-img-element -- logo da locadora vem do bucket público */}
        {company ? <img src={company.logo} alt={name} className="mx-auto h-14 w-auto max-w-40 object-contain" /> : <Logo className="mx-auto w-36" />}
        <div className="mt-10 rounded-2xl border border-line bg-surface p-6">
          {paid ? <CheckCircle2 className="mx-auto size-10 text-emerald-400" aria-hidden /> : <Clock className="mx-auto size-10 text-amber-300" aria-hidden />}
          <h1 className="mt-4 font-display text-xl font-semibold text-white">{paid ? "Pagamento confirmado" : "Pagamento em processamento"}</h1>
          <p className="mt-2 text-sm text-zinc-400">
            {paid
              ? `Obrigado! A parcela da sua locação já consta como paga na ${name}.`
              : "Recebemos seu retorno. Assim que a InfinitePay confirmar, a parcela é baixada e você recebe a confirmação por e-mail e notificação."}
          </p>
          <div className="mt-6 grid gap-2">
            {/^https:\/\//.test(receiptUrl) && (
              <Button asChild variant="outline">
                <a href={receiptUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink /> Ver comprovante
                </a>
              </Button>
            )}
            <Button asChild>
              <a href={company?.slug ? `/locatario/pagamentos?org=${company.slug}` : "/locatario/pagamentos"}>Voltar ao app</a>
            </Button>
            {whatsapp && (
              <Button asChild variant="ghost">
                <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                  <WhatsAppIcon className="size-4" /> Falar com a {name}
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

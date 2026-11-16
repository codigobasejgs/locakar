import type { Metadata } from "next";
import { CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { WhatsAppIcon } from "@/components/ui/whatsapp-icon";
import { GATEWAYS, isGateway } from "@/lib/gateways";
import { reconcileGateway } from "@/lib/server/gateways";
import { brand, globalDb, loadOrg, runWithOrg } from "@/lib/server/org-context";
import { serviceDb } from "@/lib/server/push";

export const metadata: Metadata = { title: "Pagamento", robots: { index: false, follow: false }, referrer: "no-referrer" };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.slice(0, 200) : "");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Retorno de Mercado Pago, PagBank e Pagar.me. Os parâmetros da URL não confirmam nada:
 * o servidor consulta o gateway e só então baixa a parcela (o webhook faz o mesmo em paralelo).
 */
export default async function GatewayReturn({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const g = one(q.g);
  const ref = one(q.ref);
  // Mercado Pago devolve o id do pagamento (payment_id / collection_id): acelera a consulta.
  const hint = /^\d{1,20}$/.test(one(q.payment_id)) ? one(q.payment_id) : /^\d{1,20}$/.test(one(q.collection_id)) ? one(q.collection_id) : null;
  const { data: owner } =
    process.env.SUPABASE_SECRET_KEY && isGateway(g) && UUID.test(ref)
      ? await globalDb().from("payment_transactions").select("organization_id").eq("id", ref).eq("provider", g).maybeSingle()
      : { data: null };
  const org = owner ? await loadOrg(owner.organization_id as string) : null;
  const { decision, company } = org && isGateway(g)
    ? await runWithOrg({ org }, async () => ({
        decision: await reconcileGateway(serviceDb(), g, ref, g === "mercadopago" ? hint : null).catch(() => "unknown" as const),
        company: brand(),
      }))
    : { decision: "unknown" as const, company: null };
  const paid = decision === "paid" || decision === "already";
  const name = company?.name ?? "locadora";
  const gw = isGateway(g) ? GATEWAYS[g].label.replace(/ \(.*\)$/, "") : "gateway";
  const whatsapp = company?.whatsapp ? `https://wa.me/${company.whatsapp}?text=${encodeURIComponent(`Olá, ${name}! Acabei de pagar pelo link (${gw}).`)}` : null;

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
              : `Assim que o ${gw} confirmar (Pix na hora; boleto em até 3 dias úteis), a parcela é baixada e você recebe a confirmação por e-mail e notificação.`}
          </p>
          <div className="mt-6 grid gap-2">
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

"use client";

import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

interface Result {
  id: string;
  status: string;
  warning?: string | null;
  amountCents?: number;
  nsu?: string | null;
  aut?: string | null;
  cardBrand?: string | null;
  error?: string;
}

/**
 * result_url do InfiniteTap: o app InfinitePay volta para cá com order_id, nsu, aut, card_brand...
 * O retorno só registra a tentativa ("aguardando confirmação"); a baixa exige a confirmação da equipe.
 */
export default function InfiniteTapResultPage() {
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = Object.fromEntries(new URLSearchParams(window.location.search));
    let alive = true;
    fetch("/api/payments/infinitepay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "tap.result", params }) })
      .then((r) => r.json())
      .then((json: Result) => alive && setResult(json))
      .catch(() => alive && setResult({ id: "", status: "error", error: "Sem conexão. Abra de novo o retorno do InfinitePay." }));
    return () => {
      alive = false;
    };
  }, []);

  const confirm = async () => {
    if (!result?.id) return;
    setBusy(true);
    const res = await fetch("/api/payments/infinitepay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "tap.confirm", id: result.id }) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return void toast.error(json.error ?? "Não foi possível confirmar.");
    setResult({ ...result, status: "paid" });
    toast.success("Pagamento confirmado e parcela baixada.");
  };

  const status = result?.error ? "error" : result?.status;

  return (
    <>
      <PageHeader title="Retorno do InfinitePay" description="Resultado do pagamento por aproximação (InfiniteTap)." />
      <Card className="mx-auto max-w-lg p-6 text-center">
        {!result ? (
          <p className="text-sm text-muted">Registrando o retorno do InfinitePay…</p>
        ) : status === "paid" ? (
          <>
            <CheckCircle2 className="mx-auto size-10 text-emerald-400" aria-hidden />
            <h2 className="mt-3 font-display text-lg font-semibold">Pagamento confirmado</h2>
            <p className="mt-1 text-sm text-muted">A parcela foi baixada e o cliente foi avisado.</p>
          </>
        ) : status === "awaiting_confirmation" ? (
          <>
            <Clock className="mx-auto size-10 text-amber-300" aria-hidden />
            <h2 className="mt-3 font-display text-lg font-semibold">Aprovado no InfinitePay — confira e confirme</h2>
            <dl className="mt-4 grid grid-cols-2 gap-2 text-left text-sm">
              {result.amountCents ? (<><dt className="text-muted">Valor</dt><dd className="font-semibold">{formatCurrency(result.amountCents / 100)}</dd></>) : null}
              {result.nsu && (<><dt className="text-muted">NSU</dt><dd className="break-all font-mono text-xs">{result.nsu}</dd></>)}
              {result.aut && (<><dt className="text-muted">Autorização</dt><dd className="font-mono">{result.aut}</dd></>)}
              {result.cardBrand && (<><dt className="text-muted">Bandeira</dt><dd className="capitalize">{result.cardBrand}</dd></>)}
            </dl>
            <p className="mt-4 text-xs text-muted">Confira no app InfinitePay (Vendas) que a venda com este NSU está aprovada antes de confirmar.</p>
            <Button className="mt-4 w-full" disabled={busy} onClick={confirm}>
              <CheckCircle2 /> {busy ? "Confirmando…" : "Confirmar e dar baixa na parcela"}
            </Button>
          </>
        ) : (
          <>
            <AlertTriangle className="mx-auto size-10 text-red-400" aria-hidden />
            <h2 className="mt-3 font-display text-lg font-semibold">Pagamento não concluído</h2>
            <p className="mt-1 text-sm text-muted">{result.error ?? result.warning ?? "O InfinitePay não retornou uma venda aprovada."}</p>
          </>
        )}
        <Button asChild variant="outline" className="mt-4 w-full">
          <Link href="/admin/pagamentos">Voltar aos pagamentos</Link>
        </Button>
      </Card>
    </>
  );
}

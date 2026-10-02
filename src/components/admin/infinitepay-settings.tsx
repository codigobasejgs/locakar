"use client";

import { Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { TX_STATUS_LABEL, normalizeHandle, type InfinitePaySettings, type TransactionStatus } from "@/lib/infinitepay";
import { isSupabaseEnabled } from "@/lib/supabase/env";
import { formatCurrency, maskCNPJ, maskCPF, onlyDigits } from "@/lib/utils";

interface Status {
  state: "disabled" | "configured" | "incomplete";
  handle: string;
  webhookUrl: string;
  redirectUrl: string;
  tapResultUrl: string;
  lastTransaction: { flow: string; status: TransactionStatus; amount_cents: number; created_at: string } | null;
  lastWebhookAt: string | null;
  lastError: { last_error: string; updated_at: string } | null;
}

const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

/**
 * Configurações → InfinitePay. Sem API key: o InfiniteTap usa o app InfinitePay logado no celular do operador
 * e o Checkout Integrado identifica a conta pela InfiniteTag (handle), conforme a documentação oficial.
 */
export function InfinitePaySettingsFields({ value, onChange }: { value: InfinitePaySettings; onChange: (v: InfinitePaySettings) => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const set = <K extends keyof InfinitePaySettings>(k: K, v: InfinitePaySettings[K]) => onChange({ ...value, [k]: v });
  const handleOk = !value.handle.trim() || Boolean(normalizeHandle(value.handle));
  const doc = onlyDigits(value.docNumber);

  useEffect(() => {
    if (!isSupabaseEnabled) return;
    let alive = true;
    fetch("/api/payments/infinitepay?view=status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Status | null) => alive && setStatus(j))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const copy = (text: string) => navigator.clipboard.writeText(text).then(() => toast.success("Copiado."), () => toast.error("Não foi possível copiar."));
  const saved = status?.state;
  const badge =
    saved === "configured" ? ["● Conectado", "text-emerald-300"] : saved === "incomplete" ? ["⚠ Configuração incompleta", "text-amber-300"] : ["○ Não configurado", "text-muted"];

  return (
    <>
      <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
        <span className={`font-semibold ${badge[1]}`}>{badge[0]}</span>
        <span className="text-xs text-muted">{status?.handle ? `Conta: $${status.handle}` : "Salve para aplicar"}</span>
      </div>

      <Field label="InfiniteTag (handle)" htmlFor="ip-handle" hint={handleOk ? "Seu usuário no app InfinitePay, sem o $" : "InfiniteTag inválida"}>
        <Input id="ip-handle" value={value.handle} onChange={(e) => set("handle", e.target.value)} placeholder="locakar" autoComplete="off" />
      </Field>
      <Field label="Modo" htmlFor="ip-mode">
        <Select
          id="ip-mode"
          value={value.mode}
          onChange={(e) => set("mode", e.target.value as InfinitePaySettings["mode"])}
          options={[
            { value: "both", label: "Ambos (aproximação e link)" },
            { value: "tap", label: "Somente InfiniteTap (aproximação)" },
            { value: "checkout", label: "Somente Checkout (link Pix / cartão)" },
          ]}
        />
      </Field>
      <Field label="CNPJ/CPF da conta InfinitePay" htmlFor="ip-doc" hint="Opcional: o app confere se o operador está logado na conta certa">
        <Input
          id="ip-doc"
          inputMode="numeric"
          value={doc.length > 11 ? maskCNPJ(doc) : maskCPF(doc)}
          onChange={(e) => set("docNumber", onlyDigits(e.target.value).slice(0, 14))}
          placeholder="00.000.000/0000-00"
        />
      </Field>
      <div className="flex items-end">
        <Checkbox
          label="Aproximação só na conta da empresa (envia InfiniteTag/CNPJ ao app)"
          checked={value.tapCheckAccount}
          onChange={(e) => set("tapCheckAccount", e.target.checked)}
        />
      </div>

      {status && (
        <div className="sm:col-span-2 grid gap-2 text-xs">
          {[
            ["Webhook (enviado em cada link)", status.webhookUrl],
            ["Retorno do cliente (redirect_url)", status.redirectUrl],
            ["Retorno do InfiniteTap (result_url)", status.tapResultUrl],
          ].map(([label, url]) => (
            <div key={label} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
              <div className="min-w-0">
                <p className="text-muted">{label}</p>
                <p className="break-all font-mono text-zinc-300">{url}</p>
              </div>
              <button type="button" onClick={() => copy(url)} className="shrink-0 text-muted hover:text-white" aria-label={`Copiar ${label}`}>
                <Copy className="size-4" />
              </button>
            </div>
          ))}
          <p className="text-muted">
            Última transação:{" "}
            {status.lastTransaction
              ? `${status.lastTransaction.flow === "tap" ? "Aproximação" : "Checkout"} · ${formatCurrency(status.lastTransaction.amount_cents / 100)} · ${TX_STATUS_LABEL[status.lastTransaction.status]} · ${when(status.lastTransaction.created_at)}`
              : "nenhuma"}
            {" · "}Último webhook: {status.lastWebhookAt ? when(status.lastWebhookAt) : "nenhum"}
          </p>
          {status.lastError && <p className="text-red-400">Último erro ({when(status.lastError.updated_at)}): {status.lastError.last_error}</p>}
        </div>
      )}
      <p className="sm:col-span-2 text-xs text-muted">
        Nenhuma chave de API é necessária. Para o link de pagamento, ative o &quot;Checkout externo&quot; no app/portal InfinitePay. Para a aproximação, o operador precisa do app InfinitePay instalado e logado no celular.
      </p>
    </>
  );
}

"use client";

import { CheckCircle2, FileSignature, ShieldCheck } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { Logo } from "@/components/ui/logo";
import { SelfieCapture } from "@/components/ui/selfie-capture";
import { SignaturePad } from "@/components/ui/signature-pad";
import { WhatsAppIcon } from "@/components/ui/whatsapp-icon";
import { COMPANY } from "@/lib/company";
import { getSupabase } from "@/lib/supabase/client";
import { maskCPF } from "@/lib/utils";
import { getWhatsAppUrl } from "@/lib/whatsapp";

interface View {
  status: "pending" | "signed" | "cancelled";
  content: string;
  contentHash: string;
  clientName: string;
  companySigner?: string;
  expiresAt?: string;
  signedName?: string;
  signedAt?: string;
}

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short" }) : "");

/** Página pública de assinatura. O acesso é pelo token do link; o CPF confirma a identidade. */
export default function SignPage() {
  const { token } = useParams<{ token: string }>();
  const [view, setView] = useState<View | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSupabase()
      .rpc("contract_for_signing", { p_token: token })
      .then(({ data }) => {
        const v = (data as View | null) ?? null;
        setView(v);
        if (v) setName(v.clientName);
      });
  }, [token]);

  const expired = !!view?.expiresAt && new Date(view.expiresAt) < new Date();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selfie) return setError("Tire a selfie para confirmar sua identidade.");
    if (!signature) return setError("Desenhe sua assinatura no quadro.");
    setSending(true);
    setError(null);
    const res = await fetch("/api/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, name, cpf, signature, selfie, accepted }),
    });
    const json = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) return setError(json.error ?? "Não foi possível assinar. Tente novamente.");
    setView((v) => (v ? { ...v, status: "signed", signedName: name, signedAt: new Date().toISOString() } : v));
  };

  return (
    <main className="min-h-dvh bg-ink px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 flex items-center justify-between">
          <Logo priority className="w-28" />
          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
            <ShieldCheck className="size-4 text-brand-soft" aria-hidden /> Assinatura eletrônica
          </span>
        </header>

        {view === undefined && <div className="h-96 animate-pulse rounded-2xl bg-white/[0.04]" aria-busy="true" aria-label="Carregando contrato" />}

        {view === null && (
          <Message title="Contrato não encontrado" text="O link pode estar incompleto. Confira o e-mail recebido ou fale com a LOCAKAR." />
        )}

        {view && view.status === "cancelled" && (
          <Message title="Contrato cancelado" text="Este contrato foi cancelado pela locadora. Fale com a LOCAKAR para receber um novo link." />
        )}

        {view && view.status === "signed" && (
          <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.06] p-6 text-center sm:p-8">
            <CheckCircle2 className="mx-auto size-12 text-emerald-300" aria-hidden />
            <h1 className="mt-4 font-display text-2xl font-semibold">Contrato assinado</h1>
            <p className="mt-2 text-sm text-zinc-300">
              Assinado por <strong>{view.signedName}</strong> em {when(view.signedAt)}.
            </p>
            <p className="mt-1 text-sm text-zinc-400">A via assinada foi enviada para o seu e-mail cadastrado.</p>
          </div>
        )}

        {view && view.status === "pending" && expired && (
          <Message title="Link expirado" text="O prazo para assinatura terminou. Fale com a LOCAKAR para receber um novo link." />
        )}

        {view && view.status === "pending" && !expired && (
          <>
            <h1 className="flex items-center gap-2 font-display text-2xl font-semibold">
              <FileSignature className="size-6 text-brand-soft" aria-hidden /> Contrato de locação
            </h1>
            <p className="mt-1 text-sm text-muted">Leia todo o contrato antes de assinar.</p>

            <article
              tabIndex={0}
              aria-label="Texto do contrato"
              className="mt-4 max-h-[55vh] overflow-y-auto whitespace-pre-wrap rounded-2xl border border-line bg-white p-5 text-sm leading-relaxed text-zinc-900 sm:p-6"
            >
              {view.content}
            </article>
            <p className="mt-2 break-all text-[11px] text-zinc-500">Código de integridade (SHA-256): {view.contentHash}</p>

            <form onSubmit={submit} className="mt-6 space-y-5 rounded-2xl border border-line bg-panel p-5 sm:p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nome completo" htmlFor="s-name" required>
                  <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={5} autoComplete="name" />
                </Field>
                <Field label="CPF" htmlFor="s-cpf" required hint="Confirme o CPF informado no contrato">
                  <Input id="s-cpf" value={cpf} onChange={(e) => setCpf(maskCPF(e.target.value))} required inputMode="numeric" placeholder="000.000.000-00" />
                </Field>
              </div>
              <SelfieCapture onChange={setSelfie} />
              <SignaturePad onChange={setSignature} label="Sua assinatura" />
              <Checkbox
                label="Li e concordo com todas as cláusulas deste contrato e reconheço a validade desta assinatura eletrônica."
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                required
              />
              {error && (
                <p role="alert" className="rounded-xl border border-red-400/25 bg-red-400/[0.08] px-3 py-2 text-sm text-red-200">
                  {error}
                </p>
              )}
              <Button type="submit" size="lg" className="w-full" disabled={sending || !accepted || !selfie || !signature}>
                {sending ? "Registrando assinatura..." : "Assinar contrato"}
              </Button>
              <p className="text-xs text-zinc-500">Registramos selfie, data, hora, IP e navegador para comprovar a assinatura.</p>
            </form>
          </>
        )}

        <p className="mt-8 text-center text-sm">
          <a href={getWhatsAppUrl("Olá, LOCAKAR! Tenho uma dúvida sobre o meu contrato.")} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white">
            <WhatsAppIcon className="size-4 text-[#25D366]" /> Dúvidas? {COMPANY.whatsapp.display}
          </a>
        </p>
      </div>
    </main>
  );
}

function Message({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-8 text-center">
      <h1 className="font-display text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted">{text}</p>
    </div>
  );
}

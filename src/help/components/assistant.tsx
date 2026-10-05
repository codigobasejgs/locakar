"use client";

import { Bot, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useHelp } from "@/help/components/context";

/** Pergunta em linguagem natural. Só aparece se a locadora tem IA configurada; a busca comum não depende dele. */
export function HelpAssistant() {
  const { access, base } = useHelp();
  const [enabled, setEnabled] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<{ answer: string; sources: { slug: string; title: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (access.audience !== "admin" || !access.role) return;
    let alive = true;
    fetch("/api/help/ask")
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((d) => alive && setEnabled(Boolean(d.enabled)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [access.audience, access.role]);

  if (!enabled) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim().length < 4 || busy) return;
    setBusy(true);
    setError(null);
    setReply(null);
    try {
      const r = await fetch("/api/help/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "O assistente está indisponível agora.");
      setReply(j);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Assistente" className="no-print rounded-2xl border border-line bg-surface p-5 space-y-3">
      <h2 className="flex items-center gap-2 font-semibold text-white"><Bot className="size-4 text-brand-soft" /> Pergunte ao assistente</h2>
      <p className="text-xs text-muted">Responde só com base nos tutoriais desta Central e mostra de onde tirou a resposta.</p>
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={300}
          placeholder="Ex.: meu cliente pagou e mandou comprovante, o que faço?"
          aria-label="Pergunta para o assistente"
          className="h-10 flex-1 rounded-xl border border-line-strong bg-panel px-3 text-sm text-white outline-none focus:border-brand-soft"
        />
        <Button type="submit" size="sm" disabled={busy || q.trim().length < 4}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : "Perguntar"}
        </Button>
      </form>
      {error && <p className="text-xs text-amber-300" role="alert">{error}</p>}
      {reply && (
        <div className="rounded-xl border border-line bg-panel p-4 text-sm text-zinc-200 space-y-2" aria-live="polite">
          <p className="whitespace-pre-line leading-relaxed">{reply.answer}</p>
          {reply.sources.length > 0 && (
            <div className="text-xs">
              <p className="text-muted">Baseado em:</p>
              <ul className="mt-1 space-y-0.5">
                {reply.sources.map((s) => (
                  <li key={s.slug}><Link href={`${base}/artigo/${s.slug}`} className="text-brand-soft hover:underline">• {s.title}</Link></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

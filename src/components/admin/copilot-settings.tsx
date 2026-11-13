"use client";

import { Bot, LogOut, Paperclip, RefreshCw, Send, Smartphone } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { isSupabaseEnabled } from "@/lib/supabase/env";

type Card = { text: string; buttons?: { id: string; title: string }[]; sections?: { rows: { id: string; title: string; description?: string }[] }[] };
interface State {
  config: { enabled: boolean; mode: "buttons" | "hybrid"; level: number; adminPhones: string[]; customerBot: boolean; customerRate: number };
  aiAvailable: boolean;
  session: { engine: boolean; state?: string; qr?: string | null; pairingCode?: string | null; me?: { id: string | null } | null; error?: string };
}

const LEVELS = [
  { value: "1", label: "1 — Básico: só consultas e relatórios" },
  { value: "2", label: "2 — Intermediário: + baixas, despesas e manutenções com confirmação" },
  { value: "3", label: "3 — Avançado: + áudio, foto e PDF de notas (IA)" },
];

async function api<T>(body?: object): Promise<T> {
  const res = await fetch("/api/copilot", body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Falha na operação.");
  return json as T;
}

/** Copiloto da locadora no WhatsApp (motor Whaileys). Independente da conexão de notificações (Evolution). */
export function CopilotSettings() {
  const [s, setS] = useState<State | null>(null);
  const [draft, setDraft] = useState<State["config"] | null>(null);
  const [phones, setPhones] = useState("");
  const [busy, setBusy] = useState(false);
  const [pairPhone, setPairPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Falha de carga vira aviso fixo no cartão (sem toast repetido a cada atualização).
  const load = useCallback(async () => {
    try {
      const j = await api<State>();
      setS(j);
      setError(null);
      setDraft((d) => d ?? j.config);
      setPhones((p) => p || j.config.adminPhones.join("\n"));
    } catch (e) { setError((e as Error).message); }
  }, []);

  useEffect(() => {
    if (!isSupabaseEnabled) return;
    let alive = true;
    const tick = async () => alive && (await load());
    tick();
    const id = setInterval(tick, s?.session.state === "open" || error ? 60_000 : 15_000);
    return () => { alive = false; clearInterval(id); };
  }, [load, s?.session.state, error]);

  const act = async (body: object, ok?: string) => {
    setBusy(true);
    try { await api(body); if (ok) toast.success(ok); await load(); }
    catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  };

  if (!isSupabaseEnabled) return <p className="text-sm text-muted sm:col-span-2">Disponível com o banco de dados conectado.</p>;
  if (error && !s) return <p className="text-sm text-amber-300 sm:col-span-2">Copiloto indisponível: {error}</p>;
  if (!s || !draft) return <div className="h-40 animate-pulse rounded-xl bg-white/[0.04] sm:col-span-2" aria-busy="true" aria-label="Carregando" />;
  const connected = s.session.state === "open";

  return (
    <div className="grid gap-5 sm:col-span-2">
      <p className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-xs text-amber-200">
        Use um número diferente do WhatsApp de notificações acima. O mesmo chip conectado nos dois motores ao mesmo tempo derruba as conexões.
      </p>

      {/* Sessão */}
      <div className="grid gap-3 md:grid-cols-[200px_1fr]">
        {!s.session.engine ? (
          <p className="text-sm text-amber-300 md:col-span-2">Motor do Copiloto não configurado no servidor (WHAILEYS_API_URL, WHAILEYS_API_KEY e WHAILEYS_WEBHOOK_SECRET).</p>
        ) : connected ? (
          <div className="flex items-center gap-3 md:col-span-2">
            <Smartphone className="size-8 text-emerald-300" aria-hidden />
            <div>
              <p className="flex items-center gap-2 font-medium">Copiloto conectado <Badge tone="success">Ativo</Badge></p>
              <p className="text-sm text-muted">{s.session.me?.id?.split(/[:@]/)[0] ?? "número conectado"} · abra a conversa com você mesmo e digite <strong>menu</strong>.</p>
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={busy} onClick={() => act({ action: "test" }, "Card de teste enviado ao seu WhatsApp.")}><Send /> Testar botões</Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => confirm("Desconectar o Copiloto deste WhatsApp?") && act({ action: "disconnect" }, "Copiloto desconectado.")}><LogOut /> Desconectar</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid aspect-square w-full max-w-48 place-items-center rounded-xl bg-white p-2">
              {s.session.qr ? (
                // eslint-disable-next-line @next/next/no-img-element -- QR em data URL gerado pelo motor
                <img src={s.session.qr} alt="QR Code para conectar o WhatsApp do Copiloto" className="size-full" />
              ) : <Bot className="size-10 text-zinc-400" aria-hidden />}
            </div>
            <div className="space-y-3 text-sm text-zinc-300">
              <p className="flex items-center gap-2 font-medium text-white">Conecte o WhatsApp do Copiloto <Badge tone="warning">{s.session.state === "connecting" ? "Aguardando leitura" : "Desconectado"}</Badge></p>
              {s.session.error && <p className="text-xs text-red-300">{s.session.error}</p>}
              <p>WhatsApp → Dispositivos conectados → Conectar dispositivo → leia o QR. Ou use o código de pareamento.</p>
              {s.session.pairingCode && <p className="font-mono text-lg tracking-widest text-white">{s.session.pairingCode}</p>}
              <div className="flex flex-wrap items-end gap-2">
                <Button variant="outline" size="sm" disabled={busy} onClick={() => act({ action: "connect" })}><RefreshCw /> Gerar QR Code</Button>
                <Input aria-label="Telefone para código de pareamento" placeholder="(11) 99999-9999" inputMode="tel" value={pairPhone} onChange={(e) => setPairPhone(e.target.value)} className="h-9 max-w-44" />
                <Button variant="ghost" size="sm" disabled={busy || !pairPhone} onClick={() => act({ action: "connect", phone: pairPhone })}>Código de pareamento</Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Configuração */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Checkbox label="Copiloto ativo (responde no WhatsApp)" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} className="sm:col-span-2" />
        <Field label="Nível de permissão" htmlFor="cp-level" hint="Validado no servidor: nível 1 nunca grava nada.">
          <Select id="cp-level" value={String(draft.level)} options={LEVELS} onChange={(e) => setDraft({ ...draft, level: Number(e.target.value) })} />
        </Field>
        <Field label="Modo de operação" htmlFor="cp-mode" hint={s.aiAvailable ? "Botões e listas nunca usam IA." : "Sem chave de IA: só menus e botões."}>
          <Select id="cp-mode" value={draft.mode} options={[{ value: "hybrid", label: "Híbrido: botões + IA só para áudio, foto, PDF e texto livre (recomendado)" }, { value: "buttons", label: "Somente botões e menus (zero IA)" }]} onChange={(e) => setDraft({ ...draft, mode: e.target.value as "buttons" | "hybrid" })} />
        </Field>
        <Field label="Gestores autorizados (um por linha)" htmlFor="cp-phones" className="sm:col-span-2" hint="Além da conversa com você mesmo, só estes números podem usar o Copiloto. Nenhum outro número recebe dados.">
          <Textarea id="cp-phones" value={phones} onChange={(e) => setPhones(e.target.value)} placeholder="(11) 99999-9999" />
        </Field>
        <div className="grid gap-3 rounded-xl border border-line p-4 sm:col-span-2">
          <Checkbox label="Autoatendimento de clientes neste número (pagar, 2ª via, locação e app oficial)" checked={draft.customerBot} onChange={(e) => setDraft({ ...draft, customerBot: e.target.checked })} />
          <p className="text-xs text-muted">Clientes e visitantes que escreverem para o número do Copiloto recebem menus com botões, sem IA. Gestores e a conversa com você mesmo continuam no Copiloto. Dados pessoais só após os 4 primeiros dígitos do CPF.</p>
          <Field label="Máximo de respostas por hora para cada cliente" htmlFor="cp-rate" hint="Protege o chip contra bloqueio (5 a 200).">
            <Input id="cp-rate" type="number" min={5} max={200} value={draft.customerRate} onChange={(e) => setDraft({ ...draft, customerRate: Number(e.target.value) })} className="max-w-32" />
          </Field>
        </div>
        <Button className="justify-self-start" disabled={busy} onClick={() => act({ action: "save", ...draft, adminPhones: phones.split(/[\n,;]/).map((p) => p.trim()).filter(Boolean) }, "Copiloto salvo.")}>Salvar Copiloto</Button>
      </div>

      <Simulator />
    </div>
  );
}

/** Simulador: mesmo fluxo do WhatsApp, sempre em modo de teste (nada é gravado nem enviado). */
function Simulator() {
  const [as, setAs] = useState<"manager" | "customer">("manager");
  const [customerPhone, setCustomerPhone] = useState("");
  const [log, setLog] = useState<{ me: boolean; text: string; card?: Card }[]>([]);
  const [session, setSession] = useState<unknown>(null);
  const [text, setText] = useState("menu");
  const [busy, setBusy] = useState(false);

  const send = async (body: Record<string, unknown>, label: string) => {
    setBusy(true);
    setLog((l) => [...l, { me: true, text: label }]);
    try {
      const j = await api<{ replies: Card[]; session: unknown }>({ action: "simulate", session, as, phone: customerPhone, ...body });
      setSession(j.session);
      setLog((l) => [...l, ...j.replies.map((c) => ({ me: false, text: c.text, card: c }))]);
    } catch (e) { setLog((l) => [...l, { me: false, text: `⚠️ ${(e as Error).message}` }]); }
    setBusy(false);
  };

  const file = async (f?: File) => {
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) return toast.error("Arquivo acima de 8 MB.");
    const kind = f.type.startsWith("audio/") ? "audio" : f.type === "application/pdf" ? "document" : f.type.startsWith("image/") ? "image" : null;
    if (!kind) return toast.error("Use áudio, foto (JPG/PNG) ou PDF.");
    const data = btoa(String.fromCharCode(...new Uint8Array(await f.arrayBuffer())));
    await send({ kind, mimetype: f.type, data }, `📎 ${f.name}`);
  };

  return (
    <div className="grid gap-3 rounded-xl border border-line p-4">
      <p className="text-sm font-semibold">Simulador <Badge tone="info">Teste — nada é gravado nem enviado</Badge></p>
      <div className="flex flex-wrap items-end gap-2">
        <Select aria-label="Simular como" value={as} options={[{ value: "manager", label: "Como gestor (Copiloto)" }, { value: "customer", label: "Como cliente (autoatendimento)" }]} onChange={(e) => { setAs(e.target.value as "manager" | "customer"); setLog([]); setSession(null); }} className="max-w-64" />
        {as === "customer" && <Input aria-label="Telefone do cliente para simular" placeholder="Telefone de um cliente cadastrado" inputMode="tel" value={customerPhone} onChange={(e) => { setCustomerPhone(e.target.value); setSession(null); }} className="max-w-60" />}
      </div>
      <div className="max-h-96 space-y-2 overflow-y-auto rounded-lg bg-black/20 p-3" aria-live="polite">
        {!log.length && <p className="text-xs text-muted">Digite “menu” para começar.</p>}
        {log.map((m, i) => (
          <div key={i} className={m.me ? "ml-auto max-w-[85%] rounded-lg bg-magenta/20 px-3 py-2 text-sm" : "max-w-[85%] rounded-lg bg-surface px-3 py-2 text-sm"}>
            <p className="whitespace-pre-wrap">{m.text}</p>
            {m.card && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[...(m.card.buttons ?? []), ...(m.card.sections?.flatMap((s) => s.rows) ?? [])].map((b) => (
                  <button key={b.id} type="button" disabled={busy} onClick={() => send({ kind: "action", id: b.id }, b.title)} className="rounded-lg border border-line px-2 py-1 text-xs hover:bg-white/5 disabled:opacity-50">{b.title}</button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { send({ kind: "text", text }, text); setText(""); } }}>
        <Input aria-label="Mensagem para o simulador" value={text} onChange={(e) => setText(e.target.value)} className="min-w-0 flex-1" placeholder="menu, 180 Pneu, recebi 360 do João…" />
        <Button type="submit" variant="outline" disabled={busy}><Send /> Enviar</Button>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-line px-3 text-sm">
          <Paperclip className="size-4" aria-hidden /> Áudio/foto/PDF
          <input type="file" accept="audio/*,image/jpeg,image/png,application/pdf" className="sr-only" disabled={busy} onChange={(e) => { file(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        <Button type="button" variant="ghost" onClick={() => { setLog([]); setSession(null); }}>Limpar</Button>
      </form>
    </div>
  );
}

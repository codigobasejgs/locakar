"use client";

import { ArrowLeft, Bot, MessageSquare, RefreshCw, Search, Send, Tag, UserRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/form";
import { LEAD_LABELS, MODE_LABEL, cleanLabels, type Action, type Chat, type Message, type Mode, type Provider } from "@/lib/whatsapp/inbox";
import { createInbox, type ChatList, type Inbox } from "@/lib/whatsapp/inbox-client";
import { cn } from "@/lib/utils";

const PROVIDER_LABEL: Record<Provider, string> = { evolution: "Evolution (notificações)", whaileys: "Whaileys (Copiloto · botões)" };
const MODE_HINT: Record<Mode, string> = {
  human: "Robô pausado: só a equipe responde este contato.",
  buttons: "Autoatendimento por menu: o cliente escolhe opções (pagar, 2ª via, locação…).",
  ai: "Atendente virtual responde dúvidas; “menu” abre o autoatendimento.",
};
const fmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const when = (iso: string | null) => (iso && Number.isFinite(Date.parse(iso)) ? fmt.format(new Date(iso)) : "");
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const shown = (c: Chat) => c.name || (c.phone ? `+${c.phone}` : c.id.endsWith("@lid") ? "Contato oculto" : `+${c.id.split("@")[0]}`);

/** Atualiza a cada `ms` enquanto a aba está visível. */
function usePoll(fn: () => void, ms: number) {
  const ref = useRef(fn);
  useEffect(() => { ref.current = fn; }, [fn]);
  useEffect(() => {
    const id = setInterval(() => document.visibilityState === "visible" && ref.current(), ms);
    return () => clearInterval(id);
  }, [ms]);
}

export function WhatsAppInbox({ demo = false }: { demo?: boolean }) {
  const api = useMemo(() => createInbox(demo), [demo]);
  const [provider, setProvider] = useState<Provider>("evolution");
  return (
    <section className="min-w-0 space-y-4" aria-label="Conversas do WhatsApp">
      <div data-tour="conversations-provider" className="flex flex-wrap items-center gap-2">
        {(["evolution", "whaileys"] as Provider[]).map((p) => (
          <Button key={p} size="sm" variant={p === provider ? "primary" : "outline"} aria-pressed={p === provider} onClick={() => setProvider(p)}>{PROVIDER_LABEL[p]}</Button>
        ))}
        {demo && <Badge tone="info">Demonstração: nada é enviado pelo WhatsApp</Badge>}
      </div>
      <ProviderInbox key={provider} api={api} provider={provider} />
    </section>
  );
}

function ProviderInbox({ api, provider }: { api: Inbox; provider: Provider }) {
  const [data, setData] = useState<ChatList | null>(null);
  const [error, setError] = useState("");
  const [selected, select] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [label, setLabel] = useState("");

  const load = useCallback(async () => {
    try { setData(await api.chats(provider)); setError(""); }
    catch (e) { setError((e as Error).message); }
  }, [api, provider]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  usePoll(load, 15_000);

  const chats = useMemo(() => data?.chats ?? [], [data]);
  const chat = chats.find((c) => c.id === selected);
  const q = norm(search.trim());
  const matches = chats.filter((c) => (!label || c.labels.includes(label)) && norm(`${c.name} ${c.phone ?? ""} ${c.id}`).includes(q));
  const labels = [...new Set([...LEAD_LABELS, ...chats.flatMap((c) => c.labels)])];
  const patch = (id: string, p: Partial<Chat>) => setData((d) => d && { ...d, chats: d.chats.map((c) => (c.id === id ? { ...c, ...p } : c)) });
  const caps = data?.capabilities;

  if (caps && !caps[provider]) {
    return (
      <div className="rounded-xl border border-line bg-panel p-5 text-sm text-muted">
        {provider === "whaileys"
          ? "O WhatsApp por botões (Copiloto) não está ativo nesta locadora. Disponível nos planos Profissional e Completo; conecte o número em Configurações → Copiloto."
          : "O WhatsApp de notificações não está configurado. Conecte o número em Configurações → WhatsApp."}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data && <Notices provider={provider} data={data} />}
      <div className="grid min-w-0 overflow-hidden rounded-xl border border-line bg-panel lg:grid-cols-[minmax(17rem,32%)_minmax(0,1fr)]">
        <aside aria-label="Contatos" className={cn(chat ? "hidden lg:block" : "block", "min-w-0 lg:border-r lg:border-line")}>
          <div data-tour="conversations-filters" className="grid gap-2 border-b border-line p-3">
            <label className="relative">
              <Search aria-hidden className="absolute left-3 top-3 size-4 text-muted" />
              <Input className="pl-9" type="search" aria-label="Buscar por nome ou número" placeholder="Buscar nome ou número" value={search} onChange={(e) => setSearch(e.target.value)} />
            </label>
            <div className="flex gap-2">
              <Select aria-label="Filtrar por etiqueta" value={label} onChange={(e) => setLabel(e.target.value)} options={[{ value: "", label: "Todas as etiquetas" }, ...labels.map((s) => ({ value: s, label: s }))]} />
              <Button variant="outline" size="icon" aria-label="Atualizar conversas" onClick={load}><RefreshCw /></Button>
            </div>
          </div>
          {!data ? (
            <p role={error ? "alert" : "status"} className="p-4 text-sm text-muted">{error || "Carregando conversas…"}</p>
          ) : !matches.length ? (
            <div role="status" className="space-y-2 p-4 text-sm text-muted">
              <p>{chats.length ? "Nenhum contato com esses filtros." : "Nenhuma conversa ainda. Assim que um cliente escrever, ela aparece aqui."}</p>
              {(label || search) && <Button size="sm" variant="ghost" onClick={() => { setLabel(""); setSearch(""); }}>Limpar filtros</Button>}
            </div>
          ) : (
            <ul data-tour="conversations-list" className="max-h-[68dvh] divide-y divide-line overflow-y-auto">
              {matches.map((c) => (
                <li key={c.id}>
                  <button type="button" aria-pressed={chat?.id === c.id} onClick={() => select(c.id)} className="w-full border-l-2 border-transparent px-4 py-3 text-left hover:bg-white/[0.04] aria-pressed:border-brand aria-pressed:bg-white/[0.06]">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold text-white">{shown(c)}</span>
                      <span className="shrink-0 text-[11px] text-muted">{when(c.lastAt)}</span>
                    </span>
                    <span className="block truncate text-sm text-muted">{c.lastMessage || "Sem mensagens"}</span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      <Badge tone={c.mode === "human" ? "neutral" : "brand"}>{MODE_LABEL[c.mode]}</Badge>
                      {c.labels.map((l) => <Badge key={l} tone="info">{l}</Badge>)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
        {chat ? (
          <Thread key={chat.id} api={api} provider={provider} chat={chat} modes={caps?.modes ?? ["human"]} labels={labels} patch={patch} back={() => select(null)} />
        ) : (
          <div className="hidden min-h-96 flex-col items-center justify-center gap-3 p-6 text-sm text-muted lg:flex"><MessageSquare aria-hidden />Selecione uma conversa.</div>
        )}
      </div>
    </div>
  );
}

function Notices({ provider, data }: { provider: Provider; data: ChatList }) {
  const items: string[] = [];
  if (!data.capabilities.autoReply) items.push("Respostas automáticas (botões e IA) desligadas: ligue “Autoatendimento de clientes” em Configurações → Copiloto. O atendimento humano funciona normalmente.");
  if (provider === "evolution" && data.hook === "foreign") items.push("Este número já envia eventos para outro sistema: o histórico aparece aqui, mas respostas automáticas pela Evolution ficam desligadas.");
  if (provider === "evolution" && !data.live) items.push("Não foi possível ler o histórico ao vivo da Evolution agora; mostrando as conversas já registradas.");
  if (provider === "whaileys") items.push("O histórico do Whaileys começa a partir da ativação desta tela (o motor não guarda mensagens antigas).");
  return items.length ? <ul className="space-y-1 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-200">{items.map((t) => <li key={t}>{t}</li>)}</ul> : null;
}

function Thread({ api, provider, chat, modes, labels, patch, back }: {
  api: Inbox; provider: Provider; chat: Chat; modes: Mode[]; labels: string[]; patch: (id: string, p: Partial<Chat>) => void; back: () => void;
}) {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [draft, setDraft] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const log = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try { setMessages(await api.messages(provider, chat.id)); }
    catch (e) { setMessages((m) => m ?? []); toast.error((e as Error).message); }
  }, [api, provider, chat.id]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  usePoll(load, 8_000);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [messages?.length]);

  async function act(a: Action, ok?: () => void) {
    setBusy(true);
    try {
      await api.act(provider, chat.id, a);
      ok?.();
      if (a.action === "send") { setDraft(""); patch(chat.id, { lastMessage: a.text, lastAt: new Date().toISOString() }); await load(); }
      if (a.action === "mode") { patch(chat.id, { mode: a.mode }); toast.success(`Atendimento: ${MODE_LABEL[a.mode]}.`); }
      if (a.action === "labels") patch(chat.id, { labels: a.labels });
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  }
  const setLabels = (next: string[]) => { const clean = cleanLabels(next); if (clean) void act({ action: "labels", labels: clean }); else toast.error("Até 10 etiquetas de até 30 caracteres."); };
  const options = [...new Set([chat.mode, ...modes])].map((m) => ({ value: m, label: MODE_LABEL[m] }));

  return (
    <section aria-label={`Conversa com ${shown(chat)}`} className="flex min-w-0 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button className="lg:hidden" variant="outline" size="icon" aria-label="Voltar aos contatos" onClick={back}><ArrowLeft /></Button>
          <div className="min-w-0">
            <h2 className="truncate font-semibold text-white">{shown(chat)}</h2>
            {chat.phone && <p className="text-xs text-muted">+{chat.phone}</p>}
          </div>
        </div>
        <label data-tour="conversations-mode" className="flex items-center gap-2 text-xs text-muted">
          {chat.mode === "human" ? <UserRound className="size-4" aria-hidden /> : <Bot className="size-4" aria-hidden />}Atendimento
          <Select className="h-9 w-auto" value={chat.mode} disabled={busy} onChange={(e) => void act({ action: "mode", mode: e.target.value as Mode })} options={options} />
        </label>
      </header>
      <p className="border-b border-line px-3 py-1.5 text-xs text-muted">{MODE_HINT[chat.mode]}</p>

      <div data-tour="conversations-labels" className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2">
        <Tag className="size-3.5 text-muted" aria-hidden />
        {chat.labels.map((l) => (
          <button key={l} type="button" disabled={busy} onClick={() => setLabels(chat.labels.filter((x) => x !== l))} className="rounded-full border border-sky-400/30 bg-sky-400/10 px-2 py-0.5 text-xs text-sky-200 hover:bg-sky-400/20" aria-label={`Remover etiqueta ${l}`}>{l} ×</button>
        ))}
        <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); if (newLabel.trim()) { setLabels([...chat.labels, newLabel]); setNewLabel(""); } }}>
          <Input list="wa-labels" aria-label="Nova etiqueta" placeholder="+ etiqueta" value={newLabel} disabled={busy} onChange={(e) => setNewLabel(e.target.value)} className="h-7 w-32 text-xs" />
          <datalist id="wa-labels">{labels.filter((l) => !chat.labels.includes(l)).map((l) => <option key={l} value={l} />)}</datalist>
        </form>
      </div>

      <div ref={log} role="log" aria-label="Histórico de mensagens" className="h-[46dvh] min-h-56 overflow-y-auto bg-ink-2 p-3">
        {messages === null ? <p role="status" className="text-sm text-muted">Carregando histórico…</p>
          : !messages.length ? <p className="text-sm text-muted">Sem mensagens registradas nesta conversa.</p>
          : <ol className="space-y-2">{messages.map((m) => (
            <li key={m.id} className={cn("w-fit max-w-[85%] rounded-2xl border px-3 py-2", m.fromMe ? "ml-auto border-brand/40 bg-brand/10" : "border-line bg-panel")}>
              <p className="whitespace-pre-wrap break-words text-sm text-white">{m.text}</p>
              <p className="mt-0.5 text-right text-[11px] text-muted">{m.fromMe ? "Locadora" : shown(chat)} · <time dateTime={m.at}>{when(m.at)}</time></p>
            </li>))}</ol>}
      </div>

      <form data-tour="conversations-reply" className="space-y-2 border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) void act({ action: "send", text: draft.trim() }); }}>
        <Textarea aria-label="Mensagem" rows={2} className="min-h-16" placeholder="Escreva uma resposta…" value={draft} disabled={busy} maxLength={4096}
          onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted">Enter envia · Shift+Enter quebra linha</span>
          <Button type="submit" disabled={busy || !draft.trim()}><Send />Enviar</Button>
        </div>
      </form>
    </section>
  );
}

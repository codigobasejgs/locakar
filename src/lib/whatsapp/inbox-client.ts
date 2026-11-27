import { MODES, type Action, type Chat, type Message, type Mode, type Provider } from "./inbox";

/** Cliente da caixa de conversas: API real (/api/whatsapp/inbox) ou demonstração local (nada sai pelo WhatsApp). */
export interface Capabilities { evolution: boolean; whaileys: boolean; modes: Mode[]; autoReply: boolean }
export interface ChatList { chats: Chat[]; live: boolean; hook?: "ours" | "foreign" | "off"; capabilities: Capabilities }
export interface Inbox {
  chats(provider: Provider, signal?: AbortSignal): Promise<ChatList>;
  messages(provider: Provider, chat: string, signal?: AbortSignal): Promise<Message[]>;
  act(provider: Provider, chat: string, action: Action, signal?: AbortSignal): Promise<void>;
}

const endpoint = "/api/whatsapp/inbox";
const invalid = () => new Error("Resposta inválida da caixa de conversas.");
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const string = (v: unknown): v is string => typeof v === "string";

async function request(url: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new Error(record(body) && string(body.error) ? body.error : `Não foi possível concluir (${res.status}).`);
  if (!record(body)) throw invalid();
  return body;
}

const isChat = (v: unknown): v is Chat =>
  record(v) && string(v.id) && string(v.name) && string(v.lastMessage) && MODES.includes(v.mode as Mode) && Array.isArray(v.labels) && v.labels.every(string);
const isMessage = (v: unknown): v is Message => record(v) && string(v.id) && string(v.text) && typeof v.fromMe === "boolean" && string(v.at);
function list<T>(v: unknown, ok: (x: unknown) => x is T): T[] {
  if (!Array.isArray(v) || !v.every(ok)) throw invalid();
  return v;
}

function api(): Inbox {
  return {
    async chats(provider, signal) {
      const b = await request(`${endpoint}?${new URLSearchParams({ provider })}`, { signal });
      return { chats: list(b.chats, isChat), live: b.live === true, hook: b.hook as ChatList["hook"], capabilities: b.capabilities as Capabilities };
    },
    async messages(provider, chat, signal) {
      const b = await request(`${endpoint}?${new URLSearchParams({ provider, chat })}`, { signal });
      return list(b.messages, isMessage);
    },
    async act(provider, chat, action, signal) {
      const b = await request(endpoint, { method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...action, provider, chat }) });
      if (b.ok !== true) throw invalid();
    },
  };
}

type Thread = { chat: Chat; history: Message[] };
function seed(provider: Provider): Thread[] {
  const people = provider === "evolution"
    ? [["Ana Souza", "Vocês têm um carro disponível para amanhã?", ["Lead"]], ["Bruno Lima", "Posso renovar a locação por mais uma semana?", ["Cliente"]], ["Carla Mendes", "Qual o valor semanal do Onix?", ["Lead", "Em negociação"]]]
    : [["Davi Alves", "Quero alugar para trabalhar de aplicativo.", ["Novo lead"]], ["Elisa Prado", "Mandei o comprovante agora há pouco.", ["Cliente"]]];
  const now = Date.UTC(2026, 10, 27, 15);
  return people.map(([name, text, labels], i) => {
    const at = new Date(now - (i + 1) * 3_600_000).toISOString();
    return {
      chat: { id: `55199990000${i}${provider === "evolution" ? 1 : 2}@s.whatsapp.net`, name: name as string, phone: null, lastMessage: text as string, lastAt: at, mode: provider === "whaileys" ? "buttons" : "human", labels: labels as string[] },
      history: [{ id: `demo-in-${i}`, text: text as string, fromMe: false, at }],
    };
  });
}

function demo(): Inbox {
  const threads = { evolution: seed("evolution"), whaileys: seed("whaileys") };
  const find = (p: Provider, id: string) => {
    const t = threads[p].find((x) => x.chat.id === id);
    if (!t) throw new Error("Conversa não encontrada.");
    return t;
  };
  const caps: Capabilities = { evolution: true, whaileys: true, modes: [...MODES], autoReply: true };
  return {
    async chats(p) { return { chats: structuredClone(threads[p].map((t) => t.chat)), live: true, hook: "ours", capabilities: caps }; },
    async messages(p, id) { return structuredClone(find(p, id).history); },
    async act(p, id, a) {
      const t = find(p, id);
      if (a.action === "send") {
        const at = new Date().toISOString();
        t.history.push({ id: `demo-${t.history.length}`, text: a.text, fromMe: true, at });
        Object.assign(t.chat, { lastMessage: a.text, lastAt: at });
      } else if (a.action === "mode") t.chat.mode = a.mode;
      else t.chat.labels = [...a.labels];
    },
  };
}

export const createInbox = (isDemo: boolean): Inbox => (isDemo ? demo() : api());

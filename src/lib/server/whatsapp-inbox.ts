import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { defaultMode, isDirectJid, isoAt, mergeChats, mergeMessages, phoneOf, textOf, type Chat, type Message, type Mode, type Provider } from "@/lib/whatsapp/inbox";
import { requireOrg, siteUrl } from "@/lib/server/org-context";
import { serviceDb } from "@/lib/server/push";
import { HttpError } from "@/lib/server/supabase";
import { evo, isWhatsAppEnabled, whatsAppInstance } from "@/lib/server/whatsapp";
import { isWhaileysEnabled, whaileysSend, whaileysStatus } from "@/lib/server/whaileys";

/**
 * Conversas do WhatsApp no painel. Tudo pelo serviceDb() (já filtrado pela locadora do contexto).
 * Evolution: histórico lido ao vivo da própria Evolution + o que passou pelo webhook.
 * Whaileys: o motor não guarda histórico; vale o que passou pelo webhook a partir da ativação.
 */

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");

const toChat = (r: Row): Chat => ({
  id: r.jid as string,
  name: str(r.name),
  phone: (r.phone as string | null) ?? null,
  lastMessage: str(r.last_text),
  lastAt: (r.last_at as string | null) ?? null,
  mode: r.mode as Mode,
  labels: (r.labels as string[] | null) ?? [],
});

export interface Incoming { provider: Provider; key: { remoteJid?: string | null; fromMe?: boolean | null; id?: string | null; senderPn?: string | null; remoteJidAlt?: string | null }; message?: unknown; pushName?: string | null; timestamp?: unknown }

/**
 * Grava a mensagem na conversa (cria a conversa se preciso). Idempotente pelo id da mensagem.
 * Retorna o modo da conversa, ou null quando a mensagem não é de conversa individual ou já foi gravada.
 */
export async function recordMessage(m: Incoming): Promise<{ mode: Mode; phone: string | null } | null> {
  const jid = m.key.remoteJid ?? "";
  const id = m.key.id ?? "";
  if (!isDirectJid(jid) || !/^[A-Za-z0-9._:-]{4,128}$/.test(id)) return null;
  const text = textOf(m.message);
  if (!text) return null;
  const db = serviceDb();
  const fromMe = Boolean(m.key.fromMe);
  const phone = phoneOf(m.key);
  const at = isoAt(m.timestamp);
  const name = !fromMe && m.pushName ? m.pushName.trim().slice(0, 120) : undefined;

  await db.from("whatsapp_conversations").upsert({ provider: m.provider, jid, phone, name: name ?? null, mode: defaultMode(m.provider), last_at: at }, { onConflict: "organization_id,provider,jid", ignoreDuplicates: true });
  const { error } = await db.from("whatsapp_messages").insert({ provider: m.provider, jid, provider_id: id, from_me: fromMe, text, at });
  if (error) return null; // repetida (unique) ou falha: nada de resposta automática em dobro
  await db.from("whatsapp_conversations").update({ last_text: text.slice(0, 500), last_at: at, updated_at: new Date().toISOString(), ...(name ? { name } : {}), ...(phone ? { phone } : {}) }).eq("provider", m.provider).eq("jid", jid);
  const { data } = await db.from("whatsapp_conversations").select("mode").eq("provider", m.provider).eq("jid", jid).maybeSingle();
  return { mode: (data?.mode as Mode) ?? defaultMode(m.provider), phone };
}

/** Modo atual da conversa (sem conversa gravada: padrão do provedor). */
export async function conversationMode(provider: Provider, jid: string): Promise<Mode> {
  const { data } = await serviceDb().from("whatsapp_conversations").select("mode").eq("provider", provider).eq("jid", jid).maybeSingle();
  return (data?.mode as Mode) ?? defaultMode(provider);
}

/* ---------- Evolution: leitura ao vivo ---------- */

const evoInstance = () => encodeURIComponent(whatsAppInstance());

async function evolutionChats(): Promise<Chat[]> {
  const r = await evo(`/chat/findChats/${evoInstance()}`, { method: "POST", body: "{}" }, 20_000);
  if (!r.ok || !Array.isArray(r.json)) throw new Error("Evolution sem lista de conversas.");
  return (r.json as Row[]).flatMap((c) => {
    const jid = str(c.remoteJid);
    if (!isDirectJid(jid)) return [];
    const last = (c.lastMessage ?? {}) as Row;
    const lastAt = last.messageTimestamp ?? c.updatedAt;
    return [{ id: jid, name: str(c.pushName) || str(c.name), phone: phoneOf({ remoteJid: jid }), lastMessage: textOf(last.message), lastAt: lastAt ? isoAt(lastAt) : null, mode: defaultMode("evolution"), labels: [] }];
  });
}

async function evolutionMessages(jid: string): Promise<Message[]> {
  const r = await evo(`/chat/findMessages/${evoInstance()}`, { method: "POST", body: JSON.stringify({ where: { key: { remoteJid: jid } }, page: 1, offset: 100 }) }, 20_000);
  const records = (r.json?.messages?.records ?? (Array.isArray(r.json) ? r.json : null)) as Row[] | null;
  if (!r.ok || !Array.isArray(records)) throw new Error("Evolution sem histórico.");
  return records.flatMap((m) => {
    const key = (m.key ?? {}) as Row;
    const text = textOf(m.message);
    if (key.remoteJid !== jid || !str(key.id) || !text) return [];
    return [{ id: str(key.id), text, fromMe: Boolean(key.fromMe), at: isoAt(m.messageTimestamp) }];
  });
}

/* ---------- Webhook da Evolution: token por locadora ---------- */

const hookSecret = () => process.env.EVOLUTION_WEBHOOK_SECRET || createHmac("sha256", process.env.EVOLUTION_API_KEY ?? "").update("frotaeasy-evolution-webhook").digest("hex");
export const evolutionHookToken = (orgId: string) => createHmac("sha256", hookSecret()).update(orgId).digest("hex");
export function verifyEvolutionHook(orgId: string, token: string | null) {
  if (!process.env.EVOLUTION_API_KEY || !token || !/^[0-9a-f]{64}$/.test(token)) return false;
  return timingSafeEqual(Buffer.from(evolutionHookToken(orgId), "hex"), Buffer.from(token, "hex"));
}
const hookUrl = (orgId: string) => `${siteUrl()}/api/webhooks/evolution?org=${orgId}&token=${evolutionHookToken(orgId)}`;

/**
 * Liga o webhook da instância para o painel receber mensagens em tempo real (respostas automáticas).
 * Nunca sobrescreve um webhook de outro sistema: nesse caso só a leitura ao vivo funciona.
 */
export async function ensureEvolutionWebhook(): Promise<"ours" | "foreign" | "off"> {
  const orgId = requireOrg().org.id;
  const url = hookUrl(orgId);
  // Teste local nunca aponta a instância real para localhost.
  if (!/^https:\/\//.test(url) || /\/\/(localhost|127\.|\[::1\])/.test(url)) return "off";
  const found = await evo(`/webhook/find/${evoInstance()}`).catch(() => null);
  const current = str(found?.json?.url ?? found?.json?.webhook?.url);
  if (current && current.split("?")[0] !== url.split("?")[0]) return "foreign";
  if (current === url && found?.json?.enabled !== false) return "ours";
  const set = await evo(`/webhook/set/${evoInstance()}`, { method: "POST", body: JSON.stringify({ webhook: { enabled: true, url, byEvents: false, base64: false, events: ["MESSAGES_UPSERT"] } }) }).catch(() => null);
  return set?.ok ? "ours" : "off";
}

/* ---------- Leitura para o painel ---------- */

async function savedChats(provider: Provider): Promise<Chat[]> {
  const { data } = await serviceDb().from("whatsapp_conversations").select("jid,name,phone,last_text,last_at,mode,labels").eq("provider", provider).order("last_at", { ascending: false, nullsFirst: false }).limit(150);
  return (data ?? []).map(toChat);
}

export async function listChats(provider: Provider): Promise<{ chats: Chat[]; live: boolean }> {
  const saved = await savedChats(provider);
  if (provider !== "evolution" || !isWhatsAppEnabled()) return { chats: saved, live: false };
  try { return { chats: mergeChats(await evolutionChats(), saved), live: true }; }
  catch { return { chats: saved, live: false }; }
}

export async function listMessages(provider: Provider, jid: string): Promise<Message[]> {
  const { data } = await serviceDb().from("whatsapp_messages").select("provider_id,text,from_me,at").eq("provider", provider).eq("jid", jid).order("at", { ascending: false }).limit(100);
  const saved: Message[] = (data ?? []).map((r) => ({ id: r.provider_id as string, text: r.text as string, fromMe: Boolean(r.from_me), at: new Date(r.at as string).toISOString() }));
  const live = provider === "evolution" && isWhatsAppEnabled() ? await evolutionMessages(jid).catch(() => []) : [];
  return mergeMessages(saved, live);
}

/* ---------- Ações ---------- */

/** Cria a conversa (contato vindo só da leitura ao vivo) e aplica modo/etiquetas. */
export async function updateConversation(provider: Provider, jid: string, patch: { mode?: Mode; labels?: string[] }) {
  const db = serviceDb();
  await db.from("whatsapp_conversations").upsert({ provider, jid, phone: phoneOf({ remoteJid: jid }), mode: defaultMode(provider) }, { onConflict: "organization_id,provider,jid", ignoreDuplicates: true });
  const { error } = await db.from("whatsapp_conversations").update({ ...patch, updated_at: new Date().toISOString() }).eq("provider", provider).eq("jid", jid);
  if (error) throw new HttpError(409, "Não foi possível atualizar a conversa.");
}

/** Envia texto pelo provedor e grava no histórico. `whaileysKey` = instância do Copiloto da locadora. */
export async function sendText(provider: Provider, jid: string, text: string, whaileysKey?: string): Promise<string> {
  let id: string | undefined;
  if (provider === "evolution") {
    if (!isWhatsAppEnabled()) throw new HttpError(409, "WhatsApp (Evolution) não configurado.");
    const number = jid.endsWith("@s.whatsapp.net") ? jid.split("@")[0] : jid;
    const r = await evo(`/message/sendText/${evoInstance()}`, { method: "POST", body: JSON.stringify({ number, text, linkPreview: false }) }, 30_000);
    if (!r.ok) throw new HttpError(502, "A Evolution não enviou a mensagem. Confira se o WhatsApp está conectado.");
    id = str(r.json?.key?.id);
  } else {
    if (!isWhaileysEnabled() || !whaileysKey) throw new HttpError(409, "Motor Whaileys não configurado.");
    if ((await whaileysStatus(whaileysKey)).state !== "open") throw new HttpError(409, "WhatsApp do Copiloto desconectado. Conecte em Configurações.");
    id = (await whaileysSend(whaileysKey, jid, { text })).messageId;
  }
  id ||= `out-${Date.now()}`;
  await recordMessage({ provider, key: { remoteJid: jid, fromMe: true, id }, message: { conversation: text } });
  return id;
}

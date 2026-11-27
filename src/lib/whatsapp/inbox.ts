/** Caixa de conversas do WhatsApp (Evolution e Whaileys). Puro: tipos e regras usados no painel, na API e nos webhooks. */
export type Provider = "evolution" | "whaileys";
export type Mode = "human" | "buttons" | "ai";
export type Chat = { id: string; name: string; phone: string | null; lastMessage: string; lastAt: string | null; mode: Mode; labels: string[] };
export type Message = { id: string; text: string; fromMe: boolean; at: string };
export type Action = { action: "send"; text: string } | { action: "mode"; mode: Mode } | { action: "labels"; labels: string[] };

export const PROVIDERS: Provider[] = ["evolution", "whaileys"];
export const MODES: Mode[] = ["human", "buttons", "ai"];
/** Conversa nova: Whaileys segue o autoatendimento (comportamento de sempre); Evolution só responde gente. */
export const defaultMode = (p: Provider): Mode => (p === "whaileys" ? "buttons" : "human");
export const MODE_LABEL: Record<Mode, string> = { human: "Humano", buttons: "Botões (menu)", ai: "IA" };
/** Etiquetas sugeridas para classificar leads; a equipe pode criar outras. */
export const LEAD_LABELS = ["Lead", "Novo lead", "Em negociação", "Cliente", "Proposta enviada", "Perdido"];

/** Conversa individual: número (@s.whatsapp.net) ou identificador oculto (@lid). Grupos, listas e canais ficam de fora. */
export const DIRECT_JID = /^\d{6,25}@(s\.whatsapp\.net|lid)$/;
export const isDirectJid = (jid: unknown): jid is string => typeof jid === "string" && DIRECT_JID.test(jid);

/** "Lead, lead ,  Orçamento" → ["Lead", "Orçamento"]: sem vazias, sem repetidas (ignora maiúsculas), até 10 de 30 caracteres. */
export function cleanLabels(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null;
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") return null;
    const s = raw.replace(/\s+/g, " ").trim().slice(0, 30);
    if (s && !out.some((o) => o.toLowerCase() === s.toLowerCase())) out.push(s);
  }
  return out.length <= 10 ? out : null;
}

/** Modos liberados pelo plano: humano sempre; botões com WhatsApp por botões; IA com Copiloto IA + botões. */
export function allowedModes(f: { buttons: boolean; ai: boolean }): Mode[] {
  return MODES.filter((m) => m === "human" || (m === "buttons" && f.buttons) || (m === "ai" && f.ai && f.buttons));
}

type Msg = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- proto dinâmico do WhatsApp

/** Texto exibível de uma mensagem do WhatsApp (Baileys/Evolution). Mídia vira um rótulo; sem conteúdo útil → "". */
export function textOf(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  let m = raw as Msg;
  m = m.ephemeralMessage?.message ?? m.viewOnceMessage?.message ?? m.viewOnceMessageV2?.message ?? m.documentWithCaptionMessage?.message ?? m;
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const out =
    s(m.conversation) || s(m.extendedTextMessage?.text) ||
    s(m.buttonsResponseMessage?.selectedDisplayText) || s(m.templateButtonReplyMessage?.selectedDisplayText) ||
    s(m.listResponseMessage?.title) || s(m.interactiveResponseMessage?.body?.text) ||
    (m.imageMessage ? `📷 Foto${s(m.imageMessage.caption) ? `: ${s(m.imageMessage.caption)}` : ""}` : "") ||
    (m.videoMessage ? `🎬 Vídeo${s(m.videoMessage.caption) ? `: ${s(m.videoMessage.caption)}` : ""}` : "") ||
    (m.audioMessage ? "🎤 Áudio" : "") ||
    (m.documentMessage ? `📄 ${s(m.documentMessage.fileName) || "Documento"}` : "") ||
    (m.stickerMessage ? "Figurinha" : "") ||
    (m.locationMessage ? "📍 Localização" : "") ||
    (m.contactMessage ? `👤 ${s(m.contactMessage.displayName) || "Contato"}` : "") ||
    s(m.buttonsMessage?.contentText) || s(m.listMessage?.description) || s(m.interactiveMessage?.body?.text);
  return out.slice(0, 4096);
}

/** Número real do contato: o próprio JID, ou o número que o WhatsApp manda junto de um @lid. */
export function phoneOf(key: { remoteJid?: string | null; senderPn?: string | null; remoteJidAlt?: string | null }): string | null {
  const pn = [key.remoteJid, key.senderPn, key.remoteJidAlt].find((j) => /@s\.whatsapp\.net$/.test(j ?? ""));
  const digits = pn?.split("@")[0].split(":")[0] ?? "";
  return /^\d{10,15}$/.test(digits) ? digits : null;
}

/** Segundos, milissegundos ou ISO → ISO; inválido → agora. */
export function isoAt(v: unknown, now = Date.now()): string {
  const n = typeof v === "string" && !/^\d+$/.test(v) ? Date.parse(v) : Number(v);
  if (!Number.isFinite(n) || n <= 0) return new Date(now).toISOString();
  return new Date(n > 1e12 ? n : n * 1000).toISOString();
}

/** O robô responde esta mensagem? Nunca a própria; "human" pausa; modo fora do plano não responde. */
export function autoReplyFor(mode: Mode, f: { fromMe: boolean; buttons: boolean; ai: boolean }): "none" | "buttons" | "ai" {
  if (f.fromMe || mode === "human" || !allowedModes(f).includes(mode)) return "none";
  return mode;
}

/** Junta conversas lidas ao vivo (Evolution) com as gravadas (modo, etiquetas, nome): mais recente primeiro. */
export function mergeChats(live: Chat[], saved: Chat[], limit = 150): Chat[] {
  const byId = new Map(saved.map((c) => [c.id, c]));
  const out = live.map((l) => {
    const s = byId.get(l.id);
    byId.delete(l.id);
    if (!s) return l;
    const newer = (s.lastAt ?? "") > (l.lastAt ?? "");
    return { ...l, name: s.name || l.name, phone: s.phone ?? l.phone, mode: s.mode, labels: s.labels, lastMessage: newer ? s.lastMessage : l.lastMessage || s.lastMessage, lastAt: newer ? s.lastAt : l.lastAt };
  });
  return [...out, ...byId.values()].sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? "")).slice(0, limit);
}

/** Junta históricos sem repetir mensagem (mesmo id), em ordem cronológica, últimas `limit`. */
export function mergeMessages(a: Message[], b: Message[], limit = 100): Message[] {
  const seen = new Map<string, Message>();
  for (const m of [...a, ...b]) if (!seen.has(m.id)) seen.set(m.id, m);
  return [...seen.values()].sort((x, y) => x.at.localeCompare(y.at)).slice(-limit);
}

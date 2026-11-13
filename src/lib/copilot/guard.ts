/** Quem pode falar com o Copiloto. Puro: decide só com dados do evento e da configuração. */
export interface IncomingKey { remoteJid?: string | null; fromMe?: boolean | null; id?: string | null; participant?: string | null; senderPn?: string | null; remoteJidAlt?: string | null }
export interface SessionMe { id?: string | null; lid?: string | null }

/** "5511999999999:12@s.whatsapp.net" → "5511999999999". */
export const jidUser = (jid?: string | null) => (jid ?? "").split("@")[0].split(":")[0];
const isLid = (jid?: string | null) => /@lid$/.test(jid ?? "");
const isPn = (jid?: string | null) => /@s\.whatsapp\.net$/.test(jid ?? "");

/** Celular brasileiro: o WhatsApp às vezes omite o 9º dígito. Compara as duas formas. */
export function samePhone(a: string, b: string) {
  const norm = (p: string) => p.replace(/\D/g, "").replace(/^55(\d{2})9(\d{8})$/, "55$1$2");
  return !!a && !!b && norm(a) === norm(b);
}

export type GuardResult = { ok: true; who: "self" | "manager"; phone: string; replyTo: string } | { ok: false; reason: string };

/**
 * Self-chat: mensagem do próprio dono para o próprio número (fromMe e remoteJid = eu, por número ou LID).
 * Gestor: mensagem recebida (não fromMe) de número autorizado; sem número real (só LID) → recusa.
 * fromMe para qualquer outro contato = conversa do dono com cliente → sempre ignorada.
 */
export function guard(key: IncomingKey, me: SessionMe, adminPhones: string[]): GuardResult {
  const remote = key.remoteJid ?? "";
  if (!remote || /@(g\.us|broadcast|newsletter)$/.test(remote)) return { ok: false, reason: "chat" };
  if (key.fromMe) {
    const self = (isPn(remote) && samePhone(jidUser(remote), jidUser(me.id))) || (isLid(remote) && !!me.lid && jidUser(remote) === jidUser(me.lid));
    return self ? { ok: true, who: "self", phone: jidUser(me.id), replyTo: remote } : { ok: false, reason: "dono conversando com terceiro" };
  }
  const pnJid = isPn(remote) ? remote : isPn(key.senderPn) ? key.senderPn : isPn(key.remoteJidAlt) ? key.remoteJidAlt : null;
  const phone = jidUser(pnJid);
  if (!phone) return { ok: false, reason: "remetente sem número" };
  if (samePhone(phone, jidUser(me.id))) return { ok: false, reason: "eco" };
  const allowed = adminPhones.find((p) => samePhone(p, phone));
  return allowed ? { ok: true, who: "manager", phone: allowed, replyTo: remote } : { ok: false, reason: "não autorizado" };
}

export type Route =
  | { to: "copilot"; who: "self" | "manager"; phone: string; replyTo: string }
  | { to: "customer"; phone: string; replyTo: string }
  | { to: "ignore"; reason: string; lidOnly?: boolean };

/**
 * Para onde vai cada mensagem da instância (decisão pura, testável):
 * gestor/self-chat → Copiloto; cliente ou visitante (não fromMe, com número real) → autoatendimento se ligado;
 * fromMe para terceiro (dono conversando com cliente) → nunca respondido.
 */
export function routeMessage(key: IncomingKey, me: SessionMe, adminPhones: string[], customerBot: boolean): Route {
  const g = guard(key, me, adminPhones);
  if (g.ok) return { to: "copilot", ...g };
  if (g.reason !== "não autorizado") return { to: "ignore", reason: g.reason, lidOnly: g.reason === "remetente sem número" };
  if (!customerBot) return { to: "ignore", reason: "autoatendimento desligado" };
  // "não autorizado" só ocorre com mensagem recebida, número real e diferente do próprio: é cliente/visitante.
  const remote = key.remoteJid ?? "";
  const pnJid = isPn(remote) ? remote : isPn(key.senderPn) ? key.senderPn : key.remoteJidAlt;
  return { to: "customer", phone: jidUser(pnJid), replyTo: remote };
}

export type Capability = "read" | "write" | "media" | "ai_text";
/** Nível 1 = leitura; 2 = + escrita com confirmação; 3 = + mídia. IA só no modo híbrido. */
export function allowed(cfg: { level: number; mode: "buttons" | "hybrid"; aiAvailable: boolean }, cap: Capability) {
  if (cap === "read") return true;
  if (cap === "write") return cfg.level >= 2;
  if (cap === "media") return cfg.level >= 3 && cfg.mode === "hybrid" && cfg.aiAvailable;
  return cfg.mode === "hybrid" && cfg.aiAvailable;
}

/** Mensagem do WhatsApp (Baileys/Whaileys) → evento do Copiloto. Puro, sem I/O. */
export type CopilotEvent =
  | { kind: "action"; id: string }
  | { kind: "text"; text: string }
  | { kind: "audio" | "image" | "document"; mimetype?: string; caption?: string }
  | { kind: "ignored" };

type Msg = Record<string, unknown> & { [k: string]: any }; // eslint-disable-line @typescript-eslint/no-explicit-any -- proto dinâmico do WhatsApp

const unwrap = (m: Msg): Msg => m?.ephemeralMessage?.message ?? m?.viewOnceMessage?.message ?? m?.viewOnceMessageV2?.message ?? m?.documentWithCaptionMessage?.message ?? m;

/** Opções numeradas do texto enviado ("1", "2"...) → id do botão; mantido na sessão. */
export function parseMessage(raw: unknown, numbered: string[] = []): CopilotEvent {
  if (!raw || typeof raw !== "object") return { kind: "ignored" };
  const m = unwrap(raw as Msg);
  const id =
    m.buttonsResponseMessage?.selectedButtonId ??
    m.templateButtonReplyMessage?.selectedId ??
    m.listResponseMessage?.singleSelectReply?.selectedRowId ??
    nativeFlowId(m.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson);
  if (typeof id === "string" && id) return { kind: "action", id: id.slice(0, 200) };
  if (m.audioMessage) return { kind: "audio", mimetype: m.audioMessage.mimetype };
  if (m.imageMessage) return { kind: "image", mimetype: m.imageMessage.mimetype, caption: m.imageMessage.caption };
  if (m.documentMessage) return { kind: "document", mimetype: m.documentMessage.mimetype, caption: m.documentMessage.caption };
  const text = (m.conversation ?? m.extendedTextMessage?.text ?? "").toString().trim();
  if (!text) return { kind: "ignored" };
  const n = /^\d{1,2}$/.test(text) ? Number(text) : 0;
  if (n >= 1 && n <= numbered.length) return { kind: "action", id: numbered[n - 1] };
  // "Confirmar"/"Sim" e "Cancelar"/"Não" digitados valem como o botão do último card.
  const word = /^(confirmar|confirmo|sim)$/i.test(text) ? "confirm_action:" : /^(cancelar|cancela|n[ãa]o)$/i.test(text) ? "cancel_action:" : null;
  const typed = word && numbered.find((id) => id.startsWith(word));
  if (typed) return { kind: "action", id: typed };
  return { kind: "text", text: text.slice(0, 1000) };
}

function nativeFlowId(params: unknown) {
  if (typeof params !== "string") return undefined;
  try { return (JSON.parse(params) as { id?: string }).id; } catch { return undefined; }
}

/** "180", "180,50 Pneu traseiro", "R$ 1.250,00 troca de óleo" → valor + descrição. */
export function parseAmount(text: string): { amount: number; description: string } | null {
  const m = text.trim().match(/^(?:R\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:reais)?\s*[-–:]?\s*(.*)$/i);
  if (!m) return null;
  const n = m[1].includes(",") ? Number(m[1].replace(/\./g, "").replace(",", ".")) : /^\d{1,3}(\.\d{3})+$/.test(m[1]) ? Number(m[1].replace(/\./g, "")) : Number(m[1]);
  if (!Number.isFinite(n) || n <= 0 || n > 10_000_000) return null;
  return { amount: Math.round(n * 100) / 100, description: m[2].trim().slice(0, 200) };
}

/** Comandos que abrem o menu principal. */
export const isMenuCommand = (text: string) => /^(\/?menu|#locakar|painel|oi|ol[aá]|in[ií]cio|0)$/i.test(text.trim());

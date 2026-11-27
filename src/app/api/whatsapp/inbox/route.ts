import { allowedModes, cleanLabels, isDirectJid, PROVIDERS, type Mode, type Provider } from "@/lib/whatsapp/inbox";
import { loadCopilotConfig } from "@/lib/server/copilot";
import { requireOrg, scoped } from "@/lib/server/org-context";
import { hasPlanFeature } from "@/lib/server/plan";
import { HttpError, errorResponse, requireStaff } from "@/lib/server/supabase";
import { audit, clientIp } from "@/lib/server/tenant";
import { isWhaileysEnabled } from "@/lib/server/whaileys";
import { isWhatsAppEnabled } from "@/lib/server/whatsapp";
import { ensureEvolutionWebhook, listChats, listMessages, sendText, updateConversation } from "@/lib/server/whatsapp-inbox";

/**
 * Caixa de conversas do WhatsApp (painel). Equipe com permissão "operate"; locadora sempre do contexto da sessão.
 * GET ?provider=evolution|whaileys            → { chats, live, capabilities }
 * GET ?provider=…&chat=<jid>                  → { messages }
 * POST { provider, chat, action: send|mode|labels, … } → { ok: true }
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const provider = (v: unknown): Provider => {
  if (!PROVIDERS.includes(v as Provider)) throw new HttpError(400, "Provedor inválido.");
  return v as Provider;
};
const chatId = (v: unknown): string => {
  if (!isDirectJid(v)) throw new HttpError(400, "Conversa inválida.");
  return v;
};

async function capabilities() {
  const org = requireOrg().org.id;
  const buttons = await hasPlanFeature(org, "whatsapp_buttons");
  const ai = buttons && (await hasPlanFeature(org, "ai_copilot"));
  const cfg = buttons ? await loadCopilotConfig() : null;
  return {
    evolution: isWhatsAppEnabled(),
    whaileys: buttons && isWhaileysEnabled(),
    modes: allowedModes({ buttons, ai }),
    // Respostas automáticas (botões/IA) dependem do Autoatendimento de clientes ligado em Configurações.
    autoReply: Boolean(cfg?.customer_bot_enabled),
    whaileysKey: cfg?.instance_key,
  };
}

export const GET = scoped(async function GET(request: Request) {
  try {
    await requireStaff("operate");
    const url = new URL(request.url);
    const p = provider(url.searchParams.get("provider"));
    const chat = url.searchParams.get("chat");
    if (chat) return Response.json({ messages: await listMessages(p, chatId(chat)) });
    const caps = await capabilities();
    if (!caps[p]) return Response.json({ chats: [], live: false, capabilities: { ...caps, whaileysKey: undefined } });
    // Evolution: liga o webhook da locadora (tempo real e respostas automáticas) sem tocar em webhook de outro sistema.
    const hook = p === "evolution" ? await ensureEvolutionWebhook().catch(() => "off" as const) : "ours";
    const { chats, live } = await listChats(p);
    return Response.json({ chats, live, hook, capabilities: { ...caps, whaileysKey: undefined } });
  } catch (e) {
    return errorResponse(e);
  }
});

export const POST = scoped(async function POST(request: Request) {
  try {
    const { userId } = await requireStaff("operate");
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const p = provider(body.provider);
    const jid = chatId(body.chat);
    const caps = await capabilities();
    if (!caps[p]) throw new HttpError(409, p === "whaileys" ? "Whaileys disponível no plano com WhatsApp por botões." : "WhatsApp (Evolution) não configurado.");

    if (body.action === "send") {
      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (!text || text.length > 4096) throw new HttpError(400, "Escreva uma mensagem de até 4096 caracteres.");
      await sendText(p, jid, text, caps.whaileysKey);
      return Response.json({ ok: true });
    }
    if (body.action === "mode") {
      const mode = body.mode as Mode;
      if (!caps.modes.includes(mode)) throw new HttpError(403, "Modo de atendimento não disponível no seu plano.");
      await updateConversation(p, jid, { mode });
      await audit({ actorType: "staff", actorId: userId, action: "whatsapp.mode", entity: "whatsapp_conversations", details: { provider: p, mode }, ip: clientIp(request) });
      return Response.json({ ok: true });
    }
    if (body.action === "labels") {
      const labels = cleanLabels(body.labels);
      if (!labels) throw new HttpError(400, "Até 10 etiquetas de até 30 caracteres.");
      await updateConversation(p, jid, { labels });
      return Response.json({ ok: true });
    }
    throw new HttpError(400, "Ação inválida.");
  } catch (e) {
    return errorResponse(e);
  }
});

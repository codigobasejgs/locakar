import { jidUser } from "@/lib/copilot/guard";
import { parseMessage } from "@/lib/copilot/parse";
import { loadCopilotConfig, runCopilot, toCard } from "@/lib/server/copilot";
import { copilotAiKey } from "@/lib/server/copilot-ai";
import { scoped } from "@/lib/server/org-context";
import { serviceDb } from "@/lib/server/push";
import { HttpError, errorResponse, requireStaff } from "@/lib/server/supabase";
import { audit, clientIp } from "@/lib/server/tenant";
import { isWhaileysEnabled, whaileysConnect, whaileysKnownPhones, whaileysLogout, whaileysSend, whaileysStatus, type OutgoingCard } from "@/lib/server/whaileys";
import { toWhatsAppNumber } from "@/lib/utils";

/**
 * Copiloto LocaKar (painel). Somente dono/administrador (permissão "integrations").
 * GET → configuração + estado da sessão Whaileys (QR/código de pareamento).
 * POST { action: save | connect | disconnect | test | simulate }.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function state(key: string) {
  if (!isWhaileysEnabled()) return { engine: false as const };
  try { return { engine: true as const, ...(await whaileysStatus(key)) }; }
  catch (e) { return { engine: true as const, state: "error", error: (e as Error).message }; }
}

export const GET = scoped(async function GET() {
  try {
    await requireStaff("integrations");
    const cfg = await loadCopilotConfig();
    const ai = await copilotAiKey();
    return Response.json({ config: { enabled: cfg.enabled, mode: cfg.mode, level: cfg.level, adminPhones: cfg.admin_phones }, aiAvailable: Boolean(ai), aiProvider: ai?.provider ?? null, session: await state(cfg.instance_key) });
  } catch (e) {
    return errorResponse(e);
  }
});

export const POST = scoped(async function POST(request: Request) {
  try {
    const { userId } = await requireStaff("integrations");
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const cfg = await loadCopilotConfig();
    const db = serviceDb();

    if (body.action === "save") {
      const level = Number(body.level), mode = body.mode;
      if (![1, 2, 3].includes(level) || (mode !== "buttons" && mode !== "hybrid")) throw new HttpError(400, "Nível ou modo inválido.");
      const phones = Array.isArray(body.adminPhones) ? body.adminPhones.map((p) => toWhatsAppNumber(String(p))) : [];
      if (phones.some((p) => !p) || phones.length > 10) throw new HttpError(400, "Informe até 10 telefones válidos com DDD.");
      const { error } = await db.from("copilot_config").update({ enabled: Boolean(body.enabled), level, mode, admin_phones: [...new Set(phones as string[])], updated_at: new Date().toISOString() }).eq("instance_key", cfg.instance_key);
      if (error) throw new HttpError(409, "Não foi possível salvar.");
      await audit({ actorType: "staff", actorId: userId, action: "copilot.config_saved", entity: "copilot_config", details: { level, mode, enabled: Boolean(body.enabled), phones: phones.length }, ip: clientIp(request) });
      // Motor resolve LID → número só dos gestores cadastrados (WhatsApp esconde o número em alguns contatos).
      if (isWhaileysEnabled()) await whaileysKnownPhones(cfg.instance_key, [...new Set(phones as string[])]).catch(() => {});
      return Response.json({ ok: true });
    }

    if (body.action === "simulate") {
      const kind = body.kind === "action" || body.kind === "audio" || body.kind === "image" || body.kind === "document" ? body.kind : "text";
      const message = kind === "action" ? { buttonsResponseMessage: { selectedButtonId: String(body.id ?? "") } }
        : kind === "text" ? { conversation: String(body.text ?? "").slice(0, 1000) }
        : { [`${kind}Message`]: { mimetype: String(body.mimetype ?? "") } };
      const media = typeof body.data === "string" && body.data.length < 11_000_000 ? { mimetype: String(body.mimetype), data: body.data } : undefined;
      const replies: OutgoingCard[] = [];
      const phone = jidUser(cfg.connected_jid) || "simulador";
      const prev = body.session && typeof body.session === "object" ? (body.session as { step?: unknown; data?: unknown }) : null;
      const session = prev && typeof prev.step === "string" && prev.data && typeof prev.data === "object" ? { step: prev.step.slice(0, 40), data: prev.data as Record<string, unknown> } : { step: "menu", data: {} };
      const opts = Array.isArray(session.data.opts) ? (session.data.opts as unknown[]).map(String) : [];
      // Simulador: sempre dry-run; nada é gravado nem enviado.
      const sim = await runCopilot(parseMessage(message, opts), { ok: true, who: "self", phone, replyTo: "" }, { media, dryRun: true, session, transport: async (c) => { replies.push(c); } });
      return Response.json({ replies, session: sim.session });
    }

    if (!isWhaileysEnabled()) throw new HttpError(409, "Configure WHAILEYS_API_URL, WHAILEYS_API_KEY e WHAILEYS_WEBHOOK_SECRET no servidor.");
    if (body.action === "connect") {
      const phone = body.phone ? toWhatsAppNumber(String(body.phone)) : undefined;
      if (body.phone && !phone) throw new HttpError(400, "Telefone inválido.");
      return Response.json(await whaileysConnect(cfg.instance_key, phone ?? undefined));
    }
    if (body.action === "disconnect") {
      await whaileysLogout(cfg.instance_key);
      await db.from("copilot_config").update({ connected_jid: null, connected_lid: null }).eq("instance_key", cfg.instance_key);
      return Response.json({ ok: true });
    }
    if (body.action === "test") {
      const s = await whaileysStatus(cfg.instance_key);
      if (s.state !== "open" || !s.me?.id) throw new HttpError(409, "Conecte o WhatsApp do Copiloto primeiro.");
      const to = `${jidUser(s.me.id)}@s.whatsapp.net`;
      const card = toCard({ text: "✅ *Teste do Copiloto*\nSe os botões aparecerem abaixo, está tudo certo. Digite *menu* para começar.", buttons: [{ id: "menu", title: "🏠 Menu" }] });
      const { messageId } = await whaileysSend(cfg.instance_key, to, card);
      await db.from("copilot_messages").insert({ phone: jidUser(s.me.id), direction: "out", provider_id: messageId, kind: "buttons", text: "teste" });
      return Response.json({ ok: true });
    }
    throw new HttpError(400, "Ação inválida.");
  } catch (e) {
    return errorResponse(e);
  }
});

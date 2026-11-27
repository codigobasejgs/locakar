import { after } from "next/server";
import { isMenuCommand, parseMessage } from "@/lib/copilot/parse";
import { routeMessage, type IncomingKey } from "@/lib/copilot/guard";
import { loadCopilotConfig } from "@/lib/server/copilot";
import { runCustomerBot } from "@/lib/server/customer-bot";
import { loadOrg, runWithOrg, scoped } from "@/lib/server/org-context";
import { hasPlanFeature } from "@/lib/server/plan";
import { serviceDb } from "@/lib/server/push";
import { isWhatsAppEnabled, whatsAppInstance } from "@/lib/server/whatsapp";
import { replyWithAi } from "@/lib/server/whatsapp-ai";
import { recordMessage, sendText, verifyEvolutionHook } from "@/lib/server/whatsapp-inbox";

/**
 * Webhook da Evolution API (evento MESSAGES_UPSERT), ligado pela caixa de Conversas.
 * Locadora pela URL (?org) + token HMAC dela (?token); a instância do corpo precisa ser a da locadora.
 * Grava a conversa; responde sozinho só no modo da conversa: botões (menu numerado) ou IA. Humano = pausado.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface EvoMessage { key?: IncomingKey; pushName?: string | null; message?: unknown; messageTimestamp?: unknown }

export const POST = scoped(async function POST(request: Request) {
  if (!isWhatsAppEnabled()) return Response.json({ error: "disabled" }, { status: 503 });
  const url = new URL(request.url);
  const orgId = url.searchParams.get("org") ?? "";
  if (!verifyEvolutionHook(orgId, url.searchParams.get("token"))) return Response.json({ error: "unauthorized" }, { status: 401 });
  const raw = await request.text();
  if (raw.length > 2_000_000) return Response.json({ error: "payload muito grande" }, { status: 413 });
  let body: { event?: string; instance?: string; data?: EvoMessage | EvoMessage[] };
  try { body = JSON.parse(raw); } catch { return Response.json({ error: "payload inválido" }, { status: 400 }); }
  if (!/^messages[._]upsert$/i.test(body.event ?? "")) return Response.json({ ignored: true });
  const org = await loadOrg(orgId);
  if (!org) return Response.json({ ignored: true });

  return runWithOrg({ org }, async () => {
    if (body.instance !== whatsAppInstance()) return Response.json({ ignored: true });
    const list = (Array.isArray(body.data) ? body.data : body.data ? [body.data] : []).slice(0, 20);
    const buttonsPlan = await hasPlanFeature(org.id, "whatsapp_buttons");
    const aiPlan = buttonsPlan && (await hasPlanFeature(org.id, "ai_copilot"));
    const cfg = buttonsPlan ? await loadCopilotConfig() : null;
    const jobs: (() => Promise<void>)[] = [];

    for (const m of list) {
      if (!m.key?.remoteJid || !m.key.id) continue;
      const saved = await recordMessage({ provider: "evolution", key: m.key, message: m.message, pushName: m.pushName, timestamp: m.messageTimestamp });
      if (!saved || m.key.fromMe || saved.mode === "human" || !cfg?.customer_bot_enabled) continue;
      // Gestores cadastrados falam com o Copiloto (Whaileys); aqui nunca recebem o menu de cliente.
      const route = routeMessage(m.key, { id: null, lid: null }, cfg.admin_phones, true);
      if (route.to !== "customer") continue;
      const jid = m.key.remoteJid;
      const send = async (text: string) => { await sendText("evolution", jid, text); };
      const { data: s } = await serviceDb().from("customer_bot_sessions").select("data").eq("phone", route.phone).maybeSingle();
      const numbered = Array.isArray((s?.data as { opts?: unknown })?.opts) ? (s!.data as { opts: string[] }).opts : [];
      const ev = parseMessage(m.message, numbered);
      if (ev.kind === "ignored") continue;
      if (saved.mode === "ai" && aiPlan && ev.kind === "text" && !isMenuCommand(ev.text)) {
        jobs.push(() => replyWithAi("evolution", jid, route.phone, cfg.customer_rate_per_hour ?? 30, send));
      } else if (saved.mode === "buttons" || saved.mode === "ai") {
        // Evolution não exibe botões nativos: o menu vai em texto numerado (o cliente responde "1", "2"...).
        jobs.push(async () => { await runCustomerBot(ev, route.phone, cfg, { transport: (card) => send(card.text + numberedOptions(card)) }); });
      }
    }
    if (jobs.length) after(() => runWithOrg({ org }, async () => {
      for (const j of jobs) await j().catch((e) => console.error(`[evolution-inbox:${org.id}]`, (e as Error).message));
    }));
    return Response.json({ received: list.length });
  });
});

/** Card do autoatendimento → opções numeradas no texto (o `toCard` já numera; aqui só completa quando faltar). */
function numberedOptions(card: { text: string; buttons?: { title: string }[]; sections?: { rows: { title: string }[] }[] }) {
  const opts = card.sections?.flatMap((s) => s.rows) ?? card.buttons ?? [];
  if (!opts.length || /\n1\. /.test(card.text)) return "";
  return `\n\n${opts.map((o, i) => `${i + 1}. ${o.title}`).join("\n")}\n_Responda com o número._`;
}

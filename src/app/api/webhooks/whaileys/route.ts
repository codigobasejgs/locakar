import { after } from "next/server";
import { routeMessage, type IncomingKey, type SessionMe } from "@/lib/copilot/guard";
import { isMenuCommand, parseMessage } from "@/lib/copilot/parse";
import { loadCopilotConfig, runCopilot, whaileysTransport } from "@/lib/server/copilot";
import { customerTransport, runCustomerBot } from "@/lib/server/customer-bot";
import { globalDb, loadOrg, runWithOrg, scoped } from "@/lib/server/org-context";
import { hasPlanFeature } from "@/lib/server/plan";
import { serviceDb } from "@/lib/server/push";
import { isWhaileysEnabled, verifyWhaileysSignature, whaileysKnownPhones } from "@/lib/server/whaileys";
import { recordMessage } from "@/lib/server/whatsapp-inbox";
import { replyWithAi } from "@/lib/server/whatsapp-ai";

/**
 * Webhook do motor Whaileys. Separado do fluxo da Evolution API.
 * 1. assinatura HMAC + janela de tempo; 2. locadora pelo instanceKey cadastrado (nunca pelo corpo livre);
 * 3. id da mensagem gravado (repetido = sem efeito; id enviado pelo próprio backend = anti-loop);
 * 4. roteamento: self-chat/gestor → Copiloto; cliente/visitante → autoatendimento (se ligado);
 *    dono conversando com cliente → ignorado; 5. responde 200 e processa depois (after).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Payload { instanceKey?: string; me?: SessionMe; key?: IncomingKey; message?: unknown; pushName?: string | null; messageTimestamp?: unknown; media?: { mimetype?: string; data?: string } }

export const POST = scoped(async function POST(request: Request) {
  if (!isWhaileysEnabled()) return Response.json({ error: "disabled" }, { status: 503 });
  const raw = await request.text();
  if (raw.length > 12_000_000) return Response.json({ error: "payload muito grande" }, { status: 413 });
  if (!verifyWhaileysSignature(raw, request.headers.get("x-whaileys-timestamp"), request.headers.get("x-whaileys-signature"))) return Response.json({ error: "unauthorized" }, { status: 401 });
  let body: Payload;
  try { body = JSON.parse(raw); } catch { return Response.json({ error: "payload inválido" }, { status: 400 }); }
  const msgId = body.key?.id;
  if (typeof body.instanceKey !== "string" || typeof msgId !== "string" || !/^[A-Za-z0-9._-]{4,128}$/.test(msgId)) return Response.json({ ignored: true });

  const { data: owner } = await globalDb().from("copilot_config").select("organization_id,enabled").eq("instance_key", body.instanceKey).maybeSingle();
  const org = owner?.enabled ? await loadOrg(owner.organization_id as string) : null;
  // Plano sem WhatsApp por botões (Essencial): o número não responde nada.
  if (!org || !(await hasPlanFeature(org.id, "whatsapp_buttons"))) return Response.json({ ignored: true });

  return runWithOrg({ org }, async () => {
    const db = serviceDb();
    const cfg = await loadCopilotConfig();
    // Sessão conectada: guarda o próprio JID/LID (self-chat por LID também é reconhecido).
    if (body.me?.id && (body.me.id !== cfg.connected_jid || (body.me.lid ?? null) !== cfg.connected_lid)) {
      await db.from("copilot_config").update({ connected_jid: body.me.id, connected_lid: body.me.lid ?? null, updated_at: new Date().toISOString() }).eq("organization_id", org.id);
    }
    const route = routeMessage(body.key!, body.me ?? { id: cfg.connected_jid, lid: cfg.connected_lid }, cfg.admin_phones, Boolean(cfg.customer_bot_enabled));
    // Caixa de conversas: tudo que é conversa com cliente/visitante (inclusive o dono respondendo pelo celular).
    // Copiloto (self-chat/gestor), grupos e eco ficam de fora.
    const saved = route.to === "copilot" || (route.to === "ignore" && ["chat", "eco"].includes(route.reason)) ? null : await recordMessage({ provider: "whaileys", key: body.key!, message: body.message, pushName: body.pushName, timestamp: body.messageTimestamp });
    if (route.to === "customer" && saved?.mode === "human") return Response.json({ paused: true });
    if (route.to === "ignore") {
      // Gestor escrevendo só com LID: o motor ainda não sabe quais números resolver (reinício ou lista nova).
      // Reenvia os autorizados; a próxima mensagem já chega com o número. Nunca libera esta mensagem.
      if (route.lidOnly && cfg.admin_phones.length) after(() => whaileysKnownPhones(cfg.instance_key, cfg.admin_phones).catch(() => {}));
      return Response.json({ ignored: true });
    }

    // Unique (organization_id, provider_id): mensagem repetida ou resposta do próprio bot não processa de novo.
    const { error } = await db.from("copilot_messages").insert({ phone: route.phone, direction: "in", provider_id: msgId, kind: "in", text: null });
    if (error) return Response.json({ duplicate: true });

    const sessionTable = route.to === "copilot" ? "copilot_sessions" : "customer_bot_sessions";
    const { data: s } = await db.from(sessionTable).select("data").eq("phone", route.phone).maybeSingle();
    const numbered = Array.isArray((s?.data as { opts?: unknown })?.opts) ? ((s!.data as { opts: string[] }).opts) : [];
    const ev = parseMessage(body.message, numbered);
    if (ev.kind === "ignored") return Response.json({ ignored: true });
    const media = body.media?.data && body.media.mimetype ? { mimetype: body.media.mimetype, data: body.media.data } : undefined;

    // Modo IA: texto livre vai para a IA; "menu", botões e mídia continuam no autoatendimento por botões.
    const aiMode = route.to === "customer" && saved?.mode === "ai" && ev.kind === "text" && !isMenuCommand(ev.text) && (await hasPlanFeature(org.id, "ai_copilot"));
    after(() => runWithOrg({ org }, async () => {
      if (aiMode && route.to === "customer") await replyWithAi("whaileys", route.replyTo, route.phone, cfg.customer_rate_per_hour ?? 30, (text) => customerTransport(cfg, route.phone, route.replyTo)({ text })).catch((e) => console.error(`[whatsapp-ai:${org.id}]`, (e as Error).message));
      else if (route.to === "copilot") await runCopilot(ev, { ok: true, who: route.who, phone: route.phone, replyTo: route.replyTo }, { media, transport: whaileysTransport(cfg, route.phone, route.replyTo) }).catch((e) => console.error(`[copilot:${org.id}]`, (e as Error).message));
      else await runCustomerBot(ev, route.phone, cfg, { media, transport: customerTransport(cfg, route.phone, route.replyTo) }).catch((e) => console.error(`[customer-bot:${org.id}]`, (e as Error).message));
      // Contexto curto: mantém só as últimas 50 mensagens do telefone.
      const { data: old } = await db.from("copilot_messages").select("id").eq("phone", route.phone).order("created_at", { ascending: false }).range(50, 500);
      if (old?.length) await db.from("copilot_messages").delete().in("id", old.map((r) => r.id));
    }));
    return Response.json({ received: true });
  });
});

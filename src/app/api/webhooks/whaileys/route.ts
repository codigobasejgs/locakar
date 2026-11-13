import { after } from "next/server";
import { guard, type IncomingKey, type SessionMe } from "@/lib/copilot/guard";
import { parseMessage } from "@/lib/copilot/parse";
import { loadCopilotConfig, runCopilot, whaileysTransport } from "@/lib/server/copilot";
import { globalDb, loadOrg, runWithOrg, scoped } from "@/lib/server/org-context";
import { serviceDb } from "@/lib/server/push";
import { isWhaileysEnabled, verifyWhaileysSignature } from "@/lib/server/whaileys";

/**
 * Webhook do motor Whaileys (Copiloto). Separado do fluxo da Evolution API.
 * 1. assinatura HMAC + janela de tempo; 2. locadora pelo instanceKey cadastrado (nunca pelo corpo livre);
 * 3. id da mensagem gravado (repetido = sem efeito; id enviado pelo próprio backend = anti-loop);
 * 4. só self-chat do dono ou gestor autorizado; 5. responde 200 e processa depois (after).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Payload { instanceKey?: string; me?: SessionMe; key?: IncomingKey; message?: unknown; media?: { mimetype?: string; data?: string } }

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
  if (!org) return Response.json({ ignored: true });

  return runWithOrg({ org }, async () => {
    const db = serviceDb();
    const cfg = await loadCopilotConfig();
    // Sessão conectada: guarda o próprio JID/LID (self-chat por LID também é reconhecido).
    if (body.me?.id && (body.me.id !== cfg.connected_jid || (body.me.lid ?? null) !== cfg.connected_lid)) {
      await db.from("copilot_config").update({ connected_jid: body.me.id, connected_lid: body.me.lid ?? null, updated_at: new Date().toISOString() }).eq("organization_id", org.id);
    }
    const g = guard(body.key!, body.me ?? { id: cfg.connected_jid, lid: cfg.connected_lid }, cfg.admin_phones);
    if (!g.ok) return Response.json({ ignored: true });

    // Unique (organization_id, provider_id): mensagem repetida ou resposta do próprio bot não processa de novo.
    const { error } = await db.from("copilot_messages").insert({ phone: g.phone, direction: "in", provider_id: msgId, kind: "in", text: null });
    if (error) return Response.json({ duplicate: true });

    const { data: s } = await db.from("copilot_sessions").select("data").eq("phone", g.phone).maybeSingle();
    const numbered = Array.isArray((s?.data as { opts?: unknown })?.opts) ? ((s!.data as { opts: string[] }).opts) : [];
    const ev = parseMessage(body.message, numbered);
    if (ev.kind === "ignored") return Response.json({ ignored: true });
    const media = body.media?.data && body.media.mimetype ? { mimetype: body.media.mimetype, data: body.media.data } : undefined;

    after(() => runWithOrg({ org }, async () => {
      await runCopilot(ev, g, { media, transport: whaileysTransport(cfg, g.phone, g.replyTo) }).catch((e) => console.error(`[copilot:${org.id}]`, (e as Error).message));
      // Contexto curto: mantém só as últimas 50 mensagens do telefone.
      const { data: old } = await db.from("copilot_messages").select("id").eq("phone", g.phone).order("created_at", { ascending: false }).range(50, 500);
      if (old?.length) await db.from("copilot_messages").delete().in("id", old.map((r) => r.id));
    }));
    return Response.json({ received: true });
  });
});

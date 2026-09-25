import { HttpError, errorResponse, requireStaff } from "@/lib/server/supabase";
import { isWhatsAppEnabled, sendWhatsApp } from "@/lib/server/whatsapp";

/**
 * Conexão do WhatsApp da LOCAKAR (Evolution API), usada em Configurações. Somente equipe.
 * GET  → estado (conectado/aguardando QR) + QR Code quando desconectado.
 * POST → { action: "logout" | "restart" | "test", phone? }.
 * A chave da Evolution nunca sai do servidor.
 */
export const dynamic = "force-dynamic";

const instance = () => process.env.EVOLUTION_INSTANCE || "locakar";

async function evo(path: string, init?: RequestInit) {
  const base = process.env.EVOLUTION_API_URL!.replace(/\/+$/, "");
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { apikey: process.env.EVOLUTION_API_KEY!, "Content-Type": "application/json", ...init?.headers },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

/** Cria a instância se ainda não existir (primeiro acesso em um servidor novo). */
async function ensureInstance() {
  const found = await evo(`/instance/fetchInstances?instanceName=${encodeURIComponent(instance())}`);
  const list = Array.isArray(found.json) ? found.json : [];
  if (found.ok && list.length) return list[0];
  const created = await evo("/instance/create", {
    method: "POST",
    body: JSON.stringify({ instanceName: instance(), integration: "WHATSAPP-BAILEYS", qrcode: true, groupsIgnore: true }),
  });
  if (!created.ok) throw new HttpError(502, "Não foi possível criar a conexão no servidor do WhatsApp.");
  return created.json.instance;
}

export async function GET() {
  try {
    await requireStaff();
    if (!isWhatsAppEnabled()) return Response.json({ configured: false });
    const info = await ensureInstance();
    const state = await evo(`/instance/connectionState/${encodeURIComponent(instance())}`);
    const connected = state.json?.instance?.state === "open";
    if (connected) {
      const owner: string | undefined = info?.ownerJid;
      return Response.json({
        configured: true,
        instance: instance(),
        connected: true,
        number: owner ? owner.split("@")[0] : undefined,
        profileName: info?.profileName ?? undefined,
      });
    }
    // Desconectado: pede um QR novo (expira em ~40s; a tela busca de novo sozinha).
    const qr = await evo(`/instance/connect/${encodeURIComponent(instance())}`);
    return Response.json({
      configured: true,
      instance: instance(),
      connected: false,
      qr: typeof qr.json?.base64 === "string" ? qr.json.base64 : undefined,
    });
  } catch (e) {
    if ((e as Error).name === "TimeoutError") return Response.json({ error: "Servidor do WhatsApp não respondeu." }, { status: 504 });
    return errorResponse(e);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase } = await requireStaff();
    if (!isWhatsAppEnabled()) throw new HttpError(409, "WhatsApp não configurado no servidor.");
    const body = (await request.json().catch(() => ({}))) as { action?: string; phone?: string };

    if (body.action === "logout") {
      await evo(`/instance/logout/${encodeURIComponent(instance())}`, { method: "DELETE" });
      return Response.json({ ok: true });
    }
    if (body.action === "restart") {
      await evo(`/instance/restart/${encodeURIComponent(instance())}`, { method: "POST" });
      return Response.json({ ok: true });
    }
    if (body.action === "test") {
      const result = await sendWhatsApp(supabase, {
        kind: "alert_digest",
        phone: body.phone,
        text: "✅ *Teste de WhatsApp — LOCAKAR*\n\nSe você recebeu esta mensagem, as notificações automáticas estão funcionando.",
      });
      if (!result.ok) throw new HttpError(422, result.error ?? "Falha no envio.");
      return Response.json({ ok: true });
    }
    throw new HttpError(400, "Ação inválida.");
  } catch (e) {
    return errorResponse(e);
  }
}

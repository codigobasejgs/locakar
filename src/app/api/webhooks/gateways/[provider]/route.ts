import { after } from "next/server";
import { sameTokenHash, sha256Hex, verifyMercadoPago, verifyPagBank } from "@/lib/gateway-signature";
import { isGateway, readMercadoPagoPayment, type GatewayId } from "@/lib/gateways";
import { decryptGatewaySecret, gatewayFetchPayment, gatewayKeyName, loadGateways, reconcileGateway } from "@/lib/server/gateways";
import { loadOrg, runWithOrg, scoped } from "@/lib/server/org-context";
import { serviceDb } from "@/lib/server/push";
import { audit, clientIp } from "@/lib/server/tenant";

/**
 * Webhooks de Mercado Pago, PagBank e Pagar.me. /api/webhooks/gateways/<provider>?o=<organização>
 * 1. autenticidade: MP = x-signature (HMAC); PagBank = x-authenticity-token (sha256 token-corpo); Pagar.me = token na URL;
 * 2. o corpo NUNCA quita nada: só aponta qual tentativa consultar; a baixa vem da consulta ao gateway;
 * 3. responde rápido (200) e consulta depois (after). Baixa idempotente (confirmPaid).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const findUuid = (v: unknown) => (typeof v === "string" ? v.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0] ?? null : null);

export const POST = scoped(async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(request.url);
  const orgId = url.searchParams.get("o") ?? "";
  if (!isGateway(provider) || !UUID.test(orgId)) return Response.json({ ok: false }, { status: 404 });
  const raw = await request.text();
  if (raw.length > 200_000) return Response.json({ ok: false }, { status: 413 });
  const org = await loadOrg(orgId);
  // Locadora inexistente: 200 para o gateway não reenviar para sempre.
  if (!org) return Response.json({ ok: true });

  return runWithOrg({ org }, async () => {
    const db = serviceDb();
    const row = (await loadGateways(db))[provider as GatewayId];
    if (!row?.credential_enc) return Response.json({ ok: true });
    let body: Record<string, unknown> = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { /* MP antigo manda query string; tratado abaixo */ }

    // ---------- Autenticidade + o que consultar ----------
    let txId: string | null = null;
    let hint: string | null = null;
    let ok = false;
    if (provider === "mercadopago") {
      const dataId = url.searchParams.get("data.id") ?? (body.data as { id?: unknown } | undefined)?.id?.toString() ?? null;
      const type = url.searchParams.get("type") ?? String(body.type ?? "");
      const secret = row.webhook_secret_enc ? decryptGatewaySecret(row.webhook_secret_enc, gatewayKeyName) : "";
      ok = verifyMercadoPago({ xSignature: request.headers.get("x-signature"), xRequestId: request.headers.get("x-request-id"), dataId, secret, toleranceSeconds: 600 });
      if (type !== "payment" || !dataId || !/^\d{1,20}$/.test(dataId)) return Response.json({ ok: true }); // outros tópicos: ignorados
      hint = dataId; // pagamento do MP; a tentativa vem do external_reference na consulta
    } else if (provider === "pagbank") {
      const token = decryptGatewaySecret(row.credential_enc, gatewayKeyName);
      ok = verifyPagBank(raw, token, request.headers.get("x-authenticity-token"));
      txId = findUuid(body.reference_id);
      hint = typeof body.id === "string" && body.id.startsWith("ORDE_") ? body.id : null;
    } else {
      const token = url.searchParams.get("t") ?? "";
      const stored = row.webhook_secret_enc ? decryptGatewaySecret(row.webhook_secret_enc, gatewayKeyName) : "";
      ok = Boolean(stored) && sameTokenHash(token, sha256Hex(stored));
      const data = (body.data ?? {}) as Record<string, unknown>;
      const order = (data.order ?? data) as Record<string, unknown>;
      txId = findUuid(order.code) ?? findUuid(JSON.stringify(order.items ?? ""));
      hint = typeof order.id === "string" && order.id.startsWith("or_") ? order.id : null;
    }

    await audit({ actorType: "system", action: `${provider}_webhook_received`, entity: "payment_transactions", entityId: txId, details: { ok, hint }, ip: clientIp(request) });
    // Assinatura inválida: 401 (o gateway reenvia; um atacante não consegue nada além de nos fazer consultar).
    if (!ok) return Response.json({ ok: false }, { status: 401 });

    after(() => runWithOrg({ org }, async () => {
      try {
        let id = txId;
        // Mercado Pago avisa só o id do pagamento: a tentativa vem do external_reference (lido do próprio MP).
        if (!id && provider === "mercadopago" && hint) {
          const ref = readMercadoPagoPayment(await gatewayFetchPayment("mercadopago", hint)).reference;
          id = ref && UUID.test(ref) ? ref : null;
        }
        if (!id) return;
        const decision = await reconcileGateway(db, provider as GatewayId, id, hint);
        await audit({ actorType: "system", action: `${provider}_webhook_processed`, entity: "payment_transactions", entityId: id, details: { decision } });
      } catch (e) {
        console.error(`[${provider}] webhook:`, (e as Error).message);
      }
    }));
    return Response.json({ ok: true });
  });
});

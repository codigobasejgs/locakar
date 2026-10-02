import { chargeFor } from "@/lib/billing";
import { formatCurrency, formatDate, todaySP } from "@/lib/utils";
import { loadSettings, notifyStaff, serviceDb } from "@/lib/server/push";
import { HttpError, errorResponse } from "@/lib/server/supabase";
import { createHash } from "node:crypto";
import { audit, corsHeaders, requireTenant, tenantOptions } from "@/lib/server/tenant";
import { fromRow } from "@/repositories/mapping";
import type { Rental } from "@/types";

/**
 * "Já paguei" no App do Locatário: registra o comprovante para a equipe aprovar.
 * POST { rentalId, receiptId, proofPath }
 * - A locação e a parcela precisam ser do cliente logado (lidas com a sessão dele: RLS).
 * - O arquivo precisa estar na pasta do cliente no bucket privado `comprovantes`.
 * - O valor vem do servidor (parcela + multa/juros do dia), nunca do app.
 * - Uma análise por parcela: repetir o envio não duplica.
 * Não marca nada como pago: só a equipe aprova.
 */
export const dynamic = "force-dynamic";

export const OPTIONS = tenantOptions;

export async function POST(request: Request) {
  const headers = corsHeaders(request);
  try {
    const { db, clientId, ip } = await requireTenant(request);
    const body = (await request.json().catch(() => ({}))) as { rentalId?: unknown; receiptId?: unknown; proofPath?: unknown };
    const rentalId = typeof body.rentalId === "string" ? body.rentalId : "";
    const receiptId = typeof body.receiptId === "string" ? body.receiptId : "";
    const proofPath = typeof body.proofPath === "string" ? body.proofPath : "";
    if (!rentalId || !receiptId || !proofPath) throw new HttpError(422, "Dados do comprovante incompletos.");

    // Caminho do arquivo: <client_id>/<nome>, sem subir de pasta.
    if (!proofPath.startsWith(`${clientId}/`) || proofPath.includes("..") || proofPath.length > 300) {
      throw new HttpError(422, "Arquivo do comprovante inválido.");
    }

    const { data: row } = await db.from("tenant_rentals").select("*").eq("id", rentalId).maybeSingle();
    if (!row) throw new HttpError(404, "Locação não encontrada.");
    const rental = fromRow<Rental>(row);
    const installment = rental.receipts.find((r) => r.id === receiptId);
    if (!installment) throw new HttpError(404, "Parcela não encontrada.");
    if (installment.paid) throw new HttpError(409, "Esta parcela já está paga.");

    const admin = serviceDb();
    // O arquivo precisa existir no Storage (enviado pelo app antes desta chamada).
    const folder = proofPath.slice(0, proofPath.lastIndexOf("/"));
    const name = proofPath.slice(proofPath.lastIndexOf("/") + 1);
    const { data: files } = await admin.storage.from("comprovantes").list(folder, { search: name, limit: 1 });
    if (!files?.some((f) => f.name === name)) throw new HttpError(422, "O arquivo do comprovante não foi encontrado. Envie novamente.");
    // Impressão digital da imagem: a mesma usada em outro pagamento vira sinal na Central de Segurança.
    const { data: blob } = await admin.storage.from("comprovantes").download(proofPath);
    if (!blob) throw new HttpError(422, "Não foi possível ler o comprovante.");
    const bytes = Buffer.from(await blob.arrayBuffer());
    const pdf = bytes.subarray(0, 5).toString() === "%PDF-";
    const jpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (bytes.length > 7 * 1024 * 1024 || !(pdf || jpg || png)) throw new HttpError(422, "Envie um comprovante PDF, JPG ou PNG de até 7 MB.");
    const sha = createHash("sha256").update(bytes).digest("hex");

    const today = todaySP();
    const settings = await loadSettings(admin);
    if (settings.pix.enabled === false) {
      // Reenvio de comprovante antigo recusado continua disponível: não é uma nova escolha de pagamento.
      const { data: previous, error } = await admin.from("payment_receipts").select("status")
        .eq("client_id", clientId).eq("rental_id", rentalId).eq("receipt_id", receiptId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error || previous?.status !== "rejected") throw new HttpError(409, "Pagamento por Pix com comprovante está desativado no momento.");
    }
    const charge = chargeFor(rental, receiptId, settings.pix, today);
    const amount = charge?.total ?? installment.amount;

    const { data: created, error } = await admin
      .from("payment_receipts")
      .insert({ client_id: clientId, rental_id: rentalId, receipt_id: receiptId, amount, proof_url: proofPath, proof_sha256: sha, status: "pending_review", payment_date: today })
      .select("id")
      .single();
    if (error) {
      // Índice único: já existe um comprovante desta parcela em análise.
      if (error.code === "23505") throw new HttpError(409, "Já existe um comprovante desta parcela em análise.");
      throw new HttpError(500, "Não foi possível registrar o comprovante.");
    }

    await audit({ actorType: "client", actorId: clientId, action: "payment_receipt.submitted", entity: "payment_receipts", entityId: created.id, details: { rentalId, receiptId, amount }, ip });
    const { data: client } = await db.from("tenant_profile").select("name").single();
    await notifyStaff([
      {
        type: "payment.receipt_submitted",
        category: "payments",
        severity: "warning",
        title: "Novo comprovante de pagamento",
        body: `${client?.name ?? "Cliente"} · ${charge?.label ?? "parcela"} · ${formatCurrency(amount)} · vencimento ${formatDate(installment.dueDate)}`,
        url: "/admin/finance",
        dedupeKey: `payment_receipt:${created.id}`,
      },
    ]);

    return Response.json({ ok: true, id: created.id, amount }, { headers });
  } catch (e) {
    const res = errorResponse(e);
    Object.entries(headers).forEach(([k, v]) => res.headers.set(k, v));
    return res;
  }
}

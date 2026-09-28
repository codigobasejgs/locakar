import { HttpError, errorResponse, requireStaff } from "@/lib/server/supabase";
import { sendPushToClient, serviceDb } from "@/lib/server/push";
import { emailLayout, sendEmail } from "@/lib/server/email";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Client, Rental } from "@/types";

export const dynamic = "force-dynamic";

/**
 * Consulta de comprovantes para o painel administrativo.
 * GET  → lista comprovantes pendentes de revisão
 * POST → { action: "approve" | "reject", receiptId, rejectionReason? }
 */
export async function GET() {
  try {
    const { supabase } = await requireStaff();
    const { data, error } = await supabase
      .from("payment_receipts")
      .select(`
        id,
        rental_id,
        receipt_id,
        client_id,
        amount,
        payment_date,
        proof_url,
        status,
        created_at
      `)
      .order("created_at", { ascending: false });

    if (error) throw new HttpError(500, error.message);
    return Response.json({ receipts: data || [] });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, email: staffEmail } = await requireStaff();
    const body = (await request.json().catch(() => ({}))) as {
      action?: "approve" | "reject";
      receiptId?: string;
      rejectionReason?: string;
    };

    if (!body.receiptId || !body.action) {
      throw new HttpError(400, "Dados incompletos.");
    }

    const db = serviceDb();

    // 1. Busca o registro do comprovante
    const { data: proof, error: proofErr } = await db
      .from("payment_receipts")
      .select("*")
      .eq("id", body.receiptId)
      .maybeSingle();

    if (proofErr || !proof) throw new HttpError(404, "Comprovante não encontrado.");
    if (proof.status !== "pending_review") {
      throw new HttpError(409, `Este comprovante já foi ${proof.status === "approved" ? "aprovado" : "rejeitado"}.`);
    }

    const { data: client } = await db.from("clients").select("*").eq("id", proof.client_id).maybeSingle();
    const { data: rental } = await db.from("rentals").select("*").eq("id", proof.rental_id).maybeSingle();

    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    if (body.action === "approve") {
      // 2. Atualiza a parcela na locação
      if (rental && Array.isArray(rental.receipts)) {
        const updatedReceipts = rental.receipts.map((r: any) =>
          r.id === proof.receipt_id
            ? { ...r, paid: true, paidAt: today, amountPaid: Number(proof.amount) }
            : r
        );

        await db
          .from("rentals")
          .update({ receipts: updatedReceipts, updated_at: now })
          .eq("id", proof.rental_id);
      }

      // 3. Atualiza o status do comprovante
      await db
        .from("payment_receipts")
        .update({
          status: "approved",
          reviewed_at: now,
          updated_at: now,
        })
        .eq("id", proof.id);

      // 4. Notifica o locatário (Push no celular + e-mail)
      if (client) {
        await sendPushToClient(client.id, {
          title: "Pagamento aprovado! ✅",
          body: `Seu pagamento de ${formatCurrency(Number(proof.amount))} foi confirmado pela LOCAKAR.`,
          url: "/(tabs)/pagamentos",
          severity: "success",
          tag: `receipt-approved-${proof.id}`,
        });

        if (client.email) {
          await sendEmail(db, {
            kind: "receipt",
            to: client.email,
            subject: `Pagamento confirmado — ${formatCurrency(Number(proof.amount))} — LOCAKAR`,
            rentalId: proof.rental_id,
            html: emailLayout({
              title: "Pagamento aprovado",
              intro: `Olá, ${client.name}! Confirmamos o recebimento da sua parcela de ${formatCurrency(Number(proof.amount))}.`,
              rows: [
                ["Valor confirmado", formatCurrency(Number(proof.amount))],
                ["Data de confirmação", formatDate(today)],
                ["Locação", proof.rental_id.slice(0, 8).toUpperCase()],
              ],
              footerNote: "Seu comprovante foi validado com sucesso pela nossa equipe.",
            }),
          }).catch((err) => console.error("[comprovante] erro email:", err));
        }
      }

      return Response.json({ ok: true, status: "approved" });
    }

    if (body.action === "reject") {
      const reason = body.rejectionReason?.trim() || "Comprovante ilegível ou divergente.";

      await db
        .from("payment_receipts")
        .update({
          status: "rejected",
          rejection_reason: reason,
          reviewed_at: now,
          updated_at: now,
        })
        .eq("id", proof.id);

      // Notifica o locatário com o motivo
      if (client) {
        await sendPushToClient(client.id, {
          title: "Comprovante não aprovado ⚠️",
          body: `Motivo: ${reason}. Por favor, acesse o app e envie novamente.`,
          url: "/(tabs)/pagamentos",
          severity: "warning",
          tag: `receipt-rejected-${proof.id}`,
        });
      }

      return Response.json({ ok: true, status: "rejected", reason });
    }

    throw new HttpError(400, "Ação inválida.");
  } catch (e) {
    return errorResponse(e);
  }
}

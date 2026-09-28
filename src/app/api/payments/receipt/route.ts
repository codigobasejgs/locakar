import { emailLayout, sendEmail } from "@/lib/server/email";
import { sendPushToClient, serviceDb } from "@/lib/server/push";
import { HttpError, errorResponse, requireStaff } from "@/lib/server/supabase";
import { formatCurrency, formatDate, todaySP } from "@/lib/utils";
import { fromRow } from "@/repositories/mapping";
import type { Rental } from "@/types";

/**
 * Comprovantes enviados pelo App do Locatário. Somente equipe.
 * GET  → comprovantes em análise, com nome do cliente, parcela e link temporário da imagem
 * POST → { action: "approve" | "reject", receiptId, rejectionReason? }
 * Aprovar marca a parcela como paga (valor do comprovante, calculado pelo servidor no envio).
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { supabase } = await requireStaff();
    const { data, error } = await supabase
      .from("payment_receipts")
      .select("id,rental_id,receipt_id,client_id,amount,payment_date,proof_url,status,created_at")
      .eq("status", "pending_review")
      .order("created_at", { ascending: true });
    if (error) throw new HttpError(500, error.message);
    if (!data?.length) return Response.json({ receipts: [] });

    const ids = (k: "client_id" | "rental_id") => [...new Set(data.map((r) => r[k] as string))];
    const [clients, rentals, urls] = await Promise.all([
      supabase.from("clients").select("id,name").in("id", ids("client_id")),
      supabase.from("rentals").select("id,receipts,vehicle_id").in("id", ids("rental_id")),
      supabase.storage.from("comprovantes").createSignedUrls(data.map((r) => r.proof_url), 600),
    ]);
    const nameById = new Map((clients.data ?? []).map((c) => [c.id, c.name as string]));
    const rentalById = new Map((rentals.data ?? []).map((r) => [r.id, fromRow<Pick<Rental, "receipts">>(r)]));
    const urlByPath = new Map((urls.data ?? []).map((u) => [u.path, u.signedUrl]));

    return Response.json({
      receipts: data.map((r) => {
        const receipts = rentalById.get(r.rental_id)?.receipts ?? [];
        const index = receipts.findIndex((x) => x.id === r.receipt_id);
        return {
          id: r.id,
          rentalId: r.rental_id,
          clientName: nameById.get(r.client_id) ?? "Cliente",
          amount: Number(r.amount),
          installment: index >= 0 ? { number: index + 1, dueDate: receipts[index].dueDate, amount: receipts[index].amount } : null,
          createdAt: r.created_at,
          imageUrl: urlByPath.get(r.proof_url) ?? null,
        };
      }),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase } = await requireStaff();
    const { data: claims } = await supabase.auth.getClaims();
    const reviewer = claims!.claims.sub as string;
    const body = (await request.json().catch(() => ({}))) as { action?: string; receiptId?: string; rejectionReason?: string };
    if (typeof body.receiptId !== "string" || (body.action !== "approve" && body.action !== "reject")) throw new HttpError(400, "Dados incompletos.");

    const db = serviceDb();
    const now = new Date().toISOString();
    const reason = body.rejectionReason?.trim().slice(0, 300);
    if (body.action === "reject" && !reason) throw new HttpError(422, "Informe o motivo da rejeição.");

    // Troca de status atômica: só sai de "em análise" uma vez (duas pessoas aprovando juntas não duplica).
    const { data: proof } = await db
      .from("payment_receipts")
      .update(
        body.action === "approve"
          ? { status: "approved", reviewed_by: reviewer, reviewed_at: now, updated_at: now }
          : { status: "rejected", rejection_reason: reason, reviewed_by: reviewer, reviewed_at: now, updated_at: now },
      )
      .eq("id", body.receiptId)
      .eq("status", "pending_review")
      .select("*")
      .maybeSingle();
    if (!proof) throw new HttpError(409, "Este comprovante já foi analisado.");

    const [{ data: client }, { data: rentalRow }] = await Promise.all([
      db.from("clients").select("id,name,email").eq("id", proof.client_id).maybeSingle(),
      db.from("rentals").select("*").eq("id", proof.rental_id).maybeSingle(),
    ]);
    const rental = rentalRow ? fromRow<Rental>(rentalRow) : null;
    const index = rental ? rental.receipts.findIndex((r) => r.id === proof.receipt_id) : -1;
    const amount = Number(proof.amount);

    if (body.action === "approve") {
      if (rental && index >= 0) {
        const receipts = rental.receipts.map((r) => (r.id === proof.receipt_id ? { ...r, paid: true, paidAt: todaySP(), amountPaid: amount } : r));
        await db.from("rentals").update({ receipts, updated_at: now }).eq("id", rental.id);
      }
      if (client) {
        await sendPushToClient(client.id, {
          title: "Pagamento aprovado",
          body: `Recebemos seu pagamento de ${formatCurrency(amount)}${index >= 0 ? ` (parcela ${index + 1})` : ""}.`,
          url: "/",
          severity: "success",
          tag: `receipt-${proof.id}`,
        });
        if (client.email) {
          await sendEmail(db, {
            kind: "receipt",
            to: client.email,
            rentalId: proof.rental_id,
            subject: `Pagamento confirmado — ${formatCurrency(amount)} — LOCAKAR`,
            html: emailLayout({
              title: "Pagamento confirmado",
              intro: `Olá, ${client.name}! Conferimos seu comprovante e confirmamos o pagamento abaixo.`,
              rows: [
                ["Parcela", index >= 0 ? String(index + 1) : "—"],
                ["Vencimento", index >= 0 && rental ? formatDate(rental.receipts[index].dueDate) : "—"],
                ["Valor recebido", formatCurrency(amount)],
                ["Confirmado em", formatDate(todaySP())],
              ],
            }),
          }).catch((e) => console.error("[comprovante] e-mail:", (e as Error).message));
        }
      }
      return Response.json({ ok: true, status: "approved" });
    }

    if (client) {
      await sendPushToClient(client.id, {
        title: "Comprovante não aprovado",
        body: `Motivo: ${reason}. Abra o app e envie de novo.`,
        url: "/",
        severity: "warning",
        tag: `receipt-${proof.id}`,
      });
    }
    return Response.json({ ok: true, status: "rejected" });
  } catch (e) {
    return errorResponse(e);
  }
}

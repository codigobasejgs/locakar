import { chargeFor } from "@/lib/billing";
import { COMPANY } from "@/lib/company";
import { loadSettings, serviceDb } from "@/lib/server/push";
import { errorResponse } from "@/lib/server/supabase";
import { corsHeaders, requireTenant } from "@/lib/server/tenant";
import { todaySP } from "@/lib/utils";
import { fromRow } from "@/repositories/mapping";
import type { Rental } from "@/types";

/**
 * Tudo que a tela inicial do App do Locatário precisa, em uma chamada.
 * Parcelas já vêm com o valor do dia (multa/juros), o PIX copia e cola e o status do comprovante.
 * Nada de custo interno, fornecedor ou dado de outro cliente.
 */
export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request: Request) {
  const headers = corsHeaders(request);
  try {
    const { db, clientId } = await requireTenant(request);
    const today = todaySP();

    const [client, rentals, vehicles, proofs] = await Promise.all([
      db.from("clients").select("id,name,cpf,email,phone,cnh_expiry,cnh_number,cnh_category").eq("id", clientId).single(),
      db.from("rentals").select("*").eq("client_id", clientId).order("start_date", { ascending: false }),
      db.from("tenant_vehicles").select("*"),
      db.from("payment_receipts").select("id,rental_id,receipt_id,status,rejection_reason,created_at").order("created_at", { ascending: false }),
    ]);
    if (client.error) throw client.error;

    // Configurações só pelo servidor (settings é restrito à equipe): usa a chave de serviço.
    const settings = process.env.SUPABASE_SECRET_KEY ? await loadSettings(serviceDb()) : null;

    const vehicleById = new Map((vehicles.data ?? []).map((v) => [v.id, fromRow<Record<string, unknown>>(v)]));
    const latestProof = new Map<string, { status: string; rejectionReason?: string }>();
    for (const p of proofs.data ?? []) {
      const key = `${p.rental_id}:${p.receipt_id}`;
      if (!latestProof.has(key)) latestProof.set(key, { status: p.status, rejectionReason: p.rejection_reason ?? undefined });
    }

    const list = (rentals.data ?? []).map((row) => {
      const r = fromRow<Rental>(row);
      return {
        id: r.id,
        status: r.status,
        startDate: r.startDate,
        endDate: r.endDate,
        contractType: r.contractType,
        deposit: r.deposit ?? null,
        vehicle: vehicleById.get(r.vehicleId) ?? null,
        billing: r.billing ?? null,
        installments: r.receipts.map((x) => {
          const c = settings ? chargeFor(r, x.id, settings.pix, today) : null;
          const proof = latestProof.get(`${r.id}:${x.id}`);
          return {
            id: x.id,
            label: c?.label ?? "",
            dueDate: x.dueDate,
            amount: x.amount,
            paid: x.paid,
            paidAt: x.paidAt ?? null,
            amountPaid: x.amountPaid ?? null,
            late: c?.late ?? false,
            fee: c?.fee ?? 0,
            interest: c?.interest ?? 0,
            total: c?.total ?? x.amount,
            pixCode: x.paid ? null : (c?.code ?? null),
            proofStatus: proof?.status ?? null,
            rejectionReason: proof?.status === "rejected" ? (proof.rejectionReason ?? null) : null,
          };
        }),
      };
    });

    const c = client.data;
    return Response.json(
      {
        client: { id: c.id, name: c.name, cpf: c.cpf, email: c.email, phone: c.phone, cnhExpiry: c.cnh_expiry, cnhNumber: c.cnh_number, cnhCategory: c.cnh_category },
        rentals: list,
        pix: settings?.pix.name ? { name: settings.pix.name } : null,
        // WhatsApp comercial oficial (lib/company.ts), o mesmo do site.
        support: { whatsapp: COMPANY.whatsapp.e164, display: COMPANY.whatsapp.display },
        today,
      },
      { headers },
    );
  } catch (e) {
    const res = errorResponse(e);
    Object.entries(headers).forEach(([k, v]) => res.headers.set(k, v));
    return res;
  }
}

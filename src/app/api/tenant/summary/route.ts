import { PRIVACY_VERSION } from "@/lib/antifraud";
import { chargeFor } from "@/lib/billing";
import { COMPANY } from "@/lib/company";
import { loadSettings, serviceDb } from "@/lib/server/push";
import { errorResponse } from "@/lib/server/supabase";
import { corsHeaders, requireTenant, tenantOptions } from "@/lib/server/tenant";
import { normalizeHandle } from "@/lib/infinitepay";
import { todaySP } from "@/lib/utils";
import { fromRow } from "@/repositories/mapping";
import type { Rental } from "@/types";

/**
 * Tudo que a tela inicial do App do Locatário precisa, em uma chamada.
 * Parcelas já vêm com o valor do dia (multa/juros), o PIX copia e cola e o status do comprovante.
 * Nada de custo interno, fornecedor ou dado de outro cliente.
 */
export const dynamic = "force-dynamic";

export const OPTIONS = tenantOptions;

export async function GET(request: Request) {
  const headers = corsHeaders(request);
  try {
    const { db } = await requireTenant(request);
    const today = todaySP();

    // Views do locatário: só os dados dele e sem campos internos (observações da equipe, custos...).
    const [client, rentals, vehicles, proofs, consent, lastRequest, fleet] = await Promise.all([
      db.from("tenant_profile").select("*").maybeSingle(),
      db.from("tenant_rentals").select("*").order("start_date", { ascending: false }),
      db.from("tenant_vehicles").select("*"),
      db.from("payment_receipts").select("id,rental_id,receipt_id,status,rejection_reason,created_at").order("created_at", { ascending: false }),
      db.from("tenant_consents").select("policy_version,scopes,consented_at").order("consented_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("rental_requests").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("tenant_fleet").select("*").order("name"),
    ]);

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
        kmStart: r.kmStart ?? null,
        kmEnd: r.kmEnd ?? null,
        delivery: r.deliveryInspection ? { at: r.deliveryInspection.at, km: r.deliveryInspection.km, fuel: r.deliveryInspection.fuel } : null,
        returned: r.returnInspection ? { at: r.returnInspection.at, km: r.returnInspection.km, fuel: r.returnInspection.fuel } : null,
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

    const c = client.data ?? { id: "", name: "Locatário", cpf: "", email: null, phone: "", cnhExpiry: null, cnhNumber: null, cnhCategory: null };
    const req = lastRequest.data;
    const reqVehicle = req ? (fleet.data ?? []).find((v) => v.id === req.vehicle_id) : null;
    const pendingRequest = req
      ? {
          id: req.id,
          vehicleId: req.vehicle_id,
          vehicleName: reqVehicle?.name ?? "Veículo",
          vehicleCategory: reqVehicle?.category ?? "—",
          vehicleImage: reqVehicle?.image ?? null,
          startDate: req.start_date,
          endDate: req.end_date,
          planType: req.plan_type,
          rateAmount: Number(req.rate_amount),
          depositAmount: Number(req.deposit_amount ?? 0),
          status: req.status,
          rejectionReason: req.rejection_reason,
          correctionNotes: req.correction_notes,
          createdAt: req.created_at,
        }
      : null;

    return Response.json(
      {
        client: { id: c.id, name: c.name, cpf: c.cpf, email: c.email, phone: c.phone, cnhExpiry: c.cnh_expiry, cnhNumber: c.cnh_number, cnhCategory: c.cnh_category },
        rentals: list,
        fleet: (fleet.data ?? []).map((v) => ({
          id: v.id,
          name: v.name,
          category: v.category,
          transmission: v.transmission,
          fuel: v.fuel,
          seats: v.seats,
          image: v.image,
          dailyRate: v.daily_rate,
          weeklyRate: v.weekly_rate,
        })),
        pendingRequest,
        pix: settings?.pix.name ? { name: settings.pix.name } : null,
        // Cartão/Pix pela InfinitePay (Checkout): só aparece no app quando a equipe ativou e informou a InfiniteTag.
        infinitepay: settings?.infinitepay?.enabled && settings.infinitepay.mode !== "tap" && normalizeHandle(settings.infinitepay.handle) ? { checkout: true } : null,
        support: { whatsapp: COMPANY.whatsapp.e164, display: COMPANY.whatsapp.display },
        today,
        privacyVersion: PRIVACY_VERSION,
        consent: consent.data?.policy_version === PRIVACY_VERSION ? { scopes: consent.data.scopes as string[], at: consent.data.consented_at } : null,
      },
      { headers },
    );
  } catch (e) {
    const res = errorResponse(e);
    Object.entries(headers).forEach(([k, v]) => res.headers.set(k, v));
    return res;
  }
}

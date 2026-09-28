import { HttpError } from "@/lib/server/supabase";
import { tenantOptions, tenantRoute } from "@/lib/server/tenant";

/**
 * Aba "Veículo" e "Multas" do app: manutenções do carro atual (sem custo nem fornecedor) e multas do cliente.
 * Tudo por views com RLS: nenhum dado de outro cliente ou interno da locadora.
 */
export const dynamic = "force-dynamic";
export const OPTIONS = tenantOptions;

export const GET = tenantRoute(async (_request, { db }) => {
  const [maintenance, fines] = await Promise.all([
    db.from("client_vehicle_maintenance").select("*").order("date", { ascending: false }).limit(30),
    db.from("tenant_fines").select("*").order("infraction_date", { ascending: false }).limit(50),
  ]);
  if (maintenance.error || fines.error) throw new HttpError(500, "Não foi possível carregar.");
  return {
    maintenance: (maintenance.data ?? []).map((m) => ({
      id: m.id,
      vehicleId: m.vehicle_id,
      date: m.date,
      description: m.description,
      currentKm: m.current_km,
      nextKm: m.next_km,
      status: m.status,
    })),
    fines: (fines.data ?? []).map((f) => ({
      id: f.id,
      vehicleId: f.vehicle_id,
      noticeNumber: f.notice_number,
      infractionDate: f.infraction_date,
      driverIdDeadline: f.driver_id_deadline,
      discountDeadline: f.discount_deadline,
      description: f.description,
      dueDate: f.due_date,
      amount: Number(f.amount),
      paymentDate: f.payment_date,
      status: f.status,
    })),
  };
});

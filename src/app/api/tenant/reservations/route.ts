import { addDays, formatDate, todaySP } from "@/lib/utils";
import { notifyClientSubmission, notifyStaff, serviceDb } from "@/lib/server/push";
import { HttpError } from "@/lib/server/supabase";
import { audit, readBody, tenantOptions, tenantRoute } from "@/lib/server/tenant";
import { isIsoDate } from "@/lib/tenant";
import { brand } from "@/lib/server/org-context";

/**
 * Pedidos de reserva pelo app.
 * GET  → reservas do cliente + frota disponível para pedir (sem placa nem dados internos)
 * POST → { action: "create", vehicleId, startDate, endDate } | { action: "cancel", id }
 * O pedido nasce "pending": a equipe confirma no painel. Conflito com outra reserva ou locação é recusado
 * aqui (e o banco também impede reservas sobrepostas).
 */
export const dynamic = "force-dynamic";
export const OPTIONS = tenantOptions;

export const GET = tenantRoute(async (_request, { db }) => {
  const [reservations, fleet] = await Promise.all([
    db.from("tenant_reservations").select("*").order("start_date", { ascending: false }).limit(30),
    db.from("tenant_fleet").select("*").order("name"),
  ]);
  const nameById = new Map((fleet.data ?? []).map((v) => [v.id, v.name as string]));
  return {
    reservations: (reservations.data ?? []).map((r) => ({
      id: r.id,
      vehicleId: r.vehicle_id,
      vehicleName: nameById.get(r.vehicle_id) ?? "Veículo",
      startDate: r.start_date,
      endDate: r.end_date,
      status: r.status,
    })),
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
  };
});

export const POST = tenantRoute(async (request, { db, clientId, ip }) => {
  const body = await readBody(request);
  const admin = serviceDb();
  const { data: profile } = await db.from("tenant_profile").select("name,phone,email").single();

  if (body.action === "cancel") {
    const id = typeof body.id === "string" ? body.id : "";
    // Só a própria reserva e só se ainda não começou.
    const { data: own } = await db.from("tenant_reservations").select("id,status,start_date").eq("id", id).maybeSingle();
    if (!own) throw new HttpError(404, "Reserva não encontrada.");
    if (!["pending", "confirmed"].includes(own.status)) throw new HttpError(409, "Esta reserva não pode mais ser cancelada.");
    const { data: done } = await admin
      .from("reservations")
      .update({ status: "cancelled" })
      .eq("id", id)
      .eq("client_id", clientId)
      .in("status", ["pending", "confirmed"])
      .select("id")
      .maybeSingle();
    if (!done) throw new HttpError(409, "Esta reserva não pode mais ser cancelada.");
    await audit({ actorType: "client", actorId: clientId, action: "reservation.cancelled", entity: "reservations", entityId: id, ip });
    await notifyStaff([
      {
        type: "reservation.cancelled",
        category: "reservations",
        severity: "warning",
        title: "Reserva cancelada pelo cliente",
        body: `${profile?.name ?? "Cliente"} · ${formatDate(own.start_date)}`,
        url: "/admin/reservations",
        dedupeKey: `reservation_cancelled:${id}`,
      },
    ]);
    return { ok: true };
  }

  if (body.action !== "create") throw new HttpError(400, "Ação inválida.");
  const vehicleId = typeof body.vehicleId === "string" ? body.vehicleId : "";
  const { startDate, endDate } = body;
  const today = todaySP();
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) throw new HttpError(422, "Informe as datas de retirada e devolução.");
  if (startDate < today) throw new HttpError(422, "A retirada não pode ser no passado.");
  if (endDate < startDate) throw new HttpError(422, "A devolução precisa ser depois da retirada.");
  if (startDate > addDays(today, 365) || endDate > addDays(startDate, 365)) throw new HttpError(422, `Período muito longo. Fale com a ${brand().name}.`);

  const { data: vehicle } = await db.from("tenant_fleet").select("id,name").eq("id", vehicleId).maybeSingle();
  if (!vehicle) throw new HttpError(404, "Veículo não encontrado.");

  // Limite anti-spam: até 3 pedidos em aberto por cliente.
  const { count } = await admin.from("reservations").select("id", { count: "exact", head: true }).eq("client_id", clientId).eq("status", "pending");
  if ((count ?? 0) >= 3) throw new HttpError(429, `Você já tem 3 pedidos aguardando resposta. Aguarde a ${brand().name} confirmar.`);

  // Conflito com locação em andamento nesse período (o banco cobre reservas sobrepostas).
  const { data: busy } = await admin
    .from("rentals")
    .select("id")
    .eq("vehicle_id", vehicleId)
    .in("status", ["active", "late", "pending"])
    .lte("start_date", endDate)
    .gte("end_date", startDate)
    .limit(1);
  if (busy?.length) throw new HttpError(409, "Este veículo não está disponível nessas datas. Escolha outro período ou outro carro.");

  const { data: created, error } = await admin
    .from("reservations")
    .insert({ client_id: clientId, vehicle_id: vehicleId, start_date: startDate, end_date: endDate, status: "pending", notes: "Pedido pelo app do locatário" })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23P01") throw new HttpError(409, "Este veículo já tem reserva nessas datas. Escolha outro período ou outro carro.");
    throw new HttpError(500, "Não foi possível registrar o pedido.");
  }

  await audit({ actorType: "client", actorId: clientId, action: "reservation.requested", entity: "reservations", entityId: created.id, details: { vehicleId, startDate, endDate }, ip });
  await Promise.all([
    notifyClientSubmission({
      id: created.id,
      clientId,
      client: profile,
      title: "Solicitação de reserva",
      rows: [
        ["Veículo", vehicle.name],
        ["Período", `${formatDate(startDate)} a ${formatDate(endDate)}`],
      ],
      adminUrl: "/admin/reservations",
      screen: "reservas",
    }),
    notifyStaff([
    {
      type: "reservation.created",
      category: "reservations",
      severity: "info",
      title: "Pedido de reserva pelo app",
      body: `${profile?.name ?? "Cliente"} · ${vehicle.name} · ${formatDate(startDate)} a ${formatDate(endDate)}`,
      url: "/admin/reservations",
      dedupeKey: `reservation:${created.id}`,
    },
  ], { companyAlert: false }),
  ]);
  return { ok: true, id: created.id };
});

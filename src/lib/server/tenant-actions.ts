import "server-only";
import { brand } from "@/lib/server/org-context";
import { notifyStaff, serviceDb } from "@/lib/server/push";
import { HttpError } from "@/lib/server/supabase";
import { audit } from "@/lib/server/tenant";
import { DOCUMENT_KIND, INCIDENT_CATEGORY, isIsoDate } from "@/lib/tenant";
import { addDays, formatDate, todaySP } from "@/lib/utils";

/**
 * Ações do locatário compartilhadas entre o App (rotas /api/tenant/*) e o WhatsApp (autoatendimento).
 * Uma única fonte de regras: validação, gravação idempotente, auditoria e aviso à equipe.
 * O clientId SEMPRE vem de quem autenticou (token do app ou telefone verificado), nunca do corpo.
 */
type Via = "app" | "whatsapp";
const label = (via: Via) => (via === "whatsapp" ? "pelo WhatsApp" : "pelo app");

/** Locação do cliente (filtro explícito por client_id além da locadora do serviceDb). */
async function ownRental(clientId: string, rentalId: string) {
  const { data } = await serviceDb().from("rentals").select("id,vehicle_id,status,km_start").eq("id", rentalId).eq("client_id", clientId).maybeSingle();
  if (!data) throw new HttpError(404, "Locação não encontrada.");
  return data as { id: string; vehicle_id: string; status: string; km_start: number | null };
}

async function clientName(clientId: string) {
  const { data } = await serviceDb().from("clients").select("name,phone").eq("id", clientId).maybeSingle();
  return { name: (data?.name as string | undefined) ?? "Cliente", phone: (data?.phone as string | undefined) ?? "—" };
}

export function validIncident(category: unknown, description: unknown) {
  const cat = typeof category === "string" && category in INCIDENT_CATEGORY ? category : null;
  const desc = typeof description === "string" ? description.trim().slice(0, 2000) : "";
  if (!cat) throw new HttpError(422, "Escolha o tipo do problema.");
  if (desc.length < 10) throw new HttpError(422, "Descreva o problema com pelo menos 10 caracteres.");
  return { category: cat, description: desc };
}

/** Ocorrência: idempotente por request_id (reenvio devolve a mesma). Fotos já no bucket ocorrencias/<clientId>/. */
export async function createIncident(p: { clientId: string; rentalId: string; category: unknown; description: unknown; photos: string[]; requestId: string; ip?: string | null; via: Via }) {
  const { category, description } = validIncident(p.category, p.description);
  const rental = await ownRental(p.clientId, p.rentalId);
  const db = serviceDb();
  const { data: created, error } = await db.from("vehicle_incidents")
    .insert({ rental_id: rental.id, client_id: p.clientId, vehicle_id: rental.vehicle_id, category, description, media_urls: p.photos.slice(0, 6), request_id: p.requestId })
    .select("id").single();
  if (error) {
    if (error.code === "23505") {
      const { data: prev } = await db.from("vehicle_incidents").select("id").eq("client_id", p.clientId).eq("request_id", p.requestId).single();
      return { id: prev?.id as string, duplicate: true };
    }
    throw new HttpError(500, "Não foi possível registrar a ocorrência.");
  }
  await audit({ actorType: "client", actorId: p.clientId, action: "incident.created", entity: "vehicle_incidents", entityId: created.id, details: { rentalId: rental.id, category, via: p.via }, ip: p.ip ?? null });
  const [who, { data: vehicle }] = await Promise.all([clientName(p.clientId), db.from("vehicles").select("name,plate").eq("id", rental.vehicle_id).maybeSingle()]);
  await notifyStaff([{
    type: "incident.created",
    category: "vehicles",
    // Acidente é sempre crítico: vai também ao e-mail e WhatsApp de alertas da empresa.
    severity: category === "acidente" ? "critical" : "warning",
    title: `Ocorrência: ${INCIDENT_CATEGORY[category]}`,
    body: `${who.name} (${who.phone}) ${label(p.via)} · ${vehicle?.name ?? "veículo"} ${vehicle?.plate ?? ""} · ${description.slice(0, 140)}`,
    url: "/admin/incidents",
    dedupeKey: `incident:${created.id}`,
  }]);
  return { id: created.id as string, duplicate: false };
}

/** Documento: um em análise por tipo (índice único). Arquivo já em documentos/<clientId>/. */
export async function submitDocument(p: { clientId: string; kind: unknown; path: string; ip?: string | null; via: Via }) {
  const kind = typeof p.kind === "string" && p.kind in DOCUMENT_KIND ? p.kind : null;
  if (!kind) throw new HttpError(422, "Tipo de documento inválido.");
  const { data: created, error } = await serviceDb().from("tenant_documents").insert({ client_id: p.clientId, kind, path: p.path }).select("id").single();
  if (error) {
    if (error.code === "23505") throw new HttpError(409, "Este documento já está em análise. Aguarde a conferência.");
    throw new HttpError(500, "Não foi possível registrar o documento.");
  }
  await audit({ actorType: "client", actorId: p.clientId, action: "document.submitted", entity: "tenant_documents", entityId: created.id, details: { kind, via: p.via }, ip: p.ip ?? null });
  const who = await clientName(p.clientId);
  await notifyStaff([{ type: "document.submitted", category: "documents", severity: "info", title: `Documento enviado: ${DOCUMENT_KIND[kind]}`, body: `${who.name} enviou ${label(p.via)}. Confira em Clientes.`, url: "/admin/incidents?tab=documentos", dedupeKey: `tenant_document:${created.id}` }]);
  return { id: created.id as string, kind };
}

/** Reserva: mesmas regras do app (datas, até 3 pendentes, conflito com locação; o banco barra sobreposição). */
export async function requestReservation(p: { clientId: string; vehicleId: string; startDate: unknown; endDate: unknown; ip?: string | null; via: Via }) {
  const { startDate, endDate } = p;
  const today = todaySP();
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) throw new HttpError(422, "Informe as datas de retirada e devolução.");
  if (startDate < today) throw new HttpError(422, "A retirada não pode ser no passado.");
  if (endDate < startDate) throw new HttpError(422, "A devolução precisa ser depois da retirada.");
  if (startDate > addDays(today, 365) || endDate > addDays(startDate, 365)) throw new HttpError(422, `Período muito longo. Fale com a ${brand().name}.`);
  const db = serviceDb();
  const { data: vehicle } = await db.from("vehicles").select("id,name").eq("id", p.vehicleId).neq("status", "sold").maybeSingle();
  if (!vehicle) throw new HttpError(404, "Veículo não encontrado.");
  const { count } = await db.from("reservations").select("id", { count: "exact", head: true }).eq("client_id", p.clientId).eq("status", "pending");
  if ((count ?? 0) >= 3) throw new HttpError(429, `Você já tem 3 pedidos aguardando resposta. Aguarde a ${brand().name} confirmar.`);
  const { data: busy } = await db.from("rentals").select("id").eq("vehicle_id", p.vehicleId).in("status", ["active", "late", "pending"]).lte("start_date", endDate).gte("end_date", startDate).limit(1);
  if (busy?.length) throw new HttpError(409, "Este veículo não está disponível nessas datas. Escolha outro período ou outro carro.");
  const { data: created, error } = await db.from("reservations")
    .insert({ client_id: p.clientId, vehicle_id: p.vehicleId, start_date: startDate, end_date: endDate, status: "pending", notes: `Pedido ${label(p.via)}` })
    .select("id").single();
  if (error) {
    if (error.code === "23P01") throw new HttpError(409, "Este veículo já tem reserva nessas datas. Escolha outro período ou outro carro.");
    throw new HttpError(500, "Não foi possível registrar o pedido.");
  }
  await audit({ actorType: "client", actorId: p.clientId, action: "reservation.requested", entity: "reservations", entityId: created.id, details: { vehicleId: p.vehicleId, startDate, endDate, via: p.via }, ip: p.ip ?? null });
  const who = await clientName(p.clientId);
  await notifyStaff([{ type: "reservation.created", category: "reservations", severity: "info", title: `Pedido de reserva ${label(p.via)}`, body: `${who.name} · ${vehicle.name} · ${formatDate(startDate)} a ${formatDate(endDate)}`, url: "/admin/reservations", dedupeKey: `reservation:${created.id}` }], { companyAlert: false });
  return { id: created.id as string, vehicleName: vehicle.name as string };
}

/** Cancela reserva própria ainda pendente/confirmada. */
export async function cancelReservation(p: { clientId: string; id: string; ip?: string | null; via: Via }) {
  const { data: done } = await serviceDb().from("reservations").update({ status: "cancelled" }).eq("id", p.id).eq("client_id", p.clientId).in("status", ["pending", "confirmed"]).select("id,start_date").maybeSingle();
  if (!done) throw new HttpError(409, "Esta reserva não pode mais ser cancelada.");
  await audit({ actorType: "client", actorId: p.clientId, action: "reservation.cancelled", entity: "reservations", entityId: p.id, details: { via: p.via }, ip: p.ip ?? null });
  const who = await clientName(p.clientId);
  await notifyStaff([{ type: "reservation.cancelled", category: "reservations", severity: "warning", title: "Reserva cancelada pelo cliente", body: `${who.name} · ${formatDate(done.start_date as string)}`, url: "/admin/reservations", dedupeKey: `reservation_cancelled:${p.id}` }]);
}

import { addDays, formatDate, todaySP } from "@/lib/utils";
import { notifyStaff, serviceDb } from "@/lib/server/push";
import { HttpError } from "@/lib/server/supabase";
import { audit, filesExist, readBody, safePath, tenantOptions, tenantRoute, text } from "@/lib/server/tenant";
import { isIsoDate } from "@/lib/tenant";

/**
 * Solicitações de Locação pelo App do Locatário (fluxo de auto-onboarding).
 * GET  → solicitações do cliente logado com status e dados do carro
 * POST → cria solicitação com carro escolhido, datas, CNH e upload dos 4 documentos obrigatórios
 */
export const dynamic = "force-dynamic";
export const OPTIONS = tenantOptions;

export const GET = tenantRoute(async (_request, { db, clientId }) => {
  const [requests, fleet] = await Promise.all([
    db.from("rental_requests").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(20),
    db.from("tenant_fleet").select("*"),
  ]);
  if (requests.error) throw new HttpError(500, "Não foi possível carregar as solicitações.");

  const vehicleById = new Map((fleet.data ?? []).map((v) => [v.id, v]));
  const paths = (requests.data ?? []).flatMap((r) => [r.cnh_front_path, r.cnh_back_path, r.address_proof_path, r.selfie_path].filter(Boolean));
  const { data: urls } = paths.length ? await db.storage.from("documentos").createSignedUrls(paths as string[], 600) : { data: [] };
  const urlByPath = new Map((urls ?? []).map((u) => [u.path, u.signedUrl]));

  return {
    requests: (requests.data ?? []).map((r) => {
      const v = vehicleById.get(r.vehicle_id);
      return {
        id: r.id,
        vehicleId: r.vehicle_id,
        vehicleName: v?.name ?? "Veículo",
        vehicleCategory: v?.category ?? "—",
        vehicleImage: v?.image ?? null,
        startDate: r.start_date,
        endDate: r.end_date,
        planType: r.plan_type,
        rateAmount: Number(r.rate_amount),
        depositAmount: Number(r.deposit_amount ?? 0),
        cnhNumber: r.cnh_number,
        cnhCategory: r.cnh_category,
        cnhExpiry: r.cnh_expiry,
        status: r.status,
        rejectionReason: r.rejection_reason,
        correctionNotes: r.correction_notes,
        createdRentalId: r.created_rental_id,
        createdAt: r.created_at,
        cnhFrontUrl: urlByPath.get(r.cnh_front_path) ?? null,
        cnhBackUrl: urlByPath.get(r.cnh_back_path) ?? null,
        addressProofUrl: urlByPath.get(r.address_proof_path) ?? null,
        selfieUrl: r.selfie_path ? (urlByPath.get(r.selfie_path) ?? null) : null,
      };
    }),
  };
});

export const POST = tenantRoute(async (request, { db, clientId, ip }) => {
  const body = await readBody(request);
  const vehicleId = typeof body.vehicleId === "string" ? body.vehicleId : "";
  const startDate = typeof body.startDate === "string" ? body.startDate : "";
  const endDate = typeof body.endDate === "string" ? body.endDate : "";
  const planType = typeof body.planType === "string" && ["daily", "weekly", "biweekly", "monthly"].includes(body.planType) ? body.planType : "weekly";

  const today = todaySP();
  if (!vehicleId) throw new HttpError(422, "Escolha o veículo desejado.");
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) throw new HttpError(422, "Informe as datas de retirada e devolução.");
  if (startDate < today) throw new HttpError(422, "A data de retirada não pode ser no passado.");
  if (endDate <= startDate) throw new HttpError(422, "A data de devolução precisa ser posterior à retirada.");
  if (startDate > addDays(today, 90)) throw new HttpError(422, "A retirada não pode ser superior a 90 dias.");

  const cnhNumber = text(body.cnhNumber, 30);
  const cnhCategory = typeof body.cnhCategory === "string" && ["A", "B", "AB", "C", "D", "E"].includes(body.cnhCategory) ? body.cnhCategory : null;
  const cnhExpiry = typeof body.cnhExpiry === "string" && isIsoDate(body.cnhExpiry) ? body.cnhExpiry : null;

  if (!cnhNumber || !cnhCategory || !cnhExpiry) throw new HttpError(422, "Preencha o número, categoria e validade da sua CNH.");
  if (cnhExpiry < today) throw new HttpError(422, "Sua CNH está vencida. Atualize junto ao Detran.");

  // Validação dos caminhos dos 4 documentos no bucket privado 'documentos'
  const cnhFrontPath = safePath(body.cnhFrontPath, `${clientId}/`);
  const cnhBackPath = safePath(body.cnhBackPath, `${clientId}/`);
  const addressProofPath = safePath(body.addressProofPath, `${clientId}/`);
  const selfiePath = body.selfiePath ? safePath(body.selfiePath, `${clientId}/`) : null;

  const docs = [cnhFrontPath, cnhBackPath, addressProofPath, ...(selfiePath ? [selfiePath] : [])];
  if (!(await filesExist("documentos", docs))) {
    throw new HttpError(422, "Alguns documentos não foram encontrados. Envie as fotos novamente.");
  }

  const admin = serviceDb();

  // Busca o veículo escolhido
  const { data: vehicle } = await admin.from("vehicles").select("id,name,daily_rate,weekly_rate,status").eq("id", vehicleId).maybeSingle();
  if (!vehicle || vehicle.status === "sold") throw new HttpError(404, "Veículo não encontrado ou indisponível.");

  // Checa se já existe solicitação pendente do mesmo cliente
  const { count } = await admin.from("rental_requests").select("id", { count: "exact", head: true }).eq("client_id", clientId).eq("status", "pending");
  if ((count ?? 0) >= 2) throw new HttpError(429, "Você já possui uma solicitação em análise. Aguarde a aprovação da LOCAKAR.");

  const rateAmount = planType === "daily" ? (vehicle.daily_rate ?? 120) : (vehicle.weekly_rate ?? 650);
  const depositAmount = 1000.0; // Caução padrão LOCAKAR

  const row = {
    client_id: clientId,
    vehicle_id: vehicleId,
    start_date: startDate,
    end_date: endDate,
    plan_type: planType,
    rate_amount: rateAmount,
    deposit_amount: depositAmount,
    cnh_number: cnhNumber,
    cnh_category: cnhCategory,
    cnh_expiry: cnhExpiry,
    cnh_front_path: cnhFrontPath,
    cnh_back_path: cnhBackPath,
    address_proof_path: addressProofPath,
    selfie_path: selfiePath,
    status: "pending",
  };

  const { data: created, error } = await admin.from("rental_requests").insert(row).select("id").single();
  if (error) throw new HttpError(500, "Não foi possível registrar sua solicitação.");

  // Atualiza CNH no cadastro do cliente
  await admin.from("clients").update({
    cnh_number: cnhNumber,
    cnh_category: cnhCategory,
    cnh_expiry: cnhExpiry,
    cnh_front_url: `documentos/${cnhFrontPath}`,
    cnh_back_url: `documentos/${cnhBackPath}`,
    address_proof_url: `documentos/${addressProofPath}`,
    updated_at: new Date().toISOString(),
  }).eq("id", clientId);

  await audit({ actorType: "client", actorId: clientId, action: "rental_request.created", entity: "rental_requests", entityId: created.id, details: { vehicleId, startDate, endDate, planType }, ip });

  const { data: client } = await db.from("tenant_profile").select("name,phone").single();
  await notifyStaff([
    {
      type: "rental.created",
      category: "rentals",
      severity: "warning",
      title: "Nova solicitação de locação",
      body: `${client?.name ?? "Cliente"} (${client?.phone ?? "—"}) solicitou ${vehicle.name} de ${formatDate(startDate)} a ${formatDate(endDate)}. Analise os documentos.`,
      url: "/admin/requests",
      dedupeKey: `rental_request:${created.id}`,
    },
  ]);

  return { ok: true, id: created.id };
});

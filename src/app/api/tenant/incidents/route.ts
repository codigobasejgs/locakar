import { notifyStaff, serviceDb } from "@/lib/server/push";
import { HttpError } from "@/lib/server/supabase";
import { audit, filesExist, readBody, requestId, safePath, tenantOptions, tenantRoute, text } from "@/lib/server/tenant";
import { INCIDENT_CATEGORY } from "@/lib/tenant";

/**
 * Ocorrências do locatário (pneu furado, luz no painel, acidente...).
 * GET  → ocorrências do cliente (RLS), com links temporários das fotos
 * POST → { rentalId, category, description, photos: [path], requestId }
 * Fotos em ocorrencias/<clientId>/. Localização não é coletada: o cliente descreve onde está, se quiser.
 */
export const dynamic = "force-dynamic";
export const OPTIONS = tenantOptions;

export const GET = tenantRoute(async (_request, { db }) => {
  const { data, error } = await db
    .from("vehicle_incidents")
    .select("id,rental_id,category,description,media_urls,status,admin_notes,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new HttpError(500, "Não foi possível carregar as ocorrências.");
  const paths = (data ?? []).flatMap((i) => i.media_urls as string[]);
  const { data: urls } = paths.length ? await db.storage.from("ocorrencias").createSignedUrls(paths, 600) : { data: [] };
  const urlByPath = new Map((urls ?? []).map((u) => [u.path, u.signedUrl]));
  return {
    incidents: (data ?? []).map((i) => ({
      id: i.id,
      rentalId: i.rental_id,
      category: i.category,
      description: i.description,
      status: i.status,
      adminNotes: i.admin_notes,
      createdAt: i.created_at,
      updatedAt: i.updated_at,
      photos: (i.media_urls as string[]).map((p) => urlByPath.get(p)).filter(Boolean),
    })),
  };
});

export const POST = tenantRoute(async (request, { db, clientId, ip }) => {
  const body = await readBody(request);
  const reqId = requestId(body.requestId);
  const rentalId = typeof body.rentalId === "string" ? body.rentalId : "";
  const category = typeof body.category === "string" && body.category in INCIDENT_CATEGORY ? body.category : null;
  const description = text(body.description, 2000);
  if (!rentalId || !category) throw new HttpError(422, "Escolha o tipo do problema.");
  if (!description || description.length < 10) throw new HttpError(422, "Descreva o problema com pelo menos 10 caracteres.");

  const { data: rental } = await db.from("tenant_rentals").select("id,vehicle_id,status").eq("id", rentalId).maybeSingle();
  if (!rental) throw new HttpError(404, "Locação não encontrada.");

  const photos = (Array.isArray(body.photos) ? body.photos : []).slice(0, 6).map((p) => safePath(p, `${clientId}/`));
  if (photos.length && !(await filesExist("ocorrencias", photos))) throw new HttpError(422, "Algumas fotos não chegaram. Envie de novo.");

  const admin = serviceDb();
  const { data: created, error } = await admin
    .from("vehicle_incidents")
    .insert({ rental_id: rentalId, client_id: clientId, vehicle_id: rental.vehicle_id, category, description, media_urls: photos, request_id: reqId })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      const { data: prev } = await admin.from("vehicle_incidents").select("id").eq("client_id", clientId).eq("request_id", reqId).single();
      return { ok: true, id: prev?.id, duplicate: true };
    }
    throw new HttpError(500, "Não foi possível registrar a ocorrência.");
  }

  await audit({ actorType: "client", actorId: clientId, action: "incident.created", entity: "vehicle_incidents", entityId: created.id, details: { rentalId, category }, ip });
  const [{ data: profile }, { data: vehicle }] = await Promise.all([
    db.from("tenant_profile").select("name,phone").single(),
    db.from("tenant_vehicles").select("name,plate").eq("id", rental.vehicle_id).maybeSingle(),
  ]);
  await notifyStaff([
    {
      type: "incident.created",
      category: "vehicles",
      // Acidente é sempre crítico: vai também ao e-mail e WhatsApp de alertas da empresa.
      severity: category === "acidente" ? "critical" : "warning",
      title: `Ocorrência: ${INCIDENT_CATEGORY[category]}`,
      body: `${profile?.name ?? "Cliente"} (${profile?.phone ?? "—"}) · ${vehicle?.name ?? "veículo"} ${vehicle?.plate ?? ""} · ${description.slice(0, 140)}`,
      url: "/admin/incidents",
      dedupeKey: `incident:${created.id}`,
    },
  ]);
  return { ok: true, id: created.id };
});

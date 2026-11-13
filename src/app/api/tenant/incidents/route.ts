import { HttpError } from "@/lib/server/supabase";
import { filesExist, readBody, requestId, safePath, tenantOptions, tenantRoute, text } from "@/lib/server/tenant";
import { createIncident, validIncident } from "@/lib/server/tenant-actions";

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

export const POST = tenantRoute(async (request, { clientId, ip }) => {
  const body = await readBody(request);
  const reqId = requestId(body.requestId);
  const rentalId = typeof body.rentalId === "string" ? body.rentalId : "";
  validIncident(body.category, text(body.description, 2000));
  if (!rentalId) throw new HttpError(422, "Escolha o tipo do problema.");
  const photos = (Array.isArray(body.photos) ? body.photos : []).slice(0, 6).map((p) => safePath(p, `${clientId}/`));
  if (photos.length && !(await filesExist("ocorrencias", photos))) throw new HttpError(422, "Algumas fotos não chegaram. Envie de novo.");
  // Mesmas regras do WhatsApp (tenant-actions): locação do próprio cliente, idempotência e aviso à equipe.
  const r = await createIncident({ clientId, rentalId, category: body.category, description: text(body.description, 2000), photos, requestId: reqId, ip, via: "app" });
  return r.duplicate ? { ok: true, id: r.id, duplicate: true } : { ok: true, id: r.id };
});

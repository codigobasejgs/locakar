import { FUEL_LABEL, FUEL_ORDER, INSPECTION_ITEMS } from "@/lib/contract";
import { notifyStaff, serviceDb } from "@/lib/server/push";
import { HttpError } from "@/lib/server/supabase";
import { audit, filesExist, readBody, requestId, safePath, tenantOptions, tenantRoute, text } from "@/lib/server/tenant";
import { DAMAGE_SLOT, MAX_DAMAGE_PHOTOS, PHOTO_SLOTS, TENANT_INSPECTION_KIND, signatureSvg } from "@/lib/tenant";
import type { FuelLevel } from "@/types";

/**
 * Vistoria feita pelo locatário no app (retirada, devolução ou periódica).
 * GET  → histórico das vistorias do cliente (RLS) com links temporários das fotos
 * POST → { rentalId, kind, km, fuel, items, photos: [{slot, path}], damages?, notes?, signature, requestId }
 * Fotos já enviadas pelo app para vistorias/<rentalId>/app/<requestId>/. Não substitui a vistoria oficial
 * da equipe (rentals.delivery_inspection / return_inspection): fica como histórico para conferência.
 */
export const dynamic = "force-dynamic";
export const OPTIONS = tenantOptions;

export const GET = tenantRoute(async (_request, { db }) => {
  const { data, error } = await db
    .from("tenant_inspections")
    .select("id,rental_id,kind,km,fuel,items,photos,damages,notes,status,admin_notes,created_at")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new HttpError(500, "Não foi possível carregar as vistorias.");
  const paths = (data ?? []).flatMap((i) => (i.photos as { path: string }[]).map((p) => p.path));
  const { data: urls } = paths.length ? await db.storage.from("vistorias").createSignedUrls(paths, 600) : { data: [] };
  const urlByPath = new Map((urls ?? []).map((u) => [u.path, u.signedUrl]));
  return {
    inspections: (data ?? []).map((i) => ({
      id: i.id,
      rentalId: i.rental_id,
      kind: i.kind,
      km: i.km,
      fuel: i.fuel,
      items: i.items,
      damages: i.damages,
      notes: i.notes,
      status: i.status,
      adminNotes: i.admin_notes,
      createdAt: i.created_at,
      photos: (i.photos as { slot: string; path: string }[]).map((p) => ({ slot: p.slot, url: urlByPath.get(p.path) ?? null })),
    })),
  };
});

export const POST = tenantRoute(async (request, { db, clientId, ip }) => {
  const body = await readBody(request);
  const reqId = requestId(body.requestId);
  const rentalId = typeof body.rentalId === "string" ? body.rentalId : "";
  const kind = typeof body.kind === "string" && body.kind in TENANT_INSPECTION_KIND ? body.kind : null;
  const km = typeof body.km === "number" && Number.isInteger(body.km) && body.km >= 0 && body.km < 5_000_000 ? body.km : null;
  const fuel = FUEL_ORDER.includes(body.fuel as FuelLevel) ? (body.fuel as FuelLevel) : null;
  if (!rentalId || !kind || km == null || !fuel) throw new HttpError(422, "Preencha tipo, quilometragem e combustível.");

  // Locação do próprio cliente (view com RLS), em andamento.
  const { data: rental } = await db.from("tenant_rentals").select("id,vehicle_id,status,km_start").eq("id", rentalId).maybeSingle();
  if (!rental) throw new HttpError(404, "Locação não encontrada.");
  if (rental.status === "cancelled") throw new HttpError(409, "Esta locação foi cancelada.");
  if (kind !== "delivery" && rental.km_start != null && km < rental.km_start) {
    throw new HttpError(422, `A quilometragem não pode ser menor que a da retirada (${rental.km_start} km).`);
  }

  // Checklist: só os itens oficiais, na ordem oficial.
  const sent = Array.isArray(body.items) ? (body.items as { key?: unknown; ok?: unknown; note?: unknown }[]) : [];
  const items = INSPECTION_ITEMS.map((it) => {
    const found = sent.find((s) => s?.key === it.key);
    if (typeof found?.ok !== "boolean") throw new HttpError(422, `Marque o item "${it.label}".`);
    return { key: it.key, label: it.label, ok: found.ok, ...(text(found.note, 200) ? { note: text(found.note, 200) } : {}) };
  });

  // Fotos: todas as obrigatórias + até 6 de avarias, na pasta desta vistoria.
  const prefix = `${rentalId}/app/${reqId}/`;
  const photos = (Array.isArray(body.photos) ? body.photos : []).map((p) => {
    const slot = typeof p?.slot === "string" ? p.slot : "";
    if (slot !== DAMAGE_SLOT && !PHOTO_SLOTS.some((s) => s.key === slot)) throw new HttpError(422, "Foto de vistoria inválida.");
    return { slot, path: safePath(p?.path, prefix) };
  });
  const missing = PHOTO_SLOTS.filter((s) => !photos.some((p) => p.slot === s.key));
  if (missing.length) throw new HttpError(422, `Faltam fotos: ${missing.map((m) => m.label).join(", ")}.`);
  if (photos.filter((p) => p.slot === DAMAGE_SLOT).length > MAX_DAMAGE_PHOTOS) throw new HttpError(422, `No máximo ${MAX_DAMAGE_PHOTOS} fotos de avarias.`);
  if (!(await filesExist("vistorias", photos.map((p) => p.path)))) throw new HttpError(422, "Algumas fotos não chegaram. Envie de novo.");

  const signature = signatureSvg(body.signature);
  if (!signature) throw new HttpError(422, "Assine com o dedo para confirmar a vistoria.");

  const admin = serviceDb();
  const row = {
    rental_id: rentalId,
    client_id: clientId,
    vehicle_id: rental.vehicle_id,
    kind,
    km,
    fuel,
    items,
    photos,
    damages: text(body.damages, 1000),
    notes: text(body.notes, 1000),
    signature_svg: signature,
    request_id: reqId,
    ip_address: ip,
  };
  const { data: created, error } = await admin.from("tenant_inspections").insert(row).select("id").single();
  if (error) {
    // Mesmo requestId: o app reenviou (sem internet na 1ª vez). Devolve o registro existente.
    if (error.code === "23505") {
      const { data: prev } = await admin.from("tenant_inspections").select("id").eq("client_id", clientId).eq("request_id", reqId).single();
      return { ok: true, id: prev?.id, duplicate: true };
    }
    throw new HttpError(500, "Não foi possível registrar a vistoria.");
  }

  const problems = items.filter((i) => !i.ok).length;
  await audit({ actorType: "client", actorId: clientId, action: "inspection.submitted", entity: "tenant_inspections", entityId: created.id, details: { rentalId, kind, km, problems }, ip });
  const { data: profile } = await db.from("tenant_profile").select("name").single();
  await notifyStaff([
    {
      type: "inspection.submitted",
      category: "rentals",
      severity: problems || row.damages ? "warning" : "info",
      title: `Vistoria pelo app: ${TENANT_INSPECTION_KIND[kind].toLowerCase()}`,
      body: `${profile?.name ?? "Cliente"} · ${km.toLocaleString("pt-BR")} km · combustível ${FUEL_LABEL[fuel]}${problems ? ` · ${problems} item(ns) com problema` : ""}`,
      url: `/admin/rentals/${rentalId}`,
      dedupeKey: `tenant_inspection:${created.id}`,
    },
  ]);
  return { ok: true, id: created.id };
});

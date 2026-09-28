import { RISK_FACTOR_LABEL, riskLevel } from "@/lib/antifraud";
import { sendPushToClient, serviceDb } from "@/lib/server/push";
import { HttpError, errorResponse, requireStaff } from "@/lib/server/supabase";
import { audit, clientIp } from "@/lib/server/tenant";
import { DOCUMENT_KIND, INCIDENT_CATEGORY, INCIDENT_STATUS } from "@/lib/tenant";

/**
 * Painel ↔ App do Locatário. Somente equipe.
 * GET ?view=incidents|documents|inspections&rentalId=|security → listas com links temporários (10 min)
 * POST { action: "incident.status", id, status, adminNotes? }
 *      { action: "document.review", id, approve, reason? }
 *      { action: "inspection.review", id, approve, adminNotes? }
 * Cada ação avisa o cliente (push no app/navegador) e fica na auditoria.
 */
export const dynamic = "force-dynamic";

type Sb = Awaited<ReturnType<typeof requireStaff>>["supabase"];

async function signed(db: Sb, bucket: string, paths: string[]) {
  if (!paths.length) return new Map<string, string>();
  const { data } = await db.storage.from(bucket).createSignedUrls(paths, 600);
  return new Map((data ?? []).map((u) => [u.path ?? "", u.signedUrl]));
}

async function names(db: Sb, ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const { data } = await db.from("clients").select("id,name").in("id", [...new Set(ids)]);
  return new Map((data ?? []).map((c) => [c.id as string, c.name as string]));
}

export async function GET(request: Request) {
  try {
    const { supabase: db } = await requireStaff();
    const url = new URL(request.url);
    const view = url.searchParams.get("view");

    if (view === "incidents") {
      const { data, error } = await db.from("vehicle_incidents").select("*").order("created_at", { ascending: false }).limit(100);
      if (error) throw new HttpError(500, error.message);
      const rows = data ?? [];
      const [urls, clientName, vehicles] = await Promise.all([
        signed(db, "ocorrencias", rows.flatMap((r) => r.media_urls as string[])),
        names(db, rows.map((r) => r.client_id)),
        db.from("vehicles").select("id,name,plate").in("id", [...new Set(rows.map((r) => r.vehicle_id))]),
      ]);
      const vehicleById = new Map((vehicles.data ?? []).map((v) => [v.id, `${v.name} · ${v.plate}`]));
      return Response.json({
        incidents: rows.map((r) => ({
          id: r.id,
          rentalId: r.rental_id,
          clientName: clientName.get(r.client_id) ?? "Cliente",
          vehicle: vehicleById.get(r.vehicle_id) ?? "—",
          category: r.category,
          description: r.description,
          status: r.status,
          adminNotes: r.admin_notes,
          createdAt: r.created_at,
          photos: (r.media_urls as string[]).map((p) => urls.get(p)).filter(Boolean),
        })),
      });
    }

    if (view === "documents") {
      const { data, error } = await db.from("tenant_documents").select("*").order("created_at", { ascending: false }).limit(100);
      if (error) throw new HttpError(500, error.message);
      const rows = data ?? [];
      const [urls, clientName] = await Promise.all([signed(db, "documentos", rows.map((r) => r.path)), names(db, rows.map((r) => r.client_id))]);
      return Response.json({
        documents: rows.map((r) => ({
          id: r.id,
          clientId: r.client_id,
          clientName: clientName.get(r.client_id) ?? "Cliente",
          kind: r.kind,
          status: r.status,
          rejectionReason: r.rejection_reason,
          createdAt: r.created_at,
          url: urls.get(r.path) ?? null,
        })),
      });
    }

    if (view === "inspections") {
      const rentalId = url.searchParams.get("rentalId") ?? "";
      const { data, error } = await db.from("tenant_inspections").select("*").eq("rental_id", rentalId).order("created_at", { ascending: false });
      if (error) throw new HttpError(500, error.message);
      const rows = data ?? [];
      const urls = await signed(db, "vistorias", rows.flatMap((r) => (r.photos as { path: string }[]).map((p) => p.path)));
      return Response.json({
        inspections: rows.map((r) => ({
          id: r.id,
          kind: r.kind,
          km: r.km,
          fuel: r.fuel,
          items: r.items,
          damages: r.damages,
          notes: r.notes,
          status: r.status,
          adminNotes: r.admin_notes,
          signatureSvg: r.signature_svg,
          ipAddress: r.ip_address,
          createdAt: r.created_at,
          photos: (r.photos as { slot: string; path: string }[]).map((p) => ({ slot: p.slot, url: urls.get(p.path) ?? null })),
        })),
      });
    }

    if (view === "security") {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const [telemetry, devices, consents, auditLog] = await Promise.all([
        db.from("antifraud_telemetry").select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(500),
        db.from("tenant_devices").select("client_id,installation_id,platform,device_model,os_version,app_version,active,push_token,last_seen_at").order("last_seen_at", { ascending: false }).limit(300),
        db.from("tenant_consents").select("client_id,policy_version,scopes,consented_at").order("consented_at", { ascending: false }).limit(300),
        db.from("audit_log").select("*").order("created_at", { ascending: false }).limit(100),
      ]);
      const rows = telemetry.data ?? [];
      const clientName = await names(db, [...rows.map((r) => r.client_id), ...(devices.data ?? []).map((d) => d.client_id), ...(auditLog.data ?? []).filter((a) => a.actor_type === "client").map((a) => a.actor_id)]);
      // Por cliente: a leitura mais recente define o nível atual; o histórico fica como evidência.
      const byClient = new Map<string, typeof rows>();
      for (const r of rows) byClient.set(r.client_id, [...(byClient.get(r.client_id) ?? []), r]);
      const clients = [...byClient.entries()]
        .map(([clientId, list]) => {
          const last = list[0];
          return {
            clientId,
            clientName: clientName.get(clientId) ?? "Cliente",
            score: last.risk_score ?? 0,
            level: riskLevel(last.risk_score ?? 0),
            factors: (last.risk_factors as string[]).map((f) => RISK_FACTOR_LABEL[f] ?? f),
            lastSeen: last.created_at,
            ips: [...new Set(list.map((r) => r.ip_address).filter(Boolean))].slice(0, 10),
            devices: [...new Set(list.map((r) => `${r.device_model ?? "Aparelho"} · ${r.platform ?? "?"} ${r.os_version ?? ""}`.trim()))],
            integrity: last.integrity_status,
            emulator: list.some((r) => r.is_emulator),
            history: list.slice(0, 20).map((r) => ({ at: r.created_at, score: r.risk_score, ip: r.ip_address })),
          };
        })
        .sort((a, b) => b.score - a.score);
      const consentBy = new Map<string, { version: string; scopes: string[]; at: string }>();
      for (const c of consents.data ?? []) if (!consentBy.has(c.client_id)) consentBy.set(c.client_id, { version: c.policy_version, scopes: c.scopes, at: c.consented_at });
      return Response.json({
        clients: clients.map((c) => ({ ...c, consent: consentBy.get(c.clientId) ?? null })),
        devices: (devices.data ?? []).map((d) => ({
          clientName: clientName.get(d.client_id) ?? "Cliente",
          installationId: d.installation_id,
          platform: d.platform,
          model: d.device_model,
          os: d.os_version,
          appVersion: d.app_version,
          active: d.active,
          push: Boolean(d.push_token),
          lastSeen: d.last_seen_at,
        })),
        audit: (auditLog.data ?? []).map((a) => ({
          id: a.id,
          actor: a.actor_type === "client" ? (clientName.get(a.actor_id) ?? "Cliente") : a.actor_type === "staff" ? "Equipe" : "Sistema",
          action: a.action,
          entity: a.entity,
          ip: a.ip_address,
          at: a.created_at,
        })),
      });
    }

    throw new HttpError(400, "Visão inválida.");
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase } = await requireStaff();
    const { data: claims } = await supabase.auth.getClaims();
    const reviewer = claims!.claims.sub as string;
    const ip = clientIp(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id : "";
    const note = typeof body.adminNotes === "string" ? body.adminNotes.trim().slice(0, 1000) || null : null;
    const now = new Date().toISOString();
    const db = serviceDb();
    if (!id) throw new HttpError(400, "Registro não informado.");

    if (body.action === "incident.status") {
      const status = typeof body.status === "string" && body.status in INCIDENT_STATUS ? body.status : null;
      if (!status) throw new HttpError(422, "Status inválido.");
      const { data: row } = await db.from("vehicle_incidents").update({ status, admin_notes: note, updated_at: now }).eq("id", id).select("client_id,category").maybeSingle();
      if (!row) throw new HttpError(404, "Ocorrência não encontrada.");
      await audit({ actorType: "staff", actorId: reviewer, action: "incident.status", entity: "vehicle_incidents", entityId: id, details: { status }, ip });
      await sendPushToClient(row.client_id, {
        title: `Ocorrência: ${INCIDENT_STATUS[status].label.toLowerCase()}`,
        body: `${INCIDENT_CATEGORY[row.category] ?? "Ocorrência"}${note ? ` — ${note.slice(0, 140)}` : ""}`,
        url: "/",
        severity: status === "waiting_client" ? "warning" : "info",
        tag: `incident-${id}`,
      }, "ocorrencias");
      return Response.json({ ok: true });
    }

    if (body.action === "document.review" || body.action === "inspection.review") {
      const approve = body.approve === true;
      const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
      const isDoc = body.action === "document.review";
      if (!approve && !reason && !note) throw new HttpError(422, "Informe o motivo.");
      const patch = isDoc
        ? { status: approve ? "approved" : "rejected", rejection_reason: approve ? null : reason, reviewed_by: reviewer, reviewed_at: now, updated_at: now }
        : { status: approve ? "reviewed" : "rejected", admin_notes: note ?? (reason || null), reviewed_by: reviewer, reviewed_at: now, updated_at: now };
      const from = isDoc ? "pending_review" : "submitted";
      const { data: row } = await db
        .from(isDoc ? "tenant_documents" : "tenant_inspections")
        .update(patch)
        .eq("id", id)
        .eq("status", from)
        .select(isDoc ? "client_id,kind" : "client_id,kind")
        .maybeSingle();
      if (!row) throw new HttpError(409, "Este item já foi analisado.");
      const r = row as unknown as { client_id: string; kind: string };
      await audit({ actorType: "staff", actorId: reviewer, action: body.action as string, entity: isDoc ? "tenant_documents" : "tenant_inspections", entityId: id, details: { approve }, ip });
      await sendPushToClient(
        r.client_id,
        isDoc
          ? {
              title: approve ? "Documento aprovado" : "Documento recusado",
              body: approve ? `${DOCUMENT_KIND[r.kind]} conferido pela LOCAKAR.` : `${DOCUMENT_KIND[r.kind]}: ${reason}. Envie de novo pelo app.`,
              url: "/",
              severity: approve ? "success" : "warning",
              tag: `document-${id}`,
            }
          : {
              title: approve ? "Vistoria conferida" : "Refaça a vistoria",
              body: approve ? "A LOCAKAR conferiu a vistoria que você enviou." : `${note ?? reason}`.slice(0, 180),
              url: "/",
              severity: approve ? "success" : "warning",
              tag: `inspection-${id}`,
            },
        isDoc ? "documentos" : "veiculo",
      );
      if (isDoc && approve && (r.kind === "cnh_front" || r.kind === "cnh_back" || r.kind === "address_proof")) {
        // Documento aprovado vira o oficial do cadastro (caminho privado no bucket, não URL pública).
        const { data: doc } = await db.from("tenant_documents").select("path").eq("id", id).single();
        const column = r.kind === "cnh_front" ? "cnh_front_url" : r.kind === "cnh_back" ? "cnh_back_url" : "address_proof_url";
        if (doc) await db.from("clients").update({ [column]: `documentos/${doc.path}` }).eq("id", r.client_id);
      }
      return Response.json({ ok: true });
    }

    throw new HttpError(400, "Ação inválida.");
  } catch (e) {
    return errorResponse(e);
  }
}

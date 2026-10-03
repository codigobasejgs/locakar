import { COMPANY } from "@/lib/company";
import { RISK_FACTOR_LABEL, riskLevel } from "@/lib/antifraud";
import { buildReceipts } from "@/lib/billing";
import { buildContractText } from "@/lib/contract";
import { emailLayout, sendEmail } from "@/lib/server/email";
import { loadSettings, sendPushToClient, serviceDb } from "@/lib/server/push";
import { HttpError, errorResponse, requireStaff } from "@/lib/server/supabase";
import { audit, clientIp } from "@/lib/server/tenant";
import { sendWhatsApp } from "@/lib/server/whatsapp";
import { DOCUMENT_KIND, INCIDENT_CATEGORY, INCIDENT_STATUS } from "@/lib/tenant";
import { formatCurrency, formatDate, newId } from "@/lib/utils";
import { brand, scoped } from "@/lib/server/org-context";

/**
 * Painel ↔ App do Locatário. Somente equipe.
 * GET ?view=requests|incidents|documents|inspections&rentalId=|security → listas com links temporários (10 min)
 * POST { action: "request.approve", id, planType?, rateAmount?, depositAmount?, startDate?, endDate? }
 *      { action: "request.reject", id, reason }
 *      { action: "request.request_correction", id, notes }
 *      { action: "incident.status", id, status, adminNotes? }
 *      { action: "document.review", id, approve, reason? }
 *      { action: "inspection.review", id, approve, adminNotes? }
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

export const GET = scoped(async function GET(request: Request) {
  try {
    const { supabase: db } = await requireStaff();
    const url = new URL(request.url);
    const view = url.searchParams.get("view");

    if (view === "requests") {
      const { data, error } = await db.from("rental_requests").select("*").order("created_at", { ascending: false }).limit(100);
      if (error) throw new HttpError(500, error.message);
      const rows = data ?? [];
      const [urls, clientRows, vehicles] = await Promise.all([
        signed(db, "documentos", rows.flatMap((r) => [r.cnh_front_path, r.cnh_back_path, r.address_proof_path, r.selfie_path].filter(Boolean))),
        db.from("clients").select("id,name,phone,email,cpf,code").in("id", [...new Set(rows.map((r) => r.client_id))]),
        db.from("vehicles").select("id,name,plate,image,daily_rate,weekly_rate,status").in("id", [...new Set(rows.map((r) => r.vehicle_id))]),
      ]);
      const clientById = new Map((clientRows.data ?? []).map((c) => [c.id, c]));
      const vehicleById = new Map((vehicles.data ?? []).map((v) => [v.id, v]));

      return Response.json({
        requests: rows.map((r) => {
          const c = clientById.get(r.client_id);
          const v = vehicleById.get(r.vehicle_id);
          return {
            id: r.id,
            clientId: r.client_id,
            clientName: c?.name ?? "Cliente",
            clientPhone: c?.phone ?? "—",
            clientEmail: c?.email ?? null,
            clientCpf: c?.cpf ?? "—",
            clientCode: c?.code ?? null,
            vehicleId: r.vehicle_id,
            vehicleName: v?.name ?? "Veículo",
            vehiclePlate: v?.plate ?? "—",
            vehicleImage: v?.image ?? null,
            vehicleStatus: v?.status ?? "available",
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
            cnhFrontUrl: urls.get(r.cnh_front_path) ?? null,
            cnhBackUrl: urls.get(r.cnh_back_path) ?? null,
            addressProofUrl: urls.get(r.address_proof_path) ?? null,
            selfieUrl: r.selfie_path ? (urls.get(r.selfie_path) ?? null) : null,
          };
        }),
      });
    }

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
});

export const POST = scoped(async function POST(request: Request) {
  try {
    const { supabase: db } = await requireStaff();
    const { data: claims } = await db.auth.getClaims();
    const reviewer = claims!.claims.sub as string;
    const ip = clientIp(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id : "";
    const note = typeof body.adminNotes === "string" ? body.adminNotes.trim().slice(0, 1000) || null : null;
    const now = new Date().toISOString();
    const admin = serviceDb();
    if (!id) throw new HttpError(400, "Registro não informado.");

    // APROVAÇÃO EM 1 CLIQUE DA SOLICITAÇÃO DE LOCAÇÃO
    if (body.action === "request.approve") {
      const { data: requestRow } = await admin.from("rental_requests").select("*").eq("id", id).maybeSingle();
      if (!requestRow) throw new HttpError(404, "Solicitação não encontrada.");
      if (requestRow.status === "approved") throw new HttpError(409, "Esta solicitação já foi aprovada.");

      const [{ data: client }, { data: vehicle }, settings] = await Promise.all([
        admin.from("clients").select("*").eq("id", requestRow.client_id).single(),
        admin.from("vehicles").select("*").eq("id", requestRow.vehicle_id).single(),
        loadSettings(admin),
      ]);
      if (!client || !vehicle) throw new HttpError(404, "Cliente ou veículo não encontrado.");

      const rentalId = newId();
      const plan = (typeof body.planType === "string" ? body.planType : requestRow.plan_type) as "daily" | "weekly" | "biweekly" | "monthly" | "annual";
      const rate = typeof body.rateAmount === "number" ? body.rateAmount : Number(requestRow.rate_amount);
      const deposit = typeof body.depositAmount === "number" ? body.depositAmount : Number(requestRow.deposit_amount ?? 1000);
      const startDate = typeof body.startDate === "string" ? body.startDate : requestRow.start_date;
      const endDate = typeof body.endDate === "string" ? body.endDate : requestRow.end_date;
      const tplId = typeof body.contractTemplateId === "string" ? body.contractTemplateId : undefined;
      const chosenTemplate = settings.contractTemplates?.find((t) => t.id === tplId);

      const billingConfig = {
        period: plan === "annual" ? "annual" : plan,
        amount: rate,
        firstDue: startDate,
        until: endDate,
        lateFeePercent: 2,
        interestPercent: 1,
        interestPeriod: "daily" as const,
        graceDays: 0,
        autoSend: true,
        remindDaysBefore: 1,
      };

      const receipts = buildReceipts({
        id: rentalId,
        firstDue: billingConfig.firstDue,
        until: billingConfig.until,
        amount: rate,
        period: plan === "annual" ? "annual" : plan,
      });

      const rental = {
        id: rentalId,
        client_id: client.id,
        vehicle_id: vehicle.id,
        contract_type: chosenTemplate ? chosenTemplate.name : plan === "weekly" ? "Semanal" : plan === "daily" ? "Diária" : plan === "annual" ? "Anual" : "Mensal",
        start_date: startDate,
        end_date: endDate,
        weekly_rate: rate,
        deposit,
        km_start: null,
        receipts,
        billing: billingConfig,
        status: "pending",
        notes: `Aprovado da solicitação #${id.slice(0, 8)}${chosenTemplate ? ` · Modelo: ${chosenTemplate.name}` : ""}`,
      };

      const { error: rentalErr } = await admin.from("rentals").insert(rental);
      if (rentalErr) throw new HttpError(500, `Erro ao criar locação: ${rentalErr.message}`);

      await admin.from("vehicles").update({ status: "reserved", updated_at: now }).eq("id", vehicle.id);

      const contractId = newId();
      const token = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");
      const contractContent = buildContractText({
        rental: {
          id: rentalId,
          clientId: client.id,
          vehicleId: vehicle.id,
          contractType: rental.contract_type,
          startDate,
          endDate,
          weeklyRate: rate,
          deposit,
          receipts,
          status: "pending",
        },
        client,
        vehicle,
        company: settings.company,
        issuedAt: new Date(),
      });

      await admin.from("contracts").insert({
        id: contractId,
        rental_id: rentalId,
        status: "pending",
        token,
        content: contractContent,
        client_name: client.name,
        client_cpf: client.cpf,
        client_email: client.email,
        company_signer: settings.company.signerName,
        company_signature: settings.company.signerSignature,
        company_email: settings.company.email,
      });

      await admin.from("rental_requests").update({
        status: "approved",
        created_rental_id: rentalId,
        reviewed_by: reviewer,
        reviewed_at: now,
        updated_at: now,
      }).eq("id", id);

      await audit({ actorType: "staff", actorId: reviewer, action: "rental_request.approved", entity: "rental_requests", entityId: id, details: { rentalId, contractId }, ip });

      const signUrl = `${COMPANY.siteUrl}/assinar/${token}`;
      await sendPushToClient(client.id, {
        title: "Locação aprovada!",
        body: `Parabéns, ${client.name}! Sua solicitação do ${vehicle.name} foi aprovada. Assine o contrato para retirar o carro.`,
        url: `/assinar/${token}`,
        severity: "success",
        tag: `request-approved-${id}`,
      }, "locacao");

      if (client.phone) {
        await sendWhatsApp(admin, {
          kind: "contract_signature",
          phone: client.phone,
          rentalId,
          contractId,
          text: `🎉 *Parabéns, ${client.name}!* Sua solicitação de locação do *${vehicle.name}* foi *APROVADA* pela ${brand().name}!\n\n📄 Para concluir, acesse o link seguro e assine seu contrato pelo celular:\n${signUrl}\n\nDúvidas? Estamos à disposição.`,
        }).catch((e) => console.error("[solicitação] whatsapp:", (e as Error).message));
      }

      if (client.email) {
        await sendEmail(admin, {
          kind: "contract_signature",
          to: client.email,
          rentalId,
          contractId,
          subject: `Locação aprovada — Assine seu contrato — ${brand().name}`,
          html: emailLayout({
            title: "Sua locação foi aprovada!",
            intro: `Olá, ${client.name}! Sua solicitação para o veículo <strong>${vehicle.name}</strong> foi aprovada pela equipe da ${brand().name}.`,
            rows: [
              ["Veículo", vehicle.name],
              ["Período", `${formatDate(startDate)} a ${formatDate(endDate)}`],
              ["Valor", `${formatCurrency(rate)}/${plan === "daily" ? "dia" : "semana"}`],
              ["Caução", formatCurrency(deposit)],
            ],
            cta: { label: "Assinar contrato online", url: signUrl },
          }),
        }).catch((e) => console.error("[solicitação] email:", (e as Error).message));
      }

      return Response.json({ ok: true, rentalId, contractId, signUrl });
    }

    if (body.action === "request.reject") {
      const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
      if (!reason) throw new HttpError(422, "Informe o motivo da recusa.");
      const { data: row } = await admin.from("rental_requests").update({
        status: "rejected",
        rejection_reason: reason,
        reviewed_by: reviewer,
        reviewed_at: now,
        updated_at: now,
      }).eq("id", id).select("client_id,vehicle_id").maybeSingle();
      if (!row) throw new HttpError(404, "Solicitação não encontrada.");

      await audit({ actorType: "staff", actorId: reviewer, action: "rental_request.rejected", entity: "rental_requests", entityId: id, details: { reason }, ip });
      await sendPushToClient(row.client_id, {
        title: "Solicitação não aprovada",
        body: `Sua solicitação de locação não foi aprovada: ${reason}`,
        url: "/",
        severity: "warning",
        tag: `request-rejected-${id}`,
      }, "inicio");

      return Response.json({ ok: true });
    }

    if (body.action === "request.request_correction") {
      const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 500) : "";
      if (!notes) throw new HttpError(422, "Informe a orientação para correção.");
      const { data: row } = await admin.from("rental_requests").update({
        status: "correction_requested",
        correction_notes: notes,
        reviewed_by: reviewer,
        reviewed_at: now,
        updated_at: now,
      }).eq("id", id).select("client_id").maybeSingle();
      if (!row) throw new HttpError(404, "Solicitação não encontrada.");

      await audit({ actorType: "staff", actorId: reviewer, action: "rental_request.correction", entity: "rental_requests", entityId: id, details: { notes }, ip });
      await sendPushToClient(row.client_id, {
        title: "Correção de documento necessária",
        body: `A ${brand().name} solicitou um ajuste na sua documentação: ${notes}`,
        url: "/",
        severity: "warning",
        tag: `request-correction-${id}`,
      }, "inicio");

      return Response.json({ ok: true });
    }

    if (body.action === "incident.status") {
      const status = typeof body.status === "string" && body.status in INCIDENT_STATUS ? body.status : null;
      if (!status) throw new HttpError(422, "Status inválido.");
      const { data: row } = await admin.from("vehicle_incidents").update({ status, admin_notes: note, updated_at: now }).eq("id", id).select("client_id,category").maybeSingle();
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
      const { data: row } = await admin
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
              body: approve ? `${DOCUMENT_KIND[r.kind]} conferido pela ${brand().name}.` : `${DOCUMENT_KIND[r.kind]}: ${reason}. Envie de novo pelo app.`,
              url: "/",
              severity: approve ? "success" : "warning",
              tag: `document-${id}`,
            }
          : {
              title: approve ? "Vistoria conferida" : "Refaça a vistoria",
              body: approve ? `A ${brand().name} conferiu a vistoria que você enviou.` : `${note ?? reason}`.slice(0, 180),
              url: "/",
              severity: approve ? "success" : "warning",
              tag: `inspection-${id}`,
            },
        isDoc ? "documentos" : "veiculo",
      );
      if (isDoc && approve && (r.kind === "cnh_front" || r.kind === "cnh_back" || r.kind === "address_proof")) {
        const { data: doc } = await admin.from("tenant_documents").select("path").eq("id", id).single();
        const column = r.kind === "cnh_front" ? "cnh_front_url" : r.kind === "cnh_back" ? "cnh_back_url" : "address_proof_url";
        if (doc) await admin.from("clients").update({ [column]: `documentos/${doc.path}` }).eq("id", r.client_id);
      }
      return Response.json({ ok: true });
    }

    throw new HttpError(400, "Ação inválida.");
  } catch (e) {
    return errorResponse(e);
  }
});

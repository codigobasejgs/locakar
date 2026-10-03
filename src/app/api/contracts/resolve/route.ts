import { serviceDb } from "@/lib/server/push";
import { HttpError, errorResponse, requireStaff } from "@/lib/server/supabase";
import { renderContractContent, resolveContractVariables } from "@/lib/server/contract-resolver";
import { buildContractText } from "@/lib/contract";
import { fromRow } from "@/repositories/mapping";
import type { Client, CompanyProfile, FleetVehicle, Rental } from "@/types";
import { scoped } from "@/lib/server/org-context";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Endpoint de resolução e pré-visualização de contrato determinístico.
 * POST { rentalId, templateId?, manualValues? }
 */
export const POST = scoped(async function POST(request: Request) {
  try {
    await requireStaff();
    const body = await request.json();
    const { rentalId, templateId, manualValues } = body;
    if (!rentalId) throw new HttpError(400, "Locação não informada.");

    const db = serviceDb();

    // 1. Carrega locação, cliente, veículo e dados da empresa
    const [{ data: rentalRow }, { data: settingsRow }] = await Promise.all([
      db.from("rentals").select("*").eq("id", rentalId).maybeSingle(),
      db.from("settings").select("data").maybeSingle(),
    ]);

    if (!rentalRow) throw new HttpError(404, "Locação não encontrada.");
    const rental = fromRow<Rental>(rentalRow);
    const company = (settingsRow?.data?.company ?? {}) as CompanyProfile;

    const [{ data: clientRow }, { data: vehicleRow }] = await Promise.all([
      db.from("clients").select("*").eq("id", rental.clientId).maybeSingle(),
      db.from("vehicles").select("*").eq("id", rental.vehicleId).maybeSingle(),
    ]);

    if (!clientRow || !vehicleRow) throw new HttpError(404, "Cliente ou veículo da locação não encontrado.");
    const client = fromRow<Client>(clientRow);
    const vehicle = fromRow<FleetVehicle>(vehicleRow);

    // 2. Busca o template configurado para o tipo de contrato ou selecionado manualmente
    let templateQuery = db.from("contract_templates").select("*");
    if (templateId) {
      templateQuery = templateQuery.eq("id", templateId);
    } else {
      templateQuery = templateQuery
        .or(`rental_type.eq.${rental.contractType},rental_type.eq.Todos`)
        .eq("status", "configured")
        .order("is_default", { ascending: false })
        .limit(1);
    }

    const { data: template } = await templateQuery.maybeSingle();

    // 3. Se não houver template configurado, cai para o modelo padrão estático LOCAKAR
    if (!template || !template.mapping || !template.mapping.length) {
      const defaultText = buildContractText({
        rental,
        client,
        vehicle,
        company,
        issuedAt: new Date(),
      });
      return Response.json({
        hasTemplate: false,
        content: defaultText,
        missingRequired: [],
        snapshot: {},
      });
    }

    // 4. Resolve as variáveis usando o mapping aprovado
    const { snapshot, missingRequired } = resolveContractVariables({
      rental,
      client,
      vehicle,
      company,
      manualValues,
      mappings: template.mapping,
    });

    // Se o template tem texto bruto extraído, renderiza as substituições; senão usa padrão preenchido
    const rendered = template.raw_extracted_text
      ? renderContractContent(template.raw_extracted_text, snapshot)
      : buildContractText({ rental, client, vehicle, company, issuedAt: new Date() });

    return Response.json({
      hasTemplate: true,
      templateId: template.id,
      templateName: template.name,
      templateVersion: template.current_version,
      content: rendered,
      snapshot,
      missingRequired,
      manualFields: template.manual_fields ?? [],
    });
  } catch (e) {
    return errorResponse(e);
  }
});

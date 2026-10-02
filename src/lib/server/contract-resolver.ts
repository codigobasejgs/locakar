import "server-only";
import { CONTRACT_VARIABLES, type FieldMapping } from "@/lib/contract-variables";
import { billingOf } from "@/lib/billing";
import { formatDate } from "@/lib/utils";
import type { Client, CompanyProfile, FleetVehicle, Rental } from "@/types";

export interface ResolvedContractData {
  snapshot: Record<string, string>;
  missingRequired: string[];
}

/**
 * Resolve todas as variáveis do catálogo a partir dos dados reais do banco.
 * O preenchimento é 100% determinístico, sem qualquer uso de IA.
 */
export function resolveContractVariables(args: {
  rental: Rental;
  client: Client;
  vehicle: FleetVehicle;
  company: CompanyProfile;
  manualValues?: Record<string, unknown>;
  mappings: FieldMapping[];
}): ResolvedContractData {
  const { rental, client, vehicle, company, manualValues = {}, mappings } = args;
  const billing = billingOf(rental);

  // Mapeamento fonte de dados concreta
  const rawValues: Record<string, unknown> = {
    // Cliente
    "client.name": client.name,
    "client.cpf": client.cpf,
    "client.rg": client.rg,
    "client.phone": client.phone,
    "client.email": client.email,
    "client.address": client.address,
    "client.cep": client.cep,
    "client.city": client.city,
    "client.state": client.state,
    "client.cnhNumber": client.cnhNumber,
    "client.cnhCategory": client.cnhCategory,
    "client.cnhExpiry": client.cnhExpiry,
    "client.firstLicenseDate": client.firstLicenseDate,

    // Veículo
    "vehicle.name": vehicle.name,
    "vehicle.brand": vehicle.brand,
    "vehicle.model": vehicle.model,
    "vehicle.year": vehicle.year,
    "vehicle.yearModel": vehicle.yearModel || vehicle.year,
    "vehicle.plate": vehicle.plate,
    "vehicle.color": vehicle.color,
    "vehicle.renavam": vehicle.renavam,
    "vehicle.chassis": vehicle.chassis,
    "vehicle.fuel": vehicle.fuel,
    "vehicle.odometer": vehicle.odometer,

    // Locação
    "rental.startDate": rental.startDate,
    "rental.startTime": rental.startTime,
    "rental.endDate": rental.endDate,
    "rental.endTime": rental.endTime,
    "rental.contractType": rental.contractType,
    "rental.periodRate": billing.amount,
    "rental.deposit": rental.deposit,
    "rental.paymentWeekday": rental.paymentWeekday,
    "rental.kmStart": rental.kmStart,

    // Empresa
    "company.name": company.legalName,
    "company.document": company.cnpj,
    "company.address": company.address,
    "company.signerName": company.signerName,
    "company.city": company.contractCity,

    // Contrato
    "contract.date": formatDate(new Date().toISOString()),
  };

  const snapshot: Record<string, string> = {};
  const missingRequired: string[] = [];

  // Mapeia cada campo configurado no template
  for (const m of mappings) {
    if (m.isManual || m.variableKey === "UNMAPPED") {
      const cleanLabel = (m.manualFieldLabel || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const val = manualValues[`manual.${cleanLabel}`] ?? manualValues[m.id] ?? manualValues[`manual.${m.id}`];
      if (val !== undefined && val !== null && String(val).trim() !== "") {
        snapshot[m.originalText] = String(val);
      } else {
        missingRequired.push(`Campo adicional: ${m.manualFieldLabel || m.originalText}`);
      }
      continue;
    }
    const def = CONTRACT_VARIABLES[m.variableKey];
    if (!def) continue;

    const raw = rawValues[m.variableKey];
    const hasValue = raw !== undefined && raw !== null && String(raw).trim() !== "";

    if (!hasValue && def.required) {
      missingRequired.push(`${def.label} (${def.group})`);
    }

    const formatted = hasValue ? (def.formatter ? def.formatter(raw) : String(raw)) : "";
    snapshot[m.originalText] = formatted;
  }

  return { snapshot, missingRequired };
}

/**
 * Preenche o texto original do contrato substituindo os trechos mapeados.
 * Se o modelo for texto puro, aplica substituição literal precisa.
 */
export function renderContractContent(originalContent: string, snapshot: Record<string, string>): string {
  let rendered = originalContent;
  for (const [search, replacement] of Object.entries(snapshot)) {
    if (!search || search === replacement) continue;
    // Substitui com escape de caracteres especiais regex
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    rendered = rendered.replace(new RegExp(escaped, "g"), replacement);
  }
  return rendered;
}

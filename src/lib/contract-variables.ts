/**
 * Catálogo estrito de variáveis LOCAKAR para preenchimento de contratos.
 * A IA pode sugerir somente as variáveis listadas aqui; qualquer outra é rejeitada.
 */
import { formatCurrency, formatDate, formatNumber, maskCEP, maskCNPJ, maskCPF, maskPhone, maskPlate } from "./utils";

export interface ContractVariableDef {
  key: string;
  label: string;
  group: "Cliente" | "Veículo" | "Locação" | "Reserva" | "Empresa" | "Contrato";
  description: string;
  required: boolean;
  formatter?: (val: unknown) => string;
}

export const CONTRACT_VARIABLES: Record<string, ContractVariableDef> = {
  // Cliente
  "client.name": { key: "client.name", label: "Nome do locatário", group: "Cliente", description: "Nome completo do cliente", required: true },
  "client.cpf": { key: "client.cpf", label: "CPF do locatário", group: "Cliente", description: "CPF formatado (000.000.000-00)", required: true, formatter: (v) => maskCPF(String(v ?? "")) },
  "client.rg": { key: "client.rg", label: "RG do locatário", group: "Cliente", description: "Documento de identidade", required: false },
  "client.phone": { key: "client.phone", label: "Telefone do locatário", group: "Cliente", description: "Telefone/celular formatado", required: true, formatter: (v) => maskPhone(String(v ?? "")) },
  "client.email": { key: "client.email", label: "E-mail do locatário", group: "Cliente", description: "Endereço eletrônico", required: false },
  "client.address": { key: "client.address", label: "Endereço completo", group: "Cliente", description: "Logradouro, número, bairro", required: true },
  "client.cep": { key: "client.cep", label: "CEP do locatário", group: "Cliente", description: "Código postal formatado", required: false, formatter: (v) => maskCEP(String(v ?? "")) },
  "client.city": { key: "client.city", label: "Cidade do locatário", group: "Cliente", description: "Município de residência", required: false },
  "client.state": { key: "client.state", label: "Estado do locatário", group: "Cliente", description: "UF da residência", required: false },
  "client.cnhNumber": { key: "client.cnhNumber", label: "Número da CNH", group: "Cliente", description: "Registro da carteira de habilitação", required: false },
  "client.cnhCategory": { key: "client.cnhCategory", label: "Categoria da CNH", group: "Cliente", description: "Categoria de habilitação (ex: B, AB)", required: false },
  "client.cnhExpiry": { key: "client.cnhExpiry", label: "Validade da CNH", group: "Cliente", description: "Data de expiração da CNH", required: true, formatter: (v) => formatDate(String(v ?? "")) },
  "client.firstLicenseDate": { key: "client.firstLicenseDate", label: "Data da 1ª habilitação", group: "Cliente", description: "Data da primeira CNH", required: false, formatter: (v) => formatDate(String(v ?? "")) },

  // Veículo
  "vehicle.name": { key: "vehicle.name", label: "Nome do veículo", group: "Veículo", description: "Descrição comercial (ex: Fiat Mobi)", required: true },
  "vehicle.brand": { key: "vehicle.brand", label: "Marca", group: "Veículo", description: "Fabricante do veículo", required: true },
  "vehicle.model": { key: "vehicle.model", label: "Modelo", group: "Veículo", description: "Modelo do veículo", required: true },
  "vehicle.year": { key: "vehicle.year", label: "Ano de fabricação", group: "Veículo", description: "Ano fab. do veículo", required: true },
  "vehicle.yearModel": { key: "vehicle.yearModel", label: "Ano modelo", group: "Veículo", description: "Ano modelo do veículo", required: false },
  "vehicle.plate": { key: "vehicle.plate", label: "Placa", group: "Veículo", description: "Placa Mercosul ou padrão", required: true, formatter: (v) => maskPlate(String(v ?? "")) },
  "vehicle.color": { key: "vehicle.color", label: "Cor", group: "Veículo", description: "Cor do veículo", required: false },
  "vehicle.renavam": { key: "vehicle.renavam", label: "Renavam", group: "Veículo", description: "Código Renavam", required: false },
  "vehicle.chassis": { key: "vehicle.chassis", label: "Chassi", group: "Veículo", description: "Número de chassi completo", required: false },
  "vehicle.fuel": { key: "vehicle.fuel", label: "Combustível", group: "Veículo", description: "Tipo de combustível (Flex, Gasolina, etc)", required: false },
  "vehicle.odometer": { key: "vehicle.odometer", label: "Hodômetro atual", group: "Veículo", description: "Quilometragem atual", required: false, formatter: (v) => (v != null ? `${formatNumber(Number(v))} km` : "") },

  // Locação
  "rental.startDate": { key: "rental.startDate", label: "Data inicial", group: "Locação", description: "Início da vigência", required: true, formatter: (v) => formatDate(String(v ?? "")) },
  "rental.startTime": { key: "rental.startTime", label: "Horário inicial", group: "Locação", description: "Horário de retirada", required: false },
  "rental.endDate": { key: "rental.endDate", label: "Data final", group: "Locação", description: "Término da locação", required: true, formatter: (v) => formatDate(String(v ?? "")) },
  "rental.endTime": { key: "rental.endTime", label: "Horário final", group: "Locação", description: "Horário de devolução", required: false },
  "rental.contractType": { key: "rental.contractType", label: "Tipo do contrato", group: "Locação", description: "Semanal, Mensal, etc", required: true },
  "rental.periodRate": { key: "rental.periodRate", label: "Valor da parcela", group: "Locação", description: "Valor monetário da parcela recorrente", required: true, formatter: (v) => formatCurrency(Number(v ?? 0)) },
  "rental.deposit": { key: "rental.deposit", label: "Valor da caução", group: "Locação", description: "Depósito caução exigido", required: false, formatter: (v) => formatCurrency(Number(v ?? 0)) },
  "rental.paymentWeekday": { key: "rental.paymentWeekday", label: "Dia de pagamento", group: "Locação", description: "Dia da semana acordado", required: false },
  "rental.kmStart": { key: "rental.kmStart", label: "KM inicial", group: "Locação", description: "Quilometragem no check-out", required: false, formatter: (v) => (v != null ? `${formatNumber(Number(v))} km` : "") },

  // Empresa
  "company.name": { key: "company.name", label: "Razão social da locadora", group: "Empresa", description: "Nome jurídico da locadora", required: true },
  "company.document": { key: "company.document", label: "CNPJ da locadora", group: "Empresa", description: "CNPJ da locadora", required: true, formatter: (v) => maskCNPJ(String(v ?? "")) },
  "company.address": { key: "company.address", label: "Endereço da locadora", group: "Empresa", description: "Sede da empresa", required: true },
  "company.signerName": { key: "company.signerName", label: "Representante legal", group: "Empresa", description: "Nome do responsável que assina", required: true },
  "company.city": { key: "company.city", label: "Cidade da locadora / Foro", group: "Empresa", description: "Comarca de foro eleita", required: true },

  // Contrato
  "contract.date": { key: "contract.date", label: "Data de emissão", group: "Contrato", description: "Data de geração do contrato", required: true, formatter: (v) => formatDate(String(v ?? "")) },
};

export interface FieldMapping {
  id: string;
  originalText: string;
  page?: number;
  variableKey: string | "UNMAPPED";
  confidence: number;
  manualFieldLabel?: string;
  isManual?: boolean;
}

export interface ManualField {
  key: string;
  label: string;
  type: "text" | "number" | "currency" | "date";
  required: boolean;
}

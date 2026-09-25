/**
 * Geração do texto do contrato de locação.
 * O texto final fica congelado no banco (tabela contracts, com hash SHA-256) no momento da emissão.
 * As cláusulas gerais são um MODELO: devem ser revisadas por um advogado e ajustadas em Configurações.
 */
import type { Client, CompanyProfile, FleetVehicle, Inspection, Rental } from "@/types";
import { daysBetween, formatCurrency, formatDate, formatNumber } from "./utils";

export const DEFAULT_CONTRACT_TERMS = `1. OBJETO. A LOCADORA cede ao LOCATÁRIO, a título de locação, o veículo descrito neste contrato, pelo período e valores aqui indicados.
2. USO. O veículo será conduzido exclusivamente pelo LOCATÁRIO, devidamente habilitado, em vias públicas e em conformidade com o Código de Trânsito Brasileiro, sendo vedados a sublocação, o transporte remunerado de passageiros ou cargas sem autorização por escrito, o uso em competições e a saída do território nacional.
3. PAGAMENTO. O valor da locação será pago na periodicidade e no dia combinados neste contrato. O atraso sujeita o LOCATÁRIO às medidas previstas em lei e poderá implicar o recolhimento do veículo.
4. CAUÇÃO. A caução informada garante o cumprimento das obrigações e será devolvida após a vistoria de devolução, descontados eventuais débitos apurados.
5. MULTAS DE TRÂNSITO. As infrações cometidas durante a locação são de responsabilidade do LOCATÁRIO, que desde já concorda com a indicação como condutor perante o órgão autuador e com o reembolso dos valores eventualmente pagos pela LOCADORA.
6. DANOS E SINISTROS. O LOCATÁRIO responde pelos danos causados ao veículo e a terceiros durante a locação, devendo comunicar imediatamente à LOCADORA qualquer acidente, furto ou roubo, com o respectivo boletim de ocorrência.
7. MANUTENÇÃO. O LOCATÁRIO deve zelar pelo veículo, verificar níveis e comunicar qualquer anomalia. As manutenções preventivas serão agendadas pela LOCADORA.
8. VISTORIAS. O estado do veículo é registrado em vistoria na entrega e na devolução, assinadas pelas partes, que integram este contrato.
9. DEVOLUÇÃO. O veículo deve ser devolvido na data, no horário e no local combinados, no mesmo estado de conservação e com o mesmo nível de combustível da entrega, sob pena de cobrança das diferenças.
10. RESCISÃO. O descumprimento de qualquer cláusula autoriza a rescisão imediata deste contrato e o recolhimento do veículo.
11. ASSINATURA ELETRÔNICA. As partes reconhecem a validade da assinatura eletrônica deste instrumento, nos termos do art. 10, § 2º, da MP nº 2.200-2/2001 e da Lei nº 14.063/2020, com registro de data, hora, IP e código de integridade (hash).
12. FORO. Fica eleito o foro da comarca indicada neste contrato para dirimir quaisquer questões dele decorrentes.`;

export const EMPTY_COMPANY: CompanyProfile = {
  legalName: "",
  cnpj: "",
  address: "",
  email: "",
  signerName: "",
  signerSignature: undefined,
  contractCity: "",
  contractTerms: DEFAULT_CONTRACT_TERMS,
};

/** Campos da empresa obrigatórios para emitir contrato. */
export function missingCompanyFields(c: CompanyProfile) {
  const required: [keyof CompanyProfile, string][] = [
    ["legalName", "Razão social"],
    ["cnpj", "CNPJ"],
    ["address", "Endereço"],
    ["signerName", "Representante"],
    ["contractCity", "Cidade/foro"],
  ];
  return required.filter(([k]) => !String(c[k] ?? "").trim()).map(([, label]) => label);
}

/** Campos do cliente obrigatórios para emitir contrato. */
export function missingClientFields(client: Client) {
  const missing: string[] = [];
  if (!client.address?.trim()) missing.push("endereço");
  if (!client.cnhExpiry) missing.push("vencimento da CNH");
  return missing;
}

const line = (label: string, value?: string | number) => `${label}: ${value === undefined || value === "" ? "—" : value}`;

export function buildContractText(args: { rental: Rental; client: Client; vehicle: FleetVehicle; company: CompanyProfile; issuedAt: Date }) {
  const { rental, client, vehicle, company, issuedAt } = args;
  return [
    "CONTRATO DE LOCAÇÃO DE VEÍCULO",
    "",
    "LOCADORA",
    line("Razão social", company.legalName),
    line("CNPJ", company.cnpj),
    line("Endereço", company.address),
    line("Representante", company.signerName),
    "",
    "LOCATÁRIO",
    line("Nome", client.name),
    line("CPF", client.cpf),
    line("Endereço", client.address),
    line("Telefone", client.phone),
    line("E-mail", client.email),
    line("1ª habilitação", formatDate(client.firstLicenseDate)),
    line("Validade da CNH", formatDate(client.cnhExpiry)),
    "",
    "VEÍCULO",
    line("Descrição", vehicle.name),
    line("Placa", vehicle.plate),
    line("Ano/modelo", vehicle.yearModel ?? String(vehicle.year)),
    line("Renavam", vehicle.renavam),
    line("Combustível", vehicle.fuel),
    "",
    "CONDIÇÕES DA LOCAÇÃO",
    line("Tipo de contrato", rental.contractType),
    line("Início", `${formatDate(rental.startDate)} ${rental.startTime ?? ""}`.trim()),
    line("Término", `${formatDate(rental.endDate)} ${rental.endTime ?? ""}`.trim()),
    line("Quantidade de diárias", Math.max(1, daysBetween(rental.startDate, rental.endDate) + 1)),
    line("Valor semanal", formatCurrency(rental.weeklyRate)),
    line("Dia de pagamento", rental.paymentWeekday),
    line("Caução", formatCurrency(rental.deposit)),
    line("KM inicial", rental.kmStart != null ? formatNumber(rental.kmStart) : undefined),
    rental.notes ? line("Observações", rental.notes) : "",
    "",
    "CLÁUSULAS GERAIS",
    company.contractTerms.trim(),
    "",
    `${company.contractCity || "—"}, ${issuedAt.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}.`,
    `Contrato vinculado à locação nº ${rental.id.slice(0, 8).toUpperCase()}.`,
  ]
    .filter((l, i, arr) => !(l === "" && arr[i - 1] === ""))
    .join("\n");
}

export const FUEL_LABEL: Record<Inspection["fuel"], string> = {
  empty: "Reserva",
  quarter: "1/4",
  half: "1/2",
  three_quarters: "3/4",
  full: "Cheio",
};

export const FUEL_ORDER: Inspection["fuel"][] = ["empty", "quarter", "half", "three_quarters", "full"];

/** Itens do checklist de vistoria (entrega e devolução). */
export const INSPECTION_ITEMS: { key: string; label: string }[] = [
  { key: "exterior", label: "Lataria e pintura" },
  { key: "glass", label: "Vidros e retrovisores" },
  { key: "tires", label: "Pneus e estepe" },
  { key: "lights", label: "Faróis e lanternas" },
  { key: "interior", label: "Bancos e interior limpos" },
  { key: "dashboard", label: "Painel sem luzes de alerta" },
  { key: "ac", label: "Ar-condicionado funcionando" },
  { key: "documents", label: "Documento do veículo (CRLV)" },
  { key: "tools", label: "Macaco, chave de roda e triângulo" },
  { key: "keys", label: "Chave e controle" },
];

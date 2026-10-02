/** Testes do motor inteligente de contratos: variáveis, formatadores, resolução determinística e renderização. */
import assert from "node:assert/strict";
import { CONTRACT_VARIABLES, type FieldMapping } from "../src/lib/contract-variables";
import { renderContractContent, resolveContractVariables } from "../src/lib/server/contract-resolver";
import type { Client, CompanyProfile, FleetVehicle, Rental } from "../src/types";
import { inTestOrg } from "./test-org";

inTestOrg(async () => {
  // 1. Catálogo e formatadores
  const cpfDef = CONTRACT_VARIABLES["client.cpf"];
  assert.ok(cpfDef);
  assert.equal(cpfDef.formatter?.("52998224725"), "529.982.247-25");

  const plateDef = CONTRACT_VARIABLES["vehicle.plate"];
  assert.ok(plateDef);
  assert.equal(plateDef.formatter?.("abc1d23"), "ABC1D23");

  const rateDef = CONTRACT_VARIABLES["rental.periodRate"];
  assert.ok(rateDef);
  assert.equal(rateDef.formatter?.(700), "R$ 700,00");

  // 2. Resolver determinístico sem IA
  const mockRental = {
    id: "r1",
    clientId: "c1",
    vehicleId: "v1",
    startDate: "2026-10-05",
    endDate: "2026-10-12",
    contractType: "Semanal",
    weeklyRate: 700,
    receipts: [{ id: "p1", dueDate: "2026-10-12", amount: 700, paid: false }],
  } as Rental;

  const mockClient = {
    id: "c1",
    name: "Jefferson Santos",
    cpf: "52998224725",
    phone: "19989615873",
    email: "jefferson@example.com",
    address: "Rua das Flores, 123",
    cnhExpiry: "2030-01-01",
  } as Client;

  const mockVehicle = {
    id: "v1",
    name: "Fiat Mobi",
    brand: "Fiat",
    model: "Mobi",
    year: 2024,
    plate: "ABC1D23",
  } as FleetVehicle;

  const mockCompany = {
    legalName: "LOCAKAR LOCADORA LTDA",
    cnpj: "00000000000191",
    address: "Av. Principal, 100",
    signerName: "Administrador",
    contractCity: "Campinas/SP",
    contractTerms: "Cláusulas...",
  } as CompanyProfile;

  const mappings: FieldMapping[] = [
    { id: "1", originalText: "{{NOME_LOCATARIO}}", variableKey: "client.name", confidence: 0.98 },
    { id: "2", originalText: "{{CPF_LOCATARIO}}", variableKey: "client.cpf", confidence: 0.99 },
    { id: "3", originalText: "{{PLACA_VEICULO}}", variableKey: "vehicle.plate", confidence: 0.95 },
    { id: "4", originalText: "{{VALOR_SEMANAL}}", variableKey: "rental.periodRate", confidence: 0.9 },
    { id: "5", originalText: "{{APOLICE_SEGURO}}", variableKey: "UNMAPPED", confidence: 0.5, isManual: true, manualFieldLabel: "Número da Apólice" },
  ];

  // Caso A: campo manual preenchido com sucesso
  const resolved = resolveContractVariables({
    rental: mockRental,
    client: mockClient,
    vehicle: mockVehicle,
    company: mockCompany,
    manualValues: { "manual.numerodaapolice": "AP-998877" },
    mappings,
  });

  assert.equal(resolved.missingRequired.length, 0);
  assert.equal(resolved.snapshot["{{NOME_LOCATARIO}}"], "Jefferson Santos");
  assert.equal(resolved.snapshot["{{CPF_LOCATARIO}}"], "529.982.247-25");
  assert.equal(resolved.snapshot["{{PLACA_VEICULO}}"], "ABC1D23");
  assert.equal(resolved.snapshot["{{APOLICE_SEGURO}}"], "AP-998877");

  // Caso B: campo obrigatório ausente bloqueia
  const clientWithoutAddress = { ...mockClient, address: "" };
  const mappingsWithAddress: FieldMapping[] = [
    ...mappings,
    { id: "6", originalText: "{{ENDERECO}}", variableKey: "client.address", confidence: 0.9 },
  ];
  const missingRes = resolveContractVariables({
    rental: mockRental,
    client: clientWithoutAddress,
    vehicle: mockVehicle,
    company: mockCompany,
    manualValues: { "manual.numerodaapolice": "AP-998877" },
    mappings: mappingsWithAddress,
  });
  assert.ok(missingRes.missingRequired.length > 0);
  assert.match(missingRes.missingRequired[0], /Endereço/);

  // 3. Renderização de substituição determinística
  const templateDoc = "CONTRATO DE LOCAÇÃO: Eu, {{NOME_LOCATARIO}}, portador do CPF {{CPF_LOCATARIO}}, alugo o veículo placa {{PLACA_VEICULO}} pela quantia de {{VALOR_SEMANAL}} sob a apólice {{APOLICE_SEGURO}}.";
  const rendered = renderContractContent(templateDoc, resolved.snapshot);

  assert.ok(rendered.includes("Eu, Jefferson Santos, portador"));
  assert.ok(rendered.includes("CPF 529.982.247-25"));
  assert.ok(rendered.includes("placa ABC1D23"));
  assert.ok(rendered.includes("sob a apólice AP-998877"));
  assert.ok(!rendered.includes("{{"));

  // 4. Extração de texto de DOCX (ZIP mínimo com word/document.xml comprimido)
  const { deflateRawSync } = await import("node:zlib");
  const { docxText } = await import("../src/lib/server/docx");
  const xml = Buffer.from('<w:document><w:body><w:p><w:r><w:t>Locatário: {{NOME}}</w:t></w:r></w:p><w:p><w:r><w:t>Placa &amp; CPF</w:t></w:r></w:p></w:body></w:document>');
  const comp = deflateRawSync(xml);
  const fname = Buffer.from("word/document.xml");
  const localH = Buffer.alloc(30); localH.writeUInt32LE(0x04034b50, 0); localH.writeUInt16LE(8, 8); localH.writeUInt32LE(comp.length, 18); localH.writeUInt32LE(xml.length, 22); localH.writeUInt16LE(fname.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(xml.length, 24); central.writeUInt16LE(fname.length, 28); central.writeUInt32LE(0, 42);
  const cdOffset = 30 + fname.length + comp.length;
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(46 + fname.length, 12); eocd.writeUInt32LE(cdOffset, 16);
  const zip = Buffer.concat([localH, fname, comp, central, fname, eocd]);
  assert.equal(docxText(new Uint8Array(zip)), "Locatário: {{NOME}}\nPlaca & CPF");
  assert.throws(() => docxText(new Uint8Array([1, 2, 3])));

  console.log("✓ Motor de contratos: variáveis, formatadores, resolução determinística e substituição ok");
}).catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

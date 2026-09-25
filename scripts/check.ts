/** Autoverificação da lógica pura. Rodar: `npm run check` (usa jiti, já instalado via Tailwind). */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { appleStartupImages } from "../src/lib/pwa";
import { findConflict } from "../src/lib/reservations";
import { fromRow, toRow } from "../src/repositories/mapping";
import type { Collections } from "../src/repositories/types";
import { DEFAULT_SETTINGS } from "../src/lib/constants";
import { buildNotices, dueForClient } from "../src/lib/notifications";
import { getWhatsAppUrl } from "../src/lib/whatsapp";
import { addDays, cpfCheckDigits, hideCPF, isValidCPF, isValidPlate, maskCPF, maskPhone, monthKey, toWhatsAppNumber } from "../src/lib/utils";

// WhatsApp oficial
assert.equal(getWhatsAppUrl(), "https://wa.me/5519989615873");
assert.equal(getWhatsAppUrl("Olá, LOCAKAR!"), "https://wa.me/5519989615873?text=Ol%C3%A1%2C%20LOCAKAR!");

// CPF
assert.equal(cpfCheckDigits("529982247"), "25");
assert.ok(isValidCPF("529.982.247-25"));
assert.ok(!isValidCPF("529.982.247-26"));
assert.ok(!isValidCPF("111.111.111-11"));
assert.equal(maskCPF("52998224725"), "529.982.247-25");
assert.equal(hideCPF("529.982.247-25"), "***.982.247-**");

// Telefone e placa
assert.equal(maskPhone("19989615873"), "(19) 98961-5873");
assert.ok(isValidPlate("ABC1234") && isValidPlate("ABC1D23"));
assert.ok(!isValidPlate("AB12345"));

// Datas (virada de mês/ano)
assert.equal(addDays("2026-12-30", 3), "2027-01-02");
assert.equal(monthKey("2026-03-15"), "2026-03");

// Conflito de reservas: sobreposição inclusiva, ignora canceladas e o próprio registro
const booked = [{ id: "a", vehicleId: "v1", startDate: "2026-10-01", endDate: "2026-10-10", status: "confirmed" }];
assert.ok(findConflict(booked, { vehicleId: "v1", startDate: "2026-10-10", endDate: "2026-10-12" }));
assert.equal(findConflict(booked, { vehicleId: "v1", startDate: "2026-10-11", endDate: "2026-10-12" }), undefined);
assert.equal(findConflict(booked, { vehicleId: "v2", startDate: "2026-10-01", endDate: "2026-10-12" }), undefined);
assert.equal(findConflict(booked, { id: "a", vehicleId: "v1", startDate: "2026-10-02", endDate: "2026-10-05" }), undefined);
assert.equal(findConflict([{ ...booked[0], status: "cancelled" }], { vehicleId: "v1", startDate: "2026-10-02", endDate: "2026-10-05" }), undefined);

// Mapeamento app ↔ Supabase: camelCase ↔ snake_case, undefined ↔ null, JSON aninhado intacto
const receipts = [{ id: "r1", dueDate: "2026-10-01", amount: 650, paid: false }];
const dbRow = toRow({ id: "x", clientId: "c1", kmEnd: undefined, weeklyRate: 650, receipts });
assert.deepEqual(dbRow, { id: "x", client_id: "c1", km_end: null, weekly_rate: 650, receipts });
assert.deepEqual(fromRow({ ...dbRow, created_at: "2026-01-01", updated_at: "2026-01-01" }), {
  id: "x",
  clientId: "c1",
  weeklyRate: 650,
  receipts,
  createdAt: "2026-01-01",
});
assert.equal("created_at" in toRow({ id: "y", createdAt: "2026-01-01" }), false); // nunca enviado ao banco

// Alertas automáticos: todos os grupos, dono certo e sem repetição
{
  const T = "2026-10-10";
  const base = { vehicles: [], clients: [], rentals: [], reservations: [], expenses: [], maintenance: [], fines: [], notes: [], contracts: [], emails: [] } as unknown as Collections;
  const data = {
    ...base,
    clients: [{ id: "c1", code: 1, registeredAt: T, name: "Ana Teste", phone: "(19) 99999-0000", cpf: "", cnhExpiry: "2026-10-12" }],
    vehicles: [{ id: "v1", plate: "ABC1D23", status: "rented", ipvaStatus: "late", licensingStatus: "paid" }],
    fines: [{ id: "f1", clientId: "c1", vehicleId: "v1", noticeNumber: "A1", description: "x", infractionDate: T, dueDate: "2026-10-05", amount: 100, status: "pending" }],
    rentals: [
      { id: "r1", clientId: "c1", vehicleId: "v1", startDate: "2026-09-01", endDate: "2026-10-08", weeklyRate: 1, status: "active", receipts: [{ id: "x", dueDate: "2026-10-01", amount: 700, paid: false }] },
    ],
    maintenance: [{ id: "m1", vehicleId: "v1", date: "2026-10-15", description: "óleo", status: "scheduled" }],
    reservations: [{ id: "s1", clientId: "c1", vehicleId: "v1", startDate: "2026-10-12", endDate: "2026-10-20", status: "confirmed" }],
    contracts: [{ id: "k1", rentalId: "r1", status: "pending", issuedAt: "2026-10-01T10:00:00Z", clientName: "Ana Teste" }],
  } as unknown as Collections;
  const notices = buildNotices(data, DEFAULT_SETTINGS, T);
  const groups = new Set(notices.map((n) => n.group));
  for (const g of ["fine", "receipt", "maintenance", "cnh", "documents", "contract", "return", "reservation"]) assert.ok(groups.has(g as never), `grupo ausente: ${g}`);
  // Manutenção e IPVA/licenciamento: só a empresa; os demais também vão ao cliente.
  assert.ok(notices.filter((n) => n.group === "maintenance" || n.group === "documents").every((n) => !n.clientId));
  assert.ok(notices.filter((n) => !["maintenance", "documents"].includes(n.group)).every((n) => n.clientId === "c1" && n.clientText));
  // Lembrete já enviado recentemente não se repete.
  const sent = new Set([notices.find((n) => n.group === "fine")!.key]);
  assert.equal(dueForClient(notices, sent).some((n) => n.group === "fine"), false);
  // Devolução já feita some; reserva longe demais não avisa.
  const done = buildNotices({ ...data, rentals: [{ ...data.rentals[0], returnInspection: {} as never, status: "finished" }], reservations: [{ ...data.reservations[0], startDate: "2026-11-30" }] }, DEFAULT_SETTINGS, T);
  assert.equal(done.some((n) => n.group === "return" || n.group === "reservation"), false);
}

// WhatsApp: telefone brasileiro → número internacional
assert.equal(toWhatsAppNumber("(19) 98961-5873"), "5519989615873");
assert.equal(toWhatsAppNumber("19 3232-1000"), "551932321000");
assert.equal(toWhatsAppNumber("+55 19 98961-5873"), "5519989615873");
assert.equal(toWhatsAppNumber("123"), null);

// PWA: cada splash declarada no <head> precisa existir em public/splash (gerador: scripts/generate-pwa-assets.py)
const missing = appleStartupImages()
  .map((img) => img.url)
  .filter((url) => !existsSync(join(process.cwd(), "public", url)));
assert.deepEqual(missing, [], `Splash screens ausentes: ${missing.join(", ")}`);
for (const icon of ["icon-192", "icon-512", "maskable-192", "maskable-512", "admin-180", "admin-192", "admin-512"]) {
  assert.ok(existsSync(join(process.cwd(), "public/icons", `${icon}.png`)), `Ícone ausente: ${icon}`);
}


// PDF do contrato: gera, tem cabeçalho de PDF e o certificado quando assinado.
{
  const { contractPdf } = await import("../src/lib/pdf");
  const bytes = await contractPdf({
    id: "abc12345-0000", rentalId: "r1", status: "signed", token: "t", content: "CONTRATO DE LOCAÇÃO DE VEÍCULO\n\nLOCADORA\nRazão social: X\n\nCLÁUSULAS GERAIS\n1. OBJETO. Texto 🚗.",
    contentHash: "a".repeat(64), clientName: "Fulano de Tal", clientCpf: "529.982.247-25", signedName: "Fulano de Tal", signedAt: new Date().toISOString(),
  });
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
  const { PDFDocument } = await import("pdf-lib");
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 2, "contrato + certificado");
}

console.log("✓ check ok");

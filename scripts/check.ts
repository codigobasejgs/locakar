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
  assert.ok(notices.every((n) => n.href.startsWith("/admin")), "alerta sem tela de destino");
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

// Web Push: eventos de negócio, dedupe, preferências, resumo e dispositivos expirados
{
  const { describeEvent, detectEvents, fanOut, isExpiredSubscription, noticeToEvent, summaryPayload, wantsPush, MAX_INDIVIDUAL_PUSHES } = await import("../src/lib/push-events");
  // Uma operação = uma notificação; edição trivial não notifica.
  assert.deepEqual(detectEvents("clients", undefined, { id: "c1" }), ["created"]);
  assert.deepEqual(detectEvents("clients", { id: "c1", phone: "1" }, { id: "c1", phone: "2" }), []);
  assert.deepEqual(detectEvents("emails", undefined, { id: "e" }), []);
  const rBefore = { id: "r1", status: "active", receipts: [{ id: "a", paid: false, amount: 700 }, { id: "b", paid: false, amount: 700 }] };
  const rAfter = { ...rBefore, receipts: [{ id: "a", paid: true, amount: 700 }, { id: "b", paid: false, amount: 700 }] };
  assert.deepEqual(detectEvents("rentals", rBefore, rAfter), ["receipt:a"]);
  assert.deepEqual(detectEvents("rentals", rBefore, { ...rBefore, status: "finished" }), ["status:finished"]);
  assert.deepEqual(detectEvents("vehicles", { id: "v", status: "rented" }, { id: "v", status: "available" }), [], "devolução não duplica");
  assert.deepEqual(detectEvents("expenses", { id: "x", paid: false }, { id: "x", paid: true }), ["paid"]);
  // Texto vem do registro real; CPF/telefone nunca vão na notificação.
  const paid = describeEvent("receipt:a", { collection: "rentals", record: rAfter, clientName: "Ana", plate: "ABC1D23" })!;
  assert.equal(paid.title, "Pagamento recebido");
  assert.ok(paid.body.includes("Ana") && paid.body.includes("semana 1") && paid.url === "/admin/rentals/r1");
  const client = describeEvent("created", { collection: "clients", record: { id: "c1", name: "Ana", cpf: "529.982.247-25", phone: "19999" } })!;
  assert.ok(!client.body.includes("529") && !client.body.includes("19999"));
  assert.equal(describeEvent("status:rented", { collection: "vehicles", record: { id: "v", status: "rented" } }), null);
  assert.equal(describeEvent("created", { collection: "clients", record: { id: "c1", name: "Ana" } })!.dedupeKey, describeEvent("created", { collection: "clients", record: { id: "c1", name: "Ana" } })!.dedupeKey);
  // Alerta diário: notifica ao entrar na janela e ao ficar urgente, não todo dia.
  const soon = noticeToEvent({ key: "fine-due:f1", group: "fine", href: "/admin/fines", urgent: false, adminText: "Multa a vencer · ABC1D23 · R$ 100,00" });
  const late = noticeToEvent({ key: "fine-due:f1", group: "fine", href: "/admin/fines", urgent: true, adminText: "Multa vencida · ABC1D23 · R$ 100,00" });
  assert.notEqual(soon.dedupeKey, late.dedupeKey);
  assert.equal(soon.title, "Multa a vencer");
  assert.equal(late.severity, "critical");
  // Preferências: categoria desligada ou Web Push desligado não envia.
  assert.ok(wantsPush({ enabled: true, categories: {} }, "fines"));
  assert.ok(!wantsPush({ enabled: true, categories: { fines: false } }, "fines"));
  assert.ok(!wantsPush({ enabled: false, categories: {} }, "fines"));
  // Rajada vira um resumo só.
  const many = Array.from({ length: MAX_INDIVIDUAL_PUSHES + 2 }, () => soon);
  assert.equal(summaryPayload([...many, late]).severity, "critical");
  // Vários dispositivos: 410/404 removem só aquele; erro passageiro não derruba os outros.
  assert.ok(isExpiredSubscription(404) && isExpiredSubscription(410) && !isExpiredSubscription(500));
  const subs = [{ id: "ok1" }, { id: "gone" }, { id: "down" }, { id: "ok2" }, { id: "missing" }];
  const codes: Record<string, number> = { gone: 410, down: 500, missing: 404 };
  const res = await fanOut(subs, async (s) => {
    if (codes[s.id]) throw { statusCode: codes[s.id], body: "x" };
  }, 2);
  assert.deepEqual(res.sent.sort(), ["ok1", "ok2"]);
  assert.deepEqual(res.expired.sort(), ["gone", "missing"]);
  assert.deepEqual(res.failed.map((f) => f.id), ["down"]);
}

// Alertas importantes: vão também ao e-mail/WhatsApp da empresa; texto do WhatsApp vira texto de push
{
  const { isAdminAlert, plainText } = await import("../src/lib/push-events");
  assert.ok(isAdminAlert({ type: "contract.signed", severity: "success" }));
  assert.ok(isAdminAlert({ type: "payment.received", severity: "success" }));
  assert.ok(isAdminAlert({ type: "alert.return", severity: "critical" }), "todo critical é importante");
  assert.ok(!isAdminAlert({ type: "note.created", severity: "info" }));
  assert.ok(!isAdminAlert({ type: "client.created", severity: "info" }));
  const wa = "Olá, Ana! 👋\n\n💰 *Pagamento confirmado*\nRecebemos a _semana 2_.\nhttps://www.locakar.com.br/x";
  assert.equal(plainText(wa), "💰 Pagamento confirmado Recebemos a semana 2.");
  const { mergeSettings } = await import("../src/repositories/types");
  const merged = mergeSettings(DEFAULT_SETTINGS, { alerts: { email: "a@b.com" } } as never);
  assert.equal(merged.alerts.email, "a@b.com");
  assert.equal(merged.alerts.instant, true, "configuração antiga ganha os padrões novos");
}

// Cobranças: periodicidades, fim de mês, multa/juros e PIX (BR Code lido por qualquer banco)
{
  const { buildReceipts, crc16, lateCharges, normalizePixKey, pixPayload, billingOf } = await import("../src/lib/billing");
  const dates = (period: Parameters<typeof buildReceipts>[0]["period"], first: string, until: string) =>
    buildReceipts({ id: "r", firstDue: first, until, amount: 1, period }).map((x) => x.dueDate);
  assert.deepEqual(dates("monthly", "2026-01-31", "2026-04-30"), ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"], "fim de mês");
  assert.deepEqual(dates("quarterly", "2026-10-05", "2027-04-05"), ["2026-10-05", "2027-01-05", "2027-04-05"]);
  assert.deepEqual(dates("annual", "2024-02-29", "2026-03-01"), ["2024-02-29", "2025-02-28", "2026-02-28"]);
  assert.equal(dates("daily", "2026-10-01", "2026-10-07").length, 7);
  assert.equal(dates("weekly", "2026-10-01", "2026-10-29").length, 5);
  assert.equal(dates("biweekly", "2026-10-01", "2026-10-31").length, 3);
  assert.deepEqual(dates("semiannual", "2026-03-10", "2027-03-10"), ["2026-03-10", "2026-09-10", "2027-03-10"]);
  // Multa única + juros simples; carência zera; juros semanal/mensal contam períodos completos.
  const cfg = { graceDays: 0, lateFeePercent: 2, interestPercent: 1, interestPeriod: "daily" as const };
  assert.deepEqual(lateCharges(700, "2026-10-01", "2026-10-11", cfg), { days: 10, fee: 14, interest: 70, total: 784 });
  assert.equal(lateCharges(700, "2026-10-01", "2026-10-03", { ...cfg, graceDays: 3 }).total, 700);
  assert.equal(lateCharges(1000, "2026-10-01", "2026-10-15", { ...cfg, interestPeriod: "weekly" }).interest, 20);
  assert.equal(lateCharges(1000, "2026-10-01", "2026-10-29", { ...cfg, interestPeriod: "monthly" }).interest, 0);
  // Locação antiga (sem billing) continua semanal, sem juros e sem envio automático.
  assert.equal(billingOf({ weeklyRate: 650, receipts: [], startDate: "2026-01-01", endDate: "2026-02-01" }).period, "weekly");
  // PIX: CRC do exemplo oficial do Banco Central.
  assert.equal(crc16("00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304"), "1D3D");
  // Chave no formato do Banco Central por tipo; inválidas recusadas.
  assert.equal(normalizePixKey("(19) 98961-5873", "phone"), "+5519989615873");
  assert.equal(normalizePixKey("529.982.247-25", "cpf"), "52998224725");
  assert.equal(normalizePixKey("111.111.111-11", "cpf"), null);
  assert.equal(normalizePixKey("12.345.678/0001-95", "cnpj"), "12345678000195");
  assert.equal(normalizePixKey("Contato@LOCAKAR.com.br", "email"), "contato@locakar.com.br");
  // Payload: campos obrigatórios, valor, nome/cidade sem acento e CRC válido.
  const code = pixPayload({ key: "(19) 98961-5873", keyType: "phone", name: "Locação Ágil Veículos de São Paulo Ltda", city: "São José dos Campos" }, 784, "LKR-001");
  const fields: Record<string, string> = {};
  for (let i = 0; i < code.length; ) {
    const tag = code.slice(i, i + 2), len = Number(code.slice(i + 2, i + 4));
    fields[tag] = code.slice(i + 4, i + 4 + len);
    i += 4 + len;
  }
  assert.equal(fields["00"], "01");
  assert.ok(fields["26"].includes("br.gov.bcb.pix") && fields["26"].includes("+5519989615873"));
  assert.equal(fields["53"], "986");
  assert.equal(fields["54"], "784.00");
  assert.equal(fields["59"], "LOCACAO AGIL VEICULOS DE ");
  assert.equal(fields["60"], "SAO JOSE DOS CA");
  assert.ok(fields["62"].endsWith("LKR001"));
  assert.equal(crc16(code.slice(0, -4)), fields["63"]);
  assert.throws(() => pixPayload({ key: "123", keyType: "cpf", name: "X", city: "Y" }, 1));
  // Cron: cobra N dias antes, no dia e atrasadas a cada 3 dias; ignora pagas e locação encerrada.
  const { receiptsToCharge } = await import("../src/lib/billing");
  const rent = (autoSend: boolean, status = "active") => ({
    status, weeklyRate: 1, startDate: "2026-10-01", endDate: "2026-12-31",
    billing: { period: "weekly", amount: 1, firstDue: "2026-10-01", until: "2026-12-31", lateFeePercent: 0, interestPercent: 0, interestPeriod: "daily", graceDays: 0, autoSend, remindDaysBefore: 2 },
    receipts: [
      { id: "a", dueDate: "2026-10-10", amount: 1, paid: false },
      { id: "b", dueDate: "2026-10-12", amount: 1, paid: false },
      { id: "c", dueDate: "2026-10-04", amount: 1, paid: false },
      { id: "d", dueDate: "2026-10-05", amount: 1, paid: false },
      { id: "e", dueDate: "2026-10-10", amount: 1, paid: true },
    ],
  }) as never;
  // 10/10: "a" vence hoje, "b" em 2 dias (lembrete), "c" atrasada 6 dias (múltiplo de 3), "d" 5 dias (não).
  assert.deepEqual(receiptsToCharge(rent(true), "2026-10-10").map((r: { id: string }) => r.id), ["a", "b", "c"]);
  // 07/10: "c" atrasada 3 dias; "d" atrasada 2 dias (não); nenhuma vence em 2 dias.
  assert.deepEqual(receiptsToCharge(rent(true), "2026-10-07").map((r: { id: string }) => r.id), ["c"]);
  assert.equal(receiptsToCharge(rent(false), "2026-10-10").length, 0);
  assert.equal(receiptsToCharge(rent(true, "finished"), "2026-10-10").length, 0);
}

// App do Locatário: score antifraude (nunca bloqueia; só orienta a equipe) e assinatura montada no servidor.
{
  const { riskScore, riskLevel } = await import("../src/lib/antifraud");
  const { signatureSvg, isIsoDate, PHOTO_SLOTS } = await import("../src/lib/tenant");
  const clean = { newDevice: false, otherClientsOnDevice: 0, activeDevices: 1, emulator: false, integrity: "verified" as const, distinctIps24h: 1, duplicateProofs: 0, rejectedProofs30d: 0 };
  assert.deepEqual(riskScore(clean), { score: 0, factors: [] });
  assert.equal(riskLevel(riskScore({ ...clean, newDevice: true, integrity: "unavailable" }).score), "baixo");
  assert.equal(riskLevel(riskScore({ ...clean, otherClientsOnDevice: 1 }).score), "atencao");
  assert.equal(riskLevel(riskScore({ ...clean, duplicateProofs: 1, emulator: true }).score), "elevado");
  const worst = riskScore({ newDevice: true, otherClientsOnDevice: 2, activeDevices: 9, emulator: true, integrity: "failed", distinctIps24h: 9, duplicateProofs: 3, rejectedProofs30d: 5 });
  assert.equal(worst.score, 100);
  assert.equal(riskLevel(worst.score), "critico");
  assert.equal(riskLevel(29), "baixo");
  assert.equal(riskLevel(30), "atencao");
  assert.equal(riskLevel(60), "elevado");
  assert.equal(riskLevel(80), "critico");
  // Traço válido vira SVG; qualquer marcação, script ou texto é recusado.
  assert.ok(signatureSvg("M10 10 L20 20 L30 15")?.startsWith("<svg"));
  assert.equal(signatureSvg('M10 10"/><script>alert(1)</script>'), null);
  assert.equal(signatureSvg("L10 10 L20 20 L30"), null);
  assert.equal(signatureSvg(42), null);
  assert.ok(isIsoDate("2026-10-01") && !isIsoDate("2026-13-01") && !isIsoDate("01/10/2026"));
  assert.equal(new Set(PHOTO_SLOTS.map((s) => s.key)).size, PHOTO_SLOTS.length);
}

console.log("✓ check ok");

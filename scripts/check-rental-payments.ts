// Chamado do cliente: nova locação sem cliente em curso, tipo de contrato = periodicidade, período padrão em Pagamentos.
import assert from "node:assert/strict";
import { contractTypeFor } from "../src/lib/billing";
import { inPeriod, periodRange } from "../src/lib/payment-period";
import { busyClientIds } from "../src/lib/reservations";

// ---------- Clientes com locação em curso ----------
const rentals = [
  { id: "r1", clientId: "c1", status: "active" },
  { id: "r2", clientId: "c2", status: "late" },
  { id: "r3", clientId: "c3", status: "finished" },
  { id: "r4", clientId: "c4", status: "cancelled" },
  { id: "r5", clientId: "c5", status: "pending" },
];
assert.deepEqual([...busyClientIds(rentals)].sort(), ["c1", "c2"], "só ativa/atrasada ocupa o cliente");
assert.equal(busyClientIds(rentals, "r1").has("c1"), false, "na edição, o cliente da própria locação continua disponível");
assert.equal(busyClientIds([...rentals, { id: "r6", clientId: "c1", status: "active" }], "r1").has("c1"), true, "outra locação em curso do mesmo cliente ainda bloqueia");

// ---------- Tipo de contrato vem da periodicidade (modelos de contrato usam estes nomes) ----------
assert.equal(contractTypeFor("weekly"), "Semanal");
assert.equal(contractTypeFor("biweekly"), "Quinzenal");
assert.equal(contractTypeFor("monthly"), "Mensal");
assert.equal(contractTypeFor("daily"), "Diária");

// ---------- Período de Pagamentos ----------
// 26/11/2026 é quinta-feira: semana = segunda 23/11 a domingo 29/11.
assert.deepEqual(periodRange("week", "2026-11-26"), { from: "2026-11-23", to: "2026-11-29" });
assert.deepEqual(periodRange("week", "2026-11-23"), { from: "2026-11-23", to: "2026-11-29" }, "segunda começa a semana");
assert.deepEqual(periodRange("week", "2026-11-29"), { from: "2026-11-23", to: "2026-11-29" }, "domingo fecha a semana");
assert.deepEqual(periodRange("week", "2026-12-30"), { from: "2026-12-28", to: "2027-01-03" }, "virada de ano");
assert.deepEqual(periodRange("month", "2026-11-26"), { from: "2026-11-01", to: "2026-11-30" });
assert.deepEqual(periodRange("month", "2028-02-10"), { from: "2028-02-01", to: "2028-02-29" }, "fevereiro bissexto");
assert.deepEqual(periodRange("custom", "2026-11-26", { from: "2026-11-01", to: "2026-11-15" }), { from: "2026-11-01", to: "2026-11-15" });
assert.deepEqual(periodRange("custom", "2026-11-26", { from: "2026-11-15", to: "2026-11-01" }), { from: "2026-11-01", to: "2026-11-15" }, "datas invertidas são trocadas");
assert.deepEqual(periodRange("custom", "2026-11-26", { from: "", to: "2026-11-26" }), { from: undefined, to: "2026-11-26" }, "sem data inicial = tudo até a final");
const week = periodRange("week", "2026-11-26");
assert.equal(inPeriod("2026-11-23", week), true);
assert.equal(inPeriod("2026-11-29", week), true);
assert.equal(inPeriod("2026-11-22", week), false);
assert.equal(inPeriod("2026-11-30", week), false);
assert.equal(inPeriod("2020-01-01", { from: undefined, to: undefined }), true, "personalizado vazio mostra tudo");

console.log("✓ rental-payments ok");

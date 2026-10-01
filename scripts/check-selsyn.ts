/** Offline: nenhuma chamada ao fornecedor, credencial fictícia somente nos testes. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSelsynRequest, coordinatesValid, localDateToUtc, mapTrackedVehicle, providerError, sanitizeSelsyn, SELSYN_OPERATIONS, SelsynError, trackingId, trackingTotals, validateSelsynResponse } from "../src/lib/selsyn";
import { fetchSelsyn } from "../src/lib/server/selsyn-transport";

const dates = { dataInicial: "2026-10-01T00:00:00.000Z", dataFinal: "2026-10-01T01:00:00.000Z" };
assert.equal(Object.keys(SELSYN_OPERATIONS).length, 53);
assert.equal(Object.values(SELSYN_OPERATIONS).filter(o => o.group === "Integração Consulta Nível Cliente - V1").length, 34);
const sensor = buildSelsynRequest("relatorioHistoricoSensor", { ...dates, idRastreavel: "123" });
assert.equal(sensor.path, "/relatorio/sensor/historico/123"); assert.equal(sensor.query.get("format"), "JSON");
const detailed = buildSelsynRequest("relatorioSensorDetalhado", { ...dates, idRastreavel: "123", sensorId: "7", format: "XLSX" });
assert.equal(detailed.path, "/relatorio/sensor/detalhado/123/7"); assert.equal(detailed.query.get("sensorId"), "7");
for (const input of [{ ...dates, idRastreavel: "0" }, { ...dates, idRastreavel: "123", url: "https://example.com" }, { ...dates, idRastreavel: "123", format: "CSV" }, { ...dates, dataInicial: "2026-02-30T00:00:00.000Z", idRastreavel: "1" }, { ...dates, dataFinal: "2026-09-30T00:00:00.000Z", idRastreavel: "1" }]) assert.throws(() => buildSelsynRequest("relatorioHistoricoSensor", input), SelsynError);
assert.throws(() => buildSelsynRequest("bloqueio", {}));
assert.throws(() => buildSelsynRequest("gdrFindRastreavelPorIdentificador", { identificador: "../secret" }));
assert.throws(() => buildSelsynRequest("__proto__", {}));
assert.throws(() => buildSelsynRequest("relatorioTotalizador", { ...dates, rastreavel: "1" }));
assert.equal(trackingId("9223372036854775807"), "9223372036854775807");
assert.equal(trackingId("9223372036854775808"), null); assert.equal(trackingId(9007199254740992), null);
assert.ok(coordinatesValid(0, 0)); assert.ok(!coordinatesValid(91, 0)); assert.ok(!coordinatesValid(null, 0));
assert.equal(localDateToUtc("2026-10-01T12:00"), new Date(2026, 9, 1, 12, 0).toISOString());
assert.throws(() => localDateToUtc("2026-02-30T12:00"));
const r = mapTrackedVehicle({ id: 123, identificador: "ABC1D23", offLine: false, ultimaPosicao: { latitude: 0, longitude: 0, speed: 0, ignition: false, battery: 0 }, ultimaAtualizacaoSensor: [{ id: 7, value: "0", description: "Sensor de teste" }] });
assert.equal(r.position?.ignition, false); assert.equal(r.battery, 0);
assert.deepEqual(trackingTotals([r, { ...r, id: "2", offline: true }]), { tracked: 2, moving: 0, stopped: 1, offline: 1, unknown: 0 });
assert.deepEqual(validateSelsynResponse("gdrAovivo", []), []);
assert.throws(() => validateSelsynResponse("gdrAovivo", { wrong: true }));
assert.throws(() => validateSelsynResponse("aovivoPorRastreavel", { id: 9007199254740992 }));
assert.throws(() => validateSelsynResponse("aovivoPorRastreavel", { offLine: "false" }));
assert.equal(validateSelsynResponse("relatorioHistoricoSensor", null), null);
const secret = "credential-for-offline-test";
const clean = sanitizeSelsyn({ token: secret, content: { url: `https://example.com/?x-api-key=${secret}`, text: secret } }, secret);
assert.ok(!JSON.stringify(clean).includes(secret)); assert.ok(!JSON.stringify(clean).includes('"token"'));
const responseFetch = (res: Response): typeof fetch => (async () => res) as typeof fetch;
let calls = 0;
const fake: typeof fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  calls++;
  const u = new URL(String(url));
  assert.equal(u.origin, "https://api.appselsyn.com.br");
  assert.equal(u.pathname, "/keek/rest/relatorio/sensor/historico/123");
  assert.equal(u.searchParams.get("x-api-key"), secret);
  assert.equal(new Headers(init?.headers).get("x-api-key"), null);
  assert.equal(init?.method, "GET"); assert.equal(init?.redirect, "error"); assert.equal(init?.cache, "no-store");
  assert.ok(init?.signal);
  return Response.json({ content: { rows: [], echo: secret }, id: 1, status: { key: "TEST", value: "Teste offline" } });
}) as typeof fetch;
const fetched = await fetchSelsyn("relatorioHistoricoSensor", { ...dates, idRastreavel: "123" }, secret, fake);
assert.equal(calls, 1); assert.ok(!JSON.stringify(fetched).includes(secret));
for (const status of [400, 401, 403, 404, 429, 500]) {
  await assert.rejects(fetchSelsyn("relatorioHistoricoSensor", { ...dates, idRastreavel: "123" }, secret, responseFetch(new Response(secret, { status }))), e => e instanceof SelsynError && !e.message.includes(secret) && e.code === providerError(status).code);
}
await assert.rejects(fetchSelsyn("relatorioHistoricoSensor", { ...dates, idRastreavel: "123" }, "", fake), e => e instanceof SelsynError && e.code === "NOT_CONFIGURED");
const timeout: typeof fetch = (async () => { throw new DOMException(`Timeout ${secret}`, "TimeoutError"); }) as typeof fetch;
await assert.rejects(fetchSelsyn("relatorioHistoricoSensor", { ...dates, idRastreavel: "123" }, secret, timeout), e => e instanceof SelsynError && e.code === "TIMEOUT" && !e.message.includes(secret));
await assert.rejects(fetchSelsyn("gdrAovivo", {}, secret, responseFetch(new Response("<html>err</html>"))), e => e instanceof SelsynError && e.code === "INVALID_PROVIDER_RESPONSE");
assert.equal((await fetchSelsyn("gdrAovivo", {}, secret, responseFetch(new Response(null, { status: 204 })))).data, null);
const pdf = await fetchSelsyn("relatorioHistoricoSensor", { ...dates, idRastreavel: "123", format: "PDF_PORTRAIT" }, secret, responseFetch(new Response("%PDF-offline-fixture", { headers: { "content-type": "application/pdf" } })));
assert.ok(pdf.file?.name.endsWith(".pdf"));
await assert.rejects(fetchSelsyn("relatorioHistoricoSensor", { ...dates, idRastreavel: "123", format: "HTML" }, secret, responseFetch(new Response(`<html>${secret}</html>`, { headers: { "content-type": "text/html" } }))), e => e instanceof SelsynError && e.code === "UNSAFE_EXPORT");
// Catálogo não contém operações de escrita; guardas nas rotas e na migration estão presentes.
for (const op of Object.values(SELSYN_OPERATIONS)) assert.ok(!/intervencao|bloqueio|desbloqueio|saida\/ativar/.test(op.path));
for (const p of ["status/route.ts", "fleet/route.ts", "link/route.ts", "query/[operationId]/route.ts"]) assert.ok(readFileSync(`src/app/api/selsyn/${p}`, "utf8").includes("await selsynStaff()"));
const sql = readFileSync("supabase/migrations/20261007000000_selsyn_tracking.sql", "utf8");
assert.ok(sql.includes("pg_advisory_xact_lock")); assert.ok(sql.includes("enable row level security")); assert.ok(sql.includes("from public,anon,authenticated"));
console.log("✓ selsyn offline check ok (sem chamadas reais)");

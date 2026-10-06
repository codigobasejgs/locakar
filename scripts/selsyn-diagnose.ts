/**
 * Diagnóstico manual Selsyn — somente leitura. NUNCA roda em CI nem no build.
 * Uso: SELSYN_API_KEY=<chave substituta autorizada> npm run selsyn:diagnose
 * Executa uma consulta sem parâmetros por família; comandos físicos jamais são chamados.
 */
import { createHash } from "node:crypto";
import { SELSYN_OPERATIONS, SelsynError } from "../src/lib/selsyn";
import { capabilityMatrix, integrationStatus, SELSYN_PROBES, supportReport, type SelsynProbe } from "../src/lib/selsyn-capabilities";
import { fetchSelsyn } from "../src/lib/server/selsyn-transport";

async function main() {
  if (process.env.CI) throw new Error("Diagnóstico Selsyn não roda em CI.");
  const key = process.env.SELSYN_API_KEY ?? "";
  console.log("SELSYN DIAGNOSTIC");
  console.log(`API key configured: ${key ? "yes" : "no"} · length ${key.length} · fingerprint ${key ? createHash("sha256").update(key).digest("hex").slice(0, 12) : "-"}`);
  if (/[\s"']/.test(key)) console.log("ATENÇÃO: a chave contém espaço, quebra de linha ou aspas (não foi alterada).");
  console.log("OpenAPI contract: catálogo local derivado (oficial atual NÃO verificado)\n");
  if (!key) throw new Error("Defina SELSYN_API_KEY (credencial substituta autorizada).");
  const results: SelsynProbe[] = [];
  for (const operation of SELSYN_PROBES) {
    const op = SELSYN_OPERATIONS[operation];
    try {
      const r = await fetchSelsyn(operation, {}, key);
      results.push({ operation, label: op.label, group: op.group, ok: true, code: "OK", httpStatus: r.diagnostics.httpStatus, diagnostics: r.diagnostics });
    } catch (e) {
      const err = e instanceof SelsynError ? e : new SelsynError("UNKNOWN", "Falha desconhecida.");
      results.push({ operation, label: op.label, group: op.group, ok: false, code: err.code, httpStatus: err.providerStatus ?? err.diagnostics?.httpStatus ?? null, diagnostics: err.diagnostics });
    }
    const last = results.at(-1)!;
    console.log(`${operation.padEnd(26, ".")} ${String(last.httpStatus ?? "-").padEnd(4)} ${last.code} (${op.group}) ${last.diagnostics?.durationMs ?? "-"} ms`);
  }
  console.log("\nREAD CAPABILITIES");
  for (const c of capabilityMatrix(results)) console.log(`${c.label.padEnd(36, ".")} ${c.status}`);
  console.log(`\nStatus: ${integrationStatus(true, results)}`);
  console.log("\nCOMMAND CAPABILITIES\nGDR Activate Output .... NOT EXECUTED\nVehicle blocking ....... NOT EXECUTED\n");
  console.log(supportReport(results, "manual", new Date().toISOString()));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Falha no diagnóstico.");
  process.exitCode = 1;
});

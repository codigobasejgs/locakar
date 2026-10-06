import { createHash } from "node:crypto";
import { SELSYN_OPERATIONS, SelsynError } from "@/lib/selsyn";
import { capabilityMatrix, integrationStatus, SELSYN_PROBES, supportReport, type SelsynProbe } from "@/lib/selsyn-capabilities";
import { assertSelsynTenant, querySelsyn, selsynErrorResponse, selsynResponse } from "@/lib/server/selsyn";
import { scoped } from "@/lib/server/org-context";
import { requireStaff } from "@/lib/server/supabase";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Só consultas do catálogo local; nunca comandos físicos. Sem resultado/PII do fornecedor. */
export const POST = scoped(async function POST() {
  try {
    const { userId } = await requireStaff("integrations");
    assertSelsynTenant();
    const results: SelsynProbe[] = [];
    const started = Date.now();
    for (const operation of SELSYN_PROBES) {
      const op = SELSYN_OPERATIONS[operation];
      const base = { operation, label: op.label, group: op.group };
      if (Date.now() - started > 38_000) {
        results.push({ ...base, ok: false, code: "NOT_TESTED", httpStatus: null, message: "Orçamento de tempo atingido; consulta não executada." });
        continue;
      }
      try {
        const r = await querySelsyn(userId, operation, {});
        results.push({ ...base, ok: true, code: "OK", httpStatus: r.diagnostics.httpStatus, diagnostics: r.diagnostics });
      } catch (e) {
        if (!(e instanceof SelsynError) || ["NOT_CONFIGURED", "DATABASE_NOT_READY", "RATE_LIMITED", "INVALID_CREDENTIAL_FORMAT"].includes(e.code)) throw e;
        results.push({ ...base, ok: false, code: e.code, httpStatus: e.providerStatus ?? e.diagnostics?.httpStatus ?? null, message: e.message, diagnostics: e.diagnostics });
      }
    }
    const checkedAt = new Date().toISOString();
    const key = process.env.SELSYN_API_KEY;
    return selsynResponse({ results, checkedAt, status: integrationStatus(Boolean(key), results), capabilities: capabilityMatrix(results), credential: { configured: Boolean(key), length: key?.length ?? 0, fingerprint: key ? createHash("sha256").update(key).digest("hex").slice(0, 12) : null }, contractVerified: false, report: supportReport(results, process.env.VERCEL_ENV ?? "local", checkedAt), commands: "DISABLED / NOT EXECUTED" });
  } catch (e) { return selsynErrorResponse(e); }
});

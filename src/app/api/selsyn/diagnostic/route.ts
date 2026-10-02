import { SELSYN_OPERATIONS, SelsynError } from "@/lib/selsyn";
import { querySelsyn, selsynErrorResponse, selsynResponse, selsynStaff } from "@/lib/server/selsyn";
import { scoped } from "@/lib/server/org-context";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
// Um GET sem parâmetros obrigatórios por módulo; só status, nunca dados.
const PROBES = ["gdrAovivo", "integracaoAoVivo", "aovivo", "intergacaoListTipoAlerta"] as const;
export const POST = scoped(async function POST() {
  try {
    const { userId } = await selsynStaff();
    const results = [];
    for (const operation of PROBES) {
      try { await querySelsyn(userId, operation, {}); results.push({ operation, label: SELSYN_OPERATIONS[operation].label, group: SELSYN_OPERATIONS[operation].group, ok: true, code: "OK" }); }
      catch (e) {
        if (!(e instanceof SelsynError) || ["NOT_CONFIGURED", "DATABASE_NOT_READY", "RATE_LIMITED"].includes(e.code)) throw e;
        results.push({ operation, label: SELSYN_OPERATIONS[operation].label, group: SELSYN_OPERATIONS[operation].group, ok: false, code: e.code, message: e.message });
      }
    }
    return selsynResponse({ results, checkedAt: new Date().toISOString() });
  } catch (e) { return selsynErrorResponse(e); }
});

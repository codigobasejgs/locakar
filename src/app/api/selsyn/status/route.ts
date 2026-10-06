import { selsynErrorResponse, selsynRefreshSeconds, selsynResponse, selsynStaff, selsynTenantReady } from "@/lib/server/selsyn";
import { scoped } from "@/lib/server/org-context";
export const dynamic = "force-dynamic";
export const GET = scoped(async function GET() {
  try {
    const { db } = await selsynStaff();
    const [{ data, error }, { error: vehiclesError }] = await Promise.all([
      db.from("selsyn_requests").select("operation_id,status,error_code,created_at,duration_ms").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("vehicles").select("id,selsyn_rastreavel_id,selsyn_identificador").limit(1),
    ]);
    const tenantReady = selsynTenantReady();
    return selsynResponse({ configured: Boolean(process.env.SELSYN_API_KEY) && tenantReady, tenantReady, databaseReady: !error && !vehiclesError, refreshSeconds: selsynRefreshSeconds(), lastRequest: data ?? null, contractVerified: true, commandsEnabled: process.env.SELSYN_COMMANDS_ENABLED === "true" });
  } catch (e) { return selsynErrorResponse(e); }
});

import { selsynErrorResponse, selsynRefreshSeconds, selsynResponse, selsynStaff } from "@/lib/server/selsyn";
import { scoped } from "@/lib/server/org-context";
export const dynamic = "force-dynamic";
export const GET = scoped(async function GET() {
  try {
    const { db } = await selsynStaff();
    const { data, error } = await db.from("selsyn_requests").select("operation_id,status,error_code,created_at,duration_ms").order("created_at", { ascending: false }).limit(1).maybeSingle();
    return selsynResponse({ configured: Boolean(process.env.SELSYN_API_KEY), databaseReady: !error, refreshSeconds: selsynRefreshSeconds(), lastRequest: data ?? null });
  } catch (e) { return selsynErrorResponse(e); }
});

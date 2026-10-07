import { scoped } from "@/lib/server/org-context";
import { requireStaff } from "@/lib/server/supabase";
import { assertSelsynTenant, readSelsynBody, selsynErrorResponse, selsynResponse } from "@/lib/server/selsyn";
import { requireCommandOrigin, reauthenticateCommand } from "@/lib/server/selsyn-command";
import { connectSelsynSession, disconnectSelsynSession, loadSelsynSession, publicSelsynSession } from "@/lib/server/selsyn-session";
import { SelsynError } from "@/lib/selsyn";
import { audit } from "@/lib/server/tenant";
export const dynamic = "force-dynamic";
export const maxDuration = 45;
export const GET = scoped(async function GET() {
  try { await requireStaff("integrations"); assertSelsynTenant(); return selsynResponse(publicSelsynSession(await loadSelsynSession())); }
  catch (e) { return selsynErrorResponse(e); }
});
export const POST = scoped(async function POST(request: Request) {
  try {
    const { userId } = await requireStaff("integrations"); assertSelsynTenant(); requireCommandOrigin(request);
    const body = await readSelsynBody(request);
    if (Object.keys(body).some(k => !["action","login","providerPassword","password","namespace"].includes(k)) || !["connect","disconnect"].includes(String(body.action))) throw new SelsynError("INVALID_INPUT", "Pedido de sessão inválido.");
    await reauthenticateCommand(userId, body.password);
    if (body.action === "disconnect") {
      await disconnectSelsynSession();
      await audit({ actorType: "staff", actorId: userId, action: "selsyn.session_disconnected", entity: "selsyn_session", entityId: "session" });
      return selsynResponse(publicSelsynSession(await loadSelsynSession()));
    }
    if (typeof body.login !== "string" || typeof body.providerPassword !== "string") throw new SelsynError("INVALID_INPUT", "Informe login e nova senha do Rastreame.");
    const result = await connectSelsynSession(body.login.trim(), body.providerPassword, typeof body.namespace === "string" && body.namespace.trim() ? body.namespace.trim() : null);
    await audit({ actorType: "staff", actorId: userId, action: "selsyn.session_connected", entity: "selsyn_session", entityId: "session" });
    return selsynResponse(result);
  } catch (e) { return selsynErrorResponse(e); }
});

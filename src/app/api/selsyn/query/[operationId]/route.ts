import { SelsynError } from "@/lib/selsyn";
import { querySelsyn, readSelsynBody, selsynErrorResponse, selsynResponse, selsynStaff } from "@/lib/server/selsyn";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function POST(request: Request, { params }: { params: Promise<{ operationId: string }> }) {
  try {
    const { userId } = await selsynStaff();
    const { operationId } = await params;
    const body = await readSelsynBody(request);
    if (Object.keys(body).some(k => !["requestId", "parameters"].includes(k)) || !body.parameters || typeof body.parameters !== "object" || Array.isArray(body.parameters)) throw new SelsynError("INVALID_INPUT", "Parâmetros inválidos.");
    return selsynResponse(await querySelsyn(userId, operationId, body.parameters as Record<string, unknown>, body.requestId));
  } catch (e) { return selsynErrorResponse(e); }
}

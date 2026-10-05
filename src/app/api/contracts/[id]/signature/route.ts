import { serviceDb } from "@/lib/server/push";
import { cancelSignature, loadSignatureConfig, readyToSend, resendSignatures, sendContract, signatureLink, signatureState, signedFile, syncProcess } from "@/lib/server/signature/service";
import { SignatureError } from "@/lib/server/signature/types";
import { HttpError, errorResponse, requireStaff } from "@/lib/server/supabase";
import { clientIp } from "@/lib/server/tenant";
import { scoped } from "@/lib/server/org-context";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const noStore = { headers: { "Cache-Control": "private, no-store" } };
const contractId = async (ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(id)) throw new HttpError(400, "Contrato inválido.");
  return id;
};
const failure = (e: unknown) => errorResponse(e instanceof SignatureError ? new HttpError(e.status, e.message) : e);

export const GET = scoped(async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireStaff("read");
    const id = await contractId(ctx);
    const db = serviceDb();
    const cfg = await loadSignatureConfig(db);
    return Response.json({ enabled: readyToSend(cfg), environment: cfg?.environment ?? "sandbox", state: await signatureState(db, id) }, noStore);
  } catch (e) {
    return failure(e);
  }
});

export const POST = scoped(async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const id = await contractId(ctx);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = body.action;
    const { userId } = await requireStaff(action === "download" || action === "sync" ? "read" : "operate");
    const state = await signatureState(serviceDb(), id);
    const processId = state?.process.id as string | undefined;

    if (action === "send") return Response.json({ state: await sendContract(id, userId, clientIp(request)) }, noStore);
    if (!processId) throw new HttpError(404, "Este contrato ainda não foi enviado para assinatura.");
    if (action === "sync") return Response.json({ state: await syncProcess(processId) }, noStore);
    if (action === "link") return Response.json({ url: await signatureLink(processId, body.role === "company" ? "company" : "client") }, noStore);
    if (action === "resend") {
      await resendSignatures(processId, userId);
      return Response.json({ ok: true, message: "Lembrete reenviado pela Autentique." }, noStore);
    }
    if (action === "cancel") {
      await cancelSignature(processId, userId);
      return Response.json({ state: await signatureState(serviceDb(), id) }, noStore);
    }
    if (action === "download") return Response.json({ url: await signedFile(processId) }, noStore);
    throw new HttpError(400, "Ação inválida.");
  } catch (e) {
    return failure(e);
  }
});

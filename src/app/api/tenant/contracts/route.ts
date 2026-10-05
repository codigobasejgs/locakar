import { serviceDb } from "@/lib/server/push";
import { signatureLink, signedFile, syncProcess } from "@/lib/server/signature/service";
import { SignatureError } from "@/lib/server/signature/types";
import { HttpError } from "@/lib/server/supabase";
import { readBody, tenantOptions, tenantRoute } from "@/lib/server/tenant";

export const dynamic = "force-dynamic";
export const OPTIONS = tenantOptions;

async function ownedProcess(clientId: string, processId: unknown) {
  if (typeof processId !== "string" || !/^[0-9a-f-]{36}$/i.test(processId)) throw new HttpError(422, "Contrato inválido.");
  const db = serviceDb();
  const { data: process } = await db.from("contract_signature_processes").select("id,contract_id,status").eq("id", processId).maybeSingle();
  if (!process) throw new HttpError(404, "Contrato não encontrado.");
  const { data: contract } = await db.from("contracts").select("rental_id").eq("id", process.contract_id).maybeSingle();
  const { data: rental } = contract ? await db.from("rentals").select("client_id").eq("id", contract.rental_id).maybeSingle() : { data: null };
  if (rental?.client_id !== clientId) throw new HttpError(404, "Contrato não encontrado.");
  return process as { id: string; status: string };
}

/** App do locatário: link exclusivo sob demanda, confirmação no provider e download do próprio contrato. */
export const POST = tenantRoute(async (request, tenant) => {
  const body = await readBody(request);
  const process = await ownedProcess(tenant.clientId, body.processId);
  try {
    if (body.action === "link") return { url: await signatureLink(process.id, "client") };
    if (body.action === "sync") return { state: await syncProcess(process.id) };
    if (body.action === "download") return { url: await signedFile(process.id) };
  } catch (e) {
    if (e instanceof SignatureError) throw new HttpError(e.status, e.message);
    throw e;
  }
  throw new HttpError(400, "Ação inválida.");
});

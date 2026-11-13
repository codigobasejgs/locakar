import { HttpError } from "@/lib/server/supabase";
import { filesExist, readBody, safePath, tenantOptions, tenantRoute } from "@/lib/server/tenant";
import { submitDocument } from "@/lib/server/tenant-actions";
import { DOCUMENT_KIND } from "@/lib/tenant";

/**
 * Documentos do locatário (CNH frente/verso, comprovante de endereço), conferidos pela equipe.
 * GET  → último envio de cada tipo, com link temporário
 * POST → { kind, path } — arquivo já enviado para documentos/<clientId>/
 */
export const dynamic = "force-dynamic";
export const OPTIONS = tenantOptions;

export const GET = tenantRoute(async (_request, { db }) => {
  const { data, error } = await db
    .from("tenant_documents")
    .select("id,kind,path,status,rejection_reason,created_at")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new HttpError(500, "Não foi possível carregar os documentos.");
  const latest = new Map<string, NonNullable<typeof data>[number]>();
  for (const d of data ?? []) if (!latest.has(d.kind)) latest.set(d.kind, d);
  const list = [...latest.values()];
  const { data: urls } = list.length ? await db.storage.from("documentos").createSignedUrls(list.map((d) => d.path), 600) : { data: [] };
  const urlByPath = new Map((urls ?? []).map((u) => [u.path, u.signedUrl]));
  return {
    documents: list.map((d) => ({
      id: d.id,
      kind: d.kind,
      status: d.status,
      rejectionReason: d.rejection_reason,
      createdAt: d.created_at,
      url: urlByPath.get(d.path) ?? null,
    })),
  };
});

export const POST = tenantRoute(async (request, { clientId, ip }) => {
  const body = await readBody(request);
  if (!(typeof body.kind === "string" && body.kind in DOCUMENT_KIND)) throw new HttpError(422, "Tipo de documento inválido.");
  const path = safePath(body.path, `${clientId}/`);
  if (!(await filesExist("documentos", [path]))) throw new HttpError(422, "O arquivo não chegou. Envie de novo.");
  // Mesmas regras do WhatsApp (tenant-actions): um em análise por tipo, auditoria e aviso à equipe.
  const r = await submitDocument({ clientId, kind: body.kind, path, ip, via: "app" });
  return { ok: true, id: r.id };
});

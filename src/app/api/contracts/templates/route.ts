import { serviceDb } from "@/lib/server/push";
import { HttpError, errorResponse, requireStaff } from "@/lib/server/supabase";
import { analyzeContractDocument, getAIKey, loadContractAIConfig } from "@/lib/server/contract-ai";
import { createHash } from "node:crypto";
import { requireOrg, scoped } from "@/lib/server/org-context";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * API administrativa para gestão de templates de contrato e análise única por IA.
 * GET  → lista os templates cadastrados
 * POST { action: "create" | "analyze" | "save-mapping" | "delete", ... }
 */
export const GET = scoped(async function GET() {
  try {
    await requireStaff();
    const db = serviceDb();
    const { data: templates, error } = await db
      .from("contract_templates")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw new HttpError(500, error.message);
    return Response.json({ templates: templates ?? [] });
  } catch (e) {
    return errorResponse(e);
  }
});

const MAX_TEMPLATE_BYTES = 4 * 1024 * 1024; // ponytail: limite de corpo da Vercel (~4,5 MB); acima disso, usar signed upload URL
const TEMPLATE_MIME = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" } as const;

/** Upload feito pelo servidor: a RLS do bucket "documentos" só libera escrita do locatário na própria pasta. */
async function createTemplate(form: FormData, db: ReturnType<typeof serviceDb>) {
  const file = form.get("file");
  const name = String(form.get("name") || "").trim();
  const rentalType = String(form.get("rentalType") || "Semanal");
  if (!(file instanceof File) || !file.size) throw new HttpError(400, "Selecione o arquivo do contrato.");
  if (file.size > MAX_TEMPLATE_BYTES) throw new HttpError(413, "Arquivo acima de 4 MB.");

  const ext = file.name.split(".").pop()?.toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());
  // Assinatura binária: PDF começa com "%PDF", DOCX é ZIP ("PK")
  const isPdf = ext === "pdf" && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  const isDocx = ext === "docx" && bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!isPdf && !isDocx) throw new HttpError(400, "Formato inválido. Apenas PDF e DOCX são suportados.");
  const fileType = isPdf ? "pdf" : "docx";

  // Limite rígido de 5 modelos ativos por empresa
  const { count } = await db.from("contract_templates").select("id", { count: "exact", head: true });
  if ((count ?? 0) >= 5) throw new HttpError(409, "Limite atingido: você já possui 5 modelos de contrato cadastrados.");

  const filePath = `${requireOrg().org.id}/templates/${crypto.randomUUID()}.${fileType}`;
  const { error: upErr } = await db.storage.from("documentos").upload(filePath, bytes, { contentType: TEMPLATE_MIME[fileType] });
  if (upErr) throw new HttpError(500, `Falha ao salvar arquivo: ${upErr.message}`);

  const { data: created, error } = await db
    .from("contract_templates")
    .insert({
      name: name || file.name.replace(/\.[^/.]+$/, ""),
      rental_type: rentalType,
      file_name: file.name.slice(0, 200),
      file_path: filePath,
      file_type: fileType,
      file_hash: createHash("sha256").update(bytes).digest("hex"),
      status: "uploaded",
    })
    .select()
    .single();

  if (error) {
    await db.storage.from("documentos").remove([filePath]);
    throw new HttpError(500, error.message);
  }
  return Response.json({ template: created });
}

export const POST = scoped(async function POST(request: Request) {
  try {
    await requireStaff();
    const db = serviceDb();

    // 1. Criar novo template a partir de upload (multipart)
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      return await createTemplate(await request.formData(), db);
    }

    const body = await request.json();

    // 2. Analisar documento com IA UMA ÚNICA VEZ
    if (body.action === "analyze") {
      const { templateId } = body;
      const { data: template } = await db.from("contract_templates").select("*").eq("id", templateId).maybeSingle();
      if (!template) throw new HttpError(404, "Template não encontrado.");

      const aiCfg = await loadContractAIConfig();
      const apiKey = getAIKey(aiCfg);

      await db.from("contract_templates").update({ status: "analyzing" }).eq("id", templateId);

      const { data: fileBlob } = await db.storage.from("documentos").download(template.file_path);
      if (!fileBlob) throw new HttpError(404, "Arquivo original não encontrado.");
      const bytes = new Uint8Array(await fileBlob.arrayBuffer());

      try {
        const analysis = await analyzeContractDocument(
          bytes,
          template.file_type === "pdf" ? "application/pdf" : TEMPLATE_MIME.docx,
          apiKey,
          aiCfg?.model_name || "gemini-3.8-flash"
        );

        const { data: updated, error } = await db
          .from("contract_templates")
          .update({
            status: "review_required",
            mapping: analysis.fields,
            manual_fields: analysis.manualFields,
            last_analyzed_at: new Date().toISOString(),
            last_error: null,
          })
          .eq("id", templateId)
          .select()
          .single();

        if (error) throw new HttpError(500, error.message);
        return Response.json({ template: updated });
      } catch (err) {
        const msg = (err as Error).message;
        await db.from("contract_templates").update({ status: "error", last_error: msg }).eq("id", templateId);
        throw new HttpError(500, `Erro ao analisar contrato com IA: ${msg}`);
      }
    }

    // 3. Salvar e aprovar mapeamento revisado pelo admin (torna o modelo CONFIGURED)
    if (body.action === "save-mapping") {
      const { templateId, mapping, manualFields, rentalType, name } = body;
      const { data: template } = await db.from("contract_templates").select("*").eq("id", templateId).maybeSingle();
      if (!template) throw new HttpError(404, "Template não encontrado.");

      const nextVersion = (template.current_version || 1) + 1;

      // Salva snapshot da versão anterior para imutabilidade retroativa
      await db.from("contract_template_versions").insert({
        template_id: template.id,
        version: template.current_version || 1,
        file_path: template.file_path,
        file_hash: template.file_hash,
        mapping: template.mapping,
        manual_fields: template.manual_fields,
      });

      const { data: updated, error } = await db
        .from("contract_templates")
        .update({
          name: name || template.name,
          rental_type: rentalType || template.rental_type,
          mapping: mapping || [],
          manual_fields: manualFields || [],
          status: "configured",
          current_version: nextVersion,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", templateId)
        .select()
        .single();

      if (error) throw new HttpError(500, error.message);
      return Response.json({ template: updated });
    }

    // 4. Excluir template
    if (body.action === "delete") {
      const { templateId } = body;
      const { error } = await db.from("contract_templates").delete().eq("id", templateId);
      if (error) throw new HttpError(500, error.message);
      return Response.json({ ok: true });
    }

    throw new HttpError(400, "Ação inválida.");
  } catch (e) {
    return errorResponse(e);
  }
});

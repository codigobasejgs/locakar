import { serviceDb } from "@/lib/server/push";
import { HttpError, errorResponse, requireStaff } from "@/lib/server/supabase";
import { analyzeContractDocument, getAIKey, loadContractAIConfig } from "@/lib/server/contract-ai";
import { createHash } from "node:crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * API administrativa para gestão de templates de contrato e análise única por IA.
 * GET  → lista os templates cadastrados
 * POST { action: "create" | "analyze" | "save-mapping" | "delete", ... }
 */
export async function GET() {
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
}

export async function POST(request: Request) {
  try {
    await requireStaff();
    const body = await request.json();
    const db = serviceDb();

    // 1. Criar novo template a partir de upload
    if (body.action === "create") {
      const { name, rentalType, fileName, filePath, fileType } = body;
      if (!name || !filePath || !fileType) throw new HttpError(400, "Dados do template incompletos.");

      // Limite rígido de 5 modelos ativos por empresa
      const { count } = await db.from("contract_templates").select("id", { count: "exact", head: true });
      if ((count ?? 0) >= 5) {
        throw new HttpError(409, "Limite atingido: você já possui 5 modelos de contrato cadastrados.");
      }

      // Baixa arquivo para calcular hash SHA-256 e extrair conteúdo inicial
      const { data: fileBlob } = await db.storage.from("documentos").download(filePath);
      if (!fileBlob) throw new HttpError(404, "Arquivo não encontrado no armazenamento.");
      const bytes = new Uint8Array(await fileBlob.arrayBuffer());
      const fileHash = createHash("sha256").update(bytes).digest("hex");

      const { data: created, error } = await db
        .from("contract_templates")
        .insert({
          name: name.trim(),
          rental_type: rentalType || "Semanal",
          file_name: fileName || "contrato",
          file_path: filePath,
          file_type: fileType,
          file_hash: fileHash,
          status: "uploaded",
        })
        .select()
        .single();

      if (error) throw new HttpError(500, error.message);
      return Response.json({ template: created });
    }

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
          template.file_type === "pdf" ? "application/pdf" : "application/pdf",
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
}

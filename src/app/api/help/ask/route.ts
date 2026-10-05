import "server-only";
import { articles } from "@/help";
import { canReadArticle } from "@/help/access";
import { ASSISTANT_INSTRUCTIONS, NOT_FOUND, articleContext } from "@/help/assistant";
import { searchArticles } from "@/help/search";
import { getAIKey, loadContractAIConfig } from "@/lib/server/contract-ai";
import { globalDb, scoped } from "@/lib/server/org-context";
import { HttpError, errorResponse, requireStaff } from "@/lib/server/supabase";
import type { HelpAccess } from "@/help/types";

export const dynamic = "force-dynamic";

/**
 * Assistente da Central de Ajuda (opcional). RAG sobre a documentação aprovada:
 * 1. busca local (a mesma da Central) escolhe até 3 artigos que o perfil pode ler;
 * 2. a IA recebe SÓ a pergunta + esses trechos (nenhum dado da locadora);
 * 3. a resposta volta com as fontes. Sem artigo relevante, responde "não encontrei" sem chamar a IA.
 * Usa a chave de IA que a locadora já cadastrou para contratos. Sem chave: 404 e a tela esconde o assistente.
 */
async function ask(provider: "gemini" | "openai", key: string, model: string, question: string, context: string) {
  const user = `${context}\n\nPergunta do usuário: ${question}`;
  if (provider === "openai") {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: model.startsWith("gemini") ? "gpt-4o-mini" : model, temperature: 0, max_tokens: 400, messages: [{ role: "system", content: ASSISTANT_INSTRUCTIONS }, { role: "user", content: user }] }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!r.ok) throw new HttpError(502, "O assistente está indisponível agora. Use a busca acima.");
    const j = await r.json();
    return String(j.choices?.[0]?.message?.content ?? "");
  }
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ model, system_instruction: ASSISTANT_INSTRUCTIONS, store: false, input: [{ type: "text", text: user }] }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!r.ok) throw new HttpError(502, "O assistente está indisponível agora. Use a busca acima.");
  const j = await r.json();
  return String(j.output_text || j.candidates?.[0]?.content?.parts?.[0]?.text || "");
}

async function aiConfig() {
  const cfg = await loadContractAIConfig();
  try {
    return { provider: cfg?.provider ?? "gemini", model: cfg?.model_name || "gemini-3.8-flash", key: getAIKey(cfg) };
  } catch {
    return null;
  }
}

/** GET: o assistente está disponível para esta locadora? */
export const GET = scoped(async function GET() {
  try {
    await requireStaff();
    return Response.json({ enabled: Boolean(await aiConfig()) });
  } catch (e) {
    return errorResponse(e);
  }
});

export const POST = scoped(async function POST(request: Request) {
  try {
    const { role, orgId } = await requireStaff();
    const { data: allowed } = await globalDb().rpc("hit_rate_limit", { p_key: `help-ask:${orgId}`, p_max: 30, p_window: "10 minutes" });
    if (!allowed) throw new HttpError(429, "Muitas perguntas seguidas. Aguarde alguns minutos.");

    const body = (await request.json().catch(() => ({}))) as { question?: unknown };
    const question = String(body.question ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
    if (question.length < 4) throw new HttpError(400, "Escreva sua dúvida.");

    const access: HelpAccess = { audience: "admin", role, platformAdmin: false };
    const found = searchArticles(articles.filter((a) => canReadArticle(a, access)), question).slice(0, 3).map((r) => r.article);
    const sources = found.map((a) => ({ slug: a.slug, title: a.title }));
    if (!found.length) return Response.json({ answer: NOT_FOUND, sources: [] });

    const cfg = await aiConfig();
    if (!cfg) throw new HttpError(404, "Assistente não configurado.");
    const answer = (await ask(cfg.provider, cfg.key, cfg.model, question, found.map(articleContext).join("\n\n"))).trim().slice(0, 1500);
    return Response.json({ answer: answer || NOT_FOUND, sources: answer && !answer.startsWith("Não encontrei") ? sources : [] });
  } catch (e) {
    return errorResponse(e);
  }
});

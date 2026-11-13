import "server-only";
import type { AiIntent } from "@/lib/copilot/flow";
import { getAIKey, loadContractAIConfig } from "./contract-ai";

/**
 * IA do Copiloto (só modo Híbrido): transcreve áudio, lê foto/PDF de nota e interpreta texto livre.
 * Devolve apenas uma intenção estruturada; o fluxo revalida tudo no banco e pede [Confirmar].
 * Gemini Interactions API com store:false (padrão de contract-ai.ts). Sem logs de conteúdo.
 */
const MODEL = () => process.env.COPILOT_GEMINI_MODEL || "gemini-2.5-flash";

export async function copilotAiKey(): Promise<{ key: string; provider: "gemini" | "openai" } | null> {
  try {
    const cfg = await loadContractAIConfig();
    const key = getAIKey(cfg);
    const provider = cfg?.key_enc ? cfg.provider : process.env.GEMINI_API_KEY?.trim() ? "gemini" : "openai";
    return { key, provider };
  } catch {
    return null;
  }
}

const INSTRUCTIONS = `Você interpreta pedidos do dono de uma locadora de veículos no Brasil (WhatsApp).
Classifique em UMA intenção e extraia só o que estiver explícito. Nunca invente placa, valor ou nome.
- settle: recebeu pagamento/aluguel de um cliente (client = nome, plate = placa, amount = valor recebido se dito).
- expense: gasto/despesa (amount em reais, description curta, plate se citada).
- maintenance: nota/ordem de serviço de oficina (plate, km do hodômetro, supplier = oficina, amount = TOTAL, description = lista "1x Peça R$ x; Mão de obra R$ y").
- report: análise financeira (period: this_month | last_3_months | last_6_months | this_year).
- pendings: quem está devendo / pendências do dia.
- maintenance_status: pendências de manutenção.
- menu: pediu o menu. unknown: nenhum dos anteriores.
Placa brasileira: 3 letras + 4 caracteres (ABC1234 ou ABC1D23). Valores em número decimal (180.5).`;

const SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", enum: ["settle", "expense", "maintenance", "report", "pendings", "maintenance_status", "menu", "unknown"] },
    client: { type: "string" }, plate: { type: "string" }, amount: { type: "number" }, km: { type: "number" },
    description: { type: "string" }, supplier: { type: "string" },
    period: { type: "string", enum: ["this_month", "last_3_months", "last_6_months", "this_year"] },
    transcript: { type: "string" },
  },
  required: ["intent"],
};

/** Saída da IA → intenção tipada; qualquer campo fora do esperado é descartado. */
export function toIntent(raw: unknown): AiIntent {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 && v < 10_000_000 ? Math.round(v * 100) / 100 : undefined);
  switch (o.intent) {
    case "settle": return { intent: "settle", client: str(o.client, 80), plate: str(o.plate, 10), amount: num(o.amount) };
    case "expense": return { intent: "expense", plate: str(o.plate, 10), amount: num(o.amount) ?? 0, description: str(o.description, 200) ?? "Despesa" };
    case "maintenance": return { intent: "maintenance", plate: str(o.plate, 10), km: num(o.km), amount: num(o.amount) ?? 0, description: str(o.description, 500) ?? "Manutenção", supplier: str(o.supplier, 120) };
    case "report": return { intent: "report", period: (["this_month", "last_3_months", "last_6_months", "this_year"] as const).find((p) => p === o.period) };
    case "pendings": case "maintenance_status": case "menu": return { intent: o.intent };
    default: return { intent: "unknown" };
  }
}

export async function interpret(input: { text?: string; media?: { kind: "audio" | "image" | "document"; mimetype: string; data: string } }, fetcher: typeof fetch = fetch): Promise<AiIntent> {
  const ai = await copilotAiKey();
  if (!ai) return { intent: "unknown" };
  if (input.media && ai.provider !== "gemini") return { intent: "unknown" };

  if (ai.provider === "openai") {
    const res = await fetcher("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${ai.key}`, "content-type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o-mini", temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "system", content: `${INSTRUCTIONS}\nResponda JSON com os campos: ${Object.keys(SCHEMA.properties).join(", ")}.` }, { role: "user", content: input.text ?? "" }] }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`IA indisponível (HTTP ${res.status}).`);
    const j = await res.json();
    return toIntent(JSON.parse(j.choices?.[0]?.message?.content ?? "{}"));
  }

  const parts: Record<string, unknown>[] = [];
  if (input.media) parts.push({ type: input.media.kind === "audio" ? "audio" : input.media.kind === "image" ? "image" : "document", data: input.media.data, mime_type: input.media.mimetype });
  parts.push({ type: "text", text: input.media ? `${input.text ? `Legenda: ${input.text}\n` : ""}${input.media.kind === "audio" ? "Transcreva o áudio e classifique o pedido." : "Leia a nota/ordem de serviço/comprovante e extraia os dados."}` : input.text ?? "" });
  const res = await fetcher("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": ai.key },
    body: JSON.stringify({ model: MODEL(), system_instruction: INSTRUCTIONS, store: false, input: parts, response_format: { type: "text", mime_type: "application/json", schema: SCHEMA } }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`IA indisponível (HTTP ${res.status}).`);
  const j = await res.json();
  const text = j.output_text ?? j.outputs?.at?.(-1)?.text ?? j.candidates?.[0]?.content?.parts?.[0]?.text;
  try { return toIntent(JSON.parse(text ?? "{}")); } catch { return { intent: "unknown" }; }
}

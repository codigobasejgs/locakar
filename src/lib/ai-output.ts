/**
 * Texto final de uma resposta do Gemini. A Interactions API (REST) devolve em `steps[].content[].text`
 * (o `output_text` só existe nos SDKs); a generateContent antiga em `candidates[].content.parts[].text`.
 * Junta os textos do último passo de saída do modelo, ignorando pensamentos.
 */
type Part = { type?: string; text?: unknown; thought?: boolean };

export function geminiText(j: unknown): string {
  if (!j || typeof j !== "object") return "";
  const r = j as { output_text?: unknown; steps?: { type?: string; content?: Part[] }[]; outputs?: Part[]; candidates?: { content?: { parts?: Part[] } }[] };
  if (typeof r.output_text === "string" && r.output_text.trim()) return r.output_text;
  const join = (parts?: Part[]) => (parts ?? []).filter((p) => typeof p.text === "string" && !p.thought && (!p.type || p.type === "text")).map((p) => p.text as string).join("");
  const step = [...(r.steps ?? [])].reverse().find((s) => s.type === "model_output" && join(s.content));
  if (step) return join(step.content);
  if (r.outputs?.length) return join(r.outputs);
  return join(r.candidates?.[0]?.content?.parts);
}

/** JSON da resposta, tolerando cerca de código (```json … ```). */
export function parseAiJson<T>(text: string): T {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(clean) as T;
}

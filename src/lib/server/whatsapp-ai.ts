import "server-only";
import { geminiText } from "@/lib/ai-output";
import type { Provider } from "@/lib/whatsapp/inbox";
import { brand, requireOrg } from "@/lib/server/org-context";
import { listMessages } from "@/lib/server/whatsapp-inbox";
import { serviceDb } from "@/lib/server/push";
import { formatCurrency } from "@/lib/utils";
import { copilotAiKey } from "./copilot-ai";
import { appUrlFor } from "./customer-bot";

/**
 * Atendente virtual (modo IA da conversa). Recebe SÓ dados públicos da locadora (nome, frota sem placa, link do App):
 * nunca dados de cliente, parcelas ou documentos. Assuntos pessoais vão para o menu ("menu") ou para o App.
 */
const MODEL = () => process.env.COPILOT_GEMINI_MODEL || "gemini-2.5-flash";

async function context() {
  const { data } = await serviceDb().from("vehicles").select("name,category,daily_rate,weekly_rate,status").neq("status", "sold").order("name").limit(30);
  const fleet = (data ?? []).map((v) => `- ${v.name}${v.category ? ` (${v.category})` : ""}${v.weekly_rate ? ` · ${formatCurrency(Number(v.weekly_rate))}/semana` : v.daily_rate ? ` · ${formatCurrency(Number(v.daily_rate))}/dia` : ""}${v.status === "available" ? " · disponível agora" : ""}`);
  const b = brand();
  return `Você é o atendente virtual da locadora de veículos "${b.name}" no WhatsApp, no Brasil.
Responda em português do Brasil, com até 4 frases curtas, cordial e objetivo. Sem markdown além de *negrito*.
Regras: use só as informações abaixo; nunca invente preço, disponibilidade, prazo ou regra. Se não souber, diga que um atendente vai responder.
Nunca peça nem comente CPF, senha, documentos ou dados de pagamento: para pagar, ver parcelas, contrato ou ocorrências, diga para digitar *menu* ou usar o App Oficial.
Interessado em alugar: diga os carros e valores da lista e convide a baixar o App para se cadastrar.
App Oficial: ${appUrlFor()}
${b.whatsapp ? `WhatsApp da locadora: ${b.whatsapp}\n` : ""}Frota (sem placas):
${fleet.join("\n") || "- (lista indisponível)"}`;
}

export type Turn = { fromMe: boolean; text: string };

/** Resposta da IA para a última mensagem do cliente; null = IA indisponível (o atendimento humano segue). */
export async function aiReply(history: Turn[], fetcher: typeof fetch = fetch): Promise<string | null> {
  const ai = await copilotAiKey();
  if (!ai) return null;
  const system = await context();
  const turns = history.slice(-12).map((t) => ({ role: t.fromMe ? "assistant" : "user", content: t.text.slice(0, 1000) }));
  try {
    if (ai.provider === "openai") {
      const res = await fetcher("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${ai.key}`, "content-type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o-mini", temperature: 0.3, max_tokens: 300, messages: [{ role: "system", content: system }, ...turns] }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) return null;
      const j = await res.json();
      return clean(j.choices?.[0]?.message?.content);
    }
    const transcript = turns.map((t) => `${t.role === "user" ? "Cliente" : "Atendente"}: ${t.content}`).join("\n");
    const res = await fetcher("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": ai.key },
      body: JSON.stringify({ model: MODEL(), system_instruction: system, store: false, input: [{ type: "text", text: `${transcript}\n\nEscreva só a próxima resposta do Atendente.` }] }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) return null;
    return clean(geminiText(await res.json()));
  } catch {
    return null;
  }
}

/**
 * Responde pela IA a última mensagem da conversa. Mesmo limite por telefone do autoatendimento (proteção do chip).
 * IA indisponível: nada é enviado (a conversa aparece no painel para um atendente).
 */
export async function replyWithAi(provider: Provider, jid: string, phone: string | null, ratePerHour: number, send: (text: string) => Promise<void>) {
  if (phone) {
    const { data: gate } = await serviceDb().rpc("customer_bot_take", { p_org: requireOrg().org.id, p_phone: phone, p_limit: ratePerHour });
    if (gate !== "ok") return;
  }
  const history = await listMessages(provider, jid);
  const text = await aiReply(history.map((m) => ({ fromMe: m.fromMe, text: m.text })));
  if (!text) return;
  await new Promise((r) => setTimeout(r, Math.min(3000, 1000 + text.length * 8))); // atraso humanizado
  await send(`${text}\n\n_Atendimento virtual · digite *menu* para opções._`);
}

const clean = (t: unknown) => (typeof t === "string" && t.trim() ? t.trim().replace(/^Atendente:\s*/i, "").slice(0, 1500) : null);

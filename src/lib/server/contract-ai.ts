import "server-only";
import { CONTRACT_VARIABLES, type FieldMapping, type ManualField } from "@/lib/contract-variables";
import { decrypt, hasSecretKey } from "./secret";
import { serviceDb } from "./push";

export interface AIAnalysisResult {
  fields: FieldMapping[];
  manualFields: ManualField[];
  rawText?: string;
}

export interface ContractAIConfig {
  provider: "gemini" | "openai";
  model_name: string;
  key_enc: string | null;
  key_last4: string | null;
  verified_at: string | null;
  last_error: string | null;
}

export async function loadContractAIConfig(): Promise<ContractAIConfig | null> {
  const { data } = await serviceDb().from("contract_ai_config").select("*").eq("id", 1).maybeSingle();
  return data;
}

export function getAIKey(cfg: ContractAIConfig | null): string {
  if (cfg?.key_enc && hasSecretKey("CONTRACT_AI_ENCRYPTION_KEY")) {
    try {
      return decrypt(cfg.key_enc, "CONTRACT_AI_ENCRYPTION_KEY");
    } catch {
      /* fallback */
    }
  }
  const envKey = process.env.GEMINI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();
  if (!envKey) throw new Error("Configure uma API Key do Gemini em Configurações → Contratos ou como GEMINI_API_KEY.");
  return envKey;
}

/**
 * Analisa o documento uma única vez via Gemini interactions API.
 * Usa JSON Schema estruturado e `store: false` para não reter dados no provedor.
 */
export async function analyzeContractDocument(
  fileBytes: Uint8Array,
  mimeType: string,
  key: string,
  model = "gemini-3.8-flash"
): Promise<AIAnalysisResult> {
  const base64Data = Buffer.from(fileBytes).toString("base64");
  const variableKeys = Object.keys(CONTRACT_VARIABLES);

  const systemInstruction = `Você é um analisador técnico de modelos de contrato de locação de veículos.
Seu objetivo é identificar trechos onde dados variáveis (do locatário, veículo, locação, valores, datas ou empresa) devam ser preenchidos.
REGRAS RÍGIDAS:
1. NÃO modifique, não reescreva e não resuma cláusulas.
2. Identifique os pontos variáveis do documento (ex: "Nome: ________", "Placa: {{placa}}", "CPF nº [informar]").
3. Sugira uma correspondência exclusiva dentre a lista de variáveis disponíveis:
${variableKeys.join(", ")}
4. Se o documento contiver um dado variável que NÃO existe nessa lista, marque como "UNMAPPED" e informe "manualFieldLabel".
5. Forneça uma estimativa de confiança (0.0 a 1.0) para cada mapeamento.
6. Nunca invente variáveis fora do catálogo.`;

  const responseSchema = {
    type: "object",
    properties: {
      fields: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            originalText: { type: "string", description: "O trecho exato encontrado no documento" },
            page: { type: "integer", description: "Número da página (se aplicável)" },
            variableKey: { type: "string", description: "Chave da variável do catálogo ou UNMAPPED" },
            confidence: { type: "number", description: "Confiança de 0 a 1" },
            manualFieldLabel: { type: "string", description: "Nome sugerido caso seja UNMAPPED" },
            isManual: { type: "boolean" }
          },
          required: ["id", "originalText", "variableKey", "confidence"]
        }
      }
    },
    required: ["fields"]
  };

  const url = "https://generativelanguage.googleapis.com/v1beta/interactions";
  const payload = {
    model,
    system_instruction: systemInstruction,
    store: false,
    input: [
      {
        type: "document",
        data: base64Data,
        mime_type: mimeType === "application/pdf" ? "application/pdf" : "application/pdf"
      },
      {
        type: "text",
        text: "Analise o modelo de contrato anexo e liste todos os campos variáveis a serem preenchidos conforme o schema."
      }
    ],
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: responseSchema
    }
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60_000)
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Falha na análise da IA (HTTP ${res.status}): ${errText.slice(0, 200)}`);
  }

  const result = await res.json();
  const textOutput = result.output_text || result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textOutput) throw new Error("A IA não retornou uma resposta válida para o documento.");

  let parsed: { fields: FieldMapping[] };
  try {
    parsed = JSON.parse(textOutput);
  } catch {
    throw new Error("Formato de saída da IA inválido.");
  }

  // Validação e higienização estrita: rejeita qualquer variável que não conste no dicionário oficial
  const validFields: FieldMapping[] = [];
  const manualFields: ManualField[] = [];
  const seenManual = new Set<string>();

  for (const f of parsed.fields || []) {
    let key = f.variableKey;
    let isManual = f.isManual || false;
    let manualLabel = f.manualFieldLabel;

    if (key !== "UNMAPPED" && !CONTRACT_VARIABLES[key]) {
      key = "UNMAPPED";
      isManual = true;
      manualLabel = manualLabel || f.originalText;
    }

    if (key === "UNMAPPED" || isManual) {
      isManual = true;
      const cleanKey = `manual.${(manualLabel || f.id).toLowerCase().replace(/[^a-z0-9]/g, "")}`;
      if (!seenManual.has(cleanKey)) {
        seenManual.add(cleanKey);
        manualFields.push({
          key: cleanKey,
          label: manualLabel || f.originalText,
          type: "text",
          required: false
        });
      }
    }

    validFields.push({
      id: f.id || `field_${validFields.length + 1}`,
      originalText: f.originalText,
      page: f.page,
      variableKey: key,
      confidence: typeof f.confidence === "number" ? Math.min(1, Math.max(0, f.confidence)) : 0.8,
      isManual,
      manualFieldLabel: manualLabel
    });
  }

  return {
    fields: validFields,
    manualFields
  };
}

import { SELSYN_OPERATIONS, type SelsynDiagnostics } from "./selsyn";

export const SELSYN_PROBES = ["aovivo", "integracaoAoVivo", "intergacaoListTipoAlerta", "gdrAovivo"] as const;
export interface SelsynProbe {
  operation: string; label: string; group: string; ok: boolean; code: string;
  httpStatus: number | null; message?: string; diagnostics?: SelsynDiagnostics;
}
export type CapabilityStatus = "AVAILABLE" | "FORBIDDEN" | "AUTH_ERROR" | "UNAVAILABLE" | "UNKNOWN";
export type SelsynIntegrationStatus = "NOT_CONFIGURED" | "CONFIGURED" | "CONNECTED" | "CONNECTED_PARTIAL" | "AUTH_ERROR" | "FORBIDDEN" | "PROVIDER_UNAVAILABLE";
const CAPABILITIES = {
  SELSYN_READ_POSITION: { label: "Posição (consulta cliente)", operations: ["aovivo"] },
  SELSYN_READ_MONITORING: { label: "Posição (monitoramento cliente)", operations: ["integracaoAoVivo"] },
  SELSYN_READ_HISTORY: { label: "Histórico", operations: [] },
  SELSYN_READ_SENSORS: { label: "Sensores", operations: [] },
  SELSYN_READ_ALERTS: { label: "Catálogo de tipos de alertas", operations: ["intergacaoListTipoAlerta"] },
  SELSYN_READ_REPORTS: { label: "Relatórios", operations: [] },
  SELSYN_READ_GDR: { label: "Posição (gerenciamento de risco)", operations: ["gdrAovivo"] },
} satisfies Record<string, { label: string; operations: string[] }>;

/** Um teste representa somente sua operação; histórico/sensores não herdam acesso da posição. */
export function capabilityMatrix(results: SelsynProbe[]) {
  return Object.entries(CAPABILITIES).map(([id, { label, operations }]) => {
    const evidence = results.filter(r => (operations as readonly string[]).includes(r.operation));
    const status: CapabilityStatus = evidence.some(r => r.ok) ? "AVAILABLE" : evidence.some(r => r.httpStatus === 401) ? "AUTH_ERROR" : evidence.some(r => r.httpStatus === 403) ? "FORBIDDEN" : evidence.some(r => r.code !== "NOT_TESTED") ? "UNAVAILABLE" : "UNKNOWN";
    return { id, label, status, operations, evidence };
  });
}
export function integrationStatus(configured: boolean, results: SelsynProbe[]): SelsynIntegrationStatus {
  if (!configured) return "NOT_CONFIGURED";
  if (!results.length || results.every(r => r.code === "NOT_TESTED")) return "CONFIGURED";
  const tested = results.filter(r => r.code !== "NOT_TESTED");
  if (tested.some(r => r.ok)) return tested.every(r => r.ok) && tested.length === SELSYN_PROBES.length ? "CONNECTED" : "CONNECTED_PARTIAL";
  if (tested.some(r => r.httpStatus === 401)) return "AUTH_ERROR";
  if (tested.some(r => r.httpStatus === 403)) return "FORBIDDEN";
  return "PROVIDER_UNAVAILABLE";
}
export const INTEGRATION_LABEL: Record<SelsynIntegrationStatus, string> = {
  NOT_CONFIGURED: "Não configurada", CONFIGURED: "Configurada — acesso ainda não diagnosticado",
  CONNECTED: "Conectada nas operações testadas", CONNECTED_PARTIAL: "Conectada parcialmente",
  AUTH_ERROR: "Autenticação recusada (401)", FORBIDDEN: "Consultas recusadas (403)", PROVIDER_UNAVAILABLE: "Não foi possível consultar o fornecedor",
};
export function supportReport(results: SelsynProbe[], environment: string, checkedAt: string) {
  return ["SELSYN — diagnóstico LOCAKAR", `Ambiente: ${environment}`, `Data/hora: ${checkedAt}`, "Contrato local derivado; OpenAPI oficial atual ainda não confirmado.", ...results.map(r => {
    const op = SELSYN_OPERATIONS[r.operation];
    return `${r.group} | ${r.operation} | GET ${op?.path ?? "não catalogado"} | HTTP ${r.httpStatus ?? "não obtido"} | ${r.code}`;
  }), "Solicitação: confirmar tipo/escopo da credencial, security scheme e permissão de leitura das operações acima.", "HTTP 403 não comprova sozinho chave válida sem permissão.", "Comandos físicos: NÃO EXECUTADOS / DESABILITADOS."].join("\n");
}

/**
 * Score de risco do App do Locatário (0–100). Só a equipe vê. Nunca bloqueia ninguém sozinho:
 * serve para priorizar a conferência humana na Central de Segurança.
 * Lógica pura (sem banco) para rodar também em `npm run check`.
 */
export type RiskLevel = "baixo" | "atencao" | "elevado" | "critico";

export interface RiskSignals {
  /** Primeira vez que este aparelho aparece para o cliente. */
  newDevice: boolean;
  /** Quantos outros clientes já usaram este mesmo aparelho. */
  otherClientsOnDevice: number;
  /** Aparelhos ativos do cliente. */
  activeDevices: number;
  /** Emulador / simulador (informado pelo sistema, não pelo cliente). */
  emulator: boolean;
  /** Integridade do app: verificada, falhou ou indisponível (sem verificação configurada / web). */
  integrity: "verified" | "failed" | "unavailable";
  /** IPs diferentes nas últimas 24 h. */
  distinctIps24h: number;
  /** Comprovantes com a mesma imagem de outro pagamento. */
  duplicateProofs: number;
  /** Comprovantes rejeitados nos últimos 30 dias. */
  rejectedProofs30d: number;
}

export const RISK_FACTOR_LABEL: Record<string, string> = {
  new_device: "Aparelho novo",
  shared_device: "Aparelho usado por outro cliente",
  many_devices: "Muitos aparelhos ativos",
  emulator: "Emulador ou simulador",
  integrity_failed: "App não passou na verificação de integridade",
  integrity_unavailable: "Integridade do app não verificada",
  many_ips: "Muitos IPs diferentes em 24 h",
  duplicate_proof: "Comprovante repetido (mesma imagem de outro pagamento)",
  rejected_proofs: "Comprovantes rejeitados recentemente",
};

export function riskScore(s: RiskSignals): { score: number; factors: string[] } {
  const parts: [string, number][] = [];
  if (s.newDevice) parts.push(["new_device", 10]);
  if (s.otherClientsOnDevice > 0) parts.push(["shared_device", 35]);
  if (s.activeDevices > 3) parts.push(["many_devices", 10]);
  if (s.emulator) parts.push(["emulator", 25]);
  if (s.integrity === "failed") parts.push(["integrity_failed", 30]);
  else if (s.integrity === "unavailable") parts.push(["integrity_unavailable", 5]);
  if (s.distinctIps24h > 5) parts.push(["many_ips", 10]);
  if (s.duplicateProofs > 0) parts.push(["duplicate_proof", 40]);
  if (s.rejectedProofs30d >= 2) parts.push(["rejected_proofs", 15]);
  return { score: Math.min(100, parts.reduce((a, [, p]) => a + p, 0)), factors: parts.map(([f]) => f) };
}

export function riskLevel(score: number): RiskLevel {
  if (score >= 80) return "critico";
  if (score >= 60) return "elevado";
  if (score >= 30) return "atencao";
  return "baixo";
}

export const RISK_LEVEL: Record<RiskLevel, { label: string; tone: "success" | "warning" | "danger" | "brand" }> = {
  baixo: { label: "Baixo", tone: "success" },
  atencao: { label: "Atenção", tone: "warning" },
  elevado: { label: "Elevado", tone: "danger" },
  critico: { label: "Crítico", tone: "danger" },
};

/** Versão da política de privacidade do app. Mudou o texto? Aumente para pedir o aceite de novo. */
export const PRIVACY_VERSION = "2026-10";
export const CONSENT_SCOPES = ["essential", "security_telemetry", "push"] as const;
export type ConsentScope = (typeof CONSENT_SCOPES)[number];

/** Retenção (LGPD): telemetria de segurança some depois deste prazo (rotina diária). */
export const TELEMETRY_RETENTION_DAYS = 180;

/**
 * Regras do App do Locatário compartilhadas entre as rotas /api/tenant e o painel.
 * O app (apps/locatario) repete estas listas em constants/tenant.ts: mudou aqui, mude lá.
 * Lógica pura para rodar também em `npm run check`.
 */
import type { Tone } from "./constants";

/** Fotos obrigatórias da vistoria pelo app, na ordem em que o app pede. */
export const PHOTO_SLOTS = [
  { key: "front", label: "Frente" },
  { key: "back", label: "Traseira" },
  { key: "left", label: "Lateral esquerda" },
  { key: "right", label: "Lateral direita" },
  { key: "roof", label: "Teto" },
  { key: "wheels", label: "Rodas e pneus" },
  { key: "interior", label: "Interior" },
  { key: "dashboard", label: "Painel (km e luzes)" },
  { key: "fuel", label: "Marcador de combustível" },
] as const;
export const DAMAGE_SLOT = "damage";
export const MAX_DAMAGE_PHOTOS = 6;

export const TENANT_INSPECTION_KIND: Record<string, string> = {
  delivery: "Retirada",
  return: "Devolução",
  periodic: "Periódica",
};

export const TENANT_INSPECTION_STATUS: Record<string, { label: string; tone: Tone }> = {
  submitted: { label: "Aguardando conferência", tone: "warning" },
  reviewed: { label: "Conferida", tone: "success" },
  rejected: { label: "Refazer", tone: "danger" },
};

export const INCIDENT_CATEGORY: Record<string, string> = {
  mecanica: "Mecânica",
  pneu: "Pneu",
  eletrica: "Elétrica",
  ar_condicionado: "Ar-condicionado",
  acidente: "Acidente",
  painel: "Luz no painel",
  vidro: "Vidro",
  lataria: "Lataria",
  outro: "Outro",
};

export const INCIDENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  open: { label: "Aberta", tone: "warning" },
  in_review: { label: "Em análise", tone: "info" },
  in_service: { label: "Em atendimento", tone: "brand" },
  waiting_client: { label: "Aguardando você", tone: "warning" },
  resolved: { label: "Resolvida", tone: "success" },
  cancelled: { label: "Cancelada", tone: "neutral" },
};

export const DOCUMENT_KIND: Record<string, string> = {
  cnh_front: "CNH (frente)",
  cnh_back: "CNH (verso)",
  address_proof: "Comprovante de endereço",
};

export const REVIEW_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending_review: { label: "Em análise", tone: "warning" },
  approved: { label: "Aprovado", tone: "success" },
  rejected: { label: "Recusado", tone: "danger" },
};

/**
 * Assinatura desenhada no app: só o traço (atributo `d` do SVG, comandos M/L com números).
 * O SVG é montado aqui, no servidor: nada de script, link ou estilo vindo do celular.
 */
export function signatureSvg(path: unknown): string | null {
  if (typeof path !== "string" || path.length < 10 || path.length > 50_000) return null;
  if (!/^[ML0-9.\s-]+$/.test(path) || !path.startsWith("M")) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 240" width="600" height="240"><path d="${path}" fill="none" stroke="#111" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

export const isIsoDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

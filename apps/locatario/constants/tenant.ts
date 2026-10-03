import type { BadgeTone } from "../components/ui/Badge";

/**
 * Listas do domínio. Cópia de src/lib/tenant.ts e src/lib/contract.ts (site/servidor):
 * o servidor recusa qualquer valor fora destas listas. Mudou lá, mude aqui.
 */
export const PHOTO_SLOTS = [
  { key: "front", label: "Frente", hint: "Fique a uns 3 passos, com o carro inteiro na foto." },
  { key: "back", label: "Traseira", hint: "Placa legível." },
  { key: "left", label: "Lateral esquerda", hint: "Do para-choque dianteiro ao traseiro." },
  { key: "right", label: "Lateral direita", hint: "Do para-choque dianteiro ao traseiro." },
  { key: "roof", label: "Teto", hint: "Levante o celular acima da cabeça." },
  { key: "wheels", label: "Rodas e pneus", hint: "Uma roda de perto, mostrando o pneu." },
  { key: "interior", label: "Interior", hint: "Bancos e tapetes, da porta do motorista." },
  { key: "dashboard", label: "Painel (km e luzes)", hint: "Com o carro ligado: quilometragem legível." },
  { key: "fuel", label: "Marcador de combustível", hint: "Ponteiro visível." },
] as const;
export const DAMAGE_SLOT = "damage";
export const MAX_DAMAGE_PHOTOS = 6;

export const INSPECTION_ITEMS = [
  { key: "exterior", label: "Lataria e pintura" },
  { key: "glass", label: "Vidros e retrovisores" },
  { key: "tires", label: "Pneus e estepe" },
  { key: "lights", label: "Faróis e lanternas" },
  { key: "interior", label: "Bancos e interior limpos" },
  { key: "dashboard", label: "Painel sem luzes de alerta" },
  { key: "ac", label: "Ar-condicionado funcionando" },
  { key: "documents", label: "Documento do veículo (CRLV)" },
  { key: "tools", label: "Macaco, chave de roda e triângulo" },
  { key: "keys", label: "Chave e controle" },
];

export type FuelLevel = "empty" | "quarter" | "half" | "three_quarters" | "full";
export const FUEL: { key: FuelLevel; label: string }[] = [
  { key: "empty", label: "Reserva" },
  { key: "quarter", label: "1/4" },
  { key: "half", label: "1/2" },
  { key: "three_quarters", label: "3/4" },
  { key: "full", label: "Cheio" },
];
export const fuelLabel = (k: string) => FUEL.find((f) => f.key === k)?.label ?? k;

export const INSPECTION_KIND: Record<string, string> = { delivery: "Retirada", return: "Devolução", periodic: "Periódica" };

type StatusMap = Record<string, { label: string; tone: BadgeTone }>;

export const INSPECTION_STATUS: StatusMap = {
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

export const INCIDENT_STATUS: StatusMap = {
  open: { label: "Aberta", tone: "warning" },
  in_review: { label: "Em análise", tone: "info" },
  in_service: { label: "Em atendimento", tone: "brand" },
  waiting_client: { label: "Aguardando você", tone: "warning" },
  resolved: { label: "Resolvida", tone: "success" },
  cancelled: { label: "Cancelada", tone: "neutral" },
};

export const DOCUMENT_KIND: Record<string, { label: string; hint: string }> = {
  cnh_front: { label: "CNH (frente)", hint: "Foto nítida, sem reflexo, com a foto e o número legíveis." },
  cnh_back: { label: "CNH (verso)", hint: "Verso inteiro na foto." },
  address_proof: { label: "Comprovante de endereço", hint: "Conta de luz, água ou internet dos últimos 3 meses." },
};

export const REVIEW_STATUS: StatusMap = {
  pending_review: { label: "Em análise", tone: "warning" },
  approved: { label: "Aprovado", tone: "success" },
  rejected: { label: "Recusado", tone: "danger" },
};

export const FINE_STATUS: StatusMap = {
  pending: { label: "Pendente", tone: "warning" },
  identify: { label: "Identificar condutor", tone: "info" },
  paid: { label: "Paga", tone: "success" },
  overdue: { label: "Vencida", tone: "danger" },
  contested: { label: "Contestada", tone: "brand" },
};

export const RESERVATION_STATUS: StatusMap = {
  pending: { label: "Aguardando confirmação", tone: "warning" },
  confirmed: { label: "Confirmada", tone: "success" },
  completed: { label: "Concluída", tone: "neutral" },
  cancelled: { label: "Cancelada", tone: "neutral" },
};

export const MAINTENANCE_STATUS: StatusMap = {
  scheduled: { label: "Agendada", tone: "info" },
  pending: { label: "Pendente", tone: "warning" },
  done: { label: "Feita", tone: "success" },
};

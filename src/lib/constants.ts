import type {
  CompanySettings,
  ExpenseCategory,
  FineStatus,
  MaintenanceStatus,
  PaymentState,
  RentalStatus,
  ReservationStatus,
  VehicleStatus,
} from "@/types";
import { EMPTY_COMPANY } from "./contract";

/* ---------- Rotas ---------- */

export const ROUTES = {
  home: "/",
  admin: "/admin",
  login: "/admin/login",
  vehicles: "/admin/vehicles",
  clients: "/admin/clients",
  rentals: "/admin/rentals",
  reservations: "/admin/reservations",
  expenses: "/admin/expenses",
  maintenance: "/admin/maintenance",
  fines: "/admin/fines",
  notes: "/admin/notes",
  finance: "/admin/finance",
  reports: "/admin/reports",
  settings: "/admin/settings",
} as const;

export const LANDING_NAV = [
  { href: "#inicio", label: "Início" },
  { href: "#frota", label: "Frota" },
  { href: "#como-funciona", label: "Como Funciona" },
  { href: "#sobre", label: "Sobre" },
  { href: "#contato", label: "Contato" },
] as const;

/* ---------- Status (rótulo + tom visual) ---------- */

export type Tone = "success" | "brand" | "info" | "warning" | "danger" | "neutral";
type StatusMap<K extends string> = Record<K, { label: string; tone: Tone }>;

export const VEHICLE_STATUS: StatusMap<VehicleStatus> = {
  available: { label: "Disponível", tone: "success" },
  rented: { label: "Alugado", tone: "brand" },
  reserved: { label: "Reservado", tone: "info" },
  maintenance: { label: "Manutenção", tone: "warning" },
  sold: { label: "Vendido", tone: "neutral" },
};

export const RENTAL_STATUS: StatusMap<RentalStatus> = {
  active: { label: "Ativa", tone: "success" },
  finished: { label: "Finalizada", tone: "neutral" },
  late: { label: "Atrasada", tone: "danger" },
  cancelled: { label: "Cancelada", tone: "neutral" },
  pending: { label: "Pendente", tone: "warning" },
};

export const RESERVATION_STATUS: StatusMap<ReservationStatus> = {
  pending: { label: "Pendente", tone: "warning" },
  confirmed: { label: "Confirmada", tone: "brand" },
  completed: { label: "Concluída", tone: "neutral" },
  cancelled: { label: "Cancelada", tone: "neutral" },
};

export const FINE_STATUS: StatusMap<FineStatus> = {
  pending: { label: "Pendente", tone: "warning" },
  identify: { label: "Identificar condutor", tone: "info" },
  paid: { label: "Pago", tone: "success" },
  overdue: { label: "Vencida", tone: "danger" },
  contested: { label: "Contestada", tone: "brand" },
};

export const MAINTENANCE_STATUS: StatusMap<MaintenanceStatus> = {
  scheduled: { label: "Agendada", tone: "info" },
  pending: { label: "Pendente", tone: "warning" },
  done: { label: "Realizada", tone: "success" },
};

/** Lista de validação "PAGO, EM ABERTO, ATRASADO" da aba VEÍCULOS. */
export const CONTRACT_STATUS: StatusMap<import("@/types").ContractStatus> = {
  pending: { label: "Aguardando assinatura", tone: "warning" },
  signed: { label: "Assinado", tone: "success" },
  cancelled: { label: "Cancelado", tone: "neutral" },
};

export const PAYMENT_STATE: StatusMap<PaymentState> = {
  paid: { label: "Pago", tone: "success" },
  open: { label: "Em aberto", tone: "warning" },
  late: { label: "Atrasado", tone: "danger" },
};

export const EXPENSE_CATEGORY: Record<ExpenseCategory, string> = {
  recurring: "Recorrentes",
  misc: "Diversas",
};

/* ---------- Listas de opções (validações da planilha) ---------- */

export const VEHICLE_TYPES = ["Carro", "Moto", "Van", "Caminhão", "Utilitário", "Ônibus"] as const;

export const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
] as const;

export const WEEKDAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"] as const;

/** Tipos de contrato — a aba FORMULA (DADOS) prevê a lista, ajuste conforme a operação. */
export const CONTRACT_TYPES = ["Semanal", "Quinzenal", "Mensal", "Diária"] as const;

export const PAYMENT_METHODS = ["PIX", "Boleto", "Cartão de crédito", "Cartão de débito", "Dinheiro", "Transferência"] as const;

export const toOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));

export const statusOptions = <K extends string>(map: StatusMap<K>) =>
  (Object.keys(map) as K[]).map((value) => ({ value, label: map[value].label }));

/* ---------- Cores de gráficos ---------- */

export const CHART_COLORS = {
  brand: "#A000A0",
  brandSoft: "#D06FD0",
  deep: "#600060",
  white: "#F4F4F5",
  muted: "#71717A",
  grid: "rgba(255,255,255,0.06)",
  success: "#34D399",
  warning: "#FBBF24",
  danger: "#F87171",
  info: "#38BDF8",
} as const;

export const TONE_COLOR: Record<Tone, string> = {
  success: CHART_COLORS.success,
  brand: CHART_COLORS.brand,
  info: CHART_COLORS.info,
  warning: CHART_COLORS.warning,
  danger: CHART_COLORS.danger,
  neutral: CHART_COLORS.muted,
};

/* ---------- Configurações padrão ---------- */

export const DEFAULT_SETTINGS: CompanySettings = {
  company: EMPTY_COMPANY,
  pageSize: 10,
  alertWindowDays: 15,
  compactTables: false,
  notifyFines: true,
  notifyMaintenance: true,
  notifyReceipts: true,
};

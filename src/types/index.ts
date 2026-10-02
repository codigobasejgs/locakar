import type { FipeLink } from "../lib/fipe";
import type { InfinitePaySettings } from "../lib/infinitepay";
/**
 * Modelos de domínio da LOCAKAR.
 * Espelham as abas da planilha operacional (VEÍCULOS, CLIENTES, LOCAÇÃO, RESERVA DE CARROS,
 * DESPESAS, MANUTENÇÃO FROTA, MULTAS, ANOTAÇÕES). Datas em ISO `YYYY-MM-DD`, horas em `HH:mm`.
 */

export type VehicleStatus = "available" | "rented" | "reserved" | "maintenance" | "sold";

/** Veículo exibido publicamente (vitrine da Landing Page). */
export interface Vehicle {
  id: string;
  name: string;
  brand: string;
  model: string;
  year: number;
  image: string;
  category: string;
  transmission: string;
  fuel: string;
  seats: number;
  airConditioning: boolean;
  dailyRate?: number;
  weeklyRate?: number;
  status: VehicleStatus;
}

/** Situação de IPVA / licenciamento (lista de validação da planilha). */
export type PaymentState = "paid" | "open" | "late";

/** Veículo da frota com os campos administrativos da aba VEÍCULOS. */
export interface FleetVehicle extends Vehicle {
  plate: string;
  vehicleType: string;
  chassis?: string;
  odometer?: number;
  color?: string;
  licensingDueDate?: string;
  purchaseDate?: string;
  purchaseValue?: number;
  photos?: string[];
  crlvUrl?: string;
  fipe?: FipeLink;
  fipePrice?: number;
  fipeReferenceMonth?: string;
  fipeCheckedAt?: string;
  selsynRastreavelId?: string;
  selsynIdentificador?: string;
  selsynLinkedAt?: string;
  yearModel?: string;
  renavam?: string;
  ipvaValue?: number;
  ipvaStatus: PaymentState;
  licensingMonth?: string;
  licensingStatus: PaymentState;
  notes?: string;
}

export type DocType = "cpf" | "cnpj";

export interface Client {
  id: string;
  code: number;
  registeredAt: string;
  name: string;
  phone: string;
  backupPhone?: string;
  email?: string;
  docType?: DocType;
  cpf: string;
  rg?: string;
  kmDaily?: number;
  kmMonthly?: number;
  cep?: string;
  state?: string;
  city?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  address?: string;
  firstLicenseDate?: string;
  cnhNumber?: string;
  cnhCategory?: string;
  cnhExpiry?: string;
  cnhFrontUrl?: string;
  cnhBackUrl?: string;
  cnhPdfUrl?: string;
  addressProofUrl?: string;
  avatarUrl?: string;
  userId?: string;
  notes?: string;
}

export type RentalStatus = "active" | "finished" | "late" | "cancelled" | "pending";

export type PaymentMethod = "pix" | "dinheiro" | "transferencia" | "cartao_debito" | "cartao_credito" | "outro";

/** Recebimento semanal (colunas "RECEBIMENTOS / RECEBER" da aba LOCAÇÃO). */
export interface Receipt {
  id: string;
  dueDate: string;
  amount: number;
  paid: boolean;
  /** Data do pagamento e valor efetivamente recebido (com multa/juros, se houver). */
  paidAt?: string;
  amountPaid?: number;
  paymentMethod?: PaymentMethod | string;
  description?: string;
  notes?: string;
  proofUrl?: string;
  cancelled?: boolean;
  cancelledAt?: string;
  cancelReason?: string;
  settledBy?: string;
}

export type BillingPeriod = "daily" | "weekly" | "biweekly" | "monthly" | "quarterly" | "semiannual" | "annual";
export type InterestPeriod = "daily" | "weekly" | "monthly";

/**
 * Regras de cobrança da locação. Ausente em locações antigas = semanal, sem juros
 * (comportamento anterior, com `weeklyRate` como valor da parcela).
 */
export interface BillingConfig {
  period: BillingPeriod;
  /** Valor de cada parcela no período escolhido. */
  amount: number;
  /** Primeira cobrança e última data de cobrança (ex.: do dia 05/10 até 05/03). */
  firstDue: string;
  until: string;
  /** Multa única (%) após a carência. */
  lateFeePercent: number;
  /** Juros simples (%) por período de atraso. */
  interestPercent: number;
  interestPeriod: InterestPeriod;
  /** Dias após o vencimento sem multa nem juros. */
  graceDays: number;
  /** Enviar a cobrança com PIX por e-mail/WhatsApp automaticamente (cron diário). */
  autoSend: boolean;
  /** Quantos dias antes do vencimento enviar o lembrete (0 = só no dia). */
  remindDaysBefore: number;
}

export interface Rental {
  id: string;
  clientId: string;
  vehicleId: string;
  contractType: string;
  contractTemplateId?: string;
  startDate: string;
  startTime?: string;
  endDate: string;
  endTime?: string;
  paymentWeekday?: string;
  deposit?: number;
  kmStart?: number;
  kmEnd?: number;
  weeklyRate: number;
  receipts: Receipt[];
  billing?: BillingConfig;
  status: RentalStatus;
  notes?: string;
  /** Vistoria na entrega do veículo ao cliente (check-out). */
  deliveryInspection?: Inspection;
  /** Vistoria na devolução (check-in). */
  returnInspection?: Inspection;
}

export type FuelLevel = "empty" | "quarter" | "half" | "three_quarters" | "full";

export interface InspectionItem {
  key: string;
  label: string;
  ok: boolean;
  note?: string;
}

export interface Inspection {
  at: string; // ISO datetime
  km: number;
  fuel: FuelLevel;
  items: InspectionItem[];
  damages?: string;
  notes?: string;
  /** Pendências financeiras apuradas na devolução (combustível, avarias, limpeza...). */
  extraCharges?: number;
  staffName: string;
  clientName: string;
  /** Assinatura do cliente na vistoria (PNG em data URL). */
  clientSignature: string;
}

export type ReservationStatus = "pending" | "confirmed" | "completed" | "cancelled";

export interface Reservation {
  id: string;
  clientId: string;
  vehicleId: string;
  startDate: string;
  endDate: string;
  status: ReservationStatus;
  contractTemplateId?: string;
  notes?: string;
}

export type ExpenseCategory = "recurring" | "misc";

export interface Expense {
  id: string;
  date: string;
  description: string;
  vehicleId?: string;
  supplier?: string;
  amount: number;
  paid: boolean;
  paymentMethod?: string;
  category: ExpenseCategory;
  notes?: string;
}

export type MaintenanceStatus = "scheduled" | "pending" | "done";

export interface Maintenance {
  id: string;
  date: string;
  vehicleId: string;
  description: string;
  currentKm?: number;
  nextKm?: number;
  supplier?: string;
  amount?: number;
  status: MaintenanceStatus;
  notes?: string;
}

export type FineStatus = "pending" | "identify" | "paid" | "overdue" | "contested";

export interface Fine {
  id: string;
  clientId?: string;
  realOffender?: string;
  vehicleId: string;
  noticeNumber: string;
  infractionDate: string;
  driverIdDeadline?: string;
  discountDeadline?: string;
  description: string;
  dueDate: string;
  amount: number;
  paymentDate?: string;
  amountPaid?: number;
  status: FineStatus;
  notes?: string;
}

export interface Note {
  id: string;
  date: string;
  time: string;
  clientId?: string;
  description: string;
}

/** Preferências do painel. Dados institucionais (WhatsApp, site) são fixos em `lib/company.ts`. */
export type ContractStatus = "pending" | "signed" | "cancelled";

export interface Contract {
  id: string;
  rentalId: string;
  status: ContractStatus;
  token: string;
  content: string;
  contentHash?: string;
  clientName: string;
  clientCpf: string;
  clientEmail?: string;
  companySigner?: string;
  companySignature?: string;
  companyEmail?: string;
  issuedAt?: string;
  expiresAt?: string;
  signedName?: string;
  signedCpf?: string;
  signature?: string;
  /** Selfie tirada no ato da assinatura (JPEG em data URL). Só a equipe acessa. */
  selfie?: string;
  signedAt?: string;
  signedIp?: string;
  signedUserAgent?: string;
}

export type EmailKind = "contract_signature" | "contract_signed" | "delivery" | "return" | "receipt" | "fine" | "reservation" | "maintenance" | "alert_client" | "alert_digest" | "alert_admin" | "charge";

export interface EmailLog {
  id: string;
  kind: EmailKind;
  toEmail: string;
  subject: string;
  rentalId?: string;
  fineId?: string;
  contractId?: string;
  providerId?: string;
  /** Chaves dos alertas cobertos por este e-mail (evita lembrete repetido). */
  alertKeys?: string[];
  status: "sent" | "failed";
  error?: string;
  createdAt?: string;
}

/** Dados da empresa usados nos contratos e comprovantes (não inventados: preenchidos pelo administrador). */
export interface CompanyProfile {
  legalName: string;
  cnpj: string;
  address: string;
  email: string;
  signerName: string;
  /** Assinatura padrão do representante (PNG em data URL). */
  signerSignature?: string;
  contractCity: string;
  /** Cláusulas gerais do contrato; editáveis em Configurações. */
  contractTerms: string;
}

/** Categorias das notificações do painel (preferências de Web Push). */
export type NotificationCategory =
  | "rentals"
  | "reservations"
  | "payments"
  | "clients"
  | "expenses"
  | "maintenance"
  | "fines"
  | "vehicles"
  | "documents"
  | "contracts"
  | "notes"
  | "system";

export type NotificationSeverity = "info" | "success" | "warning" | "critical";

/** Item da central de notificações do painel (tabela `notifications`). */
export interface AppNotification {
  id: string;
  type: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  body: string;
  url: string;
  createdAt: string;
  readAt?: string;
}

/** Chave PIX da empresa, usada em todas as cobranças (QR Code e copia e cola). */
export type PixKeyType = "cpf" | "cnpj" | "phone" | "email" | "random";

export interface PixSettings {
  key: string;
  keyType: PixKeyType;
  /** Nome do recebedor (como no banco) e cidade: exigidos pelo padrão do Banco Central. */
  name: string;
  city: string;
  /** Meio "PIX QR Code" (comprovante + aprovação manual) oferecido aos clientes. Ausente = ligado. */
  enabled?: boolean;
}

/** Para onde vão os alertas da empresa por e-mail e WhatsApp (vazio = padrão do servidor). */
export interface AdminAlerts {
  email: string;
  phone: string;
  /** Resumo diário das 8h (vencimentos e atrasos). */
  daily: boolean;
  /** Alertas importantes na hora (contrato assinado, nova locação, pagamento, multa, atrasos...). */
  instant: boolean;
}

export interface ContractTemplate {
  id: string;
  name: string;
  fileName: string;
  filePath: string;
  fileType: "pdf" | "doc" | "docx";
  uploadedAt: string;
}

export interface CompanySettings {
  company: CompanyProfile;
  alerts: AdminAlerts;
  pix: PixSettings;
  contractTemplates?: ContractTemplate[];
  /** InfinitePay (InfiniteTap e Checkout). Ausente em bases antigas = desligado. */
  infinitepay?: InfinitePaySettings;
  /** Web Push para a equipe: liga/desliga geral e por categoria (ausente = ligada). */
  push: { enabled: boolean; categories: Partial<Record<NotificationCategory, boolean>> };
  pageSize: number;
  alertWindowDays: number;
  compactTables: boolean;
  notifyFines: boolean;
  notifyMaintenance: boolean;
  notifyReceipts: boolean;
}

/* ---------- Multiempresa (SaaS) ---------- */

export type OrgRole = "owner" | "admin" | "manager" | "finance" | "operator" | "viewer";
export type OrgStatus = "active" | "trial" | "past_due" | "suspended" | "cancelled";

/** Identidade visual da locadora (white label). Cores em #rrggbb; logos: URL pública do bucket branding. */
export interface OrgBranding {
  displayName?: string;
  primary?: string;
  secondary?: string;
  accent?: string;
  theme?: "light" | "dark" | "system";
  logo?: string;
  logoLight?: string;
  logoCompact?: string;
  favicon?: string;
}

/** Textos curtos personalizáveis (não é CMS). */
export interface OrgTexts {
  welcome?: string;
  billing?: string;
  support?: string;
  footer?: string;
}

export interface Organization {
  id: string;
  slug: string;
  name: string;
  legal_name: string | null;
  document: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  cep: string | null;
  status: OrgStatus;
  branding: OrgBranding;
  texts: OrgTexts;
  onboarding: Record<string, boolean>;
  created_at: string;
}

/* ---------- Entidades do App do Locatário ---------- */

export type PaymentReceiptStatus = "pending_review" | "approved" | "rejected";

export interface PaymentReceipt {
  id: string;
  rentalId: string;
  receiptId: string;
  clientId: string;
  amount: number;
  paymentDate: string;
  proofUrl: string;
  status: PaymentReceiptStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export type IncidentCategory =
  | "mecanica"
  | "pneu"
  | "eletrica"
  | "ar_condicionado"
  | "acidente"
  | "painel"
  | "vidro"
  | "lataria"
  | "outro";

export type IncidentStatus = "open" | "in_review" | "in_service" | "waiting_client" | "resolved" | "cancelled";

export interface VehicleIncident {
  id: string;
  rentalId: string;
  clientId: string;
  vehicleId: string;
  category: IncidentCategory;
  description: string;
  mediaUrls: string[];
  locationLat?: number;
  locationLng?: number;
  status: IncidentStatus;
  adminNotes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface TenantDevice {
  id: string;
  clientId: string;
  installationId: string;
  pushToken: string;
  platform: "ios" | "android";
  deviceModel?: string;
  osVersion?: string;
  appVersion?: string;
  active: boolean;
  lastSeenAt: string;
  createdAt: string;
}

export interface AntifraudTelemetry {
  id: string;
  clientId: string;
  deviceId: string;
  ipAddress?: string;
  appVersion?: string;
  integrityStatus?: string;
  isEmulator: boolean;
  batteryLevel?: number;
  networkType?: string;
  locationLat?: number;
  locationLng?: number;
  riskScore?: number;
  riskFactors?: string[];
  createdAt: string;
}

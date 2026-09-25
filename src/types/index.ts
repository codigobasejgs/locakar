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
  purchaseDate?: string;
  purchaseValue?: number;
  yearModel?: string;
  renavam?: string;
  ipvaValue?: number;
  ipvaStatus: PaymentState;
  licensingMonth?: string;
  licensingStatus: PaymentState;
  notes?: string;
}

export interface Client {
  id: string;
  code: number;
  registeredAt: string;
  name: string;
  phone: string;
  email?: string;
  cpf: string;
  address?: string;
  firstLicenseDate?: string;
  cnhExpiry?: string;
  notes?: string;
}

export type RentalStatus = "active" | "finished" | "late" | "cancelled" | "pending";

/** Recebimento semanal (colunas "RECEBIMENTOS / RECEBER" da aba LOCAÇÃO). */
export interface Receipt {
  id: string;
  dueDate: string;
  amount: number;
  paid: boolean;
}

export interface Rental {
  id: string;
  clientId: string;
  vehicleId: string;
  contractType: string;
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
  signedAt?: string;
  signedIp?: string;
  signedUserAgent?: string;
}

export type EmailKind = "contract_signature" | "contract_signed" | "delivery" | "return" | "receipt" | "fine";

export interface EmailLog {
  id: string;
  kind: EmailKind;
  toEmail: string;
  subject: string;
  rentalId?: string;
  fineId?: string;
  contractId?: string;
  providerId?: string;
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

export interface CompanySettings {
  company: CompanyProfile;
  pageSize: number;
  alertWindowDays: number;
  compactTables: boolean;
  notifyFines: boolean;
  notifyMaintenance: boolean;
  notifyReceipts: boolean;
}

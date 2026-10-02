import { supabase } from "./supabase";

/** Servidor da LOCAKAR. Em desenvolvimento aponte para o seu computador: EXPO_PUBLIC_API_URL=http://192.168.x.x:3000 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || "https://www.locakar.com.br").replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Chama /api/tenant/* com o token da sessão. O servidor descobre o cliente pelo token, nunca por um id enviado aqui. */
export async function api<T>(path: string, init: { method?: "GET" | "POST"; body?: unknown } = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError(401, "Sessão expirada. Entre novamente.");
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? "GET",
      headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Sem conexão. Verifique a internet e tente de novo.");
  }
  const json = await res.json().catch(() => ({}));
  // Sem JSON (ex.: tempo esgotado no servidor): mostra o código para o suporte identificar a causa.
  if (!res.ok) throw new ApiError(res.status, json.error ?? `Não foi possível carregar (erro ${res.status}). Tente de novo.`);
  return json as T;
}

/* ---------- Tipos da resposta de /api/tenant/summary ---------- */

export type ProofStatus = "pending_review" | "approved" | "rejected" | null;

export interface Installment {
  id: string;
  label: string;
  dueDate: string;
  amount: number;
  paid: boolean;
  paidAt: string | null;
  amountPaid: number | null;
  late: boolean;
  fee: number;
  interest: number;
  total: number;
  pixCode: string | null;
  proofStatus: ProofStatus;
  rejectionReason: string | null;
  /** Cobrança Asaas em aberto desta parcela (null = fluxo PIX/manual). */
  asaas?: { id: string; billingType: string | null; invoiceUrl: string | null } | null;
}

export interface TenantVehicle {
  id: string;
  name: string;
  brand: string;
  model: string;
  year: number;
  yearModel?: string;
  plate: string;
  image?: string;
  fuel: string;
  transmission: string;
  seats?: number;
  airConditioning?: boolean;
  category?: string;
}

export interface TenantRental {
  id: string;
  status: "active" | "finished" | "late" | "cancelled" | "pending";
  startDate: string;
  endDate: string;
  contractType: string;
  deposit: number | null;
  kmStart: number | null;
  kmEnd: number | null;
  /** Vistorias oficiais registradas pela equipe (retirada e devolução). */
  delivery: { at: string; km: number; fuel: string } | null;
  returned: { at: string; km: number; fuel: string } | null;
  vehicle: TenantVehicle | null;
  billing: {
    period: string;
    amount: number;
    firstDue: string;
    until: string;
    lateFeePercent: number;
    interestPercent: number;
    interestPeriod: "daily" | "weekly" | "monthly";
    graceDays: number;
  } | null;
  installments: Installment[];
}

export interface PendingRentalRequest {
  id: string;
  vehicleId: string;
  vehicleName: string;
  vehicleCategory: string;
  vehicleImage: string | null;
  startDate: string;
  endDate: string;
  planType: string;
  rateAmount: number;
  depositAmount: number;
  status: "pending" | "approved" | "rejected" | "correction_requested";
  rejectionReason: string | null;
  correctionNotes: string | null;
  createdAt: string;
}

export interface TenantSummary {
  client: { id: string; name: string; cpf: string; email: string | null; phone: string; cnhExpiry: string | null; cnhNumber: string | null; cnhCategory: string | null };
  rentals: TenantRental[];
  fleet?: FleetVehicle[];
  pendingRequest?: PendingRentalRequest | null;
  pix: { name: string } | null;
  /** Checkout InfinitePay ativo (cartão até 12x ou Pix pela InfinitePay). */
  infinitepay?: { checkout: boolean } | null;
  /** Asaas ativo: formas de pagamento online habilitadas pela LOCAKAR. */
  asaas?: { methods: string[]; allowUndefined: boolean; sandbox: boolean } | null;
  support: { whatsapp: string; display: string };
  today: string;
  privacyVersion: string;
  /** Aceite da política atual; null = o app mostra a tela de privacidade antes de tudo. */
  consent: { scopes: string[]; at: string } | null;
}

/* ---------- Demais telas ---------- */

export interface Photo {
  slot: string;
  url: string | null;
}

export interface AppInspection {
  id: string;
  rentalId: string;
  kind: string;
  km: number;
  fuel: string;
  items: { key: string; label: string; ok: boolean; note?: string }[];
  damages: string | null;
  notes: string | null;
  status: string;
  adminNotes: string | null;
  createdAt: string;
  photos: Photo[];
}

export interface Incident {
  id: string;
  rentalId: string;
  category: string;
  description: string;
  status: string;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
  photos: string[];
}

export interface TenantDocument {
  id: string;
  kind: string;
  status: string;
  rejectionReason: string | null;
  createdAt: string;
  url: string | null;
}

export interface Maintenance {
  id: string;
  date: string;
  description: string;
  currentKm: number | null;
  nextKm: number | null;
  status: string;
}

export interface Fine {
  id: string;
  noticeNumber: string;
  infractionDate: string;
  driverIdDeadline: string | null;
  discountDeadline: string | null;
  description: string;
  dueDate: string;
  amount: number;
  paymentDate: string | null;
  status: string;
}

export interface Reservation {
  id: string;
  vehicleId: string;
  vehicleName: string;
  startDate: string;
  endDate: string;
  status: string;
}

export interface FleetVehicle {
  id: string;
  name: string;
  category: string;
  transmission: string;
  fuel: string;
  seats: number;
  image: string;
  dailyRate: number | null;
  weeklyRate: number | null;
}

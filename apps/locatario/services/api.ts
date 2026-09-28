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
  if (!res.ok) throw new ApiError(res.status, json.error ?? "Não foi possível carregar. Tente de novo.");
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
}

export interface TenantVehicle {
  id: string;
  name: string;
  brand: string;
  model: string;
  year: number;
  plate: string;
  fuel: string;
  transmission: string;
}

export interface TenantRental {
  id: string;
  status: "active" | "finished" | "late" | "cancelled" | "pending";
  startDate: string;
  endDate: string;
  contractType: string;
  deposit: number | null;
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

export interface TenantSummary {
  client: { id: string; name: string; cpf: string; email: string | null; phone: string; cnhExpiry: string | null; cnhNumber: string | null; cnhCategory: string | null };
  rentals: TenantRental[];
  pix: { name: string } | null;
  support: { whatsapp: string; display: string };
  today: string;
}

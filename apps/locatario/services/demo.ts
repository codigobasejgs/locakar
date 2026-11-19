import { Platform } from "react-native";
import type { TenantSummary } from "./api";

/**
 * Demonstração (frotaeasy.com.br/demo): o app abre com uma locatária fictícia, sem login nem servidor.
 * Liga só na versão web quando o cookie fe_demo existe. Nada é enviado: envios respondem "modo demonstração".
 */
const ORGS: Record<string, { name: string; primary: string; secondary: string; accent: string; ddd: string; plate: string; client: string; rate: number }> = {
  rotasul: { name: "Rota Sul Locadora", primary: "#0ea5e9", secondary: "#0369a1", accent: "#38bdf8", ddd: "19", plate: "RSL0A10", client: "Ana Beatriz Moreira", rate: 650 },
  viaexpress: { name: "Via Express Locações", primary: "#f97316", secondary: "#c2410c", accent: "#fb923c", ddd: "15", plate: "VEX0A10", client: "Larissa Gomes Vieira", rate: 590 },
};

export const demoSlug = (): string | null => {
  if (Platform.OS !== "web" || typeof document === "undefined") return null;
  const m = /(?:^|;\s*)fe_demo=([a-z]+)/.exec(document.cookie);
  return m && m[1] in ORGS ? m[1] : null;
};
export const isDemo = demoSlug() !== null;

const day = (offset: number) => {
  const d = new Date(Date.now() + offset * 86_400_000);
  return d.toISOString().slice(0, 10);
};

function summary(slug: string): TenantSummary {
  const o = ORGS[slug];
  const start = day(-35);
  const installments = Array.from({ length: 8 }, (_, i) => {
    const due = day(-35 + i * 7);
    const paid = i < 4;
    const late = !paid && due < day(0);
    const fee = late ? Math.round(o.rate * 0.02) : 0;
    return { id: `demo-r${i + 1}`, label: `Semana ${i + 1}`, dueDate: due, amount: o.rate, paid, paidAt: paid ? due : null, amountPaid: paid ? o.rate : null, late, fee, interest: 0, total: o.rate + fee, pixCode: null, proofStatus: null, rejectionReason: null };
  });
  const vehicle = { id: "demo-v1", name: "Fiat Mobi Like 1.0", brand: "Fiat", model: "Mobi", year: 2023, yearModel: "2023", plate: o.plate, image: "/vehicles/fiat-mobi.jpg", fuel: "Flex", transmission: "Manual", seats: 5, airConditioning: true, category: "Hatch compacto" };
  return {
    client: { id: "demo-c1", name: o.client, cpf: "123.456.789-09", email: `${o.client.split(" ")[0].toLowerCase()}@exemplo.com`, phone: `(${o.ddd}) 90000-1000`, cnhExpiry: day(400), cnhNumber: "00000000000", cnhCategory: "B" },
    rentals: [
      {
        id: "demo-l1", status: "active", startDate: start, endDate: day(60), contractType: "Semanal", deposit: 800, kmStart: 42800, kmEnd: null,
        delivery: { at: `${start}T09:00:00`, km: 42800, fuel: "full" }, returned: null, vehicle,
        billing: { period: "weekly", amount: o.rate, firstDue: start, until: day(60), lateFeePercent: 2, interestPercent: 1, interestPeriod: "daily", graceDays: 0 },
        installments,
        contract: { id: "demo-k1", status: "signed", signature: null },
      },
    ],
    fleet: [
      { id: "demo-v2", name: "Renault Kwid Zen 1.0", category: "Compacto urbano", transmission: "Manual", fuel: "Flex", seats: 5, image: "/vehicles/renault-kwid.jpg", dailyRate: null, weeklyRate: o.rate + 50 },
      { id: "demo-v3", name: "Fiat Mobi Like 1.0", category: "Hatch compacto", transmission: "Manual", fuel: "Flex", seats: 5, image: "/vehicles/fiat-mobi.jpg", dailyRate: null, weeklyRate: o.rate },
    ],
    pendingRequest: null,
    features: { periodicCheckin: true },
    pix: { name: o.name },
    paymentMethods: ["pix_manual"],
    asaas: null,
    infinitepay: null,
    support: { whatsapp: null, display: `(${o.ddd}) 90000-0000`, email: `contato@${slug}.exemplo`, text: "Atendimento de demonstração." },
    brand: { slug, name: o.name, logo: `/demo/${slug}-dark.png`, logoLight: `/demo/${slug}-light.png`, logoCompact: `/demo/${slug}-icon.png`, primary: o.primary, secondary: o.secondary, accent: o.accent, welcome: `Bem-vinda à ${o.name}!` },
    organizations: [{ id: `demo-${slug}`, slug, name: o.name, logo: `/demo/${slug}-icon.png`, primary: o.primary, active: true }],
    today: day(0),
    privacyVersion: "demo",
    consent: { scopes: ["essential"], at: day(-35) },
  } as TenantSummary;
}

/** Marca pública da locadora fictícia (tela de login/abertura). */
export function demoBrand(slug: string) {
  const s = summary(slug);
  return { ...s.brand!, whatsapp: null, email: s.support.email ?? null, support: s.support.text ?? null, active: true };
}

/** Respostas fictícias das rotas /api/tenant/*. Escritas não fazem nada e avisam. */
export function demoApi<T>(path: string, method: "GET" | "POST"): T {
  const slug = demoSlug()!;
  if (method === "POST") throw new Error("Modo demonstração: nada é enviado. No sistema real, isso fica registrado na hora para a locadora.");
  const s = summary(slug);
  const base = path.split("?")[0];
  const data: Record<string, unknown> = {
    "/api/tenant/summary": s,
    "/api/tenant/vehicle": { maintenance: [{ id: "m1", date: day(-20), description: "Troca de óleo e filtros", currentKm: 44100, nextKm: 54100, status: "done" }], fines: [] },
    "/api/tenant/inspections": { inspections: [] },
    "/api/tenant/documents": { documents: [] },
    "/api/tenant/incidents": { incidents: [] },
    "/api/tenant/reservations": { reservations: [], fleet: s.fleet },
  };
  return (data[base] ?? {}) as T;
}

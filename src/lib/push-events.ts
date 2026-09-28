/**
 * Catálogo de eventos que viram notificação para a equipe (central do painel + Web Push).
 * Puro, sem I/O — testado em scripts/check.ts.
 *
 * Fluxo: o painel grava direto no Supabase → `detectEvents` (navegador) identifica o evento de negócio
 * → POST /api/push { action: "event" } → o servidor relê o registro e monta o texto com `describeEvent`
 * (o navegador nunca define título nem destinatário) → notifyStaff → web-push.
 */
import type { CollectionKey } from "@/repositories/types";
import type { AppNotification, NotificationCategory, NotificationSeverity } from "@/types";
import {
  FINE_STATUS,
  MAINTENANCE_STATUS,
  RESERVATION_STATUS,
  ROUTES,
  VEHICLE_STATUS,
} from "./constants";
import type { AlertGroup, Notice } from "./notifications";
import { formatCurrency, formatDate } from "./utils";

export const CATEGORY_LABEL: Record<NotificationCategory, string> = {
  rentals: "Locações",
  reservations: "Reservas",
  payments: "Pagamentos e recebimentos",
  clients: "Clientes",
  expenses: "Despesas",
  maintenance: "Manutenção",
  fines: "Multas",
  vehicles: "Veículos",
  documents: "Documentos (CNH, IPVA, licenciamento)",
  contracts: "Contratos",
  notes: "Anotações",
  system: "Sistema",
};

/** Evento pronto para gravar na central e enviar por push. */
export interface StaffEvent {
  type: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  body: string;
  url: string;
  /** Mesmo evento nunca notifica duas vezes (coluna única em `notifications`). */
  dedupeKey: string;
}

/** Conteúdo enviado ao service worker (public/sw.js). */
export interface PushPayload {
  id?: string;
  title: string;
  body: string;
  url: string;
  severity: NotificationSeverity;
  category?: NotificationCategory;
  tag?: string;
}

export const PUSH_COLLECTIONS = ["rentals", "reservations", "clients", "vehicles", "expenses", "maintenance", "fines", "notes"] as const satisfies readonly CollectionKey[];
export type PushCollection = (typeof PUSH_COLLECTIONS)[number];
export const isPushCollection = (k: string): k is PushCollection => (PUSH_COLLECTIONS as readonly string[]).includes(k);

type Rec = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/**
 * Eventos de negócio numa gravação do painel. Uma operação gera no máximo uma notificação
 * relevante (edições triviais, como corrigir observação ou telefone, não notificam).
 */
export function detectEvents(key: CollectionKey, before: Rec | undefined, after: Rec): string[] {
  if (!isPushCollection(key)) return [];
  if (!before) return ["created"];
  const events: string[] = [];
  if (key === "rentals") {
    const was = new Map(((before.receipts as Rec[]) ?? []).map((r) => [r.id, r.paid]));
    for (const r of (after.receipts as Rec[]) ?? []) if (r.paid && !was.get(r.id)) events.push(`receipt:${String(r.id)}`);
  }
  if (key === "expenses" && after.paid && !before.paid) events.push("paid");
  if (key === "reservations" && (before.startDate !== after.startDate || before.endDate !== after.endDate)) events.push("rescheduled");
  // Devolução já notifica pela locação ("Locação finalizada"): o veículo voltando a disponível não repete.
  const returnedVehicle = key === "vehicles" && before.status === "rented" && after.status === "available";
  if (["rentals", "reservations", "vehicles", "maintenance", "fines"].includes(key) && before.status !== after.status && after.status && !returnedVehicle) {
    events.push(`status:${String(after.status)}`);
  }
  return events.slice(0, 2);
}

/** Contexto que o servidor monta relendo o banco (nomes resolvidos). */
export interface EventContext {
  collection: PushCollection;
  record: Rec;
  clientName?: string;
  plate?: string;
}

const short = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const join = (...parts: (string | undefined | false)[]) => parts.filter(Boolean).join(" · ");

/** Texto da notificação a partir do registro real. `null` = evento sem valor operacional. */
export function describeEvent(kind: string, ctx: EventContext): StaffEvent | null {
  const r = ctx.record;
  const id = String(r.id);
  const who = ctx.clientName;
  const plate = ctx.plate;
  const base = { dedupeKey: `${ctx.collection}:${id}:${kind}` };
  const [verb, arg] = kind.split(":") as [string, string | undefined];

  switch (ctx.collection) {
    case "rentals": {
      const url = `${ROUTES.rentals}/${id}`;
      const period = `${formatDate(str(r.startDate))} a ${formatDate(str(r.endDate))}`;
      if (verb === "created") return { ...base, type: "rental.created", category: "rentals", severity: "info", title: "Nova locação registrada", body: join(who, plate, period), url };
      if (verb === "receipt") {
        const receipts = (r.receipts as Rec[]) ?? [];
        const i = receipts.findIndex((x) => x.id === arg);
        if (i < 0) return null;
        return { ...base, type: "payment.received", category: "payments", severity: "success", title: "Pagamento recebido", body: join(who, formatCurrency(Number(receipts[i].amount)), `semana ${i + 1}`), url };
      }
      if (verb === "status") {
        const map: Record<string, [string, NotificationSeverity]> = {
          active: ["Veículo entregue ao cliente", "success"],
          finished: ["Locação finalizada", "success"],
          cancelled: ["Locação cancelada", "warning"],
          late: ["Locação em atraso", "critical"],
        };
        const m = map[arg ?? ""];
        return m ? { ...base, type: `rental.${arg}`, category: "rentals", severity: m[1], title: m[0], body: join(who, plate), url } : null;
      }
      return null;
    }
    case "reservations": {
      const url = ROUTES.reservations;
      const period = `${formatDate(str(r.startDate))} a ${formatDate(str(r.endDate))}`;
      if (verb === "created") return { ...base, type: "reservation.created", category: "reservations", severity: "info", title: "Nova reserva", body: join(who, plate, period), url };
      if (verb === "rescheduled") return { ...base, dedupeKey: `${base.dedupeKey}:${str(r.startDate)}:${str(r.endDate)}`, type: "reservation.rescheduled", category: "reservations", severity: "info", title: "Reserva alterada", body: join(who, plate, period), url };
      if (verb === "status" && (arg === "confirmed" || arg === "cancelled")) {
        return { ...base, type: `reservation.${arg}`, category: "reservations", severity: arg === "cancelled" ? "warning" : "success", title: `Reserva ${RESERVATION_STATUS[arg].label.toLowerCase()}`, body: join(who, plate, period), url };
      }
      return null;
    }
    case "clients":
      // Só o nome: dados pessoais (CPF, telefone) não vão na notificação.
      return verb === "created" ? { ...base, type: "client.created", category: "clients", severity: "info", title: "Novo cliente cadastrado", body: str(r.name) ?? "", url: ROUTES.clients } : null;
    case "vehicles": {
      const label = join(str(r.plate), str(r.name));
      if (verb === "created") return { ...base, type: "vehicle.created", category: "vehicles", severity: "info", title: "Novo veículo na frota", body: label, url: ROUTES.vehicles };
      if (verb === "status" && arg && arg in VEHICLE_STATUS && arg !== "rented" && arg !== "reserved") {
        // Alugado/reservado já chegam pela locação/reserva: não duplica.
        return { ...base, dedupeKey: `${base.dedupeKey}:${Date.now().toString(36)}`, type: `vehicle.${arg}`, category: "vehicles", severity: arg === "maintenance" ? "warning" : "info", title: `Veículo: ${VEHICLE_STATUS[arg as keyof typeof VEHICLE_STATUS].label.toLowerCase()}`, body: label, url: ROUTES.vehicles };
      }
      return null;
    }
    case "expenses": {
      const body = join(short(str(r.description) ?? ""), formatCurrency(Number(r.amount)), plate);
      if (verb === "created") return { ...base, type: "expense.created", category: "expenses", severity: "info", title: r.paid ? "Nova despesa registrada" : "Nova despesa a pagar", body, url: ROUTES.expenses };
      if (verb === "paid") return { ...base, type: "expense.paid", category: "expenses", severity: "success", title: "Despesa paga", body, url: ROUTES.expenses };
      return null;
    }
    case "maintenance": {
      const body = join(plate, short(str(r.description) ?? ""), formatDate(str(r.date)));
      if (verb === "created") return { ...base, type: "maintenance.created", category: "maintenance", severity: "info", title: "Manutenção registrada", body, url: ROUTES.maintenance };
      if (verb === "status" && arg === "done") {
        return { ...base, type: "maintenance.done", category: "maintenance", severity: "success", title: `Manutenção ${MAINTENANCE_STATUS.done.label.toLowerCase()}`, body: join(body, r.amount != null && formatCurrency(Number(r.amount))), url: ROUTES.maintenance };
      }
      return null;
    }
    case "fines": {
      const body = join(plate, formatCurrency(Number(r.amount)), `vencimento ${formatDate(str(r.dueDate))}`);
      if (verb === "created") return { ...base, type: "fine.created", category: "fines", severity: "warning", title: "Nova multa", body: join(body, who), url: ROUTES.fines };
      if (verb === "status" && (arg === "paid" || arg === "contested" || arg === "overdue")) {
        const severity: NotificationSeverity = arg === "paid" ? "success" : arg === "overdue" ? "critical" : "info";
        return { ...base, type: `fine.${arg}`, category: "fines", severity, title: `Multa ${FINE_STATUS[arg].label.toLowerCase()}`, body, url: ROUTES.fines };
      }
      return null;
    }
    case "notes":
      return verb === "created" ? { ...base, type: "note.created", category: "notes", severity: "info", title: "Nova anotação", body: join(who, short(str(r.description) ?? "")), url: ROUTES.notes } : null;
  }
}

/* ---------- Alertas por data (cron diário) ---------- */

const GROUP_CATEGORY: Record<AlertGroup, NotificationCategory> = {
  fine: "fines",
  receipt: "payments",
  receipt_due: "payments",
  expense: "expenses",
  maintenance: "maintenance",
  cnh: "documents",
  documents: "documents",
  contract: "contracts",
  return: "rentals",
  reservation: "reservations",
};

/**
 * Alerta diário → notificação. Cada alerta notifica no máximo duas vezes: quando entra na janela
 * ("vence em breve") e quando fica urgente (vencido/atrasado). Sem repetir todo dia.
 */
export function noticeToEvent(n: Notice): StaffEvent {
  const [title, ...rest] = n.adminText.split(" · ");
  return {
    type: `alert.${n.group}`,
    category: GROUP_CATEGORY[n.group],
    severity: n.urgent ? "critical" : n.group === "reservation" || n.group === "receipt_due" ? "info" : "warning",
    title: short(title, 110),
    body: short(rest.join(" · "), 380),
    url: n.href,
    dedupeKey: `alert:${n.key}:${n.urgent ? "urgent" : "soon"}`,
  };
}

/* ---------- Preferências e envio ---------- */

export function wantsPush(prefs: { enabled: boolean; categories: Partial<Record<NotificationCategory, boolean>> }, category: NotificationCategory) {
  return prefs.enabled && prefs.categories[category] !== false;
}

/** Até este número de eventos novos, um push por evento; acima, um resumo só (evita rajada). */
export const MAX_INDIVIDUAL_PUSHES = 3;

export function summaryPayload(events: StaffEvent[]): PushPayload {
  const rank: NotificationSeverity[] = ["critical", "warning", "info", "success"];
  const severity = rank.find((s) => events.some((e) => e.severity === s)) ?? "info";
  const critical = events.filter((e) => e.severity === "critical").length;
  return {
    title: `${events.length} novas notificações`,
    body: [critical && `${critical} urgente(s)`, ...events.slice(0, 3).map((e) => e.title)].filter(Boolean).join(" · "),
    url: ROUTES.admin,
    severity,
    tag: "locakar-resumo",
  };
}

/** Web Push: 404/410 = inscrição não existe mais no serviço do navegador → remover. */
export const isExpiredSubscription = (statusCode?: number) => statusCode === 404 || statusCode === 410;

export interface FanOutResult {
  sent: string[];
  expired: string[];
  failed: { id: string; error: string }[];
}

/**
 * Envia para vários dispositivos em lotes, sem que a falha de um interrompa os outros.
 * `send` rejeita com { statusCode } (formato do web-push).
 */
export async function fanOut<S extends { id: string }>(subs: S[], send: (s: S) => Promise<unknown>, batch = 20): Promise<FanOutResult> {
  const out: FanOutResult = { sent: [], expired: [], failed: [] };
  for (let i = 0; i < subs.length; i += batch) {
    const chunk = subs.slice(i, i + batch);
    const results = await Promise.allSettled(chunk.map(send));
    results.forEach((res, j) => {
      const id = chunk[j].id;
      if (res.status === "fulfilled") return void out.sent.push(id);
      const err = res.reason as { statusCode?: number; body?: string; message?: string };
      if (isExpiredSubscription(err?.statusCode)) out.expired.push(id);
      else out.failed.push({ id, error: short(`${err?.statusCode ?? ""} ${err?.body || err?.message || "erro"}`.trim(), 200) });
    });
  }
  return out;
}

/** Central: não lidas primeiro no contador; mais recentes primeiro na lista. */
export const unreadCount = (items: Pick<AppNotification, "readAt">[]) => items.filter((n) => !n.readAt).length;

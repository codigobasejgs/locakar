import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import {
  MAX_INDIVIDUAL_PUSHES,
  fanOut,
  summaryPayload,
  wantsPush,
  type PushPayload,
  type StaffEvent,
} from "@/lib/push-events";
import { SUPABASE_URL } from "@/lib/supabase/env";
import { mergeSettings } from "@/repositories/types";
import type { CompanySettings } from "@/types";

/**
 * Única camada que conhece a biblioteca web-push (VAPID). Nada fora daqui chama webpush.sendNotification.
 * Env (somente servidor): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto: ou https:).
 * Grava com a service role (SUPABASE_SECRET_KEY): notificações e limpeza de inscrições de qualquer usuário.
 */
export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY ?? "";
export const isPushConfigured = () => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.SUPABASE_SECRET_KEY);

let configured = false;
function vapid() {
  if (!configured) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:locakarveiculos@gmail.com", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
    configured = true;
  }
  return webpush;
}

export function serviceDb(): SupabaseClient {
  return createClient(SUPABASE_URL, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
}

interface SubRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  failures: number;
}

const log = (msg: string, extra?: Record<string, unknown>) => console.info(`[push] ${msg}`, extra ?? "");

/** Envia a todos os dispositivos das pessoas indicadas (ou de toda a equipe, se omitido). */
async function deliver(db: SupabaseClient, payload: PushPayload, userIds?: string[]) {
  let q = db.from("push_subscriptions").select("id,user_id,endpoint,p256dh,auth,failures");
  if (userIds) q = q.in("user_id", userIds);
  const { data: subs, error } = await q;
  if (error) throw new Error(`push_subscriptions: ${error.message}`);
  if (!subs?.length) return { sent: 0, failed: 0, expired: 0 };

  const body = JSON.stringify(payload);
  const wp = vapid();
  const res = await fanOut(subs as SubRow[], (s) =>
    wp.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
      TTL: payload.severity === "critical" ? 60 * 60 * 24 : 60 * 60 * 6,
      urgency: payload.severity === "critical" ? "high" : "normal",
      topic: payload.tag?.slice(0, 32).replace(/[^A-Za-z0-9_-]/g, ""),
      timeout: 10_000,
    }),
  );

  // Expirada (404/410): some só aquela inscrição. Falha passageira: conta; após 5 seguidas, remove.
  if (res.expired.length) {
    await db.from("push_subscriptions").delete().in("id", res.expired);
    log("inscrições expiradas removidas", { count: res.expired.length });
  }
  const byId = new Map((subs as SubRow[]).map((s) => [s.id, s]));
  const dead = res.failed.filter((f) => (byId.get(f.id)?.failures ?? 0) + 1 >= 5).map((f) => f.id);
  if (dead.length) await db.from("push_subscriptions").delete().in("id", dead);
  await Promise.all(
    res.failed
      .filter((f) => !dead.includes(f.id))
      .map((f) => db.from("push_subscriptions").update({ failures: (byId.get(f.id)?.failures ?? 0) + 1, last_error: f.error }).eq("id", f.id)),
  );
  if (res.sent.length) {
    await db.from("push_subscriptions").update({ failures: 0, last_error: null, last_seen_at: new Date().toISOString() }).in("id", res.sent).gt("failures", 0);
  }
  if (res.failed.length) log("falhas de envio", { count: res.failed.length, errors: res.failed.map((f) => f.error) });
  return { sent: res.sent.length, failed: res.failed.length, expired: res.expired.length };
}

export const sendPushToUser = (db: SupabaseClient, userId: string, payload: PushPayload) => deliver(db, payload, [userId]);

/** Papel real do sistema: "staff" (tabela public.staff). É o único papel com acesso ao painel. */
export async function sendPushToRole(db: SupabaseClient, role: "staff", payload: PushPayload) {
  const { data, error } = await db.from(role).select("user_id");
  if (error) throw new Error(`${role}: ${error.message}`);
  return deliver(db, payload, (data ?? []).map((r) => r.user_id as string));
}

/** Todos os dispositivos inscritos. Restrito ao servidor (inscrever exige ser da equipe). */
export const sendPushToAll = (db: SupabaseClient, payload: PushPayload) => deliver(db, payload);

async function loadSettings(db: SupabaseClient): Promise<CompanySettings> {
  const { data } = await db.from("settings").select("data").eq("id", 1).maybeSingle();
  return mergeSettings(DEFAULT_SETTINGS, data?.data as Partial<CompanySettings> | undefined);
}

/**
 * Registra eventos na central (sem duplicar: dedupe_key único) e avisa a equipe por Web Push,
 * respeitando as preferências de Configurações. Nunca lança: notificação é efeito secundário.
 */
export async function notifyStaff(events: StaffEvent[], opts: { createdBy?: string; db?: SupabaseClient } = {}) {
  const report = { created: 0, pushed: 0, failed: 0, expired: 0, skipped: 0 };
  if (!events.length || !process.env.SUPABASE_SECRET_KEY) return report;
  const db = opts.db ?? serviceDb();
  try {
    const rows = events.map((e) => ({
      type: e.type,
      category: e.category,
      severity: e.severity,
      title: e.title.slice(0, 120),
      body: e.body.slice(0, 400),
      url: e.url.startsWith("/admin") ? e.url : "/admin",
      dedupe_key: e.dedupeKey.slice(0, 300),
      created_by: opts.createdBy ?? null,
    }));
    // ignoreDuplicates: evento já registrado (mesma dedupe_key) volta vazio e não notifica de novo.
    const { data: created, error } = await db.from("notifications").upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("id,category,dedupe_key");
    if (error) throw new Error(`notifications: ${error.message}`);
    report.created = created?.length ?? 0;
    report.skipped = events.length - report.created;
    if (!created?.length || !isPushConfigured()) return report;

    const settings = await loadSettings(db);
    const fresh = created
      .map((c) => ({ row: c, event: events.find((e) => e.dedupeKey.slice(0, 300) === c.dedupe_key)! }))
      .filter((x) => x.event && wantsPush(settings.push, x.event.category));
    if (!fresh.length) return report;

    const payloads: { id?: string; payload: PushPayload }[] =
      fresh.length > MAX_INDIVIDUAL_PUSHES
        ? [{ payload: summaryPayload(fresh.map((x) => x.event)) }]
        : fresh.map(({ row, event }) => ({
            id: row.id as string,
            payload: { id: row.id as string, title: event.title, body: event.body, url: event.url, severity: event.severity, category: event.category, tag: row.id as string },
          }));

    for (const { id, payload } of payloads) {
      const r = await sendPushToRole(db, "staff", payload);
      report.pushed += r.sent;
      report.failed += r.failed;
      report.expired += r.expired;
      if (id) await db.from("notifications").update({ push_sent: r.sent, push_failed: r.failed }).eq("id", id);
    }
  } catch (e) {
    console.error("[push] notifyStaff:", (e as Error).message);
  }
  return report;
}

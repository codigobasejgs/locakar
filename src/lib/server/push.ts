import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { COMPANY } from "@/lib/company";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import {
  MAX_INDIVIDUAL_PUSHES,
  fanOut,
  isAdminAlert,
  summaryPayload,
  wantsPush,
  type PushPayload,
  type StaffEvent,
} from "@/lib/push-events";
import { emailLayout, sendEmail } from "@/lib/server/email";
import { sendWhatsApp } from "@/lib/server/whatsapp";
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
  endpoint: string;
  p256dh: string;
  auth: string;
  failures: number;
}

/** Equipe: push_subscriptions (por user_id). Cliente: client_push_subscriptions (por client_id). */
type SubTable = "push_subscriptions" | "client_push_subscriptions";

const log = (msg: string, extra?: Record<string, unknown>) => console.info(`[push] ${msg}`, extra ?? "");

/** Envia a todos os dispositivos dos donos indicados (sem filtro = todos da tabela). */
async function deliver(db: SupabaseClient, payload: PushPayload, owners?: string[], table: SubTable = "push_subscriptions") {
  let q = db.from(table).select("id,endpoint,p256dh,auth,failures");
  if (owners) q = q.in(table === "push_subscriptions" ? "user_id" : "client_id", owners);
  const { data: subs, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);
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
    await db.from(table).delete().in("id", res.expired);
    log("inscrições expiradas removidas", { table, count: res.expired.length });
  }
  const byId = new Map((subs as SubRow[]).map((s) => [s.id, s]));
  const dead = res.failed.filter((f) => (byId.get(f.id)?.failures ?? 0) + 1 >= 5).map((f) => f.id);
  if (dead.length) await db.from(table).delete().in("id", dead);
  await Promise.all(
    res.failed
      .filter((f) => !dead.includes(f.id))
      .map((f) => db.from(table).update({ failures: (byId.get(f.id)?.failures ?? 0) + 1, last_error: f.error }).eq("id", f.id)),
  );
  if (res.sent.length) {
    await db.from(table).update({ failures: 0, last_error: null, last_seen_at: new Date().toISOString() }).in("id", res.sent).gt("failures", 0);
  }
  if (res.failed.length) log("falhas de envio", { table, count: res.failed.length, errors: res.failed.map((f) => f.error) });
  return { sent: res.sent.length, failed: res.failed.length, expired: res.expired.length };
}

export const sendPushToUser = (db: SupabaseClient, userId: string, payload: PushPayload) => deliver(db, payload, [userId]);

/** Papel real do sistema: "staff" (tabela public.staff). É o único papel com acesso ao painel. */
export async function sendPushToRole(db: SupabaseClient, role: "staff", payload: PushPayload) {
  const { data, error } = await db.from(role).select("user_id");
  if (error) throw new Error(`${role}: ${error.message}`);
  return deliver(db, payload, (data ?? []).map((r) => r.user_id as string));
}

/** Todos os dispositivos da equipe. Restrito ao servidor (inscrever exige ser da equipe). */
export const sendPushToAll = (db: SupabaseClient, payload: PushPayload) => deliver(db, payload);

/** Tela do App do Locatário aberta ao tocar na notificação (rotas do Expo Router). */
export type TenantScreen = "inicio" | "pagamentos" | "locacao" | "veiculo" | "ocorrencias" | "documentos" | "multas" | "reservas" | "notificacoes";

const EXPO_PUSH = "https://exp.host/--/api/v2/push/send";

/**
 * Push nativo do App do Locatário pelo serviço da Expo (entrega via FCM/APNs configurados no EAS).
 * Tokens em tenant_devices, gravados pelo servidor. Token inválido (DeviceNotRegistered) é desativado.
 * EXPO_ACCESS_TOKEN (opcional, só no servidor) ativa o "push security" da Expo.
 */
async function deliverNative(db: SupabaseClient, clientId: string, payload: PushPayload, screen: TenantScreen) {
  const { data: devices } = await db.from("tenant_devices").select("id,push_token").eq("client_id", clientId).eq("active", true);
  if (!devices?.length) return { sent: 0, failed: 0 };
  const messages = devices.map((d) => ({
    to: d.push_token as string,
    title: payload.title,
    body: payload.body,
    sound: "default",
    priority: payload.severity === "critical" || payload.severity === "warning" ? "high" : "normal",
    channelId: "default",
    data: { screen, tag: payload.tag ?? null },
  }));
  const res = await fetch(EXPO_PUSH, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
    },
    body: JSON.stringify(messages),
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: { status: string; details?: { error?: string } }[] };
  const tickets = json.data ?? [];
  const dead = tickets.map((t, i) => (t.details?.error === "DeviceNotRegistered" ? (devices[i].id as string) : null)).filter(Boolean) as string[];
  if (dead.length) await db.from("tenant_devices").update({ active: false, updated_at: new Date().toISOString() }).in("id", dead);
  const sent = tickets.filter((t) => t.status === "ok").length;
  if (sent < devices.length) log("push nativo com falhas", { clientId, sent, total: devices.length });
  return { sent, failed: devices.length - sent };
}

/**
 * Push para o cliente: navegador (ativado na página do contrato) + App do Locatário. Nunca lança.
 * No navegador o clique abre o contrato ou o site (nunca o painel); no app abre `screen`.
 */
export async function sendPushToClient(clientId: string | undefined, payload: PushPayload, screen: TenantScreen = "inicio") {
  const out = { sent: 0, failed: 0, expired: 0 };
  if (!clientId || !process.env.SUPABASE_SECRET_KEY) return out;
  const db = serviceDb();
  const [web, native] = await Promise.all([
    isPushConfigured()
      ? deliver(db, payload, [clientId], "client_push_subscriptions").catch((e) => {
          console.error("[push] cliente:", (e as Error).message);
          return out;
        })
      : out,
    deliverNative(db, clientId, payload, screen).catch((e) => {
      console.error("[push] app do locatário:", (e as Error).message);
      return { sent: 0, failed: 0 };
    }),
  ]);
  return { sent: web.sent + native.sent, failed: web.failed + native.failed, expired: web.expired };
}

export async function loadSettings(db: SupabaseClient): Promise<CompanySettings> {
  const { data } = await db.from("settings").select("data").eq("id", 1).maybeSingle();
  return mergeSettings(DEFAULT_SETTINGS, data?.data as Partial<CompanySettings> | undefined);
}

/** Destino dos alertas da empresa: Configurações → Alertas para a empresa; vazio = padrão do servidor. */
export function companyContacts(settings: CompanySettings) {
  return {
    email: settings.alerts.email.trim() || process.env.ALERTS_ADMIN_EMAIL || "locakarveiculos@gmail.com",
    phone: settings.alerts.phone.trim() || process.env.ALERTS_ADMIN_WHATSAPP || COMPANY.whatsapp.e164,
  };
}

/**
 * Eventos importantes (contrato assinado, nova locação, pagamento, multa, todo "critical")
 * também vão ao e-mail e ao WhatsApp de alertas da empresa. Um envio por lote.
 */
async function alertCompany(db: SupabaseClient, settings: CompanySettings, events: StaffEvent[]) {
  const important = events.filter(isAdminAlert);
  if (!important.length || !settings.alerts.instant) return;
  const { email, phone } = companyContacts(settings);
  const one = important.length === 1;
  const link = `${COMPANY.siteUrl}${one ? important[0].url : "/admin"}`;
  const text = [
    "🔔 *Alerta LOCAKAR*",
    "",
    ...important.map((e) => `${e.severity === "critical" ? "⚠️" : "•"} *${e.title}*${e.body ? ` — ${e.body}` : ""}`),
    "",
    link,
  ].join("\n");
  await Promise.all([
    sendEmail(db, {
      kind: "alert_admin",
      to: email,
      subject: one ? `${important[0].title} — LOCAKAR` : `${important.length} alertas — LOCAKAR`,
      html: emailLayout({
        title: one ? important[0].title : `${important.length} novos alertas`,
        intro: one ? important[0].body || "Novo evento no painel da LOCAKAR." : "Eventos importantes no painel da LOCAKAR:",
        rows: one ? undefined : important.map((e) => [e.title, e.body] as [string, string]),
        cta: { label: "Abrir no painel", url: link },
      }),
    }).catch((e) => console.error("[alerta] e-mail:", (e as Error).message)),
    sendWhatsApp(db, { kind: "alert_admin", phone, text }),
  ]);
}

/**
 * Pedido feito pelo cliente no app (reserva ou solicitação de locação): confirma ao cliente
 * (WhatsApp, e-mail, push) e avisa os contatos de alerta das Configurações (WhatsApp, e-mail)
 * sempre, independente de "alerta instantâneo". O Web Push da equipe segue por notifyStaff.
 * Nunca lança: cada canal falha sozinho.
 */
export async function notifyClientSubmission(input: {
  id: string;
  clientId: string;
  client: { name?: string | null; phone?: string | null; email?: string | null } | null;
  title: string;
  rows: [string, string][];
  adminUrl: string;
  screen: TenantScreen;
}) {
  if (!process.env.SUPABASE_SECRET_KEY) return;
  const db = serviceDb();
  const { email, phone } = companyContacts(await loadSettings(db));
  const name = input.client?.name?.trim() || "Cliente";
  const first = name.split(" ")[0];
  const lines = input.rows.map(([k, v]) => `• *${k}:* ${v}`);
  const adminLink = `${COMPANY.siteUrl}${input.adminUrl}`;
  const clientIntro = `Olá, ${first}! Recebemos seu pedido e a equipe LOCAKAR vai analisar. Você será avisado assim que houver resposta.`;
  const adminRows: [string, string][] = [["Cliente", name], ["Telefone", input.client?.phone || "—"], ...input.rows];
  const safe = (label: string) => (e: unknown) => console.error(`[pedido] ${label}:`, (e as Error).message);

  await Promise.all([
    sendWhatsApp(db, { kind: "reservation", phone: input.client?.phone ?? undefined, text: [`✅ *${input.title} recebida*`, "", clientIntro, "", ...lines].join("\n") }).catch(safe("WhatsApp cliente")),
    input.client?.email
      ? sendEmail(db, { kind: "reservation", to: input.client.email, subject: `${input.title} recebida — LOCAKAR`, html: emailLayout({ title: `${input.title} recebida`, intro: clientIntro, rows: input.rows }) }).catch(safe("e-mail cliente"))
      : null,
    sendPushToClient(input.clientId, { title: `${input.title} recebida`, body: "A LOCAKAR vai analisar e te avisar por aqui.", url: "/", severity: "success", tag: `pedido-${input.id}` }, input.screen),
    sendWhatsApp(db, { kind: "alert_admin", phone, text: [`🔔 *Nova ${input.title.toLowerCase()}*`, "", ...adminRows.map(([k, v]) => `• *${k}:* ${v}`), "", adminLink].join("\n") }).catch(safe("WhatsApp admin")),
    sendEmail(db, { kind: "alert_admin", to: email, subject: `Nova ${input.title.toLowerCase()} — ${name}`, html: emailLayout({ title: `Nova ${input.title.toLowerCase()}`, intro: `${name} enviou um pedido pelo app. Analise no painel.`, rows: adminRows, cta: { label: "Abrir no painel", url: adminLink } }) }).catch(safe("e-mail admin")),
  ]);
}

/**
 * Registra eventos na central (sem duplicar: dedupe_key único), avisa a equipe por Web Push
 * (respeitando as preferências) e manda os importantes ao e-mail/WhatsApp da empresa.
 * `companyAlert: false` pula o e-mail/WhatsApp da empresa (quando quem chama já avisou).
 * Nunca lança: notificação é efeito secundário.
 */
export async function notifyStaff(events: StaffEvent[], opts: { createdBy?: string; db?: SupabaseClient; companyAlert?: boolean } = {}) {
  const report = { created: 0, pushed: 0, failed: 0, expired: 0, skipped: 0 };
  if (!events.length || !process.env.SUPABASE_SECRET_KEY) return report;
  const db = opts.db ?? serviceDb();
  try {
    const key = (e: StaffEvent) => e.dedupeKey.slice(0, 300);
    const rows = events.map((e) => ({
      type: e.type,
      category: e.category,
      severity: e.severity,
      title: e.title.slice(0, 120),
      body: e.body.slice(0, 400),
      url: e.url.startsWith("/admin") ? e.url : "/admin",
      dedupe_key: key(e),
      created_by: opts.createdBy ?? null,
    }));
    // ignoreDuplicates: evento já registrado (mesma dedupe_key) volta vazio e não notifica de novo.
    const { data: created, error } = await db.from("notifications").upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("id,dedupe_key");
    if (error) throw new Error(`notifications: ${error.message}`);
    report.created = created?.length ?? 0;
    report.skipped = events.length - report.created;
    if (!created?.length) return report;

    const fresh = created.map((row) => ({ id: row.id as string, event: events.find((e) => key(e) === row.dedupe_key)! })).filter((x) => x.event);
    const settings = await loadSettings(db);
    if (opts.companyAlert !== false) await alertCompany(db, settings, fresh.map((x) => x.event));
    if (!isPushConfigured()) return report;

    const wanted = fresh.filter((x) => wantsPush(settings.push, x.event.category));
    const payloads: { id?: string; payload: PushPayload }[] =
      wanted.length > MAX_INDIVIDUAL_PUSHES
        ? [{ payload: summaryPayload(wanted.map((x) => x.event)) }]
        : wanted.map(({ id, event }) => ({
            id,
            payload: { id, title: event.title, body: event.body, url: event.url, severity: event.severity, category: event.category, tag: id },
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

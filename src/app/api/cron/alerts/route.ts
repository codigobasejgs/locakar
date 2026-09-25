import { createClient } from "@supabase/supabase-js";
import { COMPANY } from "@/lib/company";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import { GROUP_LABEL, REMIND_DAYS, buildNotices, dueForClient, type AlertGroup, type Notice } from "@/lib/notifications";
import { emailLayout, sendEmail } from "@/lib/server/email";
import { sendWhatsApp } from "@/lib/server/whatsapp";
import { SUPABASE_URL } from "@/lib/supabase/env";
import { toISODate } from "@/lib/utils";
import { fromRow } from "@/repositories/mapping";
import { mergeSettings, type Collections } from "@/repositories/types";
import type { Client, CompanySettings } from "@/types";

/**
 * Alertas diários por e-mail (Vercel Cron, ver vercel.json).
 * - Cliente: e-mail + WhatsApp com os avisos dele (multa, atraso, CNH, contrato, devolução, reserva).
 * - Empresa: resumo com todos os alertas (e-mail + WhatsApp), incluindo manutenção e IPVA/licenciamento.
 * Protegido por CRON_SECRET. Lê o banco com a secret key (somente no servidor, nunca no navegador).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ADMIN_EMAIL = process.env.ALERTS_ADMIN_EMAIL || "locakarveiculos@gmail.com";
/** WhatsApp que recebe o resumo diário da empresa (padrão: número oficial da LOCAKAR). */
const ADMIN_WHATSAPP = process.env.ALERTS_ADMIN_WHATSAPP || COMPANY.whatsapp.e164;
const TABLES: Record<keyof Collections, string> = {
  vehicles: "vehicles",
  clients: "clients",
  rentals: "rentals",
  reservations: "reservations",
  expenses: "expenses",
  maintenance: "maintenance",
  fines: "fines",
  notes: "notes",
  contracts: "contracts",
  emails: "email_log",
};

/** Data de hoje no fuso de São Paulo (o servidor da Vercel roda em UTC). */
const todaySP = () => toISODate(new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })));

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Não autorizado." }, { status: 401 });
  }
  const serviceKey = process.env.SUPABASE_SECRET_KEY;
  if (!serviceKey) return Response.json({ error: "SUPABASE_SECRET_KEY não configurada." }, { status: 500 });

  const db = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } });
  const today = todaySP();
  const since = new Date(Date.now() - REMIND_DAYS * 86_400_000).toISOString();

  const entries = await Promise.all(
    (Object.keys(TABLES) as (keyof Collections)[]).map(async (key) => {
      let q = db.from(TABLES[key]).select("*");
      if (key === "emails") q = q.gte("created_at", since); // só o histórico recente importa
      if (key === "contracts") q = q.eq("status", "pending"); // selfie/assinatura não são necessárias aqui
      const { data, error } = await q;
      if (error) throw new Error(`${TABLES[key]}: ${error.message}`);
      return [key, (data ?? []).map((r) => fromRow(r))] as const;
    }),
  ).catch((e: Error) => e);
  if (entries instanceof Error) return Response.json({ error: entries.message }, { status: 500 });

  const data = Object.fromEntries(entries) as unknown as Collections;
  const { data: row } = await db.from("settings").select("data").eq("id", 1).maybeSingle();
  const settings: CompanySettings = mergeSettings(DEFAULT_SETTINGS, row?.data as Partial<CompanySettings> | undefined);
  const notices = buildNotices(data, settings, today);

  const sentRecently = new Set(
    data.emails.filter((e) => e.status === "sent" && e.kind === "alert_client").flatMap((e) => e.alertKeys ?? []),
  );
  const replyTo = settings.company.email || ADMIN_EMAIL;
  const report = { date: today, notices: notices.length, clientsNotified: 0, clientsWithoutContact: 0, failures: [] as string[] };

  // ---------- Cliente: um e-mail por cliente, com todos os avisos dele ----------
  const byClient = new Map<string, Notice[]>();
  for (const n of dueForClient(notices, sentRecently)) byClient.set(n.clientId!, [...(byClient.get(n.clientId!) ?? []), n]);

  for (const [clientId, list] of byClient) {
    const client = data.clients.find((c) => c.id === clientId) as Client | undefined;
    if (!client) continue;
    const keys = list.map((n) => n.key);
    let reached = false;
    if (client.email) {
      try {
        await sendEmail(db, {
          kind: "alert_client",
          to: client.email,
          replyTo,
          alertKeys: keys,
          subject: list.some((n) => n.urgent) ? "Aviso importante sobre sua locação — LOCAKAR" : "Lembrete da LOCAKAR",
          html: emailLayout({
            title: `Olá, ${client.name.split(" ")[0]}!`,
            intro: "Temos um aviso sobre a sua locação com a LOCAKAR:",
            rows: list.map((n, i) => [`${i + 1}. ${GROUP_LABEL[n.group]}`, n.clientText!] as [string, string]),
            cta: { label: "Falar com a LOCAKAR no WhatsApp", url: `https://wa.me/${COMPANY.whatsapp.e164}` },
            footerNote: "Se você já resolveu, desconsidere esta mensagem.",
          }),
        });
        reached = true;
      } catch (e) {
        report.failures.push(`${client.email}: ${(e as Error).message}`);
      }
    }
    const wa = await sendWhatsApp(db, {
      kind: "alert_client",
      phone: client.phone,
      alertKeys: keys,
      text: [
        `🔔 *Aviso da LOCAKAR*`,
        "",
        `Olá, ${client.name.split(" ")[0]}!`,
        ...list.map((n) => `• ${n.clientText}`),
        "",
        "Se já resolveu, desconsidere. Dúvidas? Responda esta mensagem.",
      ].join("\n"),
    });
    if (wa.ok) reached = true;
    else if (wa.error !== "WhatsApp não configurado.") report.failures.push(`WhatsApp ${client.phone}: ${wa.error}`);
    if (reached) report.clientsNotified++;
    else report.clientsWithoutContact++;
  }

  // ---------- Empresa: resumo diário completo ----------
  if (notices.length) {
    const groups = [...new Set(notices.map((n) => n.group))] as AlertGroup[];
    const rows: [string, string][] = groups.flatMap((g) =>
      notices.filter((n) => n.group === g).map((n, i) => [i === 0 ? `${GROUP_LABEL[g]} (${notices.filter((x) => x.group === g).length})` : "", `${n.urgent ? "⚠ " : ""}${n.adminText}`] as [string, string]),
    );
    const extra = [
      report.clientsNotified && `${report.clientsNotified} cliente(s) avisado(s) hoje.`,
      report.clientsWithoutContact && `${report.clientsWithoutContact} cliente(s) sem e-mail nem WhatsApp válido não foram avisados.`,
    ]
      .filter(Boolean)
      .join(" ");
    try {
      await sendEmail(db, {
        kind: "alert_digest",
        to: ADMIN_EMAIL,
        subject: `Resumo diário LOCAKAR — ${notices.filter((n) => n.urgent).length} urgente(s), ${notices.length} alerta(s)`,
        html: emailLayout({
          title: "Resumo diário de alertas",
          intro: `Alertas de ${today.split("-").reverse().join("/")}. ${extra}`.trim(),
          rows,
          cta: { label: "Abrir o painel", url: `${COMPANY.siteUrl}/admin` },
        }),
      });
    } catch (e) {
      report.failures.push(`resumo: ${(e as Error).message}`);
    }
    const urgent = notices.filter((n) => n.urgent);
    const wa = await sendWhatsApp(db, {
      kind: "alert_digest",
      phone: ADMIN_WHATSAPP,
      text: [
        `📋 *Resumo diário LOCAKAR* — ${today.split("-").reverse().join("/")}`,
        `${urgent.length} urgente(s) · ${notices.length} alerta(s)`,
        ...groups.flatMap((g) => {
          const items = notices.filter((n) => n.group === g);
          return [
            "",
            `*${GROUP_LABEL[g]}* (${items.length})`,
            ...items.slice(0, 8).map((n) => `${n.urgent ? "⚠️" : "•"} ${n.adminText}`),
            ...(items.length > 8 ? [`… e mais ${items.length - 8}`] : []),
          ];
        }),
        ...(extra ? ["", extra] : []),
        "",
        `Painel: ${COMPANY.siteUrl}/admin`,
      ].join("\n"),
    });
    if (!wa.ok && wa.error !== "WhatsApp não configurado.") report.failures.push(`resumo WhatsApp: ${wa.error}`);
  }

  return Response.json(report, { status: report.failures.length ? 207 : 200 });
}

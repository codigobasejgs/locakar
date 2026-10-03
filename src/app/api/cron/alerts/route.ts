import { after } from "next/server";
import { updateFipeBatch } from "@/lib/server/fipe";
import { isPixReady, receiptsToCharge } from "@/lib/billing";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import { GROUP_LABEL, REMIND_DAYS, buildNotices, dueForClient, type AlertGroup, type Notice } from "@/lib/notifications";
import { noticeToEvent } from "@/lib/push-events";
import { sendCharge } from "@/lib/server/charge";
import { emailLayout, sendEmail } from "@/lib/server/email";
import { brand, globalDb, runWithOrg, scoped, siteUrl } from "@/lib/server/org-context";
import { companyContacts, notifyStaff, sendPushToClient } from "@/lib/server/push";
import { sendWhatsApp } from "@/lib/server/whatsapp";
import { todaySP } from "@/lib/utils";
import { fromRow } from "@/repositories/mapping";
import { mergeSettings, type Collections } from "@/repositories/types";
import type { Client, CompanySettings, Organization } from "@/types";

/**
 * Alertas diários (Vercel Cron diário às 11h UTC, ver vercel.json).
 * Itera as locadoras ativas/trial: cada uma processa seus próprios dados, com seus settings e contatos.
 * Expira testes grátis (trial vencido → past_due → suspended após carência).
 * FIPE roda no fim, com o orçamento restante de tempo.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

async function processOrg(org: Organization, deadline: number) {
  return runWithOrg({ org }, async () => {
    if (Date.now() + 5000 >= deadline) return { skipped: true };
    const db = (await import("@/lib/server/push")).serviceDb();
    const today = todaySP();
    const since = new Date(Date.now() - REMIND_DAYS * 86_400_000).toISOString();

    const entries = await Promise.all(
      (Object.keys(TABLES) as (keyof Collections)[]).map(async (key) => {
        let q = db.from(TABLES[key]).select("*");
        if (key === "emails") q = q.gte("created_at", since);
        if (key === "contracts") q = q.eq("status", "pending");
        const { data, error } = await q;
        if (error) throw new Error(`${TABLES[key]}: ${error.message}`);
        return [key, (data ?? []).map((r) => fromRow(r))] as const;
      }),
    );
    const data = Object.fromEntries(entries) as unknown as Collections;
    const { data: row } = await db.from("settings").select("data").maybeSingle();
    const settings: CompanySettings = mergeSettings(DEFAULT_SETTINGS, row?.data as Partial<CompanySettings> | undefined);
    const notices = buildNotices(data, settings, today);
    const { email: ADMIN_EMAIL, phone: ADMIN_WHATSAPP } = companyContacts(settings);
    const co = brand();

    const sentRecently = new Set(
      data.emails.filter((e) => e.status === "sent" && e.kind === "alert_client").flatMap((e) => e.alertKeys ?? []),
    );
    const replyTo = settings.company.email || ADMIN_EMAIL;
    const report = { notices: notices.length, clientsNotified: 0, failures: [] as string[] };

    // Clientes da locadora
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
            subject: list.some((n) => n.urgent) ? `Aviso importante sobre sua locação — ${co.name}` : `Lembrete da ${co.name}`,
            html: emailLayout({
              title: `Olá, ${client.name.split(" ")[0]}!`,
              intro: `Temos um aviso sobre a sua locação com a ${co.name}:`,
              rows: list.map((n, i) => [`${i + 1}. ${GROUP_LABEL[n.group]}`, n.clientText!] as [string, string]),
              cta: co.whatsapp ? { label: `Falar com a ${co.name} no WhatsApp`, url: `https://wa.me/${co.whatsapp}` } : undefined,
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
          `🔔 *Aviso da ${co.name}*`,
          "",
          `Olá, ${client.name.split(" ")[0]}!`,
          ...list.map((n) => `• ${n.clientText}`),
          "",
          "Se já resolveu, desconsidere. Dúvidas? Responda esta mensagem.",
        ].join("\n"),
      });
      if (wa.ok) reached = true;
      const push = await sendPushToClient(client.id, {
        title: list.some((n) => n.urgent) ? `Aviso importante da ${co.name}` : `Lembrete da ${co.name}`,
        body: list.map((n) => n.clientText).join(" ").slice(0, 180),
        url: "/",
        severity: list.some((n) => n.urgent) ? "warning" : "info",
        tag: `lembrete-${client.id}`,
      }, "inicio");
      if (push.sent) reached = true;
      if (reached) report.clientsNotified++;
    }

    // Resumo diário para a empresa
    if (notices.length && settings.alerts.daily && (ADMIN_EMAIL || ADMIN_WHATSAPP)) {
      const groups = [...new Set(notices.map((n) => n.group))] as AlertGroup[];
      const rows: [string, string][] = groups.flatMap((g) =>
        notices.filter((n) => n.group === g).map((n, i) => [i === 0 ? `${GROUP_LABEL[g]} (${notices.filter((x) => x.group === g).length})` : "", `${n.urgent ? "⚠ " : ""}${n.adminText}`] as [string, string]),
      );
      if (ADMIN_EMAIL) {
        await sendEmail(db, {
          kind: "alert_digest",
          to: ADMIN_EMAIL,
          subject: `Resumo diário ${co.name} — ${notices.filter((n) => n.urgent).length} urgente(s), ${notices.length} alerta(s)`,
          html: emailLayout({
            title: "Resumo diário de alertas",
            intro: `Alertas de ${today.split("-").reverse().join("/")}.`,
            rows,
            cta: { label: "Abrir o painel", url: `${siteUrl()}/admin` },
          }),
        }).catch((e) => report.failures.push(`resumo: ${(e as Error).message}`));
      }
      if (ADMIN_WHATSAPP) {
        const urgent = notices.filter((n) => n.urgent);
        await sendWhatsApp(db, {
          kind: "alert_digest",
          phone: ADMIN_WHATSAPP,
          text: [
            `📋 *Resumo diário ${co.name}* — ${today.split("-").reverse().join("/")}`,
            `${urgent.length} urgente(s) · ${notices.length} alerta(s)`,
            ...groups.flatMap((g) => {
              const items = notices.filter((n) => n.group === g);
              return ["", `*${GROUP_LABEL[g]}* (${items.length})`, ...items.slice(0, 8).map((n) => `${n.urgent ? "⚠️" : "•"} ${n.adminText}`)];
            }),
            "",
            `Painel: ${siteUrl()}/admin`,
          ].join("\n"),
        }).catch((e) => report.failures.push(`resumo WhatsApp: ${(e as Error).message}`));
      }
    }

    // Cobranças com PIX
    let charges = 0;
    if (isPixReady(settings.pix) && settings.pix.enabled !== false) {
      for (const rental of data.rentals) {
        const client = data.clients.find((c) => c.id === rental.clientId) as Client | undefined;
        if (!client) continue;
        for (const receipt of receiptsToCharge(rental, today)) {
          try {
            await sendCharge(db, { rental, receipt, client, vehicle: data.vehicles.find((v) => v.id === rental.vehicleId), settings, today, replyTo });
            charges++;
          } catch (e) {
            report.failures.push(`${client.name}: ${(e as Error).message}`);
          }
        }
      }
    }

    const push = await notifyStaff(notices.map(noticeToEvent), { db });
    return { ...report, charges, push };
  });
}

export const GET = scoped(async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Não autorizado." }, { status: 401 });
  }
  const deadline = Date.now() + 50000;
  if (!process.env.SUPABASE_SECRET_KEY) return Response.json({ error: "SUPABASE_SECRET_KEY não configurada." }, { status: 500 });

  const global = globalDb();
  // Expira testes grátis (trial → past_due → suspended)
  const { data: trials } = await global.rpc("expire_trials");

  // Locadoras ativas ou em período de teste
  const { data: orgs, error } = await global
    .from("organizations")
    .select("id,slug,name,legal_name,document,email,phone,whatsapp,website,address,city,state,cep,status,branding,texts,onboarding,created_at")
    .in("status", ["active", "trial", "past_due"])
    .order("created_at");
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const results: Record<string, unknown> = {};
  for (const org of (orgs ?? []) as Organization[]) {
    try {
      results[org.slug] = await processOrg(org, deadline);
    } catch (e) {
      results[org.slug] = { error: (e as Error).message };
    }
  }

  // FIPE atualiza o lote mensal no final (orçamento restante)
  after(async () => {
    if (Date.now() + 3000 < deadline) await updateFipeBatch(deadline);
  });
  await global.rpc("prune_notifications");
  const { data: purged } = await global.rpc("purge_tenant_data");

  return Response.json({ date: todaySP(), orgs: (orgs ?? []).length, trials, results, purged });
});

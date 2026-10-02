import "server-only";
import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { onColor } from "@/lib/contrast";
import { brand } from "@/lib/server/org-context";
import type { EmailKind } from "@/types";

/**
 * Remetente: endereço único da plataforma (EMAIL_FROM, domínio verificado no Resend) com o NOME da locadora.
 * Respostas vão para o e-mail da locadora (replyTo). Sem EMAIL_FROM, o endereço de teste do Resend
 * só entrega para o dono da conta Resend.
 */
const FROM_ADDRESS = (process.env.EMAIL_FROM || "LOCAKAR <onboarding@resend.dev>").replace(/^.*<([^>]+)>.*$/, "$1");
const fromName = () => brand().name.replace(/["<>\r\n]/g, "").slice(0, 60);

let client: Resend | undefined;
function resend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY não configurada no servidor.");
  client ??= new Resend(key);
  return client;
}

export interface OutgoingEmail {
  kind: EmailKind;
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  /** `contentId`: imagem embutida no corpo (referenciada como cid:<id>). */
  attachments?: { filename: string; content: Uint8Array; contentId?: string }[];
  rentalId?: string;
  fineId?: string;
  contractId?: string;
  alertKeys?: string[];
}

/** Envia pelo Resend e registra em email_log (sucesso ou falha). */
export async function sendEmail(db: SupabaseClient, mail: OutgoingEmail) {
  let providerId: string | undefined;
  let error: string | undefined;
  try {
    const { data, error: err } = await resend().emails.send({
      from: `${fromName()} <${FROM_ADDRESS}>`,
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
      replyTo: mail.replyTo || brand().email || undefined,
      attachments: mail.attachments?.map((a) => ({ filename: a.filename, content: Buffer.from(a.content), contentId: a.contentId })),
    });
    if (err) error = err.message;
    providerId = data?.id;
  } catch (e) {
    error = e instanceof Error ? e.message : "Falha no envio.";
  }
  // Com sessão anônima (assinatura pública) o RLS recusa o registro: o envio segue normalmente.
  await db.from("email_log").insert({
    kind: mail.kind,
    to_email: mail.to,
    subject: mail.subject,
    rental_id: mail.rentalId ?? null,
    fine_id: mail.fineId ?? null,
    contract_id: mail.contractId ?? null,
    alert_keys: mail.alertKeys ?? null,
    provider_id: providerId ?? null,
    status: error ? "failed" : "sent",
    error: error ?? null,
  });
  if (error) throw new Error(`Não foi possível enviar o e-mail: ${error}`);
  return providerId;
}

/* ---------- Layout ---------- */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** `extraHtml`: HTML já escapado por quem chama (ex.: QR Code PIX), inserido após a tabela. */
export function emailLayout(opts: { title: string; intro: string; rows?: [string, string][]; extraHtml?: string; cta?: { label: string; url: string }; footerNote?: string }) {
  const b = brand();
  const contact = [b.whatsapp && `WhatsApp ${b.whatsapp.replace(/^55(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3")}`, b.email].filter(Boolean).join(" · ");
  const rows = (opts.rows ?? [])
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 0;color:#71717a;font-size:13px;width:42%">${esc(k)}</td><td style="padding:6px 0;color:#18181b;font-size:14px;font-weight:600">${esc(v)}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:#050505;padding:22px 28px"><img src="${esc(b.logo)}" alt="${esc(b.name)}" width="120" style="display:block;max-height:60px;object-fit:contain"></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 12px;font-size:20px;color:#18181b">${esc(opts.title)}</h1>
<p style="margin:0 0 18px;font-size:15px;line-height:1.55;color:#3f3f46">${esc(opts.intro)}</p>
${rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e4e4e7;border-bottom:1px solid #e4e4e7;margin:0 0 20px">${rows}</table>` : ""}
${opts.extraHtml ?? ""}
${opts.cta ? `<a href="${esc(opts.cta.url)}" style="display:inline-block;background:${b.primary};color:${onColor(b.primary)};text-decoration:none;padding:13px 22px;border-radius:10px;font-weight:bold;font-size:15px">${esc(opts.cta.label)}</a>` : ""}
${opts.footerNote ? `<p style="margin:20px 0 0;font-size:12px;line-height:1.5;color:#71717a">${esc(opts.footerNote)}</p>` : ""}
</td></tr>
<tr><td style="background:#fafafa;padding:18px 28px;font-size:12px;color:#71717a;line-height:1.6">
${esc(b.legalName)}${contact ? `<br>${esc(contact)}` : ""}<br><a href="${esc(b.site)}" style="color:${b.primary}">${esc(b.site.replace(/^https?:\/\//, ""))}</a>
</td></tr></table></td></tr></table></body></html>`;
}

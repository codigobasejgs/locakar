import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import QRCode from "qrcode";
import { chargeFor, isPixReady } from "@/lib/billing";
import { emailLayout, sendEmail } from "@/lib/server/email";
import { sendPushToClient } from "@/lib/server/push";
import { sendWhatsApp } from "@/lib/server/whatsapp";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Client, CompanySettings, FleetVehicle, Receipt, Rental } from "@/types";

/**
 * Cobrança de uma parcela: valor atualizado (multa/juros), PIX copia e cola + QR Code,
 * enviada por e-mail (QR embutido), WhatsApp (QR como imagem + código) e push no celular.
 * Retorna os canais que chegaram. Lança só se nenhum canal enviar.
 */
export async function sendCharge(
  db: SupabaseClient,
  args: { rental: Rental; receipt: Receipt; client: Client; vehicle?: FleetVehicle; settings: CompanySettings; today: string; replyTo?: string; clientUrl?: string },
) {
  const { rental, receipt, client, vehicle, settings, today } = args;
  if (!isPixReady(settings.pix)) throw new Error("Cadastre a chave PIX em Configurações → PIX para cobranças.");
  const charge = chargeFor(rental, receipt.id, settings.pix, today);
  if (!charge?.code) throw new Error("Parcela não encontrada.");
  const { label, late, code } = charge;
  const charges = { days: charge.days, fee: charge.fee, interest: charge.interest, total: charge.total };
  const png = await QRCode.toBuffer(code, { type: "png", width: 360, margin: 2, errorCorrectionLevel: "M" });
  const first = client.name.split(" ")[0];
  const vehicleText = vehicle ? `${vehicle.name} · ${vehicle.plate}` : undefined;

  const rows: [string, string][] = [
    ["Referência", `${label} da locação`],
    ["Vencimento", formatDate(receipt.dueDate)],
    ...(vehicleText ? ([["Veículo", vehicleText]] as [string, string][]) : []),
    ["Valor da parcela", formatCurrency(receipt.amount)],
    ...(charges.fee ? ([["Multa por atraso", formatCurrency(charges.fee)]] as [string, string][]) : []),
    ...(charges.interest ? ([[`Juros (${charges.days} dia(s) de atraso)`, formatCurrency(charges.interest)]] as [string, string][]) : []),
    ["Total a pagar", formatCurrency(charges.total)],
    ["Recebedor", `${settings.pix.name} · chave ${settings.pix.key}`],
  ];
  const title = late ? `Pagamento em atraso — ${label}` : `Cobrança — ${label}`;
  const sent: string[] = [];
  const errors: string[] = [];

  if (client.email) {
    try {
      await sendEmail(db, {
        kind: "charge",
        to: client.email,
        replyTo: args.replyTo,
        subject: `${title} — LOCAKAR`,
        rentalId: rental.id,
        html: emailLayout({
          title,
          intro: late
            ? `Olá, ${client.name}! A parcela abaixo venceu em ${formatDate(receipt.dueDate)}. O valor já inclui multa e juros previstos no contrato. Pague pelo PIX:`
            : `Olá, ${client.name}! Segue a cobrança da sua locação. Pague pelo PIX (QR Code ou copia e cola):`,
          rows,
          extraHtml: `<p style="margin:0 0 8px;text-align:center"><img src="cid:pix-qr" alt="QR Code PIX" width="220" height="220" style="display:inline-block"></p>
<p style="margin:0 0 6px;font-size:12px;color:#71717a;text-align:center">PIX copia e cola:</p>
<p style="margin:0 0 18px;padding:10px;background:#f4f4f5;border-radius:8px;font-family:monospace;font-size:11px;word-break:break-all;color:#18181b">${code}</p>`,
          footerNote: "Depois de pagar, envie o comprovante pelo WhatsApp da LOCAKAR. Se já pagou, desconsidere.",
        }),
        attachments: [{ filename: "pix-qrcode.png", content: png, contentId: "pix-qr" }],
      });
      sent.push(`e-mail ${client.email}`);
    } catch (e) {
      errors.push((e as Error).message);
    }
  }

  const waText = [
    late ? `⚠️ *Pagamento em atraso* — ${label}` : `💳 *Cobrança LOCAKAR* — ${label}`,
    "",
    `Olá, ${first}!`,
    `• Vencimento: ${formatDate(receipt.dueDate)}`,
    ...(vehicleText ? [`• Veículo: ${vehicleText}`] : []),
    `• Parcela: ${formatCurrency(receipt.amount)}`,
    ...(charges.fee ? [`• Multa: ${formatCurrency(charges.fee)}`] : []),
    ...(charges.interest ? [`• Juros (${charges.days} dia(s)): ${formatCurrency(charges.interest)}`] : []),
    `• *Total: ${formatCurrency(charges.total)}*`,
    "",
    "Pague pelo QR Code acima ou copie o código PIX da próxima mensagem.",
    `Recebedor: ${settings.pix.name}`,
  ].join("\n");
  const wa = await sendWhatsApp(db, {
    kind: "charge",
    phone: client.phone,
    rentalId: rental.id,
    text: waText,
    image: { filename: "pix-qrcode.png", content: png },
  });
  if (wa.ok) {
    // Código sozinho numa mensagem: o cliente toca e copia inteiro.
    await sendWhatsApp(db, { kind: "charge", phone: client.phone, rentalId: rental.id, text: code });
    sent.push(`WhatsApp ${client.phone}`);
  } else if (wa.error !== "WhatsApp não configurado.") errors.push(`WhatsApp: ${wa.error}`);

  const push = await sendPushToClient(client.id, {
    title,
    body: `${formatCurrency(charges.total)} · vencimento ${formatDate(receipt.dueDate)}. O PIX foi enviado por ${client.email ? "e-mail e " : ""}WhatsApp.`,
    url: args.clientUrl ?? "/",
    severity: late ? "warning" : "info",
    tag: `charge-${receipt.id}`,
  }, "pagamentos");
  if (push.sent) sent.push("notificação no celular");

  if (!sent.length) throw new Error(errors[0] ?? `O cliente ${client.name} não tem e-mail nem WhatsApp válido.`);
  return { to: sent.join(" e "), total: charges.total, warnings: errors };
}

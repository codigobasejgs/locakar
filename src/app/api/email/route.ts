import type { SupabaseClient } from "@supabase/supabase-js";
import { COMPANY } from "@/lib/company";
import { FUEL_LABEL } from "@/lib/contract";
import { contractDocument, inspectionDocument } from "@/lib/documents";
import { emailLayout, sendEmail } from "@/lib/server/email";
import { HttpError, errorResponse, requireStaff } from "@/lib/server/supabase";
import { sendWhatsApp } from "@/lib/server/whatsapp";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import { fromRow } from "@/repositories/mapping";
import type { Client, Contract, EmailKind, Fine, FleetVehicle, Inspection, Maintenance, Rental, Reservation } from "@/types";

/**
 * Notificações ao cliente pelo painel (somente equipe): e-mail (Resend) + WhatsApp (Evolution API).
 * O servidor busca os dados pelo ID: o navegador nunca define destinatário nem conteúdo.
 * Cada canal é tentado de forma independente; a requisição só falha se nenhum canal enviar.
 */
type Body =
  | { kind: "test"; to: string }
  | { kind: "contract_signature"; contractId: string }
  | { kind: "delivery" | "return"; rentalId: string }
  | { kind: "receipt"; rentalId: string; receiptId: string }
  | { kind: "fine"; fineId: string }
  | { kind: "reservation"; reservationId: string }
  | { kind: "maintenance"; maintenanceId: string };

interface Message {
  kind: EmailKind;
  client: Client;
  subject: string;
  html: string;
  whatsapp: string;
  attachments?: { filename: string; content: string }[];
  rentalId?: string;
  fineId?: string;
  contractId?: string;
}

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || COMPANY.siteUrl;
const first = (name: string) => name.split(" ")[0];
const WA_FOOTER = `\n\n_${COMPANY.name} · ${COMPANY.site}_`;

async function deliver(db: SupabaseClient, m: Message, replyTo?: string) {
  const sent: string[] = [];
  const errors: string[] = [];
  if (m.client.email) {
    try {
      await sendEmail(db, { kind: m.kind, to: m.client.email, replyTo, subject: m.subject, html: m.html, attachments: m.attachments, rentalId: m.rentalId, fineId: m.fineId, contractId: m.contractId });
      sent.push(`e-mail ${m.client.email}`);
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  const wa = await sendWhatsApp(db, { kind: m.kind, phone: m.client.phone, text: m.whatsapp + WA_FOOTER, rentalId: m.rentalId, fineId: m.fineId, contractId: m.contractId });
  if (wa.ok) sent.push(`WhatsApp ${m.client.phone}`);
  else if (wa.error !== "WhatsApp não configurado.") errors.push(`WhatsApp: ${wa.error}`);

  if (!sent.length) throw new HttpError(422, errors[0] ?? `O cliente ${m.client.name} não tem e-mail nem WhatsApp válido.`);
  return { to: sent.join(" e "), warnings: errors };
}

export async function POST(request: Request) {
  try {
    const { supabase } = await requireStaff();
    const body = (await request.json()) as Body;

    const one = async <T,>(table: string, id: string) => {
      const { data, error } = await supabase.from(table).select("*").eq("id", id).maybeSingle();
      if (error || !data) throw new HttpError(404, "Registro não encontrado.");
      return fromRow<T>(data);
    };
    const settings = await supabase.from("settings").select("data").eq("id", 1).maybeSingle();
    const replyTo: string | undefined = settings.data?.data?.company?.email || undefined;
    const respond = async (m: Message) => Response.json({ ok: true, ...(await deliver(supabase, m, replyTo)) });

    // Teste manual do painel: só e-mail, destinatário digitado pela equipe.
    if (body.kind === "test") {
      const to = String(body.to ?? "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || to.length > 254) throw new HttpError(422, "Informe um e-mail válido.");
      await sendEmail(supabase, {
        kind: "alert_digest",
        to,
        replyTo,
        subject: "Teste de e-mail — LOCAKAR",
        html: emailLayout({
          title: "Teste de e-mail",
          intro: "Se você recebeu esta mensagem, o envio de e-mails da LOCAKAR está funcionando.",
          rows: [["Enviado em", new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" })]],
        }),
      });
      return Response.json({ ok: true, to });
    }

    if (body.kind === "contract_signature") {
      const contract = await one<Contract>("contracts", body.contractId);
      if (contract.status !== "pending") throw new HttpError(409, "Este contrato não está aguardando assinatura.");
      const rental = await one<Rental>("rentals", contract.rentalId);
      const client = await one<Client>("clients", rental.clientId);
      const url = `${siteUrl()}/assinar/${contract.token}`;
      const until = formatDate(contract.expiresAt?.slice(0, 10));
      return respond({
        kind: "contract_signature",
        client: { ...client, email: contract.clientEmail ?? client.email },
        contractId: contract.id,
        rentalId: contract.rentalId,
        subject: "Contrato de locação LOCAKAR — assinatura pendente",
        html: emailLayout({
          title: "Seu contrato está pronto para assinatura",
          intro: `Olá, ${contract.clientName}! Revise o contrato de locação e assine digitalmente pelo botão abaixo. Você vai confirmar seu CPF e tirar uma selfie.`,
          cta: { label: "Revisar e assinar contrato", url },
          footerNote: `Link pessoal e intransferível, válido até ${until}. Se não reconhece esta locação, fale com a LOCAKAR pelo WhatsApp.`,
        }),
        whatsapp: `Olá, ${first(contract.clientName)}! 👋\n\nSeu *contrato de locação* está pronto para assinatura.\n\n📝 Assine pelo link (vai pedir CPF e uma selfie):\n${url}\n\nLink pessoal, válido até ${until}.`,
      });
    }

    if (body.kind === "delivery" || body.kind === "return") {
      const rental = await one<Rental>("rentals", body.rentalId);
      const client = await one<Client>("clients", rental.clientId);
      const vehicle = await one<FleetVehicle>("vehicles", rental.vehicleId);
      const inspection: Inspection | undefined = body.kind === "delivery" ? rental.deliveryInspection : rental.returnInspection;
      if (!inspection) throw new HttpError(409, "A vistoria ainda não foi registrada.");
      const delivery = body.kind === "delivery";
      const attachments = [
        {
          filename: delivery ? "termo-de-entrega.html" : "termo-de-devolucao.html",
          content: inspectionDocument(body.kind, inspection, { clientName: client.name, vehicle: vehicle.name, plate: vehicle.plate }),
        },
      ];
      if (delivery) {
        const { data } = await supabase.from("contracts").select("*").eq("rental_id", rental.id).eq("status", "signed").order("signed_at", { ascending: false }).limit(1);
        if (data?.[0]) attachments.push({ filename: "contrato-assinado.html", content: contractDocument(fromRow<Contract>(data[0])) });
      }
      const at = new Date(inspection.at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
      const damages = inspection.items.filter((i) => !i.ok).length;
      return respond({
        kind: body.kind,
        client,
        rentalId: rental.id,
        attachments,
        subject: delivery ? `Entrega do veículo ${vehicle.plate} — LOCAKAR` : `Devolução do veículo ${vehicle.plate} — LOCAKAR`,
        html: emailLayout({
          title: delivery ? "Veículo entregue" : "Veículo devolvido",
          intro: delivery
            ? `Olá, ${client.name}! Registramos a entrega do veículo. Em anexo estão o termo de vistoria${attachments.length > 1 ? " e o contrato assinado" : ""}. Boa viagem!`
            : `Olá, ${client.name}! Registramos a devolução do veículo. O termo de vistoria segue em anexo. Obrigado por escolher a LOCAKAR!`,
          rows: [
            ["Veículo", `${vehicle.name} · ${vehicle.plate}`],
            ["Data e hora", at],
            ["Quilometragem", `${formatNumber(inspection.km)} km`],
            ["Combustível", FUEL_LABEL[inspection.fuel]],
            ...(inspection.extraCharges ? ([["Valores adicionais", formatCurrency(inspection.extraCharges)]] as [string, string][]) : []),
          ],
          footerNote: "Abra o anexo no navegador para visualizar ou salvar em PDF.",
        }),
        whatsapp: [
          delivery ? `🚗 *Veículo entregue* — ${vehicle.name} (${vehicle.plate})` : `✅ *Veículo devolvido* — ${vehicle.name} (${vehicle.plate})`,
          "",
          `Olá, ${first(client.name)}! Registramos a ${delivery ? "entrega" : "devolução"} em ${at}.`,
          `• Quilometragem: ${formatNumber(inspection.km)} km`,
          `• Combustível: ${FUEL_LABEL[inspection.fuel]}`,
          damages ? `• Avarias registradas: ${damages}${inspection.damages ? ` (${inspection.damages})` : ""}` : "• Sem avarias registradas",
          ...(inspection.extraCharges ? [`• Valores adicionais: ${formatCurrency(inspection.extraCharges)}`] : []),
          "",
          delivery ? `Devolução prevista: ${formatDate(rental.endDate)}${rental.endTime ? ` às ${rental.endTime}` : ""}. Boa viagem! 🙌` : "Obrigado por escolher a LOCAKAR! 💜",
          client.email ? "O termo completo foi enviado para o seu e-mail." : "",
        ]
          .filter((l, i, a) => l !== "" || a[i - 1] !== "")
          .join("\n")
          .trim(),
      });
    }

    if (body.kind === "receipt") {
      const rental = await one<Rental>("rentals", body.rentalId);
      const receipt = rental.receipts.find((r) => r.id === body.receiptId);
      if (!receipt) throw new HttpError(404, "Recebimento não encontrado.");
      if (!receipt.paid) throw new HttpError(409, "Marque o recebimento como pago antes de enviar o comprovante.");
      const client = await one<Client>("clients", rental.clientId);
      const vehicle = await one<FleetVehicle>("vehicles", rental.vehicleId);
      const week = rental.receipts.indexOf(receipt) + 1;
      return respond({
        kind: "receipt",
        client,
        rentalId: rental.id,
        subject: `Comprovante de pagamento — semana ${week} — LOCAKAR`,
        html: emailLayout({
          title: "Comprovante de pagamento",
          intro: `Olá, ${client.name}! Confirmamos o recebimento do pagamento abaixo.`,
          rows: [
            ["Referência", `Semana ${week} da locação`],
            ["Vencimento", formatDate(receipt.dueDate)],
            ["Valor", formatCurrency(receipt.amount)],
            ["Veículo", `${vehicle.name} · ${vehicle.plate}`],
            ["Locação nº", rental.id.slice(0, 8).toUpperCase()],
          ],
        }),
        whatsapp: `💰 *Pagamento confirmado*\n\nOlá, ${first(client.name)}! Recebemos o pagamento da *semana ${week}* da sua locação.\n• Valor: ${formatCurrency(receipt.amount)}\n• Vencimento: ${formatDate(receipt.dueDate)}\n• Veículo: ${vehicle.plate}\n\nObrigado!`,
      });
    }

    if (body.kind === "fine") {
      const fine = await one<Fine>("fines", body.fineId);
      if (!fine.clientId) throw new HttpError(422, "A multa não está vinculada a um locatário.");
      const client = await one<Client>("clients", fine.clientId);
      const vehicle = await one<FleetVehicle>("vehicles", fine.vehicleId);
      return respond({
        kind: "fine",
        client,
        fineId: fine.id,
        subject: `Notificação de multa — ${vehicle.plate} — LOCAKAR`,
        html: emailLayout({
          title: "Notificação de infração de trânsito",
          intro: `Olá, ${client.name}! Recebemos uma autuação referente ao período em que o veículo estava sob sua responsabilidade.`,
          rows: [
            ["Auto de infração", fine.noticeNumber],
            ["Infração", fine.description],
            ["Data da autuação", formatDate(fine.infractionDate)],
            ["Veículo", `${vehicle.name} · ${vehicle.plate}`],
            ["Valor", formatCurrency(fine.amount)],
            ...(fine.driverIdDeadline ? ([["Prazo p/ identificação do condutor", formatDate(fine.driverIdDeadline)]] as [string, string][]) : []),
            ...(fine.discountDeadline ? ([["Pagamento com desconto até", formatDate(fine.discountDeadline)]] as [string, string][]) : []),
            ["Vencimento", formatDate(fine.dueDate)],
          ],
          footerNote: "Entre em contato com a LOCAKAR pelo WhatsApp para a identificação do condutor ou para combinar o pagamento.",
        }),
        whatsapp: [
          `⚠️ *Notificação de multa* — ${vehicle.plate}`,
          "",
          `Olá, ${first(client.name)}! Recebemos uma autuação do período em que o veículo estava com você.`,
          `• Auto: ${fine.noticeNumber}`,
          `• Infração: ${fine.description}`,
          `• Data: ${formatDate(fine.infractionDate)}`,
          `• Valor: ${formatCurrency(fine.amount)}`,
          ...(fine.driverIdDeadline ? [`• Identificação do condutor até: ${formatDate(fine.driverIdDeadline)}`] : []),
          ...(fine.discountDeadline ? [`• Com desconto até: ${formatDate(fine.discountDeadline)}`] : []),
          `• Vencimento: ${formatDate(fine.dueDate)}`,
          "",
          "Responda esta mensagem para combinarmos a identificação ou o pagamento.",
        ].join("\n"),
      });
    }

    if (body.kind === "reservation") {
      const reservation = await one<Reservation>("reservations", body.reservationId);
      const client = await one<Client>("clients", reservation.clientId);
      const vehicle = await one<FleetVehicle>("vehicles", reservation.vehicleId);
      const statusLabel = reservation.status === "confirmed" ? "confirmada" : reservation.status === "cancelled" ? "cancelada" : "registrada";
      return respond({
        kind: "reservation",
        client,
        subject: `Reserva ${statusLabel} — ${vehicle.name} — LOCAKAR`,
        html: emailLayout({
          title: `Reserva ${statusLabel}`,
          intro: `Olá, ${client.name}! Segue o resumo da sua reserva.`,
          rows: [
            ["Veículo", `${vehicle.name} · ${vehicle.plate}`],
            ["Retirada", formatDate(reservation.startDate)],
            ["Devolução", formatDate(reservation.endDate)],
            ["Situação", statusLabel],
          ],
          footerNote: reservation.status === "cancelled" ? undefined : "Na retirada, traga CNH e documento com foto.",
        }),
        whatsapp: `📅 *Reserva ${statusLabel}*\n\nOlá, ${first(client.name)}!\n• Veículo: ${vehicle.name} (${vehicle.plate})\n• Retirada: ${formatDate(reservation.startDate)}\n• Devolução: ${formatDate(reservation.endDate)}${reservation.status === "cancelled" ? "" : "\n\nNa retirada, traga CNH e documento com foto."}`,
      });
    }

    if (body.kind === "maintenance") {
      const maintenance = await one<Maintenance>("maintenance", body.maintenanceId);
      const vehicle = await one<FleetVehicle>("vehicles", maintenance.vehicleId);
      // Avisa quem está com o carro (locação ativa); sem locação ativa não há cliente a notificar.
      const { data } = await supabase.from("rentals").select("*").eq("vehicle_id", vehicle.id).in("status", ["active", "late"]).limit(1);
      if (!data?.[0]) throw new HttpError(422, "Este veículo não está com nenhum cliente no momento.");
      const rental = fromRow<Rental>(data[0]);
      const client = await one<Client>("clients", rental.clientId);
      return respond({
        kind: "maintenance",
        client,
        rentalId: rental.id,
        subject: `Manutenção agendada — ${vehicle.plate} — LOCAKAR`,
        html: emailLayout({
          title: "Manutenção do veículo",
          intro: `Olá, ${client.name}! O veículo que está com você tem uma manutenção programada.`,
          rows: [
            ["Veículo", `${vehicle.name} · ${vehicle.plate}`],
            ["Serviço", maintenance.description],
            ["Data", formatDate(maintenance.date)],
            ...(maintenance.supplier ? ([["Local", maintenance.supplier]] as [string, string][]) : []),
          ],
          footerNote: "Fale com a LOCAKAR pelo WhatsApp para combinar o horário.",
        }),
        whatsapp: `🔧 *Manutenção programada* — ${vehicle.plate}\n\nOlá, ${first(client.name)}! O veículo que está com você tem manutenção marcada:\n• Serviço: ${maintenance.description}\n• Data: ${formatDate(maintenance.date)}${maintenance.supplier ? `\n• Local: ${maintenance.supplier}` : ""}\n\nResponda aqui para combinarmos o horário.`,
      });
    }

    throw new HttpError(400, "Tipo de notificação inválido.");
  } catch (e) {
    return errorResponse(e);
  }
}

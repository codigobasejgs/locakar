import { COMPANY } from "@/lib/company";
import { FUEL_LABEL } from "@/lib/contract";
import { contractDocument, inspectionDocument } from "@/lib/documents";
import { emailLayout, sendEmail } from "@/lib/server/email";
import { HttpError, errorResponse, requireStaff } from "@/lib/server/supabase";
import { fromRow } from "@/repositories/mapping";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import type { Client, Contract, Fine, FleetVehicle, Inspection, Rental } from "@/types";

/**
 * Envio de e-mails transacionais pelo painel (somente equipe).
 * O servidor busca os dados no banco pelo ID: o navegador nunca define destinatário nem conteúdo.
 */
type Body =
  | { kind: "contract_signature"; contractId: string }
  | { kind: "delivery" | "return"; rentalId: string }
  | { kind: "receipt"; rentalId: string; receiptId: string }
  | { kind: "fine"; fineId: string };

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || COMPANY.siteUrl;

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
    const companyEmail: string | undefined = settings.data?.data?.company?.email || undefined;
    const needEmail = (client: Client) => {
      if (!client.email) throw new HttpError(422, `O cliente ${client.name} não tem e-mail cadastrado.`);
      return client.email;
    };

    if (body.kind === "contract_signature") {
      const contract = await one<Contract>("contracts", body.contractId);
      if (contract.status !== "pending") throw new HttpError(409, "Este contrato não está aguardando assinatura.");
      const to = contract.clientEmail;
      if (!to) throw new HttpError(422, "O cliente não tem e-mail cadastrado.");
      const url = `${siteUrl()}/assinar/${contract.token}`;
      await sendEmail(supabase, {
        kind: "contract_signature",
        to,
        replyTo: companyEmail,
        contractId: contract.id,
        rentalId: contract.rentalId,
        subject: "Contrato de locação LOCAKAR — assinatura pendente",
        html: emailLayout({
          title: "Seu contrato está pronto para assinatura",
          intro: `Olá, ${contract.clientName}! Revise o contrato de locação e assine digitalmente pelo botão abaixo. Você precisará confirmar seu CPF.`,
          cta: { label: "Revisar e assinar contrato", url },
          footerNote: `Link pessoal e intransferível, válido até ${formatDate(contract.expiresAt?.slice(0, 10))}. Se não reconhece esta locação, fale com a LOCAKAR pelo WhatsApp.`,
        }),
      });
      return Response.json({ ok: true, to });
    }

    if (body.kind === "delivery" || body.kind === "return") {
      const rental = await one<Rental>("rentals", body.rentalId);
      const client = await one<Client>("clients", rental.clientId);
      const vehicle = await one<FleetVehicle>("vehicles", rental.vehicleId);
      const inspection: Inspection | undefined = body.kind === "delivery" ? rental.deliveryInspection : rental.returnInspection;
      if (!inspection) throw new HttpError(409, "A vistoria ainda não foi registrada.");
      const to = needEmail(client);
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
      await sendEmail(supabase, {
        kind: body.kind,
        to,
        replyTo: companyEmail,
        rentalId: rental.id,
        subject: delivery ? `Entrega do veículo ${vehicle.plate} — LOCAKAR` : `Devolução do veículo ${vehicle.plate} — LOCAKAR`,
        html: emailLayout({
          title: delivery ? "Veículo entregue" : "Veículo devolvido",
          intro: delivery
            ? `Olá, ${client.name}! Registramos a entrega do veículo. Em anexo estão o termo de vistoria${attachments.length > 1 ? " e o contrato assinado" : ""}. Boa viagem!`
            : `Olá, ${client.name}! Registramos a devolução do veículo. O termo de vistoria segue em anexo. Obrigado por escolher a LOCAKAR!`,
          rows: [
            ["Veículo", `${vehicle.name} · ${vehicle.plate}`],
            ["Data e hora", new Date(inspection.at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })],
            ["Quilometragem", `${formatNumber(inspection.km)} km`],
            ["Combustível", FUEL_LABEL[inspection.fuel]],
            ...(inspection.extraCharges ? ([["Valores adicionais", formatCurrency(inspection.extraCharges)]] as [string, string][]) : []),
          ],
          footerNote: "Abra o anexo no navegador para visualizar ou salvar em PDF.",
        }),
        attachments,
      });
      return Response.json({ ok: true, to });
    }

    if (body.kind === "receipt") {
      const rental = await one<Rental>("rentals", body.rentalId);
      const receipt = rental.receipts.find((r) => r.id === body.receiptId);
      if (!receipt) throw new HttpError(404, "Recebimento não encontrado.");
      if (!receipt.paid) throw new HttpError(409, "Marque o recebimento como pago antes de enviar o comprovante.");
      const client = await one<Client>("clients", rental.clientId);
      const vehicle = await one<FleetVehicle>("vehicles", rental.vehicleId);
      const to = needEmail(client);
      const week = rental.receipts.indexOf(receipt) + 1;
      await sendEmail(supabase, {
        kind: "receipt",
        to,
        replyTo: companyEmail,
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
      });
      return Response.json({ ok: true, to });
    }

    if (body.kind === "fine") {
      const fine = await one<Fine>("fines", body.fineId);
      if (!fine.clientId) throw new HttpError(422, "A multa não está vinculada a um locatário.");
      const client = await one<Client>("clients", fine.clientId);
      const vehicle = await one<FleetVehicle>("vehicles", fine.vehicleId);
      const to = needEmail(client);
      await sendEmail(supabase, {
        kind: "fine",
        to,
        replyTo: companyEmail,
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
      });
      return Response.json({ ok: true, to });
    }

    throw new HttpError(400, "Tipo de e-mail inválido.");
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * Alertas automáticos por e-mail (puro, sem I/O — testado em scripts/check.ts).
 * Cada alerta tem uma `key` estável: o mesmo alerta só é reenviado após REMIND_DAYS,
 * para o cliente não receber o mesmo lembrete todos os dias.
 */
import type { Collections } from "@/repositories/types";
import type { CompanySettings } from "@/types";
import { addDays, daysBetween, formatCurrency, formatDate } from "./utils";

export type AlertGroup = "fine" | "receipt" | "maintenance" | "cnh" | "documents" | "contract" | "return" | "reservation";

export const GROUP_LABEL: Record<AlertGroup, string> = {
  fine: "Multas",
  receipt: "Recebimentos em atraso",
  maintenance: "Manutenções",
  cnh: "CNH de clientes",
  documents: "IPVA e licenciamento",
  contract: "Contratos sem assinatura",
  return: "Devoluções atrasadas",
  reservation: "Reservas próximas",
};

export interface Notice {
  key: string;
  group: AlertGroup;
  urgent: boolean;
  /** Linha no resumo diário da empresa. */
  adminText: string;
  /** Cliente que recebe o aviso (ausente = só a empresa, ex.: manutenção, IPVA). */
  clientId?: string;
  clientText?: string;
}

/** Dias antes do evento em que o cliente é lembrado, e intervalo mínimo entre lembretes iguais. */
export const RESERVATION_NOTICE_DAYS = 3;
export const CONTRACT_REMIND_AFTER_DAYS = 2;
export const REMIND_DAYS = 3;

export function buildNotices(data: Collections, settings: CompanySettings, today: string): Notice[] {
  const horizon = addDays(today, settings.alertWindowDays);
  const within = (iso?: string) => !!iso && iso <= horizon;
  const clientName = (id?: string) => data.clients.find((c) => c.id === id)?.name ?? "cliente";
  const plate = (id: string) => data.vehicles.find((v) => v.id === id)?.plate ?? "";
  const out: Notice[] = [];

  if (settings.notifyFines) {
    for (const f of data.fines) {
      if (f.status === "paid" || f.status === "contested") continue;
      if (f.status === "identify" && within(f.driverIdDeadline)) {
        const past = f.driverIdDeadline! < today;
        out.push({
          key: `fine-id:${f.id}`,
          group: "fine",
          urgent: past,
          adminText: `Identificar condutor · ${plate(f.vehicleId)} · auto ${f.noticeNumber} · prazo ${formatDate(f.driverIdDeadline)}${past ? " (encerrado)" : ""}`,
          clientId: f.clientId,
          clientText: `Precisamos que você confirme a identificação do condutor da multa ${f.noticeNumber} (${f.description}) até ${formatDate(f.driverIdDeadline)}.`,
        });
      }
      if (within(f.dueDate)) {
        const past = f.dueDate < today;
        out.push({
          key: `fine-due:${f.id}`,
          group: "fine",
          urgent: past,
          adminText: `${past ? "Multa vencida" : "Multa a vencer"} · ${plate(f.vehicleId)} · ${formatCurrency(f.amount)} · vencimento ${formatDate(f.dueDate)}`,
          clientId: f.clientId,
          clientText: `${past ? "Está vencida" : "Vence em " + formatDate(f.dueDate)} a multa ${f.noticeNumber} (${f.description}), no valor de ${formatCurrency(f.amount)}.${
            f.discountDeadline && f.discountDeadline >= today ? ` Pagamento com desconto até ${formatDate(f.discountDeadline)}.` : ""
          }`,
        });
      }
    }
  }

  if (settings.notifyReceipts) {
    for (const r of data.rentals) {
      if (r.status === "cancelled") continue;
      const late = r.receipts.filter((x) => !x.paid && x.dueDate < today);
      if (!late.length) continue;
      const total = late.reduce((a, x) => a + x.amount, 0);
      out.push({
        key: `receipt:${r.id}:${late.length}`,
        group: "receipt",
        urgent: true,
        adminText: `Recebimento em atraso · ${clientName(r.clientId)} · ${late.length} semana(s) · ${formatCurrency(total)}`,
        clientId: r.clientId,
        clientText: `Identificamos ${late.length} pagamento(s) semanal(is) em aberto da sua locação, totalizando ${formatCurrency(total)} (desde ${formatDate(late[0].dueDate)}).`,
      });
    }
  }

  if (settings.notifyMaintenance) {
    for (const m of data.maintenance) {
      if (m.status === "done" || !within(m.date)) continue;
      out.push({
        key: `maintenance:${m.id}`,
        group: "maintenance",
        urgent: m.date < today,
        adminText: `Manutenção · ${plate(m.vehicleId)} · ${m.description} · ${formatDate(m.date)}${m.date < today ? " (atrasada)" : ""}`,
      });
    }
  }

  for (const c of data.clients) {
    if (!within(c.cnhExpiry)) continue;
    const past = c.cnhExpiry! < today;
    out.push({
      key: `cnh:${c.id}:${c.cnhExpiry}`,
      group: "cnh",
      urgent: past,
      adminText: `${past ? "CNH vencida" : "CNH a vencer"} · ${c.name} · ${formatDate(c.cnhExpiry)}`,
      clientId: c.id,
      clientText: past
        ? `Sua CNH venceu em ${formatDate(c.cnhExpiry)}. Envie a CNH renovada para mantermos seu cadastro ativo.`
        : `Sua CNH vence em ${formatDate(c.cnhExpiry)}. Lembre-se de renová-la e nos enviar a nova via.`,
    });
  }

  for (const v of data.vehicles) {
    if (v.status === "sold" || (v.ipvaStatus === "paid" && v.licensingStatus === "paid")) continue;
    const parts = [v.ipvaStatus !== "paid" && "IPVA", v.licensingStatus !== "paid" && `licenciamento (${v.licensingMonth ?? "—"})`].filter(Boolean);
    out.push({
      key: `documents:${v.id}:${v.ipvaStatus}:${v.licensingStatus}`,
      group: "documents",
      urgent: v.ipvaStatus === "late" || v.licensingStatus === "late",
      adminText: `Documentação pendente · ${v.plate} · ${parts.join(" e ")}`,
    });
  }

  for (const c of data.contracts ?? []) {
    if (c.status !== "pending" || !c.issuedAt) continue;
    const days = daysBetween(c.issuedAt.slice(0, 10), today);
    if (days < CONTRACT_REMIND_AFTER_DAYS) continue;
    const rental = data.rentals.find((r) => r.id === c.rentalId);
    out.push({
      key: `contract:${c.id}`,
      group: "contract",
      urgent: days >= 7,
      adminText: `Contrato sem assinatura há ${days} dia(s) · ${c.clientName}`,
      clientId: rental?.clientId,
      clientText: "Seu contrato de locação ainda aguarda assinatura. Use o link enviado no e-mail anterior ou fale com a LOCAKAR para receber um novo.",
    });
  }

  for (const r of data.rentals) {
    if (r.status === "cancelled" || r.status === "finished" || r.returnInspection || r.endDate >= today) continue;
    out.push({
      key: `return:${r.id}`,
      group: "return",
      urgent: true,
      adminText: `Devolução atrasada · ${clientName(r.clientId)} · ${plate(r.vehicleId)} · previsto ${formatDate(r.endDate)}`,
      clientId: r.clientId,
      clientText: `A devolução do veículo ${plate(r.vehicleId)} estava prevista para ${formatDate(r.endDate)}. Entre em contato para combinarmos a devolução ou a renovação.`,
    });
  }

  for (const r of data.reservations) {
    if (r.status !== "pending" && r.status !== "confirmed") continue;
    const days = daysBetween(today, r.startDate);
    if (days < 0 || days > RESERVATION_NOTICE_DAYS) continue;
    out.push({
      key: `reservation:${r.id}:${r.startDate}`,
      group: "reservation",
      urgent: false,
      adminText: `Reserva ${days === 0 ? "hoje" : `em ${days} dia(s)`} · ${clientName(r.clientId)} · ${plate(r.vehicleId)} · ${formatDate(r.startDate)}${r.status === "pending" ? " (pendente)" : ""}`,
      clientId: r.clientId,
      clientText: `Lembrete: sua reserva do veículo ${plate(r.vehicleId)} começa ${days === 0 ? "hoje" : `em ${formatDate(r.startDate)}`}. Traga CNH e documento com foto na retirada.`,
    });
  }

  return out.sort((a, b) => Number(b.urgent) - Number(a.urgent));
}

/** Tira os alertas já enviados nos últimos REMIND_DAYS (chaves registradas em email_log.alert_keys). */
export function dueForClient(notices: Notice[], sentRecently: Set<string>) {
  return notices.filter((n) => n.clientId && n.clientText && !sentRecently.has(n.key));
}

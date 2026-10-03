import { Badge, type BadgeTone } from "../ui/Badge";
import type { Installment } from "../../services/api";

/** Situação da parcela para o cliente. "Em análise" = comprovante enviado, aguardando a LOCAKAR. */
export function installmentStatus(i: Installment): { label: string; tone: BadgeTone } {
  if (i.paid) return { label: "Pago", tone: "success" };
  if (i.proofStatus === "pending_review") return { label: "Em análise", tone: "info" };
  if (i.proofStatus === "rejected") return { label: "Comprovante recusado", tone: "danger" };
  if (i.late) return { label: "Vencido", tone: "danger" };
  return { label: "A pagar", tone: "warning" };
}

export function InstallmentBadge({ installment }: { installment: Installment }) {
  const s = installmentStatus(installment);
  return <Badge label={s.label} tone={s.tone} />;
}

/** Próxima parcela que o cliente precisa pagar (vencida ou a vencer, sem comprovante em análise). */
export const nextToPay = (list: Installment[]) => list.find((i) => !i.paid && i.proofStatus !== "pending_review") ?? null;

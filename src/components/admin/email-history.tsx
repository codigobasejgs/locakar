"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { useAdminData } from "@/hooks/use-admin-data";
import type { EmailKind, EmailLog } from "@/types";

export const EMAIL_KIND_LABEL: Record<EmailKind, string> = {
  contract_signature: "Link de assinatura",
  contract_signed: "Contrato assinado",
  delivery: "Termo de entrega",
  return: "Termo de devolução",
  receipt: "Comprovante de pagamento",
  fine: "Notificação de multa",
};

/** Histórico de e-mails enviados (tabela email_log), filtrável por locação/multa. */
export function EmailHistory({ filter, title = "E-mails enviados" }: { filter?: (e: EmailLog) => boolean; title?: string }) {
  const { data } = useAdminData();
  const list = (data!.emails ?? [])
    .filter((e) => !filter || filter(e))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .slice(0, 20);

  return (
    <Card>
      <CardHeader title={title} description="Registro de cada envio pelo Resend." />
      {list.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted">Nenhum e-mail enviado ainda.</p>
      ) : (
        <ul className="divide-y divide-line px-5 pb-3">
          {list.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="block font-medium">{EMAIL_KIND_LABEL[e.kind] ?? e.kind}</span>
                <span className="block truncate text-xs text-muted">
                  {e.toEmail} · {e.createdAt ? new Date(e.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : ""}
                </span>
                {e.error && <span className="block text-xs text-red-300">{e.error}</span>}
              </span>
              <Badge tone={e.status === "sent" ? "success" : "danger"}>{e.status === "sent" ? "Enviado" : "Falhou"}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

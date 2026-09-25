"use client";

import { ChevronLeft, CircleDollarSign, Clock, Gauge, Pencil, Printer } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { DetailList, PageHeader } from "@/components/admin/page-header";
import { RentalForm, emptyRentalDraft, rentalToDraft } from "@/components/admin/rental-form";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, EmptyState, StatCard } from "@/components/ui/card";
import { useAdminData, useLookups } from "@/hooks/use-admin-data";
import { useCrud } from "@/hooks/use-crud";
import { rentalDays, rentalKm, rentalPending, rentalReceived } from "@/lib/analytics";
import { RENTAL_STATUS, ROUTES } from "@/lib/constants";
import { formatCurrency, formatDate, formatNumber, hideCPF, todayISO } from "@/lib/utils";

export default function RentalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, update } = useAdminData();
  const { clientById, vehicleById } = useLookups();
  const crud = useCrud("rentals", { empty: emptyRentalDraft, toDraft: rentalToDraft, noun: "Locação" });
  const rental = data!.rentals.find((r) => r.id === id);
  const today = todayISO();

  if (!rental) {
    return (
      <Card>
        <EmptyState title="Locação não encontrada" description="Ela pode ter sido excluída." />
        <div className="pb-8 text-center">
          <Button asChild variant="outline">
            <Link href={ROUTES.rentals}>Voltar para locações</Link>
          </Button>
        </div>
      </Card>
    );
  }

  const client = clientById.get(rental.clientId);
  const vehicle = vehicleById.get(rental.vehicleId);
  const received = rentalReceived(rental);
  const pending = rentalPending(rental, today);
  const km = rentalKm(rental);

  const toggleReceipt = async (receiptId: string) => {
    const receipts = rental.receipts.map((r) => (r.id === receiptId ? { ...r, paid: !r.paid } : r));
    if (await update("rentals", rental.id, { receipts })) toast.success("Recebimento atualizado.");
  };

  return (
    <>
      <Link href={ROUTES.rentals} className="no-print mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white">
        <ChevronLeft className="size-4" /> Locações
      </Link>
      <PageHeader
        title={client?.name ?? "Locação"}
        description={`${vehicle ? `${vehicle.name} · ${vehicle.plate}` : "Veículo removido"} · ${rental.contractType}`}
        actions={
          <>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer /> Imprimir
            </Button>
            <Button onClick={() => crud.openEdit(rental)}>
              <Pencil /> Editar
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Status" value={<StatusBadge map={RENTAL_STATUS} value={rental.status} />} icon={Clock} accent />
        <StatCard label="Total recebido" value={formatCurrency(received)} icon={CircleDollarSign} hint="total por locatário" />
        <StatCard label="Em atraso" value={formatCurrency(pending)} icon={Clock} />
        <StatCard label="KM rodado" value={km != null ? `${formatNumber(km)} km` : "—"} icon={Gauge} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <Card className="p-5">
          <h2 className="mb-4 font-display text-base font-semibold">Contrato</h2>
          <DetailList
            items={[
              { label: "Período inicial", value: `${formatDate(rental.startDate)} ${rental.startTime ?? ""}` },
              { label: "Período final", value: `${formatDate(rental.endDate)} ${rental.endTime ?? ""}` },
              { label: "Quantidade de diárias", value: rentalDays(rental) },
              { label: "Dia de pagamento", value: rental.paymentWeekday },
              { label: "Valor semanal", value: formatCurrency(rental.weeklyRate) },
              { label: "Caução", value: formatCurrency(rental.deposit) },
              { label: "KM inicial", value: formatNumber(rental.kmStart) },
              { label: "KM final", value: formatNumber(rental.kmEnd) },
              { label: "Telefone do locatário", value: client?.phone },
              { label: "CPF", value: client ? hideCPF(client.cpf) : "—" },
              { label: "Observação", value: rental.notes, wide: true },
            ]}
          />
        </Card>

        <Card>
          <CardHeader title="Recebimentos semanais" description="Clique para marcar como pago / em aberto." />
          <ul className="grid gap-2 p-5 sm:grid-cols-2">
            {rental.receipts.length === 0 && <li className="text-sm text-muted">Nenhum recebimento gerado.</li>}
            {rental.receipts.map((r, i) => {
              const late = !r.paid && r.dueDate < today;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => toggleReceipt(r.id)}
                    aria-pressed={r.paid}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-white/[0.02] px-3 py-2.5 text-left text-sm transition-colors hover:border-line-strong hover:bg-white/[0.04]"
                  >
                    <span>
                      <span className="block font-medium">Semana {i + 1}</span>
                      <span className="block text-xs text-muted">
                        {formatDate(r.dueDate)} · {formatCurrency(r.amount)}
                      </span>
                    </span>
                    <Badge tone={r.paid ? "success" : late ? "danger" : "neutral"}>{r.paid ? "Pago" : late ? "Atrasado" : "A receber"}</Badge>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <RentalForm crud={crud} />
    </>
  );
}

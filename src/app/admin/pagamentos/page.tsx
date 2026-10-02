"use client";

import {
  CheckCircle2,
  CircleDollarSign,
  Receipt as ReceiptIcon,
  RotateCcw,
  Search,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/page-header";
import { PaymentActionsSheet, type UnifiedPaymentItem } from "@/components/admin/payment-actions-sheet";
import { PaymentCard } from "@/components/admin/payment-card";
import { PaymentDetailsDialog } from "@/components/admin/payment-details-dialog";
import { PaymentEditDialog } from "@/components/admin/payment-edit-dialog";
import { PaymentSettleDialog } from "@/components/admin/payment-settle-dialog";
import { InfinitePayDialog } from "@/components/admin/infinitepay-dialog";
import { AsaasChargeDialog, asaasApi, releaseAsaasCharge, type AsaasCharge, type AsaasPanelConfig } from "@/components/admin/asaas-charge-dialog";
import { isSupabaseEnabled } from "@/lib/supabase/env";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Card, EmptyState, StatCard } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { useAdminData, useLookups } from "@/hooks/use-admin-data";
import { billingOf, chargeFor, lateCharges } from "@/lib/billing";
import { formatCurrency, formatDate, parseISODate, toWhatsAppNumber, todaySP } from "@/lib/utils";

export default function PagamentosPage() {
  const { data, settings, update, reload } = useAdminData();
  const { clientById, vehicleById } = useLookups();
  const today = todaySP();

  // Estados de Filtros e Busca
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "overdue" | "paid" | "cancelled">("all");
  const [dueFilter, setDueFilter] = useState<"all" | "today" | "tomorrow" | "overdue" | "future">("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"smart" | "due_asc" | "due_desc" | "amount_desc">("smart");

  // Estados dos Modais de Ação
  const [settleTarget, setSettleTarget] = useState<UnifiedPaymentItem | null>(null);
  const [editTarget, setEditTarget] = useState<UnifiedPaymentItem | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<UnifiedPaymentItem | null>(null);
  const [moreTarget, setMoreTarget] = useState<UnifiedPaymentItem | null>(null);
  const [cancellingTarget, setCancellingTarget] = useState<UnifiedPaymentItem | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [deletingTarget, setDeletingTarget] = useState<UnifiedPaymentItem | null>(null);
  const [infinitePayTarget, setInfinitePayTarget] = useState<UnifiedPaymentItem | null>(null);
  const infinitePay = settings.infinitepay;
  // Asaas (opcional): config pública + última cobrança Asaas por parcela. Sem migration/desligado = fluxo atual.
  const [asaas, setAsaas] = useState<{ config: AsaasPanelConfig; charges: Record<string, AsaasCharge> } | null>(null);
  const [asaasTarget, setAsaasTarget] = useState<UnifiedPaymentItem | null>(null);
  const loadAsaas = useCallback(() => {
    if (!isSupabaseEnabled) return;
    fetch("/api/asaas/charges", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setAsaas(j))
      .catch(() => {});
  }, []);
  useEffect(loadAsaas, [loadAsaas]);
  const asaasOn = Boolean(asaas?.config.ready);
  const asaasOpen = (p: UnifiedPaymentItem) => p.asaas?.status === "link_created" || p.asaas?.status === "started";
  const releaseAsaas = async (p: UnifiedPaymentItem, reason: string) => {
    if (!asaasOpen(p)) return;
    await releaseAsaasCharge(p.rentalId, p.id, reason);
    loadAsaas();
  };

  // Mapeia todas as parcelas das locações existentes em uma lista unificada
  const allPayments = useMemo<UnifiedPaymentItem[]>(() => {
    if (!data) return [];
    return data.rentals.flatMap((r) => {
      const client = clientById.get(r.clientId);
      const vehicle = vehicleById.get(r.vehicleId);
      const billing = billingOf(r);

      return r.receipts.map((rc, idx) => {
        const isLate = !rc.paid && !rc.cancelled && rc.dueDate < today;
        const lateCh = isLate ? lateCharges(rc.amount, rc.dueDate, today, billing) : undefined;
        let weekday = "";
        try {
          weekday = parseISODate(rc.dueDate).toLocaleDateString("pt-BR", { weekday: "long" });
        } catch {
          weekday = "—";
        }

        let status: UnifiedPaymentItem["status"] = "open";
        if (rc.cancelled) status = "cancelled";
        else if (rc.paid) status = "paid";
        else if (isLate) status = "overdue";

        return {
          id: rc.id,
          rentalId: r.id,
          rental: r,
          clientId: r.clientId,
          clientName: client?.name ?? "Locatário",
          clientCpf: client?.cpf ?? "—",
          clientPhone: client?.phone ?? "",
          vehicleName: vehicle?.name ?? "Veículo",
          vehiclePlate: vehicle?.plate ?? "—",
          dueDate: rc.dueDate,
          weekday,
          amount: rc.amount,
          paid: rc.paid,
          paidAt: rc.paidAt,
          amountPaid: rc.amountPaid,
          paymentMethod: rc.paymentMethod,
          description: rc.description || `Aluguel (${idx + 1}ª parcela)`,
          notes: rc.notes,
          proofUrl: rc.proofUrl,
          cancelled: rc.cancelled,
          cancelReason: rc.cancelReason,
          status,
          lateCharges: lateCh,
          asaas: (() => {
            const t = asaas?.charges[`${r.id}:${rc.id}`];
            return t ? { id: t.id, status: t.status, providerStatus: t.provider_status, providerPaymentId: t.provider_payment_id, billingType: t.billing_type, invoiceUrl: t.invoice_url } : undefined;
          })(),
        };
      });
    });
  }, [data, clientById, vehicleById, today, asaas]);

  // Indicadores de Resumo Financeiro (calculados sobre os dados reais)
  const totals = useMemo(() => {
    let emAberto = 0;
    let recebido = 0;
    let vencido = 0;
    let total = 0;

    for (const p of allPayments) {
      if (p.cancelled) continue;
      if (p.paid) {
        recebido += p.amountPaid ?? p.amount;
        total += p.amountPaid ?? p.amount;
      } else if (p.status === "overdue") {
        const val = p.lateCharges?.total ?? p.amount;
        vencido += val;
        total += val;
      } else {
        emAberto += p.amount;
        total += p.amount;
      }
    }

    return { emAberto, recebido, vencido, total };
  }, [allPayments]);

  // Filtragem e Busca
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const [y, m, d] = today.split("-").map(Number);
    const tomorrow = new Date(y, m - 1, d + 1).toISOString().slice(0, 10);

    return allPayments.filter((p) => {
      // 1. Busca por texto
      if (q) {
        const match =
          p.clientName.toLowerCase().includes(q) ||
          p.clientCpf.includes(q) ||
          p.vehiclePlate.toLowerCase().includes(q) ||
          p.vehicleName.toLowerCase().includes(q) ||
          p.rentalId.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q);
        if (!match) return false;
      }

      // 2. Filtro de Status
      if (statusFilter !== "all" && p.status !== statusFilter) return false;

      // 3. Filtro de Vencimento
      if (dueFilter === "today" && p.dueDate !== today) return false;
      if (dueFilter === "tomorrow" && p.dueDate !== tomorrow) return false;
      if (dueFilter === "overdue" && p.status !== "overdue") return false;
      if (dueFilter === "future" && p.dueDate <= today) return false;

      // 4. Filtro de Forma de Pagamento
      if (methodFilter !== "all" && p.paymentMethod !== methodFilter) return false;

      return true;
    });
  }, [allPayments, search, statusFilter, dueFilter, methodFilter, today]);

  // Ordenação
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortBy === "due_asc") return a.dueDate.localeCompare(b.dueDate);
      if (sortBy === "due_desc") return b.dueDate.localeCompare(a.dueDate);
      if (sortBy === "amount_desc") return b.amount - a.amount;

      // Ordenação inteligente padrão da referência:
      // 1. Vencidos primeiro
      // 2. Vencendo hoje
      // 3. Em aberto futuros (asc)
      // 4. Pagos por último (desc)
      // 5. Cancelados
      const rank = (p: UnifiedPaymentItem) => {
        if (p.cancelled) return 5;
        if (p.status === "paid") return 4;
        if (p.status === "overdue") return 1;
        if (p.dueDate === today) return 2;
        return 3;
      };

      const rA = rank(a);
      const rB = rank(b);
      if (rA !== rB) return rA - rB;
      if (rA === 4) return (b.paidAt || b.dueDate).localeCompare(a.paidAt || a.dueDate);
      return a.dueDate.localeCompare(b.dueDate);
    });
  }, [filtered, sortBy, today]);

  // Ação: Dar Baixa
  const handleSettle = async (patchData: {
    amountPaid: number;
    paidAt: string;
    paymentMethod: string;
    notes?: string;
    proofUrl?: string;
  }) => {
    if (!settleTarget) return;
    const rental = settleTarget.rental;
    const receipts = rental.receipts.map((r) => {
      if (r.id === settleTarget.id) {
        return {
          ...r,
          paid: true,
          paidAt: patchData.paidAt,
          amountPaid: patchData.amountPaid,
          paymentMethod: patchData.paymentMethod,
          notes: patchData.notes,
          proofUrl: patchData.proofUrl,
        };
      }
      return r;
    });

    const ok = await update("rentals", rental.id, { receipts });
    if (!ok) throw new Error("Não foi possível salvar o pagamento.");
    toast.success("Pagamento baixado com sucesso!");
    await releaseAsaas(settleTarget, "baixa manual");
  };

  // Ação: Editar
  const handleEdit = async (editData: {
    amount: number;
    dueDate: string;
    description: string;
    paymentMethod?: string;
    notes?: string;
  }) => {
    if (!editTarget) return;
    const rental = editTarget.rental;
    const receipts = rental.receipts.map((r) => {
      if (r.id === editTarget.id) {
        return {
          ...r,
          amount: editData.amount,
          dueDate: editData.dueDate,
          description: editData.description,
          paymentMethod: editData.paymentMethod,
          notes: editData.notes,
        };
      }
      return r;
    });

    const ok = await update("rentals", rental.id, { receipts });
    if (!ok) throw new Error("Não foi possível salvar as alterações.");
    const open = editTarget.asaas?.status === "link_created" ? editTarget.asaas : null;
    if (open && (editData.amount !== editTarget.amount || editData.dueDate !== editTarget.dueDate)) {
      await asaasApi({ action: "sync", id: open.id }).then(
        () => toast.success("Cobrança Asaas atualizada com o novo valor/vencimento."),
        (e) => toast.error(`Parcela salva, mas a cobrança Asaas não foi atualizada: ${(e as Error).message}`),
      );
      loadAsaas();
    }
  };

  // Ação: Cobrar — Asaas ativo (ou parcela com cobrança Asaas aberta) abre o modal; senão mantém o WhatsApp atual.
  const handleCharge = (p: UnifiedPaymentItem) => {
    if (asaasOn || p.asaas?.status === "link_created") setAsaasTarget(p);
    else handleChargeWhatsApp(p);
  };
  const asaasInvoice = (p: UnifiedPaymentItem) => {
    const url = p.asaas?.invoiceUrl;
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => toast.success("Link da fatura copiado."), () => window.open(url, "_blank", "noopener"));
  };
  const asaasReconcile = async (p: UnifiedPaymentItem) => {
    if (!p.asaas) return;
    try {
      const r = await asaasApi<{ charge: AsaasCharge }>({ action: "reconcile", id: p.asaas.id });
      toast.success("Status Asaas atualizado.");
      loadAsaas();
      if (r.charge.status !== p.asaas.status) reload("rentals", p.rentalId);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // Ação: Cobrar pelo WhatsApp
  const handleChargeWhatsApp = (p: UnifiedPaymentItem) => {
    const rawPhone = p.clientPhone;
    const waPhone = toWhatsAppNumber(rawPhone);
    if (!waPhone) {
      return toast.error(`O cliente ${p.clientName} não possui um telefone/WhatsApp cadastrado.`);
    }

    const expectedAmount = p.lateCharges?.total ?? p.amount;
    const chargeInfo = settings?.pix.key ? chargeFor(p.rental, p.id, settings.pix, today) : null;

    const lines = [
      `Olá, ${p.clientName.split(" ")[0]}.`,
      "",
      "Identificamos uma cobrança referente à sua locação.",
      "",
      `Veículo: ${p.vehiclePlate}`,
      `Vencimento: ${formatDate(p.dueDate)}`,
      `Valor: ${formatCurrency(expectedAmount)}`,
      "",
      "Caso já tenha realizado o pagamento, desconsidere esta mensagem.",
      "",
      "LOCAKAR – Locadora de Veículos",
    ];

    if (chargeInfo?.code) {
      lines.push("");
      lines.push("PIX Copia e Cola:");
      lines.push(chargeInfo.code);
    }

    const url = `https://wa.me/${waPhone}?text=${encodeURIComponent(lines.join("\n"))}`;
    window.open(url, "_blank");
  };

  // Ação: Cancelar Pagamento
  const handleConfirmCancel = async () => {
    if (!cancellingTarget) return;
    const rental = cancellingTarget.rental;
    const receipts = rental.receipts.map((r) => {
      if (r.id === cancellingTarget.id) {
        return {
          ...r,
          paid: false,
          cancelled: true,
          cancelledAt: today,
          cancelReason: cancelReason.trim() || "Cancelado pela equipe",
        };
      }
      return r;
    });

    const ok = await update("rentals", rental.id, { receipts });
    if (ok) {
      toast.success("Pagamento cancelado.");
      await releaseAsaas(cancellingTarget, "parcela cancelada");
      setCancellingTarget(null);
      setCancelReason("");
    }
  };

  // Ação: Excluir Pagamento
  const handleConfirmDelete = async () => {
    if (!deletingTarget) return;
    const rental = deletingTarget.rental;
    const receipts = rental.receipts.filter((r) => r.id !== deletingTarget.id);
    const ok = await update("rentals", rental.id, { receipts });
    if (ok) {
      toast.success("Pagamento excluído da locação.");
      await releaseAsaas(deletingTarget, "parcela excluída");
      setDeletingTarget(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Pagamentos"
        description="Controle de cobranças e recebimentos das locações."
      />

      {/* Indicadores do Resumo Financeiro (valores reais calculados) */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Em aberto"
          value={formatCurrency(totals.emAberto)}
          icon={CircleDollarSign}
          hint="a vencer"
        />
        <StatCard
          label="Recebido"
          value={formatCurrency(totals.recebido)}
          icon={CheckCircle2}
          hint="total pago"
          accent={totals.recebido > 0}
        />
        <StatCard
          label="Vencido"
          value={formatCurrency(totals.vencido)}
          icon={TriangleAlert}
          hint="com juros e multa"
          accent={totals.vencido > 0}
        />
        <StatCard
          label="Total"
          value={formatCurrency(totals.total)}
          icon={ReceiptIcon}
          hint="saldo de contratos"
        />
      </div>

      {/* Barra de Filtros e Busca */}
      <Card className="mb-6 p-4">
        <div className="flex flex-col gap-3">
          {/* Linha 1: Input de Busca + Ordenação */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <Input
                placeholder="Buscar por cliente, CPF, placa, contrato ou descrição..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase text-muted shrink-0">Ordenar:</span>
              <Select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="w-44 text-xs"
                options={[
                  { value: "smart", label: "Prioridade (Vencidos primeiro)" },
                  { value: "due_asc", label: "Vencimento (Mais antigo)" },
                  { value: "due_desc", label: "Vencimento (Mais recente)" },
                  { value: "amount_desc", label: "Maior valor" },
                ]}
              />
            </div>
          </div>

          {/* Linha 2: Filtros de Status & Vencimento */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 font-semibold uppercase text-muted">Status:</span>
              {(
                [
                  ["all", "Todos"],
                  ["open", "Em aberto"],
                  ["overdue", "Vencidos"],
                  ["paid", "Pagos"],
                  ["cancelled", "Cancelados"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStatusFilter(key)}
                  className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${statusFilter === key ? "bg-magenta/25 text-white ring-1 ring-magenta/40" : "text-muted hover:text-white"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-muted">Vencimento:</span>
                <select
                  value={dueFilter}
                  onChange={(e) => setDueFilter(e.target.value as typeof dueFilter)}
                  className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs text-white"
                >
                  <option value="all">Todos os vencimentos</option>
                  <option value="today">Vencendo hoje</option>
                  <option value="tomorrow">Vencendo amanhã</option>
                  <option value="overdue">Vencidos</option>
                  <option value="future">Futuros</option>
                </select>
              </div>

              {(search || statusFilter !== "all" || dueFilter !== "all" || methodFilter !== "all") && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("all");
                    setDueFilter("all");
                    setMethodFilter("all");
                  }}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-brand-soft hover:underline"
                >
                  <RotateCcw className="size-3" /> Limpar filtros
                </button>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Lista de Cards de Pagamento (layout das imagens #17 e #18) */}
      {!sorted.length ? (
        <Card>
          <EmptyState
            title="Nenhum pagamento encontrado"
            description="Não encontramos cobranças para os filtros selecionados."
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((payment) => (
            <PaymentCard
              key={`${payment.rentalId}-${payment.id}`}
              payment={payment}
              onSettle={(p) => setSettleTarget(p)}
              onEdit={(p) => setEditTarget(p)}
              onCharge={handleCharge}
              onMore={(p) => setMoreTarget(p)}
            />
          ))}
        </div>
      )}

      {/* 1. Modal: Dar Baixa no Pagamento */}
      <PaymentSettleDialog
        key={settleTarget?.id ?? "none-settle"}
        payment={settleTarget}
        onClose={() => setSettleTarget(null)}
        onSuccess={handleSettle}
      />

      {/* 2. Modal: Editar Pagamento */}
      <PaymentEditDialog
        key={editTarget?.id ?? "none-edit"}
        payment={editTarget}
        onClose={() => setEditTarget(null)}
        onSuccess={handleEdit}
      />

      {/* 3. Modal: Ver Detalhes */}
      <PaymentDetailsDialog
        payment={detailsTarget}
        onClose={() => setDetailsTarget(null)}
      />

      {/* 4. Bottom Sheet: Menu "Mais" (conforme imagem #18) */}
      <PaymentActionsSheet
        payment={moreTarget}
        company={settings.company}
        onClose={() => setMoreTarget(null)}
        onSettle={(p) => setSettleTarget(p)}
        onEdit={(p) => setEditTarget(p)}
        onCharge={handleCharge}
        onCancel={(p) => setCancellingTarget(p)}
        onDelete={(p) => setDeletingTarget(p)}
        onViewDetails={(p) => setDetailsTarget(p)}
        onInfinitePay={infinitePay?.enabled ? (p) => setInfinitePayTarget(p) : undefined}
        onAsaas={asaas && (asaasOn || Object.keys(asaas.charges).length) ? (p) => setAsaasTarget(p) : undefined}
        onAsaasInvoice={asaasInvoice}
        onAsaasReconcile={asaasReconcile}
      />

      {/* Cobrança Asaas (modal Cobrar / detalhes) */}
      {asaas && asaasTarget && (
        <AsaasChargeDialog
          key={asaasTarget.id}
          payment={asaasTarget}
          config={asaas.config}
          existing={asaas.charges[`${asaasTarget.rentalId}:${asaasTarget.id}`] ?? null}
          onClose={() => setAsaasTarget(null)}
          onChanged={(c, paid) => {
            setAsaas((a) => (a ? { ...a, charges: { ...a.charges, [`${asaasTarget.rentalId}:${asaasTarget.id}`]: c } } : a));
            if (paid) reload("rentals", asaasTarget.rentalId);
          }}
        />
      )}

      {/* 5. Receber com InfinitePay */}
      {infinitePay?.enabled && (
        <InfinitePayDialog
          key={infinitePayTarget?.id ?? "none-ip"}
          payment={infinitePayTarget}
          config={infinitePay}
          onClose={() => setInfinitePayTarget(null)}
          onPaid={() => infinitePayTarget && reload("rentals", infinitePayTarget.rentalId)}
        />
      )}

      {/* Confirmação de Cancelamento */}
      <ConfirmDialog
        open={!!cancellingTarget}
        onOpenChange={(o) => !o && setCancellingTarget(null)}
        title="Cancelar pagamento?"
        description="Esta ação registrará o cancelamento lógico da parcela no histórico sem apagar a locação."
        confirmLabel="Confirmar cancelamento"
        onConfirm={handleConfirmCancel}
      />

      {/* Confirmação de Exclusão */}
      <ConfirmDialog
        open={!!deletingTarget}
        onOpenChange={(o) => !o && setDeletingTarget(null)}
        title="Excluir pagamento da locação?"
        description="A parcela será removida definitivamente da grade da locação. Esta ação não pode ser desfeita."
        confirmLabel="Excluir parcela"
        onConfirm={handleConfirmDelete}
      />
    </>
  );
}

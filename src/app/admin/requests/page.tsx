"use client";

import { AlertCircle, CheckCircle2, Clock, ExternalLink, Eye, FileCheck, XCircle } from "lucide-react";
import Image from "next/image";
import { Suspense, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/page-header";
import { tenantAdminGet, tenantAdminPost, when } from "@/components/admin/tenant-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, StatCard } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useAdminData } from "@/hooks/use-admin-data";
import { formatCurrency, formatDate } from "@/lib/utils";

interface AdminRentalRequest {
  id: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  clientCpf: string;
  clientCode: number | null;
  vehicleId: string;
  vehicleName: string;
  vehiclePlate: string;
  vehicleImage: string | null;
  vehicleStatus: string;
  startDate: string;
  endDate: string;
  planType: string;
  rateAmount: number;
  depositAmount: number;
  cnhNumber: string | null;
  cnhCategory: string | null;
  cnhExpiry: string | null;
  status: "pending" | "approved" | "rejected" | "correction_requested";
  rejectionReason: string | null;
  correctionNotes: string | null;
  createdRentalId: string | null;
  createdAt: string;
  cnhFrontUrl: string | null;
  cnhBackUrl: string | null;
  addressProofUrl: string | null;
  selfieUrl: string | null;
}

const STATUS_CONFIG = {
  pending: { label: "Em análise", tone: "warning" as const },
  approved: { label: "Aprovada", tone: "success" as const },
  rejected: { label: "Não aprovada", tone: "danger" as const },
  correction_requested: { label: "Ajuste solicitado", tone: "brand" as const },
};

function RequestsContent() {
  const { settings } = useAdminData();
  const [requests, setRequests] = useState<AdminRentalRequest[] | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [selected, setSelected] = useState<AdminRentalRequest | null>(null);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [deposit, setDeposit] = useState("1000");
  const [rate, setRate] = useState("");
  const [contractTemplateId, setContractTemplateId] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await tenantAdminGet<{ requests: AdminRentalRequest[] }>("view=requests");
    if (res?.requests) setRequests(res.requests);
  }, []);

  useEffect(() => {
    let alive = true;
    tenantAdminGet<{ requests: AdminRentalRequest[] }>("view=requests").then((res) => {
      if (alive && res?.requests) setRequests(res.requests);
    });
    return () => {
      alive = false;
    };
  }, []);

  const openModal = (r: AdminRentalRequest) => {
    setSelected(r);
    setDeposit(String(r.depositAmount || 1000));
    setRate(String(r.rateAmount || 650));
    setContractTemplateId("");
    setApproving(false);
    setRejecting(false);
    setCorrecting(false);
    setReason("");
    setNotes("");
  };

  const handleApprove = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await tenantAdminPost({
        action: "request.approve",
        id: selected.id,
        depositAmount: Number(deposit) || 1000,
        rateAmount: Number(rate) || selected.rateAmount,
        planType: selected.planType,
        contractTemplateId: contractTemplateId || undefined,
        startDate: selected.startDate,
        endDate: selected.endDate,
      });
      toast.success("Locação aprovada com sucesso! Contrato gerado e enviado por WhatsApp e e-mail.");
      setSelected(null);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(false);
  };

  const handleReject = async () => {
    if (!selected || !reason.trim()) return toast.error("Informe o motivo da recusa.");
    setBusy(true);
    try {
      await tenantAdminPost({
        action: "request.reject",
        id: selected.id,
        reason: reason.trim(),
      });
      toast.success("Solicitação recusada. O cliente foi avisado por push e WhatsApp.");
      setSelected(null);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(false);
  };

  const handleCorrection = async () => {
    if (!selected || !notes.trim()) return toast.error("Informe as orientações para o cliente.");
    setBusy(true);
    try {
      await tenantAdminPost({
        action: "request.request_correction",
        id: selected.id,
        notes: notes.trim(),
      });
      toast.success("Pedido de correção enviado ao cliente.");
      setSelected(null);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(false);
  };

  const total = requests?.length ?? 0;
  const pendingCount = requests?.filter((r) => r.status === "pending").length ?? 0;
  const approvedCount = requests?.filter((r) => r.status === "approved").length ?? 0;
  const rejectedCount = requests?.filter((r) => r.status === "rejected").length ?? 0;

  const filtered = (requests ?? []).filter((r) => {
    if (filter === "pending") return r.status === "pending" || r.status === "correction_requested";
    if (filter === "approved") return r.status === "approved";
    if (filter === "rejected") return r.status === "rejected";
    return true;
  });

  return (
    <>
      <PageHeader
        tour="requests"
        title="Solicitações de Locação"
        description="Novos cadastros e pedidos de aluguel feitos pelo aplicativo. Analise os documentos e aprove em 1 clique."
      />

      <div data-tour="requests-kpis" className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Aguardando análise" value={pendingCount} icon={Clock} accent={pendingCount > 0} />
        <StatCard label="Locações aprovadas" value={approvedCount} icon={CheckCircle2} />
        <StatCard label="Não aprovadas" value={rejectedCount} icon={XCircle} />
        <StatCard label="Total recebidas" value={total} icon={FileCheck} />
      </div>

      <div data-tour="requests-filters" className="mb-4 flex flex-wrap items-center gap-2">
        {(
          [
            ["pending", `Pendentes (${pendingCount})`],
            ["approved", `Aprovadas (${approvedCount})`],
            ["rejected", `Não aprovadas (${rejectedCount})`],
            ["all", `Todas (${total})`],
          ] as const
        ).map(([f, label]) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? "primary" : "outline"}
            onClick={() => setFilter(f)}
          >
            {label}
          </Button>
        ))}
      </div>

      <Card data-tour="requests-list">
        {!requests ? (
          <EmptyState title="Carregando solicitações..." />
        ) : !filtered.length ? (
          <EmptyState
            title="Nenhuma solicitação encontrada"
            description={filter === "pending" ? "Nenhum pedido aguardando conferência no momento." : "Nenhum registro para este filtro."}
          />
        ) : (
          <ul className="divide-y divide-line">
            {filtered.map((r, i) => {
              const statusCfg = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.pending;
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-4">
                    {r.vehicleImage && (
                      <div className="relative size-16 shrink-0 overflow-hidden rounded-xl border border-line bg-surface">
                        <Image
                          src={r.vehicleImage}
                          alt={r.vehicleName}
                          fill
                          sizes="64px"
                          className="object-contain p-1"
                        />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-display font-semibold text-white">{r.clientName}</p>
                        <Badge tone={statusCfg.tone}>{statusCfg.label}</Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted">
                        CPF: {r.clientCpf} · WhatsApp: {r.clientPhone} {r.clientEmail ? `· ${r.clientEmail}` : ""}
                      </p>
                      <p className="mt-1 text-sm text-zinc-300">
                        <span className="font-medium text-brand-soft">{r.vehicleName}</span> ({r.vehiclePlate}) · {formatDate(r.startDate)} a {formatDate(r.endDate)} · {formatCurrency(r.rateAmount)}/{r.planType === "daily" ? "dia" : "semana"}
                      </p>
                      <p className="mt-0.5 text-[11px] text-zinc-500">
                        Recebido em {when(r.createdAt)}
                        {r.cnhNumber ? ` · CNH ${r.cnhNumber} (${r.cnhCategory}) validade ${formatDate(r.cnhExpiry || "")}` : ""}
                      </p>
                    </div>
                  </div>

                  <Button data-tour={i === 0 ? "requests-open" : undefined} size="sm" variant={r.status === "pending" ? "primary" : "outline"} onClick={() => openModal(r)}>
                    <Eye className="size-4" /> {r.status === "pending" ? "Analisar e aprovar" : "Ver detalhes"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Modal de Análise Completa de Documentos */}
      <Dialog
        open={!!selected}
        onOpenChange={(o) => !o && !busy && setSelected(null)}
        title={selected ? `Solicitação #${selected.id.slice(0, 8)} · ${selected.clientName}` : ""}
        description={selected ? `Veículo pretendido: ${selected.vehicleName} (${selected.vehiclePlate})` : undefined}
        size="lg"
        footer={
          selected && selected.status === "pending" ? (
            approving ? (
              <div className="flex w-full flex-wrap items-center justify-between gap-3">
                <Button variant="ghost" disabled={busy} onClick={() => setApproving(false)}>
                  Voltar
                </Button>
                <Button disabled={busy} onClick={handleApprove}>
                  <CheckCircle2 className="size-4" /> {busy ? "Gerando contrato..." : "Confirmar e emitir contrato"}
                </Button>
              </div>
            ) : rejecting ? (
              <div className="flex w-full flex-wrap items-center justify-between gap-3">
                <Button variant="ghost" disabled={busy} onClick={() => setRejecting(false)}>
                  Voltar
                </Button>
                <Button variant="danger" disabled={busy || !reason.trim()} onClick={handleReject}>
                  <XCircle className="size-4" /> Confirmar recusa
                </Button>
              </div>
            ) : correcting ? (
              <div className="flex w-full flex-wrap items-center justify-between gap-3">
                <Button variant="ghost" disabled={busy} onClick={() => setCorrecting(false)}>
                  Voltar
                </Button>
                <Button disabled={busy || !notes.trim()} onClick={handleCorrection}>
                  <AlertCircle className="size-4" /> Enviar solicitação de ajuste
                </Button>
              </div>
            ) : (
              <div data-tour="requests-decision" className="flex w-full flex-wrap items-center justify-end gap-2">
                <Button variant="outline" onClick={() => setCorrecting(true)}>
                  Pedir ajuste
                </Button>
                <Button variant="danger" onClick={() => setRejecting(true)}>
                  Recusar
                </Button>
                <Button onClick={() => setApproving(true)}>
                  <CheckCircle2 className="size-4" /> Aprovar locação
                </Button>
              </div>
            )
          ) : (
            <Button variant="outline" onClick={() => setSelected(null)}>
              Fechar
            </Button>
          )
        }
      >
        {selected && (
          <div className="grid gap-5">
            {/* Bloco 1: Dados do Cliente e Veículo */}
            <div className="grid gap-3 rounded-xl border border-line bg-surface p-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase text-muted">Cliente</dt>
                <dd className="font-semibold text-white">{selected.clientName}</dd>
                <dd className="text-xs text-zinc-400">CPF: {selected.clientCpf}</dd>
                <dd className="text-xs text-zinc-400">WhatsApp: {selected.clientPhone}</dd>
                {selected.clientEmail && <dd className="text-xs text-zinc-400">{selected.clientEmail}</dd>}
              </div>
              <div>
                <dt className="text-xs uppercase text-muted">Veículo pretendido</dt>
                <dd className="font-semibold text-white">{selected.vehicleName} ({selected.vehiclePlate})</dd>
                <dd className="text-xs text-zinc-400">Período: {formatDate(selected.startDate)} até {formatDate(selected.endDate)}</dd>
                <dd className="text-xs text-zinc-400">Valor do plano: {formatCurrency(selected.rateAmount)}/{selected.planType === "daily" ? "dia" : "semana"}</dd>
                <dd className="text-xs text-zinc-400">Caução prevista: {formatCurrency(selected.depositAmount)}</dd>
              </div>
            </div>

            {/* Bloco 2: Galeria dos 4 Documentos Obrigatórios */}
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Documentos anexados pelo solicitante</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "1. CNH (frente)", url: selected.cnhFrontUrl },
                  { label: "2. CNH (verso)", url: selected.cnhBackUrl },
                  { label: "3. Comprovante Residência", url: selected.addressProofUrl },
                  { label: "4. Selfie com CNH", url: selected.selfieUrl },
                ].map((doc, idx) => (
                  <div key={idx} className="flex flex-col gap-1 rounded-xl border border-line bg-white/[0.02] p-2 text-center">
                    <p className="text-[11px] font-medium text-zinc-300 truncate">{doc.label}</p>
                    {doc.url ? (
                      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-surface">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={doc.url} alt={doc.label} className="size-full object-contain" />
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity hover:opacity-100"
                        >
                          <span className="inline-flex items-center gap-1 rounded bg-black/70 px-2 py-1 text-xs text-white">
                            <ExternalLink className="size-3" /> Ver
                          </span>
                        </a>
                      </div>
                    ) : (
                      <div className="flex aspect-[4/3] items-center justify-center rounded-lg border border-dashed border-line text-xs text-muted">
                        Sem foto
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Bloco 3: Formulários de Decisão */}
            {approving && (
              <div className="grid gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                <p className="text-sm font-semibold text-emerald-300">Confirmação de Aprovação da Locação</p>
                <p className="text-xs text-muted">
                  Ao confirmar, o sistema criará a locação em Locações, gerará o contrato digital com assinatura eletrônica e notificará o cliente no WhatsApp, e-mail e push do celular.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Valor da parcela" htmlFor="appr-rate">
                    <Input id="appr-rate" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="650.00" />
                  </Field>
                  <Field label="Valor da caução" htmlFor="appr-dep">
                    <Input id="appr-dep" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="1000.00" />
                  </Field>
                  <Field label="Modelo de contrato a emitir" htmlFor="appr-tpl" className="sm:col-span-2">
                    <Select
                      id="appr-tpl"
                      value={contractTemplateId}
                      onChange={(e) => setContractTemplateId(e.target.value)}
                      options={[
                        { value: "", label: "Contrato Padrão Gerado pelo Sistema (Digital)" },
                        ...(settings.contractTemplates ?? []).map((t) => ({ value: t.id, label: `${t.name} (${t.fileName})` })),
                      ]}
                    />
                  </Field>
                </div>
              </div>
            )}

            {rejecting && (
              <div className="grid gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-4">
                <p className="text-sm font-semibold text-red-300">Motivo da Não Aprovação</p>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ex.: CNH com menos de 2 anos, reprovação de crédito, etc. Esta mensagem é enviada ao cliente."
                  rows={3}
                />
              </div>
            )}

            {correcting && (
              <div className="grid gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                <p className="text-sm font-semibold text-amber-300">Orientação de Ajuste de Documento</p>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex.: A foto da CNH verso ficou desfocada. Por favor, envie uma foto legível."
                  rows={3}
                />
              </div>
            )}
          </div>
        )}
      </Dialog>
    </>
  );
}

export default function RequestsPage() {
  return (
    <Suspense>
      <RequestsContent />
    </Suspense>
  );
}

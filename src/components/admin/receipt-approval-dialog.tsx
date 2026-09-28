"use client";

import { CheckCircle2, Clock, Eye, XCircle, AlertCircle, ExternalLink } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/form";
import { useAdminData } from "@/hooks/use-admin-data";
import { getSupabase } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils";

interface PaymentReceiptItem {
  id: string;
  rental_id: string;
  receipt_id: string;
  client_id: string;
  amount: number;
  payment_date: string;
  proof_url: string;
  status: "pending_review" | "approved" | "rejected";
  created_at: string;
}

export function ReceiptApprovalSection() {
  const { data: adminData } = useAdminData();
  const [receipts, setReceipts] = useState<PaymentReceiptItem[]>([]);
  const [selectedProof, setSelectedProof] = useState<PaymentReceiptItem | null>(null);
  const [proofSignedUrl, setProofSignedUrl] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const loadPending = useCallback(async () => {
    try {
      const res = await fetch("/api/payments/receipt");
      const json = await res.json();
      if (res.ok && json.receipts) {
        setReceipts(json.receipts.filter((r: any) => r.status === "pending_review"));
      }
    } catch {
      // Falha silenciosa se offline
    }
  }, []);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  // Gera URL assinada temporária para visualização segura da imagem
  useEffect(() => {
    if (!selectedProof) {
      setProofSignedUrl(null);
      return;
    }

    getSupabase()
      .storage.from("comprovantes")
      .createSignedUrl(selectedProof.proof_url, 3600)
      .then(({ data }) => {
        setProofSignedUrl(data?.signedUrl ?? null);
      });
  }, [selectedProof]);

  const handleAction = async (action: "approve" | "reject") => {
    if (!selectedProof) return;
    setActionLoading(true);

    try {
      const res = await fetch("/api/payments/receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          receiptId: selectedProof.id,
          rejectionReason: action === "reject" ? rejectionReason : undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao processar");

      toast.success(action === "approve" ? "Pagamento aprovado com sucesso!" : "Comprovante rejeitado.");
      setSelectedProof(null);
      setShowRejectForm(false);
      setRejectionReason("");
      await loadPending();
      window.location.reload(); // Atualiza financeiro
    } catch (e: any) {
      toast.error(e.message || "Erro na operação");
    } finally {
      setActionLoading(false);
    }
  };

  const getClientName = (clientId: string) => {
    return adminData?.clients.find((c) => c.id === clientId)?.name || "Locatário";
  };

  if (!receipts.length) return null;

  return (
    <>
      <Card className="mb-6 border-amber-500/30 bg-amber-500/[0.04]">
        <CardHeader
          title={`Comprovantes de Pagamento Pendentes (${receipts.length})`}
          description="Locatários enviaram comprovantes pelo app aguardando sua conferência e aprovação."
          action={<Badge tone="warning">Ação Necessária</Badge>}
        />
        <div className="divide-y divide-line p-5 pt-0">
          {receipts.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-semibold text-white">{getClientName(r.client_id)}</p>
                <p className="text-xs text-muted">
                  Enviado em {formatDate(r.created_at.slice(0, 10))} · Valor informado:{" "}
                  <strong className="text-emerald-400">{formatCurrency(Number(r.amount))}</strong>
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSelectedProof(r);
                  setShowRejectForm(false);
                }}
              >
                <Eye className="size-4" /> Conferir Comprovante
              </Button>
            </div>
          ))}
        </div>
      </Card>

      {/* Modal de Análise e Aprovação */}
      <Dialog
        open={!!selectedProof}
        onOpenChange={(open) => !open && setSelectedProof(null)}
        title="Análise de Comprovante de Pagamento"
        size="lg"
        footer={
          <div className="flex w-full items-center justify-between">
            <Button variant="ghost" onClick={() => setSelectedProof(null)} disabled={actionLoading}>
              Fechar
            </Button>
            <div className="flex gap-2">
              {!showRejectForm ? (
                <>
                  <Button
                    variant="danger"
                    onClick={() => setShowRejectForm(true)}
                    disabled={actionLoading}
                  >
                    <XCircle className="size-4" /> Rejeitar
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => handleAction("approve")}
                    disabled={actionLoading}
                    className="bg-emerald-600 hover:bg-emerald-500"
                  >
                    <CheckCircle2 className="size-4" /> Aprovar Pagamento
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" onClick={() => setShowRejectForm(false)} disabled={actionLoading}>
                    Voltar
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => handleAction("reject")}
                    disabled={actionLoading || !rejectionReason.trim()}
                  >
                    Confirmar Rejeição
                  </Button>
                </>
              )}
            </div>
          </div>
        }
      >
        {selectedProof && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 rounded-xl border border-line bg-panel p-4 text-sm">
              <div>
                <p className="text-xs text-muted uppercase">Locatário</p>
                <p className="font-semibold text-white">{getClientName(selectedProof.client_id)}</p>
              </div>
              <div>
                <p className="text-xs text-muted uppercase">Valor Informado</p>
                <p className="font-semibold text-emerald-400">{formatCurrency(Number(selectedProof.amount))}</p>
              </div>
              <div>
                <p className="text-xs text-muted uppercase">Data da Transação</p>
                <p className="text-zinc-200">{formatDate(selectedProof.payment_date)}</p>
              </div>
              <div>
                <p className="text-xs text-muted uppercase">Locação Vinculada</p>
                <p className="text-zinc-200">{selectedProof.rental_id.slice(0, 8).toUpperCase()}</p>
              </div>
            </div>

            {/* Imagem do Comprovante */}
            <div className="rounded-xl border border-line bg-ink p-3 text-center">
              {proofSignedUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={proofSignedUrl}
                    alt="Comprovante de pagamento"
                    className="mx-auto max-h-[380px] rounded-lg object-contain"
                  />
                  <div className="mt-2 text-right">
                    <a
                      href={proofSignedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-brand-soft hover:underline"
                    >
                      <ExternalLink className="size-3" /> Abrir imagem original
                    </a>
                  </div>
                </>
              ) : (
                <div className="flex h-48 items-center justify-center text-sm text-muted">
                  Carregando imagem do comprovante...
                </div>
              )}
            </div>

            {/* Formulário de Rejeição */}
            {showRejectForm && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/[0.05] p-4">
                <p className="mb-2 text-sm font-semibold text-red-200">Motivo da Rejeição</p>
                <Textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Ex.: Valor diverge do valor da parcela, comprovante ilegível ou data incorreta."
                  rows={3}
                />
                <p className="mt-1 text-xs text-muted">
                  Este motivo será enviado por notificação diretamente ao locatário para que ele possa corrigir e reenviar.
                </p>
              </div>
            )}
          </div>
        )}
      </Dialog>
    </>
  );
}

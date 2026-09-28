"use client";

import { CheckCircle2, ExternalLink, XCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/page-header";
import { tenantAdminGet, tenantAdminPost, when } from "@/components/admin/tenant-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Select, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { DOCUMENT_KIND, INCIDENT_CATEGORY, INCIDENT_STATUS, REVIEW_STATUS } from "@/lib/tenant";

interface Incident {
  id: string;
  rentalId: string;
  clientName: string;
  vehicle: string;
  category: string;
  description: string;
  status: string;
  adminNotes: string | null;
  createdAt: string;
  photos: string[];
}

interface Doc {
  id: string;
  clientName: string;
  kind: string;
  status: string;
  rejectionReason: string | null;
  createdAt: string;
  url: string | null;
}

/** Pedidos do App do Locatário que dependem da equipe: ocorrências no veículo e documentos enviados. */
function TenantRequests() {
  const params = useSearchParams();
  const [tab, setTab] = useState<"ocorrencias" | "documentos">(params.get("tab") === "documentos" ? "documentos" : "ocorrencias");
  const [incidents, setIncidents] = useState<Incident[] | null>(null);
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [edit, setEdit] = useState<Incident | null>(null);
  const [status, setStatus] = useState("");
  const [notes, setNotes] = useState("");
  const [review, setReview] = useState<Doc | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const fetchAll = useCallback(async () => {
    const [i, d] = await Promise.all([tenantAdminGet<{ incidents: Incident[] }>("view=incidents"), tenantAdminGet<{ documents: Doc[] }>("view=documents")]);
    return { incidents: i?.incidents ?? [], documents: d?.documents ?? [] };
  }, []);
  const reload = async () => {
    const r = await fetchAll();
    setIncidents(r.incidents);
    setDocs(r.documents);
  };

  useEffect(() => {
    let alive = true;
    fetchAll().then((r) => {
      if (!alive) return;
      setIncidents(r.incidents);
      setDocs(r.documents);
    });
    return () => {
      alive = false;
    };
  }, [fetchAll]);

  const run = async (body: Record<string, unknown>, ok: string, done: () => void) => {
    setBusy(true);
    try {
      await tenantAdminPost(body);
      toast.success(ok);
      done();
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(false);
  };

  const openIncidents = incidents?.filter((i) => !["resolved", "cancelled"].includes(i.status)).length ?? 0;
  const pendingDocs = docs?.filter((d) => d.status === "pending_review").length ?? 0;

  return (
    <>
      <PageHeader title="App do locatário" description="Ocorrências e documentos enviados pelos clientes no aplicativo. Cada resposta avisa o cliente no celular." />

      <div role="tablist" className="mb-4 inline-flex rounded-xl border border-line bg-panel p-1">
        {(
          [
            ["ocorrencias", `Ocorrências${openIncidents ? ` (${openIncidents})` : ""}`],
            ["documentos", `Documentos${pendingDocs ? ` (${pendingDocs})` : ""}`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn("rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors", tab === key ? "bg-magenta/20 text-white" : "text-muted hover:text-white")}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "ocorrencias" && (
        <Card>
          {!incidents ? (
            <EmptyState title="Carregando..." />
          ) : !incidents.length ? (
            <EmptyState title="Nenhuma ocorrência" description="Quando um cliente relatar um problema no app, aparece aqui." />
          ) : (
            <ul className="divide-y divide-line">
              {incidents.map((i) => (
                <li key={i.id} className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-white">{INCIDENT_CATEGORY[i.category] ?? i.category}</p>
                      <Badge tone={INCIDENT_STATUS[i.status]?.tone}>{INCIDENT_STATUS[i.status]?.label ?? i.status}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {i.clientName} · {i.vehicle} · {when(i.createdAt)}
                    </p>
                    <p className="mt-2 whitespace-pre-line text-sm text-zinc-200">{i.description}</p>
                    {i.adminNotes && <p className="mt-1 text-xs text-brand-soft">Resposta: {i.adminNotes}</p>}
                    {i.photos.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {i.photos.map((src, n) => (
                          <a key={src} href={src} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-line">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={src} alt={`Foto ${n + 1} da ocorrência`} className="size-20 object-cover" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEdit(i);
                      setStatus(i.status);
                      setNotes(i.adminNotes ?? "");
                    }}
                  >
                    Atualizar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "documentos" && (
        <Card>
          {!docs ? (
            <EmptyState title="Carregando..." />
          ) : !docs.length ? (
            <EmptyState title="Nenhum documento" description="CNH e comprovante de endereço enviados pelo app aparecem aqui." />
          ) : (
            <ul className="divide-y divide-line">
              {docs.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-white">{DOCUMENT_KIND[d.kind] ?? d.kind}</p>
                      <Badge tone={REVIEW_STATUS[d.status]?.tone}>{REVIEW_STATUS[d.status]?.label ?? d.status}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {d.clientName} · {when(d.createdAt)}
                      {d.rejectionReason ? ` · motivo: ${d.rejectionReason}` : ""}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setReview(d)}>
                    {d.status === "pending_review" ? "Conferir" : "Ver"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Dialog
        open={!!edit}
        onOpenChange={(o) => !o && !busy && setEdit(null)}
        title="Atualizar ocorrência"
        description="O cliente recebe o novo status e a sua resposta no celular."
        footer={
          <Button disabled={busy} onClick={() => edit && run({ action: "incident.status", id: edit.id, status, adminNotes: notes }, "Ocorrência atualizada. O cliente foi avisado.", () => setEdit(null))}>
            {busy ? "Salvando..." : "Salvar e avisar o cliente"}
          </Button>
        }
      >
        <div className="grid gap-4">
          <Field label="Status" htmlFor="inc-status">
            <Select id="inc-status" value={status} onChange={(e) => setStatus(e.target.value)} options={Object.entries(INCIDENT_STATUS).map(([value, s]) => ({ value, label: s.label }))} />
          </Field>
          <Field label="Resposta para o cliente" htmlFor="inc-notes" hint="Ex.: guincho a caminho, previsão de chegada 40 min.">
            <Textarea id="inc-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
      </Dialog>

      <Dialog
        open={!!review}
        onOpenChange={(o) => {
          if (!o && !busy) {
            setReview(null);
            setReason("");
          }
        }}
        title={review ? `${DOCUMENT_KIND[review.kind]} · ${review.clientName}` : ""}
        description="Confira se está legível e se os dados batem com o cadastro."
        size="lg"
        footer={
          review?.status === "pending_review" && (
            <>
              <Button variant="outline" disabled={busy || !reason.trim()} onClick={() => run({ action: "document.review", id: review.id, approve: false, reason }, "Documento recusado. O cliente foi avisado.", () => setReview(null))}>
                <XCircle /> Recusar
              </Button>
              <Button disabled={busy} onClick={() => run({ action: "document.review", id: review.id, approve: true }, "Documento aprovado.", () => setReview(null))}>
                <CheckCircle2 /> Aprovar
              </Button>
            </>
          )
        }
      >
        {review && (
          <div className="grid gap-4">
            <div className="rounded-xl border border-line bg-white/[0.02] p-3 text-center">
              {review.url ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={review.url} alt={DOCUMENT_KIND[review.kind]} className="mx-auto max-h-[420px] rounded-lg object-contain" />
                  <a href={review.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-brand-soft hover:underline">
                    <ExternalLink className="size-3" /> Abrir em tamanho original
                  </a>
                </>
              ) : (
                <p className="py-12 text-sm text-muted">Não foi possível carregar a imagem.</p>
              )}
            </div>
            {review.status === "pending_review" && (
              <Field label="Motivo da recusa (vai para o cliente)" htmlFor="doc-reason">
                <Textarea id="doc-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: foto desfocada, CNH vencida." />
              </Field>
            )}
          </div>
        )}
      </Dialog>
    </>
  );
}

export default function TenantRequestsPage() {
  return (
    <Suspense>
      <TenantRequests />
    </Suspense>
  );
}

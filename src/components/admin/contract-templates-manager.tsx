"use client";

import { FileText, Sparkles, Trash2, CheckCircle2, ArrowRight, RefreshCw, Upload, Shield } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { CONTRACT_VARIABLES, type FieldMapping, type ManualField } from "@/lib/contract-variables";
import { getSupabase } from "@/lib/supabase/client";

interface Template {
  id: string;
  name: string;
  rental_type: string;
  file_name: string;
  file_path: string;
  file_type: "pdf" | "docx";
  status: "uploaded" | "analyzing" | "review_required" | "configured" | "error" | "inactive";
  current_version: number;
  mapping: FieldMapping[];
  manual_fields: ManualField[];
  last_analyzed_at?: string;
  last_error?: string;
}

const RENTAL_TYPES = ["Semanal", "Quinzenal", "Mensal", "Diário", "Outro", "Todos"];

export function ContractTemplatesManager() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reviewing, setReviewing] = useState<Template | null>(null);
  const [deleting, setDeleting] = useState<Template | null>(null);

  // Form states para novo template
  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState("");
  const [rentalType, setRentalType] = useState("Semanal");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/contracts/templates", { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setTemplates(json.templates || []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/contracts/templates", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (alive) setTemplates(j.templates || []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (templates.length >= 5) {
      return toast.error("Limite atingido: você já possui 5 modelos de contrato cadastrados.");
    }

    const ext = (file.name.split(".").pop()?.toLowerCase() || "pdf") as "pdf" | "docx";
    if (ext !== "pdf" && ext !== "docx") {
      return toast.error("Formato inválido. Apenas PDF e DOCX são suportados.");
    }

    setUploading(true);
    try {
      const path = `templates/${Date.now()}_${file.name}`;
      const { error: upErr } = await getSupabase().storage.from("documentos").upload(path, file, { upsert: true });
      if (upErr) throw upErr;

      const res = await fetch("/api/contracts/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name: name.trim() || file.name.replace(/\.[^/.]+$/, ""),
          rentalType,
          fileName: file.name,
          filePath: path,
          fileType: ext,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Falha ao salvar modelo.");

      toast.success("Modelo anexado com sucesso!");
      setNewOpen(false);
      setName("");
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleAnalyze = async (templateId: string) => {
    setBusy(true);
    try {
      toast.info("Iniciando análise com IA (isso pode levar alguns segundos)...");
      const res = await fetch("/api/contracts/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "analyze", templateId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Falha na análise.");

      toast.success("Campos detectados com sucesso pela IA! Revise os mapeamentos.");
      await load();
      setReviewing(json.template);
    } catch (err) {
      toast.error((err as Error).message);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      const res = await fetch("/api/contracts/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", templateId: deleting.id }),
      });
      if (!res.ok) throw new Error("Erro ao excluir.");
      toast.success("Modelo removido.");
      setDeleting(null);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="sm:col-span-2 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div>
          <p className="font-semibold text-white">Modelos de Contrato da Locadora ({templates.length}/5)</p>
          <p className="text-xs text-muted">
            Cadastre os seus contratos em PDF ou DOCX. A IA detecta os campos variáveis uma única vez para preenchimento automático.
          </p>
        </div>
        {templates.length < 5 && (
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Upload className="size-4" /> Anexar modelo
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((tpl) => {
          const isConfigured = tpl.status === "configured";
          const isReview = tpl.status === "review_required";
          const isAnalyzing = tpl.status === "analyzing";

          return (
            <div key={tpl.id} className="flex flex-col justify-between rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-line-strong">
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <FileText className="size-5 text-brand-soft shrink-0" />
                    <p className="font-semibold text-sm text-white truncate max-w-[180px]">{tpl.name}</p>
                  </div>
                  <Badge tone={isConfigured ? "success" : isReview ? "warning" : isAnalyzing ? "brand" : "neutral"}>
                    {isConfigured ? "Configurado" : isReview ? "Revisar" : isAnalyzing ? "Analisando..." : "Não analisado"}
                  </Badge>
                </div>

                <p className="text-xs text-muted">
                  Tipo: <strong className="text-zinc-200">{tpl.rental_type}</strong> · {tpl.file_type.toUpperCase()}
                </p>
                <p className="text-[11px] text-zinc-400 truncate">{tpl.file_name}</p>

                {isConfigured && (
                  <p className="text-xs text-emerald-300 flex items-center gap-1">
                    <CheckCircle2 className="size-3.5" /> {tpl.mapping.length} campos mapeados (v{tpl.current_version})
                  </p>
                )}

                {tpl.last_error && <p className="text-xs text-red-400">{tpl.last_error}</p>}
              </div>

              <div className="mt-4 pt-3 border-t border-line flex flex-wrap items-center justify-between gap-2">
                {!isConfigured && (
                  <Button size="sm" variant={isReview ? "outline" : "primary"} disabled={busy || isAnalyzing} onClick={() => (isReview ? setReviewing(tpl) : handleAnalyze(tpl.id))}>
                    <Sparkles className="size-3.5" /> {isReview ? "Revisar campos" : "Ler e detectar com IA"}
                  </Button>
                )}

                {isConfigured && (
                  <Button size="sm" variant="ghost" onClick={() => setReviewing(tpl)}>
                    Ver campos
                  </Button>
                )}

                <div className="flex items-center gap-1">
                  {isConfigured && (
                    <Button size="sm" variant="ghost" title="Reanalisar com IA" disabled={busy} onClick={() => handleAnalyze(tpl.id)}>
                      <RefreshCw className="size-3.5" />
                    </Button>
                  )}
                  <Button size="sm" variant="danger" title="Excluir" disabled={busy} onClick={() => setDeleting(tpl)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Novo Modelo */}
      <Dialog open={newOpen} onOpenChange={setNewOpen} title="Anexar modelo de contrato" description="Envie o documento original da sua locadora (PDF ou DOCX)." size="md">
        <div className="space-y-4">
          <Field label="Nome do modelo" htmlFor="tpl-name" required>
            <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Contrato Semanal Padrão" />
          </Field>
          <Field label="Aplicável ao tipo de locação" htmlFor="tpl-type" required>
            <Select id="tpl-type" value={rentalType} onChange={(e) => setRentalType(e.target.value)} options={RENTAL_TYPES.map((t) => ({ value: t, label: t }))} />
          </Field>
          <div className="rounded-xl border border-line-strong bg-white/5 p-4 text-center">
            <p className="text-xs text-muted mb-2">Selecione o arquivo no seu computador:</p>
            <input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={uploading} onChange={handleUpload} className="text-xs text-zinc-300" />
            {uploading && <p className="text-xs text-brand-soft mt-2">Enviando e calculando hash...</p>}
          </div>
        </div>
      </Dialog>

      {/* Modal de Revisão do Mapeamento */}
      {reviewing && (
        <MappingReviewDialog
          template={reviewing}
          onClose={() => setReviewing(null)}
          onSaved={() => {
            setReviewing(null);
            load();
          }}
        />
      )}

      {/* Confirmação de exclusão */}
      <ConfirmDialog open={!!deleting} onOpenChange={() => setDeleting(null)} title="Excluir modelo de contrato?" description="Esta ação não afetará os contratos já gerados ou assinados com este modelo." confirmLabel="Excluir modelo" onConfirm={handleDelete} />
    </div>
  );
}

/** Modal de conferência humana obrigatória do mapeamento da IA */
function MappingReviewDialog({ template, onClose, onSaved }: { template: Template; onClose: () => void; onSaved: () => void }) {
  const [mappings, setMappings] = useState<FieldMapping[]>(template.mapping || []);
  const [manualFields] = useState<ManualField[]>(template.manual_fields || []);
  const [saving, setSaving] = useState(false);

  const variableOptions = [
    { value: "UNMAPPED", label: "⚠️ Não mapear / Ignorar" },
    ...Object.values(CONTRACT_VARIABLES).map((v) => ({
      value: v.key,
      label: `[${v.group}] ${v.label}`,
    })),
  ];

  const updateMapping = (id: string, variableKey: string) => {
    setMappings((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        return { ...m, variableKey, isManual: variableKey === "UNMAPPED" };
      })
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/contracts/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save-mapping",
          templateId: template.id,
          mapping: mappings,
          manualFields,
          name: template.name,
          rentalType: template.rental_type,
        }),
      });

      if (!res.ok) throw new Error("Falha ao salvar mapeamento.");
      toast.success("Modelo aprovado e configurado! Pronto para uso determinístico.");
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose} title={`Revisar mapeamento · ${template.name}`} description="Confirme ou ajuste a correspondência sugerida pela IA para os campos do contrato." size="lg">
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        <div className="rounded-xl border border-magenta/30 bg-magenta/5 p-3 text-xs text-zinc-300 flex items-center gap-2">
          <Shield className="size-4 text-brand-soft shrink-0" />
          <span>A IA é uma ferramenta de auxílio. Você tem a palavra final: revise e confirme o destino de cada campo antes de aprovar.</span>
        </div>

        <div className="space-y-3">
          {mappings.map((m) => {
            const confPct = Math.round(m.confidence * 100);
            return (
              <div key={m.id} className="rounded-xl border border-line bg-surface p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs text-white bg-black/40 px-2 py-1 rounded border border-line-strong truncate max-w-sm">
                    {m.originalText}
                  </span>
                  <Badge tone={confPct >= 85 ? "success" : confPct >= 60 ? "warning" : "neutral"}>
                    {confPct}% confiança
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs text-muted flex items-center gap-1 shrink-0">
                    Mapear para <ArrowRight className="size-3" />
                  </span>
                  <div className="flex-1 min-w-[240px]">
                    <Select value={m.variableKey} onChange={(e) => updateMapping(m.id, e.target.value)} options={variableOptions} className="text-xs h-8" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="pt-3 border-t border-line flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : "Confirmar e aprovar modelo"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

"use client";

import { Download, FileText, MessageSquare, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/form";
import { useOrganization } from "@/hooks/use-organization";
import type { Organization } from "@/types";

/** Monta o formulário só com a locadora carregada; remonta quando ela muda. */
export function OrgTextsForm() {
  const { org } = useOrganization();
  if (!org) return <div className="h-64 animate-pulse rounded-2xl bg-white/[0.04]" />;
  return <TextsForm key={org.id} org={org} />;
}

function TextsForm({ org }: { org: Organization }) {
  const { reload } = useOrganization();
  const [welcome, setWelcome] = useState(org.texts?.welcome || "");
  const [billing, setBilling] = useState(org.texts?.billing || "");
  const [support, setSupport] = useState(org.texts?.support || "");
  const [footer, setFooter] = useState(org.texts?.footer || "");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "texts", welcome, billing, support, footer }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Não foi possível salvar.");
      toast.success("Textos atualizados.");
      reload();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "export" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao exportar.");
      const blob = new Blob([JSON.stringify(json.dump, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup-${org.slug || "locadora"}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Backup baixado com sucesso!");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-8">
      <form onSubmit={save} className="space-y-4">
        <div className="flex items-center gap-2 border-b border-line pb-3">
          <MessageSquare className="size-5 text-brand-soft" />
          <div>
            <h3 className="font-semibold text-white">Mensagens e Textos</h3>
            <p className="text-xs text-muted">Personalize os avisos automáticos exibidos no app e nas comunicações da sua locadora.</p>
          </div>
        </div>

        <Field label="Mensagem de boas-vindas do aplicativo" htmlFor="t-wel">
          <textarea
            id="t-wel"
            value={welcome}
            onChange={(e) => setWelcome(e.target.value)}
            rows={3}
            maxLength={400}
            className="w-full rounded-xl border border-line bg-panel p-3 text-xs text-white outline-none focus:border-line-strong"
            placeholder="Ex.: Bem-vindo à nossa locadora! Conte com a gente para sua mobilidade."
          />
        </Field>

        <Field label="Observação nas cobranças" htmlFor="t-bill">
          <textarea
            id="t-bill"
            value={billing}
            onChange={(e) => setBilling(e.target.value)}
            rows={3}
            maxLength={400}
            className="w-full rounded-xl border border-line bg-panel p-3 text-xs text-white outline-none focus:border-line-strong"
            placeholder="Ex.: Pagamento pontual garante condições especiais na renovação da sua locação."
          />
        </Field>

        <Field label="Instruções de suporte" htmlFor="t-sup">
          <textarea
            id="t-sup"
            value={support}
            onChange={(e) => setSupport(e.target.value)}
            rows={3}
            maxLength={400}
            className="w-full rounded-xl border border-line bg-panel p-3 text-xs text-white outline-none focus:border-line-strong"
            placeholder="Ex.: Em caso de pane ou acidente, acione nosso plantão 24h pelo WhatsApp."
          />
        </Field>

        <Field label="Texto de rodapé" htmlFor="t-foot">
          <input
            id="t-foot"
            value={footer}
            onChange={(e) => setFooter(e.target.value)}
            maxLength={200}
            className="w-full rounded-xl border border-line bg-panel p-3 text-xs text-white outline-none focus:border-line-strong"
            placeholder="Ex.: Todos os direitos reservados."
          />
        </Field>

        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            <Save className="size-4" /> {saving ? "Salvando..." : "Salvar textos"}
          </Button>
        </div>
      </form>

      {/* Exportação LGPD */}
      <div className="rounded-2xl border border-line bg-surface p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-xs text-white flex items-center gap-1.5">
            <FileText className="size-4 text-brand-soft" /> Exportação de Dados da Locadora (LGPD)
          </p>
          <p className="text-[11px] text-muted">Baixe uma cópia completa em JSON com todos os veículos, clientes, locações e contratos da sua locadora.</p>
        </div>
        <Button size="sm" variant="outline" onClick={handleExport} disabled={exporting}>
          <Download className="size-4" /> {exporting ? "Gerando backup..." : "Baixar dados (JSON)"}
        </Button>
      </div>
    </div>
  );
}

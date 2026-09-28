"use client";

import { Bell, BellRing, Building2, QrCode, ExternalLink, FileSignature, FileText, FileUp, Mail, MessageCircle, Moon, Palette, RotateCcw, Send, SlidersHorizontal, Sun, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/page-header";
import { PushSettings } from "@/components/admin/push-settings";
import { PixSettingsFields } from "@/components/admin/pix-settings";
import { WhatsAppConnection } from "@/components/admin/whatsapp-connection";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Logo } from "@/components/ui/logo";
import { SignaturePad } from "@/components/ui/signature-pad";
import { WhatsAppIcon } from "@/components/ui/whatsapp-icon";
import { useAdminData } from "@/hooks/use-admin-data";
import { useTheme } from "@/hooks/use-theme";
import { sendEmailRequest } from "@/lib/api";
import { isSupabaseEnabled } from "@/lib/supabase/env";
import { getSupabase } from "@/lib/supabase/client";
import { COMPANY, WHATSAPP_MESSAGES } from "@/lib/company";
import { getWhatsAppUrl } from "@/lib/whatsapp";
import { formatDate, maskPhone, newId } from "@/lib/utils";
import { DEFAULT_CONTRACT_TERMS } from "@/lib/contract";
import { CATEGORY_LABEL } from "@/lib/push-events";
import type { CompanyProfile, CompanySettings, ContractTemplate, NotificationCategory } from "@/types";

function EmailTest() {
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  if (!isSupabaseEnabled) return <p className="text-sm text-muted sm:col-span-2">Teste disponível com o banco de dados conectado.</p>;
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await sendEmailRequest({ kind: "test", to });
      toast.success(`E-mail de teste enviado para ${to}.`);
    } catch (err) {
      toast.error((err as Error).message);
    }
    setBusy(false);
  };
  return (
    <form onSubmit={send} className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
      <Field label="Enviar e-mail de teste para" htmlFor="mail-test">
        <Input id="mail-test" type="email" required value={to} onChange={(e) => setTo(e.target.value)} placeholder="nome@exemplo.com" autoComplete="email" />
      </Field>
      <div className="flex items-end">
        <Button type="submit" variant="outline" disabled={busy || !to}>
          <Send /> {busy ? "Enviando…" : "Enviar teste"}
        </Button>
      </div>
    </form>
  );
}

function Section({ icon: Icon, title, description, children }: { icon: typeof Bell; title: string; description: string; children: React.ReactNode }) {
  return (
    <Card className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[260px_1fr]">
      <div>
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-brand-soft" aria-hidden />
          <h2 className="font-display text-base font-semibold">{title}</h2>
        </div>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </Card>
  );
}

export default function SettingsPage() {
  const { settings, saveSettings, resetDemo } = useAdminData();
  const [draft, setDraft] = useState<CompanySettings>(settings);
  const [confirmReset, setConfirmReset] = useState(false);
  const set = <K extends keyof CompanySettings>(key: K, value: CompanySettings[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setCompany = <K extends keyof CompanyProfile>(key: K, value: CompanyProfile[K]) =>
    setDraft((d) => ({ ...d, company: { ...d.company, [key]: value } }));
  const [newSignature, setNewSignature] = useState<string | null>(null);

  const { theme, setTheme } = useTheme();
  const [templateName, setTemplateName] = useState("");
  const [uploadingTemplate, setUploadingTemplate] = useState(false);

  const handleTemplateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const current = draft.contractTemplates ?? [];
    if (current.length >= 5) {
      return toast.error("Você já possui o limite de 5 modelos de contratos. Exclua um para adicionar outro.");
    }
    const name = templateName.trim() || file.name.replace(/\.[^/.]+$/, "");
    setUploadingTemplate(true);
    try {
      const ext = (file.name.split(".").pop()?.toLowerCase() || "pdf") as "pdf" | "doc" | "docx";
      const id = newId();
      const path = `templates/${id}_${file.name}`;
      const { error } = await getSupabase().storage.from("documentos").upload(path, file, { upsert: true });
      if (error) throw error;
      const newTemplate: ContractTemplate = {
        id,
        name,
        fileName: file.name,
        filePath: path,
        fileType: ext === "doc" || ext === "docx" ? ext : "pdf",
        uploadedAt: new Date().toISOString(),
      };
      const updated = [...current, newTemplate];
      set("contractTemplates", updated);
      setTemplateName("");
      toast.success(`Modelo "${name}" anexado com sucesso! Salve as alterações para gravar.`);
    } catch {
      toast.error("Não foi possível enviar o arquivo de contrato. Tente novamente.");
    }
    setUploadingTemplate(false);
    e.target.value = "";
  };

  const handleRemoveTemplate = (id: string) => {
    const updated = (draft.contractTemplates ?? []).filter((t) => t.id !== id);
    set("contractTemplates", updated);
    toast.success("Modelo removido. Salve as alterações para gravar.");
  };

  const save = async () => {
    const next = newSignature ? { ...draft, company: { ...draft.company, signerSignature: newSignature } } : draft;
    if (await saveSettings(next)) {
      setDraft(next);
      toast.success("Configurações salvas.");
    }
  };

  return (
    <>
      <PageHeader
        title="Configurações"
        description={`Dados da empresa e preferências do painel${isSupabaseEnabled ? "" : " (salvos neste navegador)"}.`}
        actions={<Button onClick={save}>Salvar alterações</Button>}
      />

      <div className="space-y-4">
        <Section icon={Building2} title="Dados da empresa" description="Informações oficiais exibidas no site. Alteradas apenas no código (src/lib/company.ts).">
          <div className="flex items-center gap-4 sm:col-span-2">
            <Logo variant="circular" className="w-16" />
            <Logo className="w-28" />
          </div>
          <Field label="Nome" htmlFor="s-name">
            <Input id="s-name" value={COMPANY.name} readOnly />
          </Field>
          <Field label="Descrição" htmlFor="s-tagline">
            <Input id="s-tagline" value={COMPANY.tagline} readOnly />
          </Field>
        </Section>

        <Section icon={FileSignature} title="Dados para contratos" description="Aparecem no contrato de locação e nos termos. Obrigatórios para emitir contratos.">
          <Field label="Razão social" htmlFor="c-legal" required>
            <Input id="c-legal" value={draft.company.legalName} onChange={(e) => setCompany("legalName", e.target.value)} />
          </Field>
          <Field label="CNPJ" htmlFor="c-cnpj" required>
            <Input id="c-cnpj" value={draft.company.cnpj} onChange={(e) => setCompany("cnpj", e.target.value)} placeholder="00.000.000/0000-00" />
          </Field>
          <Field label="Endereço" htmlFor="c-address" required className="sm:col-span-2">
            <Input id="c-address" value={draft.company.address} onChange={(e) => setCompany("address", e.target.value)} />
          </Field>
          <Field label="Representante (quem assina)" htmlFor="c-signer" required>
            <Input id="c-signer" value={draft.company.signerName} onChange={(e) => setCompany("signerName", e.target.value)} />
          </Field>
          <Field label="Cidade / foro" htmlFor="c-city" required>
            <Input id="c-city" value={draft.company.contractCity} onChange={(e) => setCompany("contractCity", e.target.value)} placeholder="Ex.: Campinas/SP" />
          </Field>
          <Field label="E-mail da empresa" htmlFor="c-email" hint="Recebe cópia dos contratos assinados e as respostas dos clientes" className="sm:col-span-2">
            <Input id="c-email" type="email" value={draft.company.email} onChange={(e) => setCompany("email", e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            {draft.company.signerSignature && !newSignature && (
              <div className="mb-2 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={draft.company.signerSignature} alt="Assinatura atual do representante" className="h-14 rounded-lg bg-white px-2" />
                <span className="text-xs text-muted">Assinatura atual. Desenhe abaixo para substituir.</span>
              </div>
            )}
            <SignaturePad onChange={setNewSignature} label="Assinatura do representante (vai em todos os contratos)" />
          </div>
          <Field label="Cláusulas gerais" htmlFor="c-terms" hint="Modelo inicial: revise com um advogado antes de usar." className="sm:col-span-2">
            <Textarea id="c-terms" rows={12} value={draft.company.contractTerms} onChange={(e) => setCompany("contractTerms", e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Button variant="ghost" size="sm" onClick={() => setCompany("contractTerms", DEFAULT_CONTRACT_TERMS)}>
              <RotateCcw /> Restaurar cláusulas padrão
            </Button>
          </div>
        </Section>

        <Section icon={QrCode} title="PIX para cobranças" description="Chave usada no QR Code e no copia e cola de todas as cobranças enviadas aos clientes.">
          <PixSettingsFields value={draft.pix} onChange={(pix) => set("pix", pix)} />
        </Section>

        <Section icon={BellRing} title="Alertas para a empresa" description="E-mail e WhatsApp que recebem os avisos importantes da operação, além do Web Push da equipe.">
          <Field label="E-mail que recebe os alertas" htmlFor="a-email" hint="Vazio: locakarveiculos@gmail.com">
            <Input id="a-email" type="email" value={draft.alerts.email} onChange={(e) => set("alerts", { ...draft.alerts, email: e.target.value })} placeholder="locakarveiculos@gmail.com" autoComplete="email" />
          </Field>
          <Field label="WhatsApp que recebe os alertas" htmlFor="a-phone" hint={`Vazio: ${COMPANY.whatsapp.display}`}>
            <Input id="a-phone" inputMode="tel" value={draft.alerts.phone} onChange={(e) => set("alerts", { ...draft.alerts, phone: maskPhone(e.target.value) })} placeholder="(19) 99999-9999" />
          </Field>
          <Checkbox
            label="Na hora: contrato assinado, nova locação ou reserva, pagamento recebido, nova multa, cancelamentos e tudo que for urgente"
            checked={draft.alerts.instant}
            onChange={(e) => set("alerts", { ...draft.alerts, instant: e.target.checked })}
            className="sm:col-span-2"
          />
          <Checkbox
            label="Resumo diário às 8h com vencimentos e atrasos"
            checked={draft.alerts.daily}
            onChange={(e) => set("alerts", { ...draft.alerts, daily: e.target.checked })}
            className="sm:col-span-2"
          />
          <p className="text-xs text-muted sm:col-span-2">
            O cliente também é avisado pelos três canais: e-mail, WhatsApp e notificação no celular (ele ativa pelo link do contrato). Salve para aplicar.
          </p>
        </Section>

        <Section icon={MessageCircle} title="WhatsApp das notificações" description="Número que envia contratos, termos, comprovantes, multas e alertas automáticos aos clientes.">
          <WhatsAppConnection />
        </Section>

        <Section icon={Mail} title="E-mails" description="Envio pelo Resend: contratos, termos de entrega/devolução, comprovantes e multas.">
          <p className="text-sm text-zinc-300 sm:col-span-2">
            Os e-mails saem do servidor. Para enviar a qualquer destinatário, o domínio precisa estar verificado no Resend (ver README).
          </p>
          <EmailTest />
        </Section>

        <Section icon={Bell} title="WhatsApp" description="Número oficial usado em todos os CTAs comerciais.">
          <Field label="Número" htmlFor="s-wa">
            <Input id="s-wa" value={COMPANY.whatsapp.display} readOnly />
          </Field>
          <Field label="Link" htmlFor="s-wa-link">
            <Input id="s-wa-link" value={getWhatsAppUrl()} readOnly />
          </Field>
          <div className="sm:col-span-2">
            <Button asChild variant="whatsapp" size="sm">
              <a href={getWhatsAppUrl(WHATSAPP_MESSAGES.availability)} target="_blank" rel="noopener noreferrer">
                <WhatsAppIcon className="size-4" /> Testar link
              </a>
            </Button>
          </div>
        </Section>

        <Section icon={ExternalLink} title="Site" description="Endereço oficial da LOCAKAR.">
          <Field label="URL" htmlFor="s-site">
            <Input id="s-site" value={COMPANY.site} readOnly />
          </Field>
        </Section>

        <Section icon={SlidersHorizontal} title="Preferências" description="Comportamento das listas e alertas.">
          <Field label="Registros por página" htmlFor="s-page">
            <Select
              id="s-page"
              value={String(draft.pageSize)}
              onChange={(e) => set("pageSize", Number(e.target.value))}
              options={[5, 10, 20, 50].map((n) => ({ value: String(n), label: `${n} registros` }))}
            />
          </Field>
          <Field label="Antecedência dos alertas" htmlFor="s-window" hint="Dias antes do vencimento">
            <Select
              id="s-window"
              value={String(draft.alertWindowDays)}
              onChange={(e) => set("alertWindowDays", Number(e.target.value))}
              options={[7, 15, 30, 60].map((n) => ({ value: String(n), label: `${n} dias` }))}
            />
          </Field>
        </Section>

        <Section icon={Palette} title="Aparência" description="Escolha como o painel administrativo será exibido.">
          <div className="flex flex-col gap-2 sm:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">Tema do Painel</label>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setTheme("light")}
                className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold transition-all ${theme === "light" ? "border-magenta bg-magenta/15 text-magenta font-bold shadow-sm" : "border-line bg-surface text-muted hover:text-white"}`}
              >
                <Sun className="size-4 text-amber-500" />
                <span>☀️ Claro</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme("dark")}
                className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold transition-all ${theme === "dark" ? "border-magenta bg-magenta/25 text-white font-bold shadow-sm" : "border-line bg-surface text-muted hover:text-white"}`}
              >
                <Moon className="size-4 text-brand-soft" />
                <span>🌙 Escuro</span>
              </button>
            </div>
            <p className="mt-1 text-xs text-muted">A troca é instantânea e afeta todo o sistema Admin sem recarregar a página.</p>
          </div>
          <Checkbox label="Tabelas compactas" checked={draft.compactTables} onChange={(e) => set("compactTables", e.target.checked)} />
        </Section>

        <Section
          icon={FileSignature}
          title="Modelos de Contrato (PDF / DOC)"
          description="Anexe até 5 tipos de contratos existentes que você já possui (em PDF ou Word) para selecionar na hora de confirmar locações e reservas."
        >
          <div className="flex flex-col gap-3 sm:col-span-2">
            {/* Lista dos contratos anexados */}
            <div className="flex flex-col gap-2">
              {!(draft.contractTemplates?.length) ? (
                <p className="rounded-xl border border-line bg-surface p-4 text-center text-xs text-muted">
                  Nenhum modelo de contrato anexado ainda. Você pode adicionar até 5 contratos em PDF ou DOC/DOCX.
                </p>
              ) : (
                draft.contractTemplates.map((tmpl) => (
                  <div key={tmpl.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3 text-xs">
                    <div className="flex items-center gap-3">
                      <div className="grid size-9 place-items-center rounded-lg bg-magenta/15 text-brand-soft">
                        <FileText className="size-4" />
                      </div>
                      <div>
                        <p className="font-semibold text-white">{tmpl.name}</p>
                        <p className="text-muted">
                          {tmpl.fileName} · anexado em {formatDate(tmpl.uploadedAt.slice(0, 10))}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={async () => {
                          const { data: signed } = await getSupabase().storage.from("documentos").createSignedUrl(tmpl.filePath, 600);
                          if (signed?.signedUrl) window.open(signed.signedUrl, "_blank");
                        }}
                      >
                        <ExternalLink className="size-3" /> Baixar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-red-400 hover:text-red-300"
                        onClick={() => handleRemoveTemplate(tmpl.id)}
                      >
                        <Trash2 className="size-3" /> Excluir
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Upload de novo modelo (se menor que 5) */}
            {(draft.contractTemplates?.length ?? 0) < 5 && (
              <div className="rounded-xl border border-line bg-white/[0.02] p-4">
                <p className="mb-2 text-xs font-semibold text-white">Adicionar novo modelo de contrato ({draft.contractTemplates?.length ?? 0} de 5)</p>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <label htmlFor="tpl-name" className="mb-1 block text-xs text-muted">Nome de identificação do contrato</label>
                    <Input
                      id="tpl-name"
                      placeholder="Ex.: Contrato Motorista de App, Contrato Mensal..."
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                    />
                  </div>
                  <label className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-magenta/40 bg-magenta/20 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-magenta/30">
                    <FileUp className="size-3.5" />
                    <span>{uploadingTemplate ? "Enviando arquivo..." : "Selecionar PDF ou DOC"}</span>
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      className="sr-only"
                      disabled={uploadingTemplate}
                      onChange={handleTemplateUpload}
                    />
                  </label>
                </div>
              </div>
            )}
          </div>
        </Section>

        <Section icon={Bell} title="Notificações" description="Alertas do sino, e-mails diários e notificações no celular/computador (Web Push) para a equipe.">
          <PushSettings />
          <p className="text-xs font-semibold uppercase tracking-wide text-muted sm:col-span-2">Alertas de vencimento</p>
          <Checkbox label="Vencimentos de multas" checked={draft.notifyFines} onChange={(e) => set("notifyFines", e.target.checked)} />
          <Checkbox label="Manutenções programadas" checked={draft.notifyMaintenance} onChange={(e) => set("notifyMaintenance", e.target.checked)} />
          <Checkbox label="Recebimentos em atraso" checked={draft.notifyReceipts} onChange={(e) => set("notifyReceipts", e.target.checked)} />
          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted sm:col-span-2">Web Push para a equipe</p>
          <Checkbox
            label="Enviar Web Push"
            checked={draft.push.enabled}
            onChange={(e) => set("push", { ...draft.push, enabled: e.target.checked })}
            className="sm:col-span-2"
          />
          {(Object.keys(CATEGORY_LABEL) as NotificationCategory[]).map((c) => (
            <Checkbox
              key={c}
              label={CATEGORY_LABEL[c]}
              disabled={!draft.push.enabled}
              checked={draft.push.enabled && draft.push.categories[c] !== false}
              onChange={(e) => set("push", { ...draft.push, categories: { ...draft.push.categories, [c]: e.target.checked } })}
            />
          ))}
          <p className="text-xs text-muted sm:col-span-2">Vale para toda a equipe. Tudo continua registrado no sino, mesmo com o Web Push desligado. Salve para aplicar.</p>
        </Section>

        {!isSupabaseEnabled && (
        <Card className="flex flex-col gap-4 border-red-400/20 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <h2 className="font-display text-base font-semibold">Dados de demonstração</h2>
            <p className="mt-1 text-sm text-muted">Apaga os dados salvos neste navegador e restaura a base de exemplo.</p>
          </div>
          <Button variant="outline" onClick={() => setConfirmReset(true)}>
            <RotateCcw /> Restaurar dados
          </Button>
        </Card>
        )}
      </div>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Restaurar dados de demonstração?"
        description="Todos os registros criados ou alterados neste navegador serão apagados. Esta ação não pode ser desfeita."
        confirmLabel="Restaurar"
        onConfirm={resetDemo}
      />
    </>
  );
}

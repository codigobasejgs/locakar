"use client";

import { Bell, Building2, ExternalLink, FileSignature, Mail, MessageCircle, Palette, RotateCcw, Send, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/page-header";
import { WhatsAppConnection } from "@/components/admin/whatsapp-connection";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Logo } from "@/components/ui/logo";
import { SignaturePad } from "@/components/ui/signature-pad";
import { WhatsAppIcon } from "@/components/ui/whatsapp-icon";
import { useAdminData } from "@/hooks/use-admin-data";
import { sendEmailRequest } from "@/lib/api";
import { isSupabaseEnabled } from "@/lib/supabase/env";
import { COMPANY, WHATSAPP_MESSAGES } from "@/lib/company";
import { getWhatsAppUrl } from "@/lib/whatsapp";
import { DEFAULT_CONTRACT_TERMS } from "@/lib/contract";
import type { CompanyProfile, CompanySettings } from "@/types";

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

        <Section icon={Palette} title="Aparência" description="O painel usa o tema escuro da identidade LOCAKAR.">
          <Checkbox label="Tabelas compactas" checked={draft.compactTables} onChange={(e) => set("compactTables", e.target.checked)} />
        </Section>

        <Section icon={Bell} title="Notificações" description="Quais alertas aparecem no sino e no dashboard.">
          <Checkbox label="Vencimentos de multas" checked={draft.notifyFines} onChange={(e) => set("notifyFines", e.target.checked)} />
          <Checkbox label="Manutenções programadas" checked={draft.notifyMaintenance} onChange={(e) => set("notifyMaintenance", e.target.checked)} />
          <Checkbox label="Recebimentos em atraso" checked={draft.notifyReceipts} onChange={(e) => set("notifyReceipts", e.target.checked)} />
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

"use client";

import {
  BellRing,
  Building2,
  CreditCard,
  FileSignature,
  Landmark,
  Mail,
  MessageCircle,
  MessageSquare,
  Moon,
  Palette,
  QrCode,
  RotateCcw,
  Send,
  SlidersHorizontal,
  Sun,
  Users,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AsaasSettings } from "@/components/admin/asaas-settings";
import { AutentiqueSettings } from "@/components/admin/autentique-settings";
import { ContractTemplatesManager } from "@/components/admin/contract-templates-manager";
import { FipeSettings } from "@/components/admin/fipe-settings";
import { InfinitePaySettingsFields } from "@/components/admin/infinitepay-settings";
import { OrgBrandingForm } from "@/components/admin/org-branding-form";
import { OrgCompanyForm } from "@/components/admin/org-company-form";
import { OrgTeamManager } from "@/components/admin/org-team-manager";
import { OrgTextsForm } from "@/components/admin/org-texts-form";
import { OrgShareLink } from "@/components/admin/org-share-link";
import { PageHeader } from "@/components/admin/page-header";
import { PaymentMethodsSettings } from "@/components/admin/payment-methods-settings";
import { PixSettingsFields } from "@/components/admin/pix-settings";
import { PushSettings } from "@/components/admin/push-settings";
import { SelsynSettings } from "@/components/admin/selsyn-settings";
import { WhatsAppConnection } from "@/components/admin/whatsapp-connection";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { SignaturePad } from "@/components/ui/signature-pad";
import { useAdminData } from "@/hooks/use-admin-data";
import { useTheme } from "@/hooks/use-theme";
import { sendEmailRequest } from "@/lib/api";
import { DEFAULT_CONTRACT_TERMS } from "@/lib/contract";
import { DEFAULT_INFINITEPAY } from "@/lib/infinitepay";
import { CATEGORY_LABEL } from "@/lib/push-events";
import { isSupabaseEnabled } from "@/lib/supabase/env";
import { maskPhone } from "@/lib/utils";
import type { CompanyProfile, CompanySettings, NotificationCategory } from "@/types";

type TabKey = "empresa" | "aparencia" | "equipe" | "textos" | "contratos" | "pagamentos" | "integracoes" | "preferencias";

const TABS: { id: TabKey; label: string; icon: typeof Building2 }[] = [
  { id: "empresa", label: "Empresa", icon: Building2 },
  { id: "aparencia", label: "Aparência", icon: Palette },
  { id: "equipe", label: "Equipe", icon: Users },
  { id: "textos", label: "Textos", icon: MessageSquare },
  { id: "contratos", label: "Contratos", icon: FileSignature },
  { id: "pagamentos", label: "Pagamentos", icon: Wallet },
  { id: "integracoes", label: "Integrações", icon: SlidersHorizontal },
  { id: "preferencias", label: "Preferências", icon: BellRing },
];

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

function Section({ id, tour, icon: Icon, title, description, children }: { id?: string; tour?: string; icon: typeof Building2; title: string; description: string; children: React.ReactNode }) {
  return (
    <Card id={id} data-tour={tour} className="p-5 sm:p-6">
      <div className="mb-5 border-b border-line pb-4">
        <div className="flex items-center gap-2">
          <Icon className="size-5 text-brand-soft" />
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
  const [tab, setTab] = useState<TabKey>(() => {
    const h = (typeof window === "undefined" ? "" : window.location.hash.replace("#", "")) as TabKey;
    return TABS.some((t) => t.id === h) ? h : "empresa";
  });
  const [newSignature, setNewSignature] = useState<string | null>(null);

  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.replace("#", "") as TabKey;
      if (TABS.some((t) => t.id === h)) setTab(h);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const changeTab = (next: TabKey) => {
    setTab(next);
    window.history.replaceState(null, "", `#${next}`);
  };

  const set = <K extends keyof CompanySettings>(key: K, value: CompanySettings[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setCompany = <K extends keyof CompanyProfile>(key: K, value: CompanyProfile[K]) =>
    setDraft((d) => ({ ...d, company: { ...d.company, [key]: value } }));

  const { theme, setTheme } = useTheme();

  const save = async () => {
    const next = newSignature ? { ...draft, company: { ...draft.company, signerSignature: newSignature } } : draft;
    if (await saveSettings(next)) {
      setDraft(next);
      window.dispatchEvent(new Event("locakar:payment-methods"));
      toast.success("Configurações salvas.");
    }
  };

  return (
    <>
      <PageHeader
        tour="settings"
        title="Configurações"
        description={`Dados da locadora, identidade visual e preferências do painel${isSupabaseEnabled ? "" : " (salvos neste navegador)"}.`}
        actions={
          tab === "contratos" || tab === "pagamentos" || tab === "preferencias" ? (
            <Button onClick={save}>Salvar alterações</Button>
          ) : undefined
        }
      />

      {/* Navegação por Abas */}
      <div data-tour="settings-tabs" className="mb-6 flex flex-wrap gap-1 rounded-2xl border border-line bg-surface p-1.5">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              data-tour={`settings-tab-${id}`}
              onClick={() => changeTab(id)}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
                active ? "bg-magenta/20 text-white font-bold shadow-sm border border-magenta/40" : "text-muted hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              <Icon className="size-3.5" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      <div className="space-y-4">
        {/* ABA: EMPRESA */}
        {tab === "empresa" && (
          <div className="space-y-4">
            <div data-tour="settings-share">
              <OrgShareLink />
            </div>
            <Card data-tour="settings-company" className="p-5 sm:p-6">
              <OrgCompanyForm />
            </Card>
          </div>
        )}

        {/* ABA: APARÊNCIA */}
        {tab === "aparencia" && (
          <div className="space-y-4">
            <Card data-tour="settings-branding" className="p-5 sm:p-6">
              <OrgBrandingForm />
            </Card>

            <Section tour="settings-theme" icon={Palette} title="Tema do Painel" description="Escolha como o painel administrativo será exibido para você neste navegador.">
              <div className="flex flex-col gap-2 sm:col-span-2">
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setTheme("light")}
                    className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold transition-all ${
                      theme === "light" ? "border-magenta bg-magenta/15 text-magenta font-bold shadow-sm" : "border-line bg-surface text-muted hover:text-white"
                    }`}
                  >
                    <Sun className="size-4 text-amber-500" />
                    <span>☀️ Claro</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTheme("dark")}
                    className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold transition-all ${
                      theme === "dark" ? "border-magenta bg-magenta/25 text-white font-bold shadow-sm" : "border-line bg-surface text-muted hover:text-white"
                    }`}
                  >
                    <Moon className="size-4 text-brand-soft" />
                    <span>🌙 Escuro</span>
                  </button>
                </div>
              </div>
              <Checkbox label="Tabelas compactas" checked={draft.compactTables} onChange={(e) => set("compactTables", e.target.checked)} />
            </Section>
          </div>
        )}

        {/* ABA: EQUIPE */}
        {tab === "equipe" && (
          <Card data-tour="settings-team" className="p-5 sm:p-6">
            <OrgTeamManager />
          </Card>
        )}

        {/* ABA: TEXTOS */}
        {tab === "textos" && (
          <Card data-tour="settings-texts" className="p-5 sm:p-6">
            <OrgTextsForm />
          </Card>
        )}

        {/* ABA: CONTRATOS */}
        {tab === "contratos" && (
          <div className="space-y-4">
            <Section
              tour="settings-contract-templates"
              icon={FileSignature}
              title="Modelos de Contrato Inteligentes"
              description="Cadastre os modelos em PDF ou DOCX da sua locadora. A IA detecta os campos variáveis para preenchimento determinístico nas locações."
            >
              <ContractTemplatesManager />
            </Section>

            <Section tour="settings-contract-signer" icon={FileSignature} title="Representante e Cláusulas Gerais" description="Dados do assinante pela locadora e cláusulas padrão para emissão.">
              <Field label="Razão social (como sairá nos contratos)" htmlFor="c-legal" required>
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
              <Field label="E-mail da empresa" htmlFor="c-email" hint="Recebe cópia dos contratos assinados" className="sm:col-span-2">
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
              <Field label="Cláusulas gerais (modelo estático)" htmlFor="c-terms" hint="Usado caso nenhum modelo dinâmico esteja configurado." className="sm:col-span-2">
                <Textarea id="c-terms" rows={10} value={draft.company.contractTerms} onChange={(e) => setCompany("contractTerms", e.target.value)} />
              </Field>
              <div className="sm:col-span-2">
                <Button variant="ghost" size="sm" onClick={() => setCompany("contractTerms", DEFAULT_CONTRACT_TERMS)}>
                  <RotateCcw /> Restaurar cláusulas padrão
                </Button>
              </div>
            </Section>
          </div>
        )}

        {/* ABA: PAGAMENTOS */}
        {tab === "pagamentos" && (
          <div className="space-y-4">
            <Section id="config-meios" tour="settings-payment-methods" icon={Wallet} title="Meios de pagamento ativos" description="Escolha quais formas de pagamento estarão disponíveis para seus clientes. Vale na hora para o painel e o App Locatário.">
              <PaymentMethodsSettings
                onToggled={(id, enabled) => {
                  if (id === "pix_manual") setDraft((d) => ({ ...d, pix: { ...d.pix, enabled } }));
                  if (id === "infinitepay") setDraft((d) => ({ ...d, infinitepay: { ...(d.infinitepay ?? DEFAULT_INFINITEPAY), enabled } }));
                }}
              />
            </Section>

            <Section id="config-pix" tour="settings-pix" icon={QrCode} title="PIX QR Code (comprovante manual)" description="Chave usada no QR Code e no copia e cola. O Pix cai direto na sua conta; o cliente envia o comprovante e a equipe aprova.">
              <PixSettingsFields value={draft.pix} onChange={(pix) => set("pix", pix)} />
            </Section>

            <Section id="config-infinitepay" tour="settings-infinitepay" icon={CreditCard} title="InfinitePay" description="Receber parcelas por aproximação no celular (InfiniteTap) ou link de pagamento Pix / cartão (Checkout Integrado).">
              <InfinitePaySettingsFields value={draft.infinitepay ?? DEFAULT_INFINITEPAY} onChange={(infinitepay) => set("infinitepay", infinitepay)} />
            </Section>

            <Section id="config-asaas" tour="settings-asaas" icon={Landmark} title="Asaas (Cobranças automáticas)" description="Cobranças Pix, boleto, cartão e fatura com baixa automática por webhook. Opcional: desligado, o PIX e a baixa manual continuam iguais.">
              <AsaasSettings />
            </Section>
          </div>
        )}

        {/* ABA: INTEGRAÇÕES */}
        {tab === "integracoes" && (
          <div className="space-y-4">
            <Section tour="settings-fipe" icon={SlidersHorizontal} title="Tabela FIPE" description="Valores mensais e histórico da frota comercial.">
              <FipeSettings />
            </Section>
            <Section tour="settings-selsyn" icon={SlidersHorizontal} title="Selsyn — Rastreamento" description="Posições, sensores e relatórios da frota. Credencial somente no backend.">
              <SelsynSettings />
            </Section>
            <Section id="config-autentique" tour="settings-autentique" icon={FileSignature} title="Autentique — Assinatura eletrônica" description="Envia o contrato da locação para assinatura do locatário e da locadora. Token e segredo ficam cifrados no servidor.">
              <AutentiqueSettings />
            </Section>
            <Section tour="settings-whatsapp" icon={MessageCircle} title="WhatsApp das notificações" description="Número que envia contratos, termos, comprovantes, multas e alertas automáticos aos clientes.">
              <WhatsAppConnection />
            </Section>
            <Section tour="settings-email" icon={Mail} title="E-mails" description="Envio pelo Resend: contratos, termos de entrega/devolução, comprovantes e multas.">
              <p className="text-sm text-zinc-300 sm:col-span-2">
                Os e-mails saem do servidor com a identidade da sua locadora. Para enviar a qualquer destinatário, o domínio precisa estar verificado no Resend.
              </p>
              <EmailTest />
            </Section>
          </div>
        )}

        {/* ABA: PREFERÊNCIAS */}
        {tab === "preferencias" && (
          <div className="space-y-4">
            <Section tour="settings-alerts" icon={BellRing} title="Alertas para a locadora" description="E-mail e WhatsApp que recebem os avisos importantes da operação, além do Web Push da equipe.">
              <Field label="E-mail que recebe os alertas" htmlFor="a-email">
                <Input id="a-email" type="email" value={draft.alerts.email} onChange={(e) => set("alerts", { ...draft.alerts, email: e.target.value })} placeholder="seu-email@locadora.com" autoComplete="email" />
              </Field>
              <Field label="WhatsApp que recebe os alertas" htmlFor="a-phone">
                <Input id="a-phone" inputMode="tel" value={draft.alerts.phone} onChange={(e) => set("alerts", { ...draft.alerts, phone: maskPhone(e.target.value) })} placeholder="(11) 99999-9999" />
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
            </Section>

            <Section tour="settings-push" icon={SlidersHorizontal} title="Notificações da equipe (Web Push)" description="Alertas do sino e notificações no navegador/celular.">
              <PushSettings />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted sm:col-span-2">Alertas de vencimento</p>
              <Checkbox label="Vencimentos de multas" checked={draft.notifyFines} onChange={(e) => set("notifyFines", e.target.checked)} />
              <Checkbox label="Manutenções programadas" checked={draft.notifyMaintenance} onChange={(e) => set("notifyMaintenance", e.target.checked)} />
              <Checkbox label="Recebimentos de aluguel" checked={draft.notifyReceipts} onChange={(e) => set("notifyReceipts", e.target.checked)} />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted sm:col-span-2">Categorias ativas no Web Push</p>
              {(Object.keys(CATEGORY_LABEL) as NotificationCategory[]).map((c) => (
                <Checkbox
                  key={c}
                  label={CATEGORY_LABEL[c]}
                  disabled={!draft.push.enabled}
                  checked={draft.push.enabled && draft.push.categories[c] !== false}
                  onChange={(e) => set("push", { ...draft.push, categories: { ...draft.push.categories, [c]: e.target.checked } })}
                />
              ))}
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

"use client";

import { Building2, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { useOrganization } from "@/hooks/use-organization";
import { maskCNPJ, maskPhone } from "@/lib/utils";
import type { Organization } from "@/types";

/** Monta o formulário só com a locadora carregada; remonta quando ela muda. */
export function OrgCompanyForm() {
  const { org } = useOrganization();
  if (!org) return <div className="h-64 animate-pulse rounded-2xl bg-white/[0.04]" />;
  return <CompanyForm key={org.id + (org.created_at ?? "")} org={org} />;
}

function CompanyForm({ org }: { org: Organization }) {
  const { reload } = useOrganization();
  const [name, setName] = useState(org.name || "");
  const [legalName, setLegalName] = useState(org.legal_name || "");
  const [doc, setDoc] = useState(org.document || "");
  const [email, setEmail] = useState(org.email || "");
  const [phone, setPhone] = useState(org.phone || "");
  const [whatsapp, setWhatsapp] = useState(org.whatsapp || "");
  const [website, setWebsite] = useState(org.website || "");
  const [address, setAddress] = useState(org.address || "");
  const [city, setCity] = useState(org.city || "");
  const [state, setState] = useState(org.state || "");
  const [cep, setCep] = useState(org.cep || "");
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "company",
          name,
          legalName,
          document: doc,
          email,
          phone,
          whatsapp,
          website,
          address,
          city,
          state,
          cep,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Não foi possível salvar.");
      toast.success("Dados da locadora atualizados.");
      reload();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="flex items-center gap-2 border-b border-line pb-3">
        <Building2 className="size-5 text-brand-soft" />
        <div>
          <h3 className="font-semibold text-white">Dados da Locadora</h3>
          <p className="text-xs text-muted">Informações legais e de contato usadas nos contratos, comprovantes e no app.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome fantasia (exibido na plataforma)" htmlFor="c-name" required>
          <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>

        <Field label="Razão social" htmlFor="c-legal">
          <Input id="c-legal" value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Empresa Ltda" />
        </Field>

        <Field label="CNPJ / CPF" htmlFor="c-doc">
          <Input id="c-doc" value={doc} onChange={(e) => setDoc(maskCNPJ(e.target.value))} placeholder="00.000.000/0000-00" />
        </Field>

        <Field label="E-mail principal" htmlFor="c-email">
          <Input id="c-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contato@sualocadora.com" />
        </Field>

        <Field label="Telefone" htmlFor="c-phone">
          <Input id="c-phone" value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} placeholder="(11) 99999-0000" />
        </Field>

        <Field label="WhatsApp de atendimento" htmlFor="c-wa" hint="Usado nos links do aplicativo e contratos">
          <Input id="c-wa" value={whatsapp} onChange={(e) => setWhatsapp(maskPhone(e.target.value))} placeholder="(11) 99999-0000" />
        </Field>

        <Field label="Site oficial" htmlFor="c-site" className="sm:col-span-2">
          <Input id="c-site" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://www.sualocadora.com.br" />
        </Field>

        <Field label="Endereço completo" htmlFor="c-addr" className="sm:col-span-2">
          <Input id="c-addr" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Av. Principal, 100 - Bairro" />
        </Field>

        <Field label="Cidade" htmlFor="c-city">
          <Input id="c-city" value={city} onChange={(e) => setCity(e.target.value)} />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="UF" htmlFor="c-uf">
            <Input id="c-uf" value={state} onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))} maxLength={2} placeholder="SP" />
          </Field>
          <Field label="CEP" htmlFor="c-cep">
            <Input id="c-cep" value={cep} onChange={(e) => setCep(e.target.value.replace(/\D/g, "").slice(0, 8))} maxLength={9} placeholder="00000-000" />
          </Field>
        </div>
      </div>

      <div className="pt-2 flex justify-end">
        <Button type="submit" disabled={saving}>
          <Save className="size-4" /> {saving ? "Salvando..." : "Salvar dados"}
        </Button>
      </div>
    </form>
  );
}

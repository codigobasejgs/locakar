"use client";

import { ArrowDownToLine, ArrowUpFromLine, CheckCircle2, Mail, Printer } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { SignaturePad } from "@/components/ui/signature-pad";
import { useAdminData, useLookups } from "@/hooks/use-admin-data";
import { sendEmailRequest } from "@/lib/api";
import { authService } from "@/lib/auth";
import { FUEL_LABEL, FUEL_ORDER, INSPECTION_ITEMS } from "@/lib/contract";
import { inspectionDocument } from "@/lib/documents";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type { FuelLevel, Inspection, InspectionItem, Rental } from "@/types";
import { openDocument } from "./contract-panel";

type Kind = "delivery" | "return";
const TITLES: Record<Kind, string> = { delivery: "Entrega ao cliente (check-out)", return: "Devolução (check-in)" };
const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function InspectionPanel({ rental }: { rental: Rental }) {
  const { update } = useAdminData();
  const { clientById, vehicleById } = useLookups();
  const [open, setOpen] = useState<Kind | null>(null);
  const client = clientById.get(rental.clientId);
  const vehicle = vehicleById.get(rental.vehicleId);
  const meta = { clientName: client?.name ?? "—", vehicle: vehicle?.name ?? "—", plate: vehicle?.plate ?? "—" };

  const email = async (kind: Kind) => {
    try {
      const to = await sendEmailRequest({ kind, rentalId: rental.id });
      toast.success(`Termo enviado para ${to}.`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const save = async (kind: Kind, inspection: Inspection) => {
    const patch: Partial<Rental> =
      kind === "delivery"
        ? { deliveryInspection: inspection, kmStart: inspection.km, status: "active" }
        : { returnInspection: inspection, kmEnd: inspection.km, status: "finished" };
    if (!(await update("rentals", rental.id, patch))) return false;
    // Veículo acompanha a vistoria: entregue → alugado; devolvido → disponível.
    if (vehicle && vehicle.status !== "sold") await update("vehicles", vehicle.id, { status: kind === "delivery" ? "rented" : "available" });
    toast.success(kind === "delivery" ? "Entrega registrada." : "Devolução registrada.");
    await email(kind); // e-mail e/ou WhatsApp; avisa na tela se nenhum canal estiver disponível
    return true;
  };

  const block = (kind: Kind) => {
    const done = kind === "delivery" ? rental.deliveryInspection : rental.returnInspection;
    const disabled = kind === "return" && !rental.deliveryInspection;
    return (
      <div className="rounded-xl border border-line p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold">
            {kind === "delivery" ? <ArrowUpFromLine className="size-4 text-brand-soft" /> : <ArrowDownToLine className="size-4 text-brand-soft" />}
            {TITLES[kind]}
          </p>
          {done ? <Badge tone="success">Registrada</Badge> : <Badge tone="neutral">Pendente</Badge>}
        </div>
        {done ? (
          <>
            <p className="mt-2 text-xs text-muted">
              {when(done.at)} · {formatNumber(done.km)} km · combustível {FUEL_LABEL[done.fuel]} · {done.items.filter((i) => !i.ok).length} avaria(s)
              {done.extraCharges ? ` · adicionais ${formatCurrency(done.extraCharges)}` : ""}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => openDocument(inspectionDocument(kind, done, meta))}>
                <Printer /> Termo
              </Button>
              <Button size="sm" variant="ghost" onClick={() => email(kind)}>
                <Mail /> Reenviar ao cliente
              </Button>
            </div>
          </>
        ) : (
          <Button size="sm" className="mt-3" onClick={() => setOpen(kind)} disabled={disabled}>
            <CheckCircle2 /> {kind === "delivery" ? "Registrar entrega" : "Registrar devolução"}
          </Button>
        )}
        {disabled && !done && <p className="mt-2 text-xs text-muted">Registre a entrega primeiro.</p>}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader title="Vistorias" description="Checklist e assinatura do cliente na entrega e na devolução." />
      <div className="grid gap-3 p-5 md:grid-cols-2">
        {block("delivery")}
        {block("return")}
      </div>
      {open && (
        <InspectionDialog
          kind={open}
          rental={rental}
          clientName={client?.name ?? ""}
          onClose={() => setOpen(null)}
          onSave={async (i) => {
            if (await save(open, i)) setOpen(null);
          }}
        />
      )}
    </Card>
  );
}

function InspectionDialog({
  kind,
  rental,
  clientName,
  onClose,
  onSave,
}: {
  kind: Kind;
  rental: Rental;
  clientName: string;
  onClose: () => void;
  onSave: (i: Inspection) => Promise<void>;
}) {
  const delivery = rental.deliveryInspection;
  const [km, setKm] = useState(String(kind === "return" ? (delivery?.km ?? rental.kmStart ?? "") : (rental.kmStart ?? "")));
  const [fuel, setFuel] = useState<FuelLevel>(kind === "return" ? (delivery?.fuel ?? "full") : "full");
  const [items, setItems] = useState<InspectionItem[]>(INSPECTION_ITEMS.map((i) => ({ ...i, ok: true })));
  const [damages, setDamages] = useState("");
  const [notes, setNotes] = useState("");
  const [extra, setExtra] = useState("");
  const [signer, setSigner] = useState(clientName);
  const [signature, setSignature] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const minKm = kind === "return" ? (delivery?.km ?? rental.kmStart ?? 0) : 0;
  const fuelDrop = kind === "return" && delivery && FUEL_ORDER.indexOf(fuel) < FUEL_ORDER.indexOf(delivery.fuel);

  const submit = async () => {
    const kmNum = Number(km);
    if (!Number.isFinite(kmNum) || kmNum < minKm) return void toast.error(`Informe a quilometragem (mínimo ${formatNumber(minKm)} km).`);
    if (items.some((i) => !i.ok) && !damages.trim()) return void toast.error("Descreva as avarias encontradas.");
    if (!signature) return void toast.error("O cliente precisa assinar a vistoria.");
    setSaving(true);
    const staff = await authService.getSession();
    await onSave({
      at: new Date().toISOString(),
      km: kmNum,
      fuel,
      items,
      damages: damages.trim() || undefined,
      notes: notes.trim() || undefined,
      extraCharges: extra ? Number(extra) : undefined,
      staffName: staff?.email ?? "Equipe LOCAKAR",
      clientName: signer.trim() || clientName,
      clientSignature: signature,
    });
    setSaving(false);
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={TITLES[kind]}
      description="Confira o veículo junto com o cliente e colete a assinatura."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Salvando..." : "Concluir vistoria"}
          </Button>
        </>
      }
    >
      <div className="grid gap-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Quilometragem" htmlFor="i-km" required hint={kind === "return" && delivery ? `Na entrega: ${formatNumber(delivery.km)} km` : undefined}>
            <Input id="i-km" type="number" min={minKm} value={km} onChange={(e) => setKm(e.target.value)} required />
          </Field>
          <Field label="Combustível" htmlFor="i-fuel" hint={kind === "return" && delivery ? `Na entrega: ${FUEL_LABEL[delivery.fuel]}` : undefined}>
            <Select id="i-fuel" value={fuel} onChange={(e) => setFuel(e.target.value as FuelLevel)} options={FUEL_ORDER.map((f) => ({ value: f, label: FUEL_LABEL[f] }))} />
          </Field>
          {kind === "return" && (
            <Field label="Valores adicionais (R$)" htmlFor="i-extra" hint="Combustível, avarias, limpeza">
              <Input id="i-extra" type="number" min={0} step="0.01" value={extra} onChange={(e) => setExtra(e.target.value)} />
            </Field>
          )}
        </div>
        {fuelDrop && <p className="text-sm text-amber-300">Combustível abaixo do nível da entrega: avalie a cobrança da diferença.</p>}

        <fieldset>
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Checklist (desmarque o que tiver avaria)</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {items.map((it, idx) => (
              <Checkbox
                key={it.key}
                label={it.label}
                checked={it.ok}
                onChange={(e) => setItems((prev) => prev.map((p, i) => (i === idx ? { ...p, ok: e.target.checked } : p)))}
                className="rounded-lg border border-line px-3 py-2"
              />
            ))}
          </div>
        </fieldset>

        <Field label="Avarias" htmlFor="i-damages" hint="Obrigatório se algum item foi desmarcado">
          <Textarea id="i-damages" value={damages} onChange={(e) => setDamages(e.target.value)} placeholder="Ex.: risco na porta traseira direita" />
        </Field>
        <Field label="Observações" htmlFor="i-notes">
          <Textarea id="i-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-[1fr_1.4fr]">
          <Field label="Nome de quem assina" htmlFor="i-signer">
            <Input id="i-signer" value={signer} onChange={(e) => setSigner(e.target.value)} />
          </Field>
          <SignaturePad onChange={setSignature} label="Assinatura do cliente" />
        </div>
      </div>
    </Dialog>
  );
}

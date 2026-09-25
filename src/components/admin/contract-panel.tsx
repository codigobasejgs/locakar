"use client";

import { Ban, Copy, Eye, FilePlus2, Mail, Printer } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { useAdminData, useLookups } from "@/hooks/use-admin-data";
import { sendEmailRequest } from "@/lib/api";
import { authService } from "@/lib/auth";
import { CONTRACT_STATUS, ROUTES } from "@/lib/constants";
import { buildContractText, missingClientFields, missingCompanyFields } from "@/lib/contract";
import { contractDocument } from "@/lib/documents";
import { newId } from "@/lib/utils";
import type { Contract, Rental } from "@/types";

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");

/** Abre documento HTML em nova aba para imprimir ou salvar em PDF. */
export function openDocument(html: string) {
  const w = window.open("", "_blank");
  if (!w) return toast.error("Permita pop-ups para abrir o documento.");
  w.document.open();
  w.document.write(html);
  w.document.close();
}

export function ContractPanel({ rental }: { rental: Rental }) {
  const { data, settings, create, update } = useAdminData();
  const { clientById, vehicleById } = useLookups();
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState<Contract | null>(null);
  const [viewing, setViewing] = useState<Contract | null>(null);
  const client = clientById.get(rental.clientId);
  const vehicle = vehicleById.get(rental.vehicleId);

  const contracts = (data!.contracts ?? [])
    .filter((c) => c.rentalId === rental.id)
    .sort((a, b) => (b.issuedAt ?? "").localeCompare(a.issuedAt ?? ""));
  const active = contracts.find((c) => c.status !== "cancelled");

  const signUrl = (c: Contract) => `${window.location.origin}/assinar/${c.token}`;

  const issue = async () => {
    if (!client || !vehicle) return;
    const missingCompany = missingCompanyFields(settings.company);
    if (missingCompany.length) return void toast.error(`Complete os dados da empresa em Configurações: ${missingCompany.join(", ")}.`);
    const missingClient = missingClientFields(client);
    if (missingClient.length) return void toast.error(`Complete o cadastro do cliente: ${missingClient.join(", ")}.`);
    setBusy(true);
    const staff = await authService.getSession();
    const contract: Contract = {
      id: newId(),
      rentalId: rental.id,
      status: "pending",
      token: Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join(""),
      content: buildContractText({ rental, client, vehicle, company: settings.company, issuedAt: new Date() }),
      clientName: client.name,
      clientCpf: client.cpf,
      clientEmail: client.email,
      companySigner: settings.company.signerName,
      companySignature: settings.company.signerSignature,
      companyEmail: settings.company.email || staff?.email,
    };
    if (await create("contracts", contract)) toast.success("Contrato gerado.");
    setBusy(false);
  };

  const send = async (c: Contract) => {
    setBusy(true);
    try {
      const to = await sendEmailRequest({ kind: "contract_signature", contractId: c.id });
      toast.success(`Link de assinatura enviado para ${to}.`);
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(false);
  };

  const copy = async (c: Contract) => {
    try {
      await navigator.clipboard.writeText(signUrl(c));
      toast.success("Link de assinatura copiado.");
    } catch {
      toast.error("Não foi possível copiar. Abra o contrato e copie o link manualmente.");
    }
  };

  return (
    <Card>
      <CardHeader
        title="Contrato e assinatura"
        description={active ? `Emitido em ${when(active.issuedAt)}` : "Gere o contrato para assinatura eletrônica do cliente."}
        action={active && <StatusBadge map={CONTRACT_STATUS} value={active.status} />}
      />
      <div className="space-y-4 p-5">
        {!active && (
          <>
            <Button onClick={issue} disabled={busy}>
              <FilePlus2 /> Gerar contrato
            </Button>
            {missingCompanyFields(settings.company).length > 0 && (
              <p className="text-xs text-amber-300">
                Antes, preencha os dados da empresa em{" "}
                <Link href={ROUTES.settings} className="underline">
                  Configurações
                </Link>
                .
              </p>
            )}
          </>
        )}

        {active?.status === "pending" && (
          <>
            <p className="text-sm text-zinc-300">
              O cliente assina pelo link, confirmando o CPF.{" "}
              {client?.email ? (
                <>
                  E-mail cadastrado: <strong>{client.email}</strong>.
                </>
              ) : (
                <span className="text-amber-300">Cliente sem e-mail: envie o link pelo WhatsApp.</span>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => send(active)} disabled={busy || !active.clientEmail}>
                <Mail /> Enviar por e-mail
              </Button>
              <Button variant="outline" onClick={() => copy(active)}>
                <Copy /> Copiar link
              </Button>
              <Button variant="outline" asChild>
                <a href={`/assinar/${active.token}`} target="_blank" rel="noopener noreferrer">
                  <Eye /> Assinar presencialmente
                </a>
              </Button>
              <Button variant="ghost" onClick={() => setCancelling(active)}>
                <Ban /> Cancelar
              </Button>
            </div>
          </>
        )}

        {active?.status === "signed" && (
          <p className="text-sm text-zinc-300">
            Assinado por <strong>{active.signedName}</strong> em {when(active.signedAt)} · IP {active.signedIp ?? "—"}
          </p>
        )}

        {contracts.length > 0 && (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {contracts.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
                <span>
                  <StatusBadge map={CONTRACT_STATUS} value={c.status} />
                  <span className="ml-2 text-xs text-muted">emitido {when(c.issuedAt)}</span>
                </span>
                <span className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setViewing(c)}>
                    <Eye /> Ver
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => openDocument(contractDocument(c))}>
                    <Printer /> Imprimir
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)} title="Contrato" size="lg">
        {viewing && (
          <>
            <pre className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-xl bg-white p-4 font-sans text-sm text-zinc-900">{viewing.content}</pre>
            <p className="mt-2 break-all text-xs text-muted">SHA-256: {viewing.contentHash ?? "—"}</p>
          </>
        )}
      </Dialog>

      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(o) => !o && setCancelling(null)}
        title="Cancelar contrato?"
        description="O link de assinatura deixa de funcionar. Você poderá gerar um novo contrato em seguida."
        confirmLabel="Cancelar contrato"
        onConfirm={async () => {
          if (cancelling && (await update("contracts", cancelling.id, { status: "cancelled" }))) toast.success("Contrato cancelado.");
        }}
      />
    </Card>
  );
}

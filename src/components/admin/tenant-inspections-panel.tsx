"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/form";
import { FUEL_LABEL } from "@/lib/contract";
import { PHOTO_SLOTS, TENANT_INSPECTION_KIND, TENANT_INSPECTION_STATUS } from "@/lib/tenant";
import { formatNumber } from "@/lib/utils";
import type { FuelLevel, InspectionItem, Rental } from "@/types";
import { tenantAdminGet, tenantAdminPost, when } from "./tenant-api";

interface AppInspection {
  id: string;
  kind: string;
  km: number;
  fuel: FuelLevel;
  items: InspectionItem[];
  damages: string | null;
  notes: string | null;
  status: string;
  adminNotes: string | null;
  signatureSvg: string | null;
  ipAddress: string | null;
  createdAt: string;
  photos: { slot: string; url: string | null }[];
}

const slotLabel = (slot: string) => PHOTO_SLOTS.find((s) => s.key === slot)?.label ?? "Avaria";

/**
 * Vistorias enviadas pelo cliente no app, com comparação Retirada × Devolução (km, combustível,
 * checklist e fotos lado a lado). A vistoria oficial da equipe continua no painel ao lado.
 */
export function TenantInspectionsPanel({ rental }: { rental: Rental }) {
  const [list, setList] = useState<AppInspection[] | null>(null);
  const [open, setOpen] = useState<AppInspection | null>(null);
  const [compare, setCompare] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const fetchList = useCallback(async () => (await tenantAdminGet<{ inspections: AppInspection[] }>(`view=inspections&rentalId=${encodeURIComponent(rental.id)}`))?.inspections ?? [], [rental.id]);
  useEffect(() => {
    let alive = true;
    fetchList().then((l) => alive && setList(l));
    return () => {
      alive = false;
    };
  }, [fetchList]);

  if (!list?.length) return null;
  const delivery = list.find((i) => i.kind === "delivery");
  const ret = list.find((i) => i.kind === "return");

  const act = async (approve: boolean) => {
    if (!open) return;
    setBusy(true);
    try {
      await tenantAdminPost({ action: "inspection.review", id: open.id, approve, adminNotes: notes });
      toast.success(approve ? "Vistoria conferida. O cliente foi avisado." : "Pedido para refazer enviado ao cliente.");
      setOpen(null);
      setList(await fetchList());
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <Card className="mt-4">
      <CardHeader
        title="Vistorias feitas pelo cliente no app"
        description="Fotos e checklist enviados pelo locatário. Confira e compare retirada com devolução."
        action={
          delivery &&
          ret && (
            <Button size="sm" variant="outline" onClick={() => setCompare(true)}>
              Comparar retirada × devolução
            </Button>
          )
        }
      />
      <ul className="divide-y divide-line px-5 pb-3 pt-2">
        {list.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-white">{TENANT_INSPECTION_KIND[i.kind]}</p>
                <Badge tone={TENANT_INSPECTION_STATUS[i.status]?.tone}>{TENANT_INSPECTION_STATUS[i.status]?.label}</Badge>
              </div>
              <p className="text-xs text-muted">
                {when(i.createdAt)} · {formatNumber(i.km)} km · {FUEL_LABEL[i.fuel]} · {i.items.filter((x) => !x.ok).length} item(ns) com problema · {i.photos.length} fotos
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setOpen(i);
                setNotes(i.adminNotes ?? "");
              }}
            >
              {i.status === "submitted" ? "Conferir" : "Ver"}
            </Button>
          </li>
        ))}
      </ul>

      <Dialog
        open={!!open}
        onOpenChange={(o) => !o && !busy && setOpen(null)}
        title={open ? `Vistoria pelo app · ${TENANT_INSPECTION_KIND[open.kind]}` : ""}
        description={open ? `${when(open.createdAt)}${open.ipAddress ? ` · IP ${open.ipAddress}` : ""}` : undefined}
        size="lg"
        footer={
          open?.status === "submitted" && (
            <>
              <Button variant="outline" disabled={busy || !notes.trim()} onClick={() => act(false)}>
                <XCircle /> Pedir para refazer
              </Button>
              <Button disabled={busy} onClick={() => act(true)}>
                <CheckCircle2 /> Marcar como conferida
              </Button>
            </>
          )
        }
      >
        {open && (
          <div className="grid gap-4 text-sm">
            <InspectionSummary i={open} />
            {open.signatureSvg && (
              <div>
                <p className="mb-1 text-xs uppercase text-muted">Assinatura do cliente</p>
                {/* SVG montado pelo servidor só com o traço (lib/tenant.ts: signatureSvg). */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`data:image/svg+xml;utf8,${encodeURIComponent(open.signatureSvg)}`} alt="Assinatura do cliente" className="h-24 rounded-lg bg-white p-2" />
              </div>
            )}
            {open.status === "submitted" && (
              <Field label="Observação para o cliente" htmlFor="insp-notes" hint="Obrigatória para pedir que refaça.">
                <Textarea id="insp-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
            )}
          </div>
        )}
      </Dialog>

      <Dialog open={compare} onOpenChange={setCompare} title="Retirada × Devolução (pelo app)" size="lg">
        {delivery && ret && (
          <div className="grid gap-4 text-sm">
            <dl className="grid grid-cols-3 gap-2 rounded-xl border border-line p-4">
              <dt className="text-xs uppercase text-muted" />
              <dt className="text-xs uppercase text-muted">Retirada</dt>
              <dt className="text-xs uppercase text-muted">Devolução</dt>
              <dd className="text-muted">Quilometragem</dd>
              <dd className="tabular-nums">{formatNumber(delivery.km)} km</dd>
              <dd className="tabular-nums">
                {formatNumber(ret.km)} km <span className="text-brand-soft">(+{formatNumber(ret.km - delivery.km)})</span>
              </dd>
              <dd className="text-muted">Combustível</dd>
              <dd>{FUEL_LABEL[delivery.fuel]}</dd>
              <dd className={ret.fuel !== delivery.fuel ? "text-amber-300" : ""}>{FUEL_LABEL[ret.fuel]}</dd>
              {delivery.items.map((it) => {
                const after = ret.items.find((x) => x.key === it.key);
                const worse = it.ok && after && !after.ok;
                return [
                  <dd key={`${it.key}-l`} className="text-muted">
                    {it.label}
                  </dd>,
                  <dd key={`${it.key}-a`}>{it.ok ? "OK" : `Problema${it.note ? `: ${it.note}` : ""}`}</dd>,
                  <dd key={`${it.key}-b`} className={worse ? "font-semibold text-red-300" : ""}>
                    {after ? (after.ok ? "OK" : `Problema${after.note ? `: ${after.note}` : ""}`) : "—"}
                  </dd>,
                ];
              })}
            </dl>
            <div className="grid gap-3">
              {PHOTO_SLOTS.map((s) => {
                const a = delivery.photos.find((p) => p.slot === s.key)?.url;
                const b = ret.photos.find((p) => p.slot === s.key)?.url;
                return (
                  <div key={s.key}>
                    <p className="mb-1 text-xs uppercase text-muted">{s.label}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[a, b].map((src, n) =>
                        src ? (
                          <a key={n} href={src} target="_blank" rel="noopener noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={src} alt={`${s.label} na ${n ? "devolução" : "retirada"}`} className="aspect-[4/3] w-full rounded-lg object-cover" />
                          </a>
                        ) : (
                          <div key={n} className="grid aspect-[4/3] place-items-center rounded-lg border border-line text-xs text-muted">
                            Sem foto
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Dialog>
    </Card>
  );
}

function InspectionSummary({ i }: { i: AppInspection }) {
  return (
    <>
      <dl className="grid grid-cols-2 gap-3 rounded-xl border border-line p-4 sm:grid-cols-4">
        <div>
          <dt className="text-xs uppercase text-muted">Quilometragem</dt>
          <dd className="tabular-nums">{formatNumber(i.km)} km</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted">Combustível</dt>
          <dd>{FUEL_LABEL[i.fuel]}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs uppercase text-muted">Avarias / observações</dt>
          <dd>{[i.damages, i.notes].filter(Boolean).join(" · ") || "—"}</dd>
        </div>
      </dl>
      <ul className="grid gap-1 sm:grid-cols-2">
        {i.items.map((it) => (
          <li key={it.key} className={it.ok ? "text-zinc-300" : "text-red-300"}>
            {it.ok ? "✓" : "✗"} {it.label}
            {it.note ? ` — ${it.note}` : ""}
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {i.photos.map((p, n) =>
          p.url ? (
            <a key={n} href={p.url} target="_blank" rel="noopener noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={slotLabel(p.slot)} className="aspect-[4/3] w-full rounded-lg object-cover" />
              <span className="mt-0.5 block text-xs text-muted">{slotLabel(p.slot)}</span>
            </a>
          ) : null,
        )}
      </div>
    </>
  );
}

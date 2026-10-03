"use client";

import { Check, Copy, ExternalLink, Link2, Smartphone } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useOrganization } from "@/hooks/use-organization";

function Row({ icon: Icon, label, url, hint, copied, onCopy }: { icon: typeof Link2; label: string; url: string; hint: string; copied: boolean; onCopy: () => void }) {
  return (
  <div className="space-y-1.5">
    <p className="flex items-center gap-1.5 text-xs font-semibold text-white">
      <Icon className="size-3.5 text-brand-soft" /> {label}
    </p>
    <div className="flex items-center gap-2">
      <input readOnly value={url} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 py-2 font-mono text-[11px] text-zinc-300" />
      <Button type="button" size="sm" variant="outline" onClick={onCopy} aria-label={`Copiar ${label}`}>
        {copied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
      </Button>
      <Button asChild size="sm" variant="ghost">
        <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${label}`}>
          <ExternalLink className="size-4" />
        </a>
      </Button>
    </div>
    <p className="text-[11px] text-muted">{hint}</p>
  </div>
  );
}

/** Links de divulgação da locadora: página pública e app do locatário, com QR Code. */
export function OrgShareLink() {
  const { org } = useOrganization();
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const page = org ? `${origin}/l/${org.slug}` : "";
  const app = org ? `${origin}/locatario?org=${org.slug}` : "";

  useEffect(() => {
    let alive = true;
    if (page) QRCode.toDataURL(page, { width: 320, margin: 1, errorCorrectionLevel: "M" }).then((u) => alive && setQr(u), () => {});
    return () => {
      alive = false;
    };
  }, [page]);

  if (!org) return null;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      toast.success("Link copiado!");
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("Não foi possível copiar. Selecione e copie o link manualmente.");
    }
  };


  return (
    <div className="grid gap-5 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-[1fr_auto]">
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold text-white">Link da sua locadora</h3>
          <p className="text-xs text-muted">Divulgue no Instagram, WhatsApp, Google ou no adesivo do carro. O cliente vê sua frota e já entra no app com a sua marca.</p>
        </div>
        <Row icon={Link2} label="Página da locadora" url={page} copied={copied === page} onCopy={() => copy(page)} hint="Frota disponível, WhatsApp e botão para o app." />
        <Row icon={Smartphone} label="Link direto do app" url={app} copied={copied === app} onCopy={() => copy(app)} hint="Abre o app do locatário já na sua locadora (cadastro e login com a sua marca)." />
      </div>
      {qr && (
        <div className="flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR Code da página da locadora" className="size-40 rounded-xl bg-white p-2" />
          <a href={qr} download={`qrcode-${org.slug}.png`} className="text-xs text-brand-soft underline">
            Baixar QR Code
          </a>
        </div>
      )}
    </div>
  );
}

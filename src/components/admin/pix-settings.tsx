"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Field, Input, Select } from "@/components/ui/form";
import { PIX_KEY_LABEL, normalizePixKey, pixPayload } from "@/lib/billing";
import type { PixKeyType, PixSettings } from "@/types";

const PLACEHOLDER: Record<PixKeyType, string> = {
  cnpj: "00.000.000/0000-00",
  cpf: "000.000.000-00",
  phone: "(19) 99999-9999",
  email: "financeiro@locakar.com.br",
  random: "123e4567-e89b-12d3-a456-426614174000",
};

/** Chave PIX das cobranças, com QR Code de teste (R$ 1,00) para conferir num app de banco antes de usar. */
export function PixSettingsFields({ value, onChange }: { value: PixSettings; onChange: (v: PixSettings) => void }) {
  const [qr, setQr] = useState<{ code: string; url: string } | null>(null);
  const set = <K extends keyof PixSettings>(k: K, v: PixSettings[K]) => onChange({ ...value, [k]: v });
  const valid = value.key.trim() ? normalizePixKey(value.key, value.keyType) : null;
  const ready = Boolean(valid && value.name.trim() && value.city.trim());
  const code = ready ? pixPayload(value, 1, "LOCAKARTESTE") : null;

  // QR gerado de forma assíncrona; só é exibido se corresponder ao código atual.
  useEffect(() => {
    if (!code) return;
    let alive = true;
    QRCode.toDataURL(code, { width: 220, margin: 1, errorCorrectionLevel: "M" }).then((url) => alive && setQr({ code, url }), () => {});
    return () => {
      alive = false;
    };
  }, [code]);

  return (
    <>
      <Field label="Tipo da chave" htmlFor="pix-type">
        <Select
          id="pix-type"
          value={value.keyType}
          onChange={(e) => set("keyType", e.target.value as PixKeyType)}
          options={(Object.keys(PIX_KEY_LABEL) as PixKeyType[]).map((t) => ({ value: t, label: PIX_KEY_LABEL[t] }))}
        />
      </Field>
      <Field label="Chave PIX" htmlFor="pix-key" hint={value.key.trim() && !valid ? `Chave inválida para ${PIX_KEY_LABEL[value.keyType]}` : undefined}>
        <Input id="pix-key" value={value.key} onChange={(e) => set("key", e.target.value)} placeholder={PLACEHOLDER[value.keyType]} autoComplete="off" />
      </Field>
      <Field label="Nome do recebedor" htmlFor="pix-name" hint="Como aparece no banco (até 25 letras, sem acento)">
        <Input id="pix-name" value={value.name} onChange={(e) => set("name", e.target.value)} placeholder="LOCAKAR LOCADORA" maxLength={40} />
      </Field>
      <Field label="Cidade do recebedor" htmlFor="pix-city" hint="Até 15 letras">
        <Input id="pix-city" value={value.city} onChange={(e) => set("city", e.target.value)} placeholder="INDAIATUBA" maxLength={30} />
      </Field>
      {code && qr?.code === code && (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-line p-4 sm:col-span-2 sm:flex-row">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr.url} alt="QR Code PIX de teste" className="size-36 shrink-0 rounded-lg bg-white p-1" />
          <div className="min-w-0 space-y-2 text-sm">
            <p className="font-medium">Teste antes de usar</p>
            <p className="text-muted">
              Abra o app do seu banco → PIX → Ler QR Code. Deve aparecer <strong className="text-white">R$ 1,00</strong> para o recebedor acima. Não precisa pagar.
            </p>
            <p className="break-all rounded-lg bg-white/[0.04] p-2 font-mono text-[11px] text-zinc-400">{code}</p>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import { AlertTriangle, Eye, Palette, Save, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { useOrganization } from "@/hooks/use-organization";
import { brandTokens, brandWarnings, isHex, onColor, shade } from "@/lib/contrast";
import type { Organization } from "@/types";

/** Monta o formulário só com a locadora carregada; remonta (estado novo) quando ela muda. */
export function OrgBrandingForm() {
  const { org } = useOrganization();
  if (!org) return <div className="h-64 animate-pulse rounded-2xl bg-white/[0.04]" />;
  return <BrandingForm key={org.id + JSON.stringify(org.branding)} org={org} />;
}

function BrandingForm({ org }: { org: Organization }) {
  const { reload } = useOrganization();
  const b0 = org.branding ?? {};
  const [displayName, setDisplayName] = useState(b0.displayName || org.name || "");
  const [primary, setPrimary] = useState(b0.primary || "#2563eb");
  const [secondary, setSecondary] = useState(b0.secondary || "#1e3a8a");
  const [accent, setAccent] = useState(b0.accent || "#0ea5e9");
  const [theme, setTheme] = useState<"light" | "dark" | "system">(b0.theme || "system");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  const warnings = useMemo(() => brandWarnings({ primary, secondary, accent }), [primary, secondary, accent]);

  const previewTokensDark = useMemo(() => brandTokens({ primary, secondary, accent }, "dark"), [primary, secondary, accent]);

  const uploadLogo = async (slot: "logo" | "logoLight" | "logoCompact" | "favicon", e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) return toast.error("Imagem muito grande (máximo 1 MB).");
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "svg") return toast.error("SVG não permitido por segurança. Use PNG, JPG ou WebP.");
    setUploading(slot);
    try {
      const form = new FormData();
      form.append("slot", slot);
      form.append("file", file);
      const res = await fetch("/api/org", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Falha no envio.");
      toast.success("Logo atualizado.");
      reload();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(null);
      e.target.value = "";
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isHex(primary)) return toast.error("Cor principal inválida (use formato #rrggbb).");
    setSaving(true);
    try {
      const res = await fetch("/api/org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "branding",
          displayName,
          primary,
          secondary: isHex(secondary) ? secondary : shade(primary, -0.3),
          accent: isHex(accent) ? accent : shade(primary, 0.15),
          theme,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Não foi possível salvar.");
      toast.success("Identidade visual atualizada.");
      reload();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const b = org.branding ?? {};

  return (
    <form onSubmit={save} className="space-y-6">
      <div className="flex items-center gap-2 border-b border-line pb-3">
        <Palette className="size-5 text-brand-soft" />
        <div>
          <h3 className="font-semibold text-white">Identidade Visual (White Label)</h3>
          <p className="text-xs text-muted">Personalize o logotipo, as cores e o nome exibido no painel e no app do locatário.</p>
        </div>
      </div>

      {/* Upload de Logos */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-line bg-surface p-4 text-center space-y-3">
          <p className="font-semibold text-xs text-white">Logo Principal (Fundo escuro)</p>
          <div className="grid h-24 place-items-center rounded-xl bg-black/40 border border-line p-2">
            {b.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.logo} alt="Logo" className="max-h-20 max-w-full object-contain" />
            ) : (
              <span className="text-[11px] text-muted">Sem logo</span>
            )}
          </div>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-line bg-panel px-3 py-1.5 text-xs text-white hover:border-line-strong">
            <Upload className="size-3.5" /> {uploading === "logo" ? "Enviando..." : "Alterar PNG/JPG"}
            <input type="file" accept="image/png,image/jpeg,image/webp" disabled={!!uploading} onChange={(e) => uploadLogo("logo", e)} className="sr-only" />
          </label>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-4 text-center space-y-3">
          <p className="font-semibold text-xs text-white">Logo para Fundo Claro</p>
          <div className="grid h-24 place-items-center rounded-xl bg-white border border-line p-2">
            {b.logoLight ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.logoLight} alt="Logo claro" className="max-h-20 max-w-full object-contain" />
            ) : (
              <span className="text-[11px] text-zinc-400">Usa o principal</span>
            )}
          </div>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-line bg-panel px-3 py-1.5 text-xs text-white hover:border-line-strong">
            <Upload className="size-3.5" /> {uploading === "logoLight" ? "Enviando..." : "Alterar PNG/JPG"}
            <input type="file" accept="image/png,image/jpeg,image/webp" disabled={!!uploading} onChange={(e) => uploadLogo("logoLight", e)} className="sr-only" />
          </label>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-4 text-center space-y-3">
          <p className="font-semibold text-xs text-white">Ícone / Logo Compacto</p>
          <div className="grid h-24 place-items-center rounded-xl bg-black/40 border border-line p-2">
            {b.logoCompact ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.logoCompact} alt="Ícone" className="size-16 object-contain" />
            ) : (
              <span className="text-[11px] text-muted">Sem ícone</span>
            )}
          </div>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-line bg-panel px-3 py-1.5 text-xs text-white hover:border-line-strong">
            <Upload className="size-3.5" /> {uploading === "logoCompact" ? "Enviando..." : "Alterar PNG"}
            <input type="file" accept="image/png,image/jpeg,image/webp" disabled={!!uploading} onChange={(e) => uploadLogo("logoCompact", e)} className="sr-only" />
          </label>
        </div>
      </div>

      {/* Nome e Tema */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome da locadora no painel e app" htmlFor="b-name" hint="Substitui qualquer referência à plataforma">
          <Input id="b-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Ex.: Rota Sul Locadora" />
        </Field>

        <Field label="Tema padrão preferido" htmlFor="b-theme">
          <Select
            id="b-theme"
            value={theme}
            onChange={(e) => setTheme(e.target.value as "light" | "dark" | "system")}
            options={[
              { value: "system", label: "Automático (sistema operacional)" },
              { value: "dark", label: "Escuro (Dark)" },
              { value: "light", label: "Claro (Light)" },
            ]}
          />
        </Field>
      </div>

      {/* Cores */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-white">Paleta de Cores</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-line bg-surface p-3 space-y-2">
            <span className="text-xs text-muted">Cor Principal</span>
            <div className="flex items-center gap-2">
              <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} className="size-9 cursor-pointer rounded-lg border-0 bg-transparent p-0" />
              <Input value={primary} onChange={(e) => setPrimary(e.target.value)} maxLength={7} className="font-mono text-xs uppercase" />
            </div>
            <p className="text-[11px] text-muted">Botões principais e barras ativas</p>
          </div>

          <div className="rounded-xl border border-line bg-surface p-3 space-y-2">
            <span className="text-xs text-muted">Cor Secundária</span>
            <div className="flex items-center gap-2">
              <input type="color" value={secondary} onChange={(e) => setSecondary(e.target.value)} className="size-9 cursor-pointer rounded-lg border-0 bg-transparent p-0" />
              <Input value={secondary} onChange={(e) => setSecondary(e.target.value)} maxLength={7} className="font-mono text-xs uppercase" />
            </div>
            <p className="text-[11px] text-muted">Gradientes e fundos de destaque</p>
          </div>

          <div className="rounded-xl border border-line bg-surface p-3 space-y-2">
            <span className="text-xs text-muted">Cor de Destaque</span>
            <div className="flex items-center gap-2">
              <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="size-9 cursor-pointer rounded-lg border-0 bg-transparent p-0" />
              <Input value={accent} onChange={(e) => setAccent(e.target.value)} maxLength={7} className="font-mono text-xs uppercase" />
            </div>
            <p className="text-[11px] text-muted">Ícones, avisos e selos</p>
          </div>
        </div>

        {/* Avisos de acessibilidade / contraste */}
        {warnings.length > 0 && (
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-200 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="size-3.5" /> Aviso de acessibilidade
            </div>
            {warnings.map((w, i) => (
              <p key={i}>• {w}</p>
            ))}
          </div>
        )}
      </div>

      {/* Pré-visualização ao vivo */}
      <div className="space-y-2 rounded-2xl border border-line bg-panel p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-white">
          <Eye className="size-3.5 text-brand-soft" /> Pré-visualização em tempo real
        </div>
        <div
          className="rounded-xl border border-line-strong p-4 space-y-3"
          style={{ background: "#0d0d0f", color: "#ffffff", ...(previewTokensDark || {}) }}
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <span className="font-display text-sm font-bold">{displayName || "Sua Locadora"}</span>
            <span
              className="rounded-lg px-3 py-1 text-xs font-semibold"
              style={{ background: primary, color: onColor(primary) }}
            >
              Botão principal
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-white/10 p-2" style={{ background: "rgba(255,255,255,0.03)" }}>
              <p className="text-zinc-400">Frota ativa</p>
              <p className="text-base font-bold" style={{ color: accent }}>
                12 veículos
              </p>
            </div>
            <div className="rounded-lg border border-white/10 p-2" style={{ background: "rgba(255,255,255,0.03)" }}>
              <p className="text-zinc-400">Contratos assinados</p>
              <p className="text-base font-bold text-emerald-400">98%</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          <Save className="size-4" /> {saving ? "Salvando..." : "Salvar identidade visual"}
        </Button>
      </div>
    </form>
  );
}

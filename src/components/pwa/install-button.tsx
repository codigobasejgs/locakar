"use client";

import { Download, Share, SquarePlus } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { isIOS, useInstallPrompt, useStandalone } from "@/hooks/use-pwa";
import { cn } from "@/lib/utils";

const noop = () => () => {};

/**
 * Botão "Instalar app".
 * - Chromium (Android, Windows, macOS, ChromeOS): prompt nativo.
 * - iOS/iPadOS (Safari não tem prompt): instruções "Compartilhar → Adicionar à Tela de Início".
 * - Já instalado ou navegador sem suporte: não renderiza.
 */
export function InstallButton({
  label = "Instalar app",
  appName,
  className,
  variant = "outline",
  size = "md",
}: {
  label?: string;
  appName: string;
  className?: string;
  variant?: "outline" | "ghost" | "primary";
  size?: "sm" | "md" | "lg";
}) {
  const { canPrompt, prompt } = useInstallPrompt();
  const standalone = useStandalone();
  const ios = useSyncExternalStore(noop, isIOS, () => false);
  const [iosHelp, setIosHelp] = useState(false);

  if (standalone || (!canPrompt && !ios)) return null;

  return (
    <>
      <Button variant={variant} size={size} className={cn(className)} onClick={() => (canPrompt ? prompt() : setIosHelp(true))}>
        <Download /> {label}
      </Button>
      <Dialog open={iosHelp} onOpenChange={setIosHelp} title={`Instalar ${appName}`} description="Adicione à Tela de Início do iPhone ou iPad." size="sm">
        <ol className="space-y-4 text-sm text-zinc-200">
          <li className="flex items-start gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-magenta/20 text-xs font-bold text-brand-soft">1</span>
            <span>
              No Safari, toque em <strong>Compartilhar</strong> <Share className="inline size-4 align-text-bottom text-sky-400" aria-label="ícone compartilhar" /> na barra
              inferior (ou superior, no iPad).
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-magenta/20 text-xs font-bold text-brand-soft">2</span>
            <span>
              Role e toque em <strong>Adicionar à Tela de Início</strong> <SquarePlus className="inline size-4 align-text-bottom" aria-hidden />.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-magenta/20 text-xs font-bold text-brand-soft">3</span>
            <span>
              Confirme em <strong>Adicionar</strong>. O app abre em tela cheia, como um aplicativo.
            </span>
          </li>
        </ol>
        <p className="mt-5 text-xs text-zinc-500">Em outros navegadores do iPhone, abra este endereço no Safari para instalar.</p>
      </Dialog>
    </>
  );
}

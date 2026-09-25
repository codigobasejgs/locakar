"use client";

import { Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sendEmailRequest, type EmailRequest } from "@/lib/api";

/** Botão compacto "avisar cliente" (e-mail + WhatsApp) para usar em linhas de tabela. */
export function NotifyButton({ request, label = "Avisar cliente" }: { request: EmailRequest; label?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={busy}
      aria-label={label}
      title={label}
      onClick={async (e) => {
        e.stopPropagation();
        setBusy(true);
        try {
          const to = await sendEmailRequest(request);
          toast.success(`Aviso enviado: ${to}.`);
        } catch (err) {
          toast.error((err as Error).message);
        }
        setBusy(false);
      }}
    >
      <Send /> <span className="hidden xl:inline">Avisar</span>
    </Button>
  );
}

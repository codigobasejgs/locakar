"use client";

import { RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** Recarrega automaticamente quando a conexão volta. */
export function OfflineActions() {
  useEffect(() => {
    const reload = () => window.location.reload();
    window.addEventListener("online", reload);
    return () => window.removeEventListener("online", reload);
  }, []);

  return (
    <Button className="mt-8" onClick={() => window.location.reload()}>
      <RefreshCw /> Tentar novamente
    </Button>
  );
}

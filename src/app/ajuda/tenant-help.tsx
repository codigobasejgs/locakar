"use client";

import { useSearchParams } from "next/navigation";
import { TenantHelpProvider } from "@/help/components/context";

/** ?org=<slug> só separa o progresso local por locadora; o conteúdo do locatário é o mesmo para todas. */
export function TenantHelp({ children }: { children: React.ReactNode }) {
  const org = useSearchParams().get("org") ?? "";
  const slug = /^[a-z0-9-]{3,40}$/.test(org) ? org : "geral";
  return <TenantHelpProvider slug={slug}>{children}</TenantHelpProvider>;
}

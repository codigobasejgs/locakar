import type { Metadata } from "next";
import { Suspense } from "react";
import { TenantHelp } from "./tenant-help";

export const metadata: Metadata = {
  title: "Ajuda do Locatário",
  description: "Como usar o aplicativo do locatário: acesso, pagamentos, vistoria, ocorrências e documentos.",
};

export default function TenantHelpLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-ink px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-4xl">
        <Suspense>
          <TenantHelp>{children}</TenantHelp>
        </Suspense>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { AdminFrame } from "@/components/admin/admin-shell";
import { APP_NAMES, PWA } from "@/lib/pwa";

export const metadata: Metadata = {
  title: { default: "Painel", template: "%s · Painel LOCAKAR" },
  robots: { index: false, follow: false },
  // App instalável separado: "LOCAKAR Gestão", escopo /admin/.
  manifest: PWA.adminManifest,
  applicationName: APP_NAMES.admin.short,
  appleWebApp: { title: APP_NAMES.admin.short },
  icons: { apple: "/icons/admin-180.png" },
};

/**
 * Área administrativa. ATENÇÃO: ainda sem autenticação real — ver `src/lib/auth.ts`
 * (futuro: Supabase Auth + `src/proxy.ts` protegendo /admin + RLS).
 */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <AdminFrame>{children}</AdminFrame>;
}

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
  // Declarar `icons` aqui substitui os herdados do layout raiz: o favicon precisa vir junto.
  icons: {
    icon: [{ url: "/icon.png", sizes: "96x96", type: "image/png" }],
    apple: [{ url: "/icons/admin-180.png", sizes: "180x180", type: "image/png" }],
  },
};

/**
 * Área administrativa. ATENÇÃO: ainda sem autenticação real — ver `src/lib/auth.ts`
 * (futuro: Supabase Auth + `src/proxy.ts` protegendo /admin + RLS).
 */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <AdminFrame>{children}</AdminFrame>;
}

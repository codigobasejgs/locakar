import type { Metadata } from "next";
import { AdminFrame } from "@/components/admin/admin-shell";

export const metadata: Metadata = {
  title: { default: "Painel", template: "%s · Painel LOCAKAR" },
  robots: { index: false, follow: false },
};

/**
 * Área administrativa. ATENÇÃO: ainda sem autenticação real — ver `src/lib/auth.ts`
 * (futuro: Supabase Auth + `src/proxy.ts` protegendo /admin + RLS).
 */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <AdminFrame>{children}</AdminFrame>;
}

import type { Metadata } from "next";
import { cookies } from "next/headers";
import { DEMO_COOKIE } from "@/lib/demo";
import { AdminFrame } from "@/components/admin/admin-shell";
import { ThemeProvider } from "@/hooks/use-theme";
import { APP_NAMES, PWA } from "@/lib/pwa";
import { brandVersion, pwaPath, shortName } from "@/lib/pwa-manifest";
import { activeOrgForSession } from "@/lib/server/supabase";

const base: Metadata = {
  title: { default: "Painel", template: "%s · Frota Easy" },
  robots: { index: false, follow: false },
  // App instalável separado: escopo /admin/. Sem sessão: Frota Easy (o login é do sistema).
  manifest: PWA.adminManifest,
  applicationName: APP_NAMES.admin.short,
  appleWebApp: { title: APP_NAMES.admin.short },
  // Declarar `icons` aqui substitui os herdados do layout raiz: o favicon precisa vir junto.
  icons: {
    icon: [{ url: "/brand/frotaeasy/favicon-48.png", sizes: "48x48", type: "image/png" }],
    apple: [{ url: "/brand/frotaeasy/admin-180.png", sizes: "180x180", type: "image/png" }],
  },
};

/**
 * Logado: o app de gestão instala com nome, ícone e cores da locadora ativa já no HTML do servidor
 * (o navegador lê o manifest no carregamento; trocar depois no cliente nem sempre vale para o botão Instalar).
 */
export async function generateMetadata(): Promise<Metadata> {
  const org = await activeOrgForSession().catch(() => null);
  if (!org) return base;
  const name = (org.branding?.displayName || org.name).trim().slice(0, 45);
  const v = brandVersion(org.branding, name);
  return {
    ...base,
    manifest: pwaPath(org.slug, "admin.webmanifest"),
    applicationName: shortName(name),
    appleWebApp: { capable: true, title: shortName(name) },
    icons: { icon: [{ url: pwaPath(org.slug, "icon-192.png", v), sizes: "192x192", type: "image/png" }], apple: [{ url: pwaPath(org.slug, "apple-180.png", v), sizes: "180x180", type: "image/png" }] },
  };
}

/**
 * Área administrativa com sistema global de temas Dark / Light (sem FOUC).
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const demo = (await cookies()).has(DEMO_COOKIE);
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var t=localStorage.getItem("locakar-admin-theme")||"dark";document.documentElement.setAttribute("data-theme",t);if(t==="light"){document.documentElement.classList.add("light");document.documentElement.classList.remove("dark");}else{document.documentElement.classList.add("dark");document.documentElement.classList.remove("light");}}catch(e){}})();`,
        }}
      />
      <ThemeProvider>
        <AdminFrame demo={demo}>{children}</AdminFrame>
      </ThemeProvider>
    </>
  );
}

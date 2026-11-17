import type { Metadata } from "next";
import { AdminFrame } from "@/components/admin/admin-shell";
import { ThemeProvider } from "@/hooks/use-theme";
import { APP_NAMES, PWA } from "@/lib/pwa";

export const metadata: Metadata = {
  title: { default: "Painel", template: "%s · Frota Easy" },
  robots: { index: false, follow: false },
  // App instalável separado: "Frota Easy", escopo /admin/.
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
 * Área administrativa com sistema global de temas Dark / Light (sem FOUC).
 */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var t=localStorage.getItem("locakar-admin-theme")||"dark";document.documentElement.setAttribute("data-theme",t);if(t==="light"){document.documentElement.classList.add("light");document.documentElement.classList.remove("dark");}else{document.documentElement.classList.add("dark");document.documentElement.classList.remove("light");}}catch(e){}})();`,
        }}
      />
      <ThemeProvider>
        <AdminFrame>{children}</AdminFrame>
      </ThemeProvider>
    </>
  );
}

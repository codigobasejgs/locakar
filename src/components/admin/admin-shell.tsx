"use client";

import { Bell, Check, ExternalLink, LogOut, Menu, Moon, Sun, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Toaster } from "sonner";
import { InstallButton } from "@/components/pwa/install-button";
import { Button } from "@/components/ui/button";
import { AdminDataProvider, useAdminData } from "@/hooks/use-admin-data";
import { BrandingStyle, OrganizationProvider } from "@/hooks/use-organization";
import { useNotifications } from "@/hooks/use-notifications";
import { useTheme } from "@/hooks/use-theme";
import { OrgBrandLogo, OrgStatusBanner, OrgSwitcher } from "./org-ui";
import { buildAlerts } from "@/lib/analytics";
import { authService } from "@/lib/auth";
import { CATEGORY_LABEL, unreadCount } from "@/lib/push-events";
import { isSupabaseEnabled } from "@/lib/supabase/env";
import { ROUTES } from "@/lib/constants";
import { cn, todayISO } from "@/lib/utils";
import { ADMIN_NAV, findNavItem } from "./nav";

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = findNavItem(pathname).href;
  return (
    <nav aria-label="Administração" className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4">
      {ADMIN_NAV.map(({ href, label, icon: Icon }) => {
        const isActive = href === active;
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              isActive ? "bg-magenta/12 text-white" : "text-zinc-400 hover:bg-white/[0.04] hover:text-white",
            )}
          >
            {isActive && (
              <motion.span
                layoutId="sidebar-active"
                className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-gradient-to-b from-brand-soft to-magenta"
              />
            )}
            <Icon className={cn("size-4 shrink-0", isActive ? "text-brand-soft" : "text-zinc-500 group-hover:text-zinc-300")} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarFooter() {
  return (
    <div className="space-y-1 border-t border-line p-3">
      <InstallButton appName="LOCAKAR Gestão" size="sm" variant="ghost" label="Instalar app de gestão" className="w-full justify-start px-3 sm:hidden" />
      <Link
        href={ROUTES.home}
        className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-zinc-400 hover:bg-white/[0.04] hover:text-white"
      >
        <ExternalLink className="size-4" aria-hidden /> Ver site
      </Link>
      <button
        type="button"
        onClick={async () => {
          await authService.signOut();
          window.location.assign(ROUTES.login);
        }}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-zinc-400 hover:bg-white/[0.04] hover:text-white"
      >
        <LogOut className="size-4" aria-hidden /> Sair
      </button>
    </div>
  );
}

const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-red-400",
  danger: "bg-red-400",
  warning: "bg-amber-400",
  success: "bg-emerald-400",
  info: "bg-sky-400",
};

const ago = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  if (min < 24 * 60) return `há ${Math.round(min / 60)} h`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
};

/**
 * Sino do painel: "Notificações" (central com histórico, lido/não lido, também entregue por Web Push)
 * e "Pendências" (alertas calculados na hora a partir dos dados: vencimentos, atrasos, documentos).
 */
function AlertsBell() {
  const { data, settings } = useAdminData();
  const { items, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"notifications" | "alerts">(isSupabaseEnabled ? "notifications" : "alerts");
  const alerts = useMemo(() => (data ? buildAlerts(data, settings, todayISO()) : []), [data, settings]);
  const unread = unreadCount(items);
  const count = isSupabaseEnabled ? unread : alerts.length;
  const urgent = isSupabaseEnabled ? items.some((n) => !n.readAt && n.severity === "critical") : alerts.some((a) => a.tone === "danger");

  // Número no ícone do app instalado (Chrome/Edge desktop e Android, Safari iOS 16.4+).
  useEffect(() => {
    if (!("setAppBadge" in navigator)) return;
    (count ? navigator.setAppBadge(count) : navigator.clearAppBadge()).catch(() => {});
  }, [count]);

  const tabs = [
    { key: "notifications" as const, label: "Notificações", n: unread, show: isSupabaseEnabled },
    { key: "alerts" as const, label: "Pendências", n: alerts.length, show: true },
  ].filter((t) => t.show);

  return (
    <div className="relative">
      <Button variant="ghost" size="icon" aria-label={`Notificações (${count} não lidas)`} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Bell />
        {count > 0 && (
          <span className={cn("absolute right-1 top-1 grid min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold text-white", urgent ? "bg-red-500" : "bg-magenta")}>
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Button>
      <AnimatePresence>
        {open && (
          <>
            <button type="button" aria-label="Fechar notificações" className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              className="absolute right-0 z-40 mt-2 w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-2xl shadow-black/60"
            >
              <div className="flex flex-wrap items-center gap-1 border-b border-line px-2 py-2" role="tablist">
                {tabs.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.key}
                    onClick={() => setTab(t.key)}
                    className={cn("whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium", tab === t.key ? "bg-white/[0.06] text-white" : "text-muted hover:text-white")}
                  >
                    {t.label} {t.n > 0 && <span className="ml-1 text-xs text-brand-soft">{t.n}</span>}
                  </button>
                ))}
                {tab === "notifications" && unread > 0 && (
                  <button type="button" onClick={markAllRead} className="ml-auto whitespace-nowrap rounded-lg px-2 py-1.5 text-xs text-brand-soft hover:text-white">
                    Marcar todas como lidas
                  </button>
                )}
              </div>

              {tab === "notifications" ? (
                <ul className="max-h-[26rem] overflow-y-auto" role="tabpanel">
                  {items.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">Nenhuma notificação ainda.</li>}
                  {items.map((n) => (
                    <li key={n.id} className={cn("group relative border-b border-line last:border-0", !n.readAt && "bg-magenta/[0.05]")}>
                      <Link
                        href={n.url}
                        onClick={() => {
                          markRead([n.id]);
                          setOpen(false);
                        }}
                        className="flex gap-3 px-4 py-3 pr-10 hover:bg-white/[0.03]"
                      >
                        <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", SEVERITY_DOT[n.severity] ?? "bg-zinc-500", n.readAt && "opacity-40")} />
                        <span className="min-w-0">
                          <span className={cn("block text-sm", n.readAt ? "text-zinc-300" : "font-semibold text-white")}>{n.title}</span>
                          {n.body && <span className="block text-xs text-muted">{n.body}</span>}
                          <span className="mt-0.5 block text-[11px] text-zinc-500">
                            {CATEGORY_LABEL[n.category]?.split(" (")[0] ?? n.category} · {ago(n.createdAt)}
                          </span>
                        </span>
                      </Link>
                      {!n.readAt && (
                        <button
                          type="button"
                          onClick={() => markRead([n.id])}
                          aria-label="Marcar como lida"
                          title="Marcar como lida"
                          className="absolute right-3 top-3 grid size-6 place-items-center rounded-md text-zinc-500 opacity-70 hover:bg-white/[0.06] hover:text-white group-hover:opacity-100"
                        >
                          <Check className="size-3.5" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="max-h-[26rem] overflow-y-auto" role="tabpanel">
                  {alerts.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">Nenhuma pendência no momento.</li>}
                  {alerts.map((a) => (
                    <li key={a.id}>
                      <Link href={a.href} onClick={() => setOpen(false)} className="flex gap-3 border-b border-line px-4 py-3 last:border-0 hover:bg-white/[0.03]">
                        <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", SEVERITY_DOT[a.tone as string] ?? "bg-zinc-500")} />
                        <span>
                          <span className="block text-sm font-medium text-zinc-100">{a.title}</span>
                          <span className="block text-xs text-muted">{a.detail}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const item = findNavItem(pathname);
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    authService.getSession().then((s) => alive && setEmail(s?.email ?? null));
    return () => {
      alive = false;
    };
  }, []);

  const { theme, toggleTheme } = useTheme();

  return (
    <header className="no-print sticky top-0 z-20 flex min-h-16 items-center gap-3 border-b border-line bg-ink/85 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl sm:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu" onClick={onMenu}>
        <Menu />
      </Button>
      <nav aria-label="Trilha" className="min-w-0 flex-1 truncate text-sm">
        <span className="text-muted">Painel</span>
        <span className="mx-2 text-zinc-600">/</span>
        <span className="font-medium text-white">{item.label}</span>
      </nav>
      <InstallButton appName="LOCAKAR Gestão" size="sm" variant="ghost" label="Instalar" className="hidden sm:inline-flex" />
      <OrgSwitcher />
      {!isSupabaseEnabled && (
        <span className="hidden rounded-full border border-amber-400/25 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold text-amber-300 md:inline">
          Modo demonstração · dados locais
        </span>
      )}
      <button
        type="button"
        onClick={toggleTheme}
        className="grid size-9 place-items-center rounded-xl border border-line text-muted transition-colors hover:border-line-strong hover:text-white"
        title={theme === "light" ? "Alternar para tema escuro" : "Alternar para tema claro"}
        aria-label={theme === "light" ? "Alternar para tema escuro" : "Alternar para tema claro"}
      >
        {theme === "light" ? <Moon className="size-4 text-brand-soft" /> : <Sun className="size-4 text-amber-300" />}
      </button>
      <AlertsBell />
      <div
        className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-magenta to-brand-deep text-xs font-bold uppercase"
        title={email ?? "Administrador"}
        aria-label={`Usuário: ${email ?? "Administrador"}`}
      >
        {(email ?? "A").charAt(0)}
      </div>
    </header>
  );
}

function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Carregando">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-white/[0.04]" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-2xl bg-white/[0.04]" />
    </div>
  );
}

function LoadError({ message }: { message: string }) {
  return (
    <div role="alert" className="mx-auto mt-10 max-w-lg rounded-2xl border border-red-400/25 bg-red-400/[0.06] p-6 text-center">
      <p className="font-display text-lg font-semibold">Não foi possível carregar os dados</p>
      <p className="mt-2 text-sm text-zinc-300">{message}</p>
      <div className="mt-5 flex justify-center gap-2">
        <Button variant="outline" onClick={() => window.location.reload()}>
          Tentar novamente
        </Button>
        <Button
          variant="ghost"
          onClick={async () => {
            await authService.signOut();
            window.location.assign(ROUTES.login);
          }}
        >
          Sair
        </Button>
      </div>
    </div>
  );
}

function Content({ children }: { children: React.ReactNode }) {
  const { data, loadError } = useAdminData();
  const pathname = usePathname();
  return (
    <motion.main
      key={pathname}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="print-area mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 lg:px-8 lg:py-8"
    >
      {loadError ? <LoadError message={loadError} /> : data ? children : <Loading />}
    </motion.main>
  );
}

/** Login fica fora do shell (sem sidebar e sem carregar dados). */
export function AdminFrame({ children }: { children: React.ReactNode }) {
  return usePathname() === ROUTES.login ? children : <AdminShell>{children}</AdminShell>;
}

function AdminShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Guarda client-side: garante redirecionamento mesmo se o CDN/SW servir HTML em cache.
  useEffect(() => {
    if (!isSupabaseEnabled) return;
    let alive = true;
    authService.getSession().then((session) => {
      if (alive && !session) {
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        // Navegação completa proposital: limpa o estado em memória e passa pelo proxy de login.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign(`${ROUTES.login}?next=${next}`);
      }
    });
    return () => {
      alive = false;
    };
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const { theme } = useTheme();

  return (
    <OrganizationProvider>
      <BrandingStyle theme={theme} />
      <AdminDataProvider>
        <div className="min-h-dvh bg-ink text-white admin-shell">
          <OrgStatusBanner />
          {/* Sidebar desktop */}
        <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-[#070708] pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] lg:flex">
          <Link href={ROUTES.admin} className="flex h-16 items-center border-b border-line px-6" aria-label="Dashboard">
            <OrgBrandLogo className="w-28" variant={theme === "light" ? "original" : "light"} />
          </Link>
          <SidebarNav />
          <SidebarFooter />
        </aside>

        {/* Drawer mobile */}
        <AnimatePresence>
          {open && (
            <>
              <motion.div
                className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setOpen(false)}
              />
              <motion.aside
                role="dialog"
                aria-modal="true"
                aria-label="Menu administrativo"
                className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-line bg-[#070708] pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] lg:hidden"
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", stiffness: 380, damping: 38 }}
              >
                <div className="flex h-16 items-center justify-between border-b border-line px-5">
                  <OrgBrandLogo className="w-28" variant={theme === "light" ? "original" : "light"} />
                  <Button variant="ghost" size="icon" aria-label="Fechar menu" onClick={() => setOpen(false)}>
                    <X />
                  </Button>
                </div>
                <SidebarNav key={pathname} onNavigate={() => setOpen(false)} />
                <SidebarFooter />
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        <div className="flex min-h-dvh flex-col lg:pl-64">
          <Topbar onMenu={() => setOpen(true)} />
          <Content>{children}</Content>
        </div>
      </div>
      <Toaster
        theme={theme}
        position="bottom-right"
        richColors
        toastOptions={{ className: "!bg-panel !border-line-strong !rounded-xl" }}
      />
      </AdminDataProvider>
    </OrganizationProvider>
  );
}

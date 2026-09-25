"use client";

import { Bell, ExternalLink, LogOut, Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { AdminDataProvider, useAdminData } from "@/hooks/use-admin-data";
import { buildAlerts } from "@/lib/analytics";
import { authService } from "@/lib/auth";
import { ROUTES } from "@/lib/constants";
import { cn, todayISO } from "@/lib/utils";
import { ADMIN_NAV, findNavItem } from "./nav";

const noopSubscribe = () => () => {};

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
  const router = useRouter();
  return (
    <div className="space-y-1 border-t border-line p-3">
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
          router.push(ROUTES.login);
        }}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-zinc-400 hover:bg-white/[0.04] hover:text-white"
      >
        <LogOut className="size-4" aria-hidden /> Sair
      </button>
    </div>
  );
}

function AlertsBell() {
  const { data, settings } = useAdminData();
  const [open, setOpen] = useState(false);
  const alerts = useMemo(() => (data ? buildAlerts(data, settings, todayISO()) : []), [data, settings]);
  const urgent = alerts.filter((a) => a.tone === "danger").length;

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Alertas (${alerts.length})`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell />
        {alerts.length > 0 && (
          <span
            className={cn(
              "absolute right-1 top-1 grid min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold text-white",
              urgent ? "bg-red-500" : "bg-magenta",
            )}
          >
            {alerts.length}
          </span>
        )}
      </Button>
      <AnimatePresence>
        {open && (
          <>
            <button type="button" aria-label="Fechar alertas" className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-2xl shadow-black/60"
            >
              <p className="border-b border-line px-4 py-3 text-sm font-semibold">Alertas ({alerts.length})</p>
              <ul className="max-h-96 overflow-y-auto">
                {alerts.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">Nenhum alerta no momento.</li>}
                {alerts.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={a.href}
                      onClick={() => setOpen(false)}
                      className="flex gap-3 border-b border-line px-4 py-3 last:border-0 hover:bg-white/[0.03]"
                    >
                      <span
                        className={cn(
                          "mt-1.5 size-2 shrink-0 rounded-full",
                          { danger: "bg-red-400", warning: "bg-amber-400", info: "bg-sky-400" }[a.tone as string] ?? "bg-zinc-500",
                        )}
                      />
                      <span>
                        <span className="block text-sm font-medium text-zinc-100">{a.title}</span>
                        <span className="block text-xs text-muted">{a.detail}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
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
  // Sessão vive no sessionStorage: lida só no cliente, sem mismatch de hidratação.
  const email = useSyncExternalStore(
    noopSubscribe,
    () => authService.getSession()?.email ?? null,
    () => null,
  );

  return (
    <header className="no-print sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-ink/85 px-4 backdrop-blur-xl sm:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu" onClick={onMenu}>
        <Menu />
      </Button>
      <nav aria-label="Trilha" className="min-w-0 flex-1 truncate text-sm">
        <span className="text-muted">Painel</span>
        <span className="mx-2 text-zinc-600">/</span>
        <span className="font-medium text-white">{item.label}</span>
      </nav>
      <span className="hidden rounded-full border border-amber-400/25 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold text-amber-300 md:inline">
        Modo demonstração · dados locais
      </span>
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

function Content({ children }: { children: React.ReactNode }) {
  const { data } = useAdminData();
  const pathname = usePathname();
  return (
    <motion.main
      key={pathname}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="print-area mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
    >
      {data ? children : <Loading />}
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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <AdminDataProvider>
      <div className="min-h-dvh bg-ink text-white">
        {/* Sidebar desktop */}
        <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-[#070708] lg:flex">
          <Link href={ROUTES.admin} className="flex h-16 items-center border-b border-line px-6" aria-label="Dashboard LOCAKAR">
            <Logo className="w-24" />
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
                className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-line bg-[#070708] lg:hidden"
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", stiffness: 380, damping: 38 }}
              >
                <div className="flex h-16 items-center justify-between border-b border-line px-5">
                  <Logo className="w-24" />
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
        theme="dark"
        position="bottom-right"
        richColors
        toastOptions={{ className: "!bg-panel !border-line-strong !rounded-xl" }}
      />
    </AdminDataProvider>
  );
}

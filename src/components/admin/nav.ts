import {
  CalendarDays,
  CarFront,
  ChartColumn,
  KeyRound,
  LayoutDashboard,
  NotebookPen,
  Receipt,
  Settings,
  TriangleAlert,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { ROUTES } from "@/lib/constants";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

export const ADMIN_NAV: NavItem[] = [
  { href: ROUTES.admin, label: "Dashboard", icon: LayoutDashboard, description: "Visão geral da operação" },
  { href: ROUTES.rentals, label: "Locações", icon: KeyRound, description: "Contratos, recebimentos e quilometragem" },
  { href: ROUTES.reservations, label: "Reservas", icon: CalendarDays, description: "Agenda de reservas da frota" },
  { href: ROUTES.vehicles, label: "Veículos", icon: CarFront, description: "Cadastro e documentação da frota" },
  { href: ROUTES.clients, label: "Clientes", icon: Users, description: "Locatários cadastrados" },
  { href: ROUTES.finance, label: "Financeiro", icon: Wallet, description: "Receitas, despesas e saldo" },
  { href: ROUTES.expenses, label: "Despesas", icon: Receipt, description: "Despesas recorrentes e diversas" },
  { href: ROUTES.maintenance, label: "Manutenção", icon: Wrench, description: "Manutenções da frota" },
  { href: ROUTES.fines, label: "Multas", icon: TriangleAlert, description: "Autuações, prazos e pagamentos" },
  { href: ROUTES.notes, label: "Anotações", icon: NotebookPen, description: "Registro de ocorrências" },
  { href: ROUTES.reports, label: "Relatórios", icon: ChartColumn, description: "Relatórios por período, veículo e status" },
  { href: ROUTES.settings, label: "Configurações", icon: Settings, description: "Empresa e preferências do painel" },
];

export function findNavItem(pathname: string) {
  return (
    [...ADMIN_NAV].sort((a, b) => b.href.length - a.href.length).find((item) => pathname.startsWith(item.href)) ??
    ADMIN_NAV[0]
  );
}

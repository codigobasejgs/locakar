import type { OrgRole } from "@/types";

/**
 * Permissões por papel (UI e APIs). O banco garante o essencial por RLS (leitor não grava,
 * configurações só dono/administrador); este mapa refina por módulo.
 */
export type Permission = "read" | "operate" | "finance" | "settings" | "team" | "integrations";

const MATRIX: Record<OrgRole, Permission[]> = {
  owner: ["read", "operate", "finance", "settings", "team", "integrations"],
  admin: ["read", "operate", "finance", "settings", "team", "integrations"],
  manager: ["read", "operate", "finance"],
  finance: ["read", "finance"],
  operator: ["read", "operate"],
  viewer: ["read"],
};

export const can = (role: OrgRole | undefined, p: Permission) => Boolean(role && MATRIX[role]?.includes(p));

export const ROLE_LABEL: Record<OrgRole, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  manager: "Gerente",
  finance: "Financeiro",
  operator: "Operador",
  viewer: "Somente leitura",
};

export const INVITABLE_ROLES: OrgRole[] = ["admin", "manager", "finance", "operator", "viewer"];

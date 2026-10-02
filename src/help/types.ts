import type { Permission } from "@/lib/permissions";
import type { OrgRole } from "@/types";

export interface HelpQuestion { question: string; answer: string }
export interface HelpField { name: string; required: boolean; description: string; example?: string }
export interface HelpStep { title: string; text: string; fields?: HelpField[]; image?: string; caption?: string }
export interface HelpArticle {
  slug: string;
  title: string;
  description: string;
  category: string;
  audience: "admin" | "tenant" | "platform";
  permission: Permission;
  feature?: string;
  keywords: string[];
  aliases: string[];
  routes: string[];
  sources: string[];
  minutes: number;
  difficulty?: "Iniciante" | "Intermediário";
  updated: string;
  version: number;
  prerequisites: string[];
  steps: HelpStep[];
  tips: string[];
  warnings: string[];
  problems: HelpQuestion[];
  faq: HelpQuestion[];
  related: string[];
  result: string;
}
export interface HelpAccess {
  audience: "admin" | "tenant";
  role: OrgRole | null;
  platformAdmin: boolean;
  modules?: Record<string, boolean>;
}
export interface HelpTraining { slug: string; title: string; description: string; audience: "admin" | "tenant" | "platform"; lessons: string[] }

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
export interface TourStep {
  id: string;
  title: string;
  content: string;
  /** Rota onde o passo acontece (aceita [param] e #aba). Sem rota: a do passo anterior ou a do tour. */
  route?: string;
  /** Valor de data-tour do elemento destacado. Sem alvo: explicação centralizada. */
  target?: string;
  /**
   * data-tour de um controle SEGURO clicado antes do passo: abrir aba, abrir formulário vazio ou abrir detalhes.
   * Nunca salvar, excluir, aprovar, cobrar ou enviar.
   */
  click?: string;
  /** Rota fixa onde fica o `click` quando o passo está numa rota com [param] (ex.: lista → detalhes). */
  via?: string;
  /** O alvo fica dentro de um formulário/janela aberto pelo `click`. */
  dialog?: boolean;
  placement?: "auto" | "top" | "bottom" | "left" | "right";
  /** Elemento que pode não existir (ex.: lista vazia): o passo é pulado sem aviso. */
  optional?: boolean;
  quick?: boolean;
  chapter?: string;
  permission?: Permission;
  feature?: string;
  article?: string;
  link?: { label: string; href: string };
}
export interface TourDef {
  id: string;
  title: string;
  description: string;
  kind: "geral" | "modulo" | "configuracao" | "jornada";
  /** Categoria da Central (liga o tour aos artigos e ao ícone). */
  module: string;
  route: string;
  permission: Permission;
  feature?: string;
  minutes: number;
  version: number;
  article?: string;
  video?: string;
  keywords: string[];
  aliases: string[];
  learn: string[];
  next?: string;
  steps: TourStep[];
}
export interface HelpTraining { slug: string; title: string; description: string; audience: "admin" | "tenant" | "platform"; lessons: string[] }

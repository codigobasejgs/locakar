/**
 * Demonstração pública do Frota Easy (/demo): duas locadoras fictícias, sem banco de dados.
 * O cookie `fe_demo=<slug>` liga o modo demonstração SÓ no navegador (repositórios locais, login fictício).
 * No servidor nada muda: as APIs continuam exigindo sessão real, o cookie não libera dado nenhum.
 */
import type { Organization } from "@/types";

export const DEMO_COOKIE = "fe_demo";

export interface DemoOrg {
  slug: string;
  name: string;
  legalName: string;
  city: string;
  state: string;
  ddd: string;
  primary: string;
  secondary: string;
  accent: string;
  plate: string;
  rates: [number, number];
  clients: string[];
  tagline: string;
}

export const DEMO_ORGS: Record<string, DemoOrg> = {
  rotasul: {
    slug: "rotasul",
    name: "Rota Sul Locadora",
    legalName: "ROTA SUL LOCADORA DE VEÍCULOS LTDA (FICTÍCIA)",
    city: "Campinas",
    state: "SP",
    ddd: "19",
    primary: "#0ea5e9",
    secondary: "#0369a1",
    accent: "#38bdf8",
    plate: "RSL",
    rates: [650, 700],
    clients: ["Ana Beatriz Moreira", "Bruno Carvalho Lima", "Camila Duarte Rocha", "Diego Fernandes Alves", "Eduarda Martins Costa", "Felipe Nogueira Santos", "Gabriela Ribeiro Pinto", "Henrique Souza Barros", "Isabela Teixeira Cruz", "João Pedro Almeida"],
    tagline: "Carros para motoristas de aplicativo, aluguel semanal.",
  },
  viaexpress: {
    slug: "viaexpress",
    name: "Via Express Locações",
    legalName: "VIA EXPRESS LOCAÇÕES LTDA (FICTÍCIA)",
    city: "Sorocaba",
    state: "SP",
    ddd: "15",
    primary: "#f97316",
    secondary: "#c2410c",
    accent: "#fb923c",
    plate: "VEX",
    rates: [590, 640],
    clients: ["Larissa Gomes Vieira", "Marcelo Pires Andrade", "Natália Campos Reis", "Otávio Lopes Ferraz", "Patrícia Melo Barbosa", "Rafael Dias Monteiro", "Sabrina Cunha Freitas", "Thiago Ramos Coelho", "Vanessa Prado Siqueira", "Wesley Antunes Moura"],
    tagline: "Frota compacta para quem trabalha rodando a cidade.",
  },
};

/** Locadora da demonstração aberta neste navegador (null = sistema real). Só no cliente. */
export function demoSlug(): string | null {
  if (typeof document === "undefined") return null;
  const m = new RegExp(`(?:^|;\\s*)${DEMO_COOKIE}=([a-z]+)`).exec(document.cookie);
  return m && m[1] in DEMO_ORGS ? m[1] : null;
}

export const currentDemo = () => {
  const s = demoSlug();
  return s ? DEMO_ORGS[s] : null;
};

export const demoLogo = (slug: string, variant: "dark" | "light" | "icon") => `/demo/${slug}-${variant}.png`;

/** Locadora (organization) fictícia que o painel mostra na demonstração. */
export function demoOrganization(d: DemoOrg): Organization {
  return {
    id: `00000000-0000-0000-0000-${d.slug === "rotasul" ? "000000000101" : "000000000102"}`,
    slug: d.slug,
    name: d.name,
    legal_name: d.legalName,
    document: null,
    email: `contato@${d.slug}.exemplo`,
    phone: `${d.ddd}900000000`,
    whatsapp: `${d.ddd}900000000`,
    website: null,
    address: "Endereço fictício, 100",
    city: d.city,
    state: d.state,
    cep: null,
    status: "active",
    branding: { displayName: d.name, primary: d.primary, secondary: d.secondary, accent: d.accent, theme: "dark", logo: demoLogo(d.slug, "light"), logoLight: demoLogo(d.slug, "dark"), logoCompact: demoLogo(d.slug, "icon") },
    texts: {},
    onboarding: {},
    created_at: new Date().toISOString(),
  };
}

/** Entra na demonstração: cookie de sessão (some ao fechar o navegador) + login fictício do painel. */
export function enterDemo(slug: string, to: string) {
  if (!(slug in DEMO_ORGS)) return;
  document.cookie = `${DEMO_COOKIE}=${slug}; path=/; SameSite=Lax`;
  try {
    sessionStorage.setItem("locakar:demo-session", JSON.stringify({ email: `demo@${slug}.exemplo` }));
  } catch {
    /* sem sessionStorage: o painel pede o login fictício */
  }
  // Navegação completa proposital: os módulos (repositórios, auth) leem o cookie ao carregar.
   
  window.location.assign(to);
}

export function exitDemo() {
  document.cookie = `${DEMO_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  try {
    sessionStorage.removeItem("locakar:demo-session");
  } catch {
    /* nada a limpar */
  }
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/demo");
}

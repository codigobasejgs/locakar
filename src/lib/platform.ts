/**
 * Marca da PLATAFORMA (SaaS) = Frota Easy. Diferente da marca de cada locadora (organizations.branding):
 * aparece no Super Admin, na landing comercial, em e-mails sem contexto de locadora e como fallback.
 * A LOCAKAR é uma locadora cliente (tenant) com site próprio em locakar.com.br: dados dela ficam em lib/company.ts.
 */
export const PLATFORM = {
  name: "Frota Easy",
  shortName: "Frota Easy",
  slogan: "Controle de locadoras de veículos",
  siteUrl: "https://www.frotaeasy.com.br",
  landingPath: "/",
  logo: "/brand/frotaeasy/logo-horizontal-dark.webp",
  logoLight: "/brand/frotaeasy/logo-horizontal-light.png",
  symbol: "/brand/frotaeasy/symbol-dark.webp",
  primary: "#7A00FF",
  accent: "#A64DFF",
  background: "#0B0B0F",
  whatsapp: { e164: "5519989615873", display: "(19) 98961-5873" },
  trialDays: 30,
} as const;

/** Hosts da plataforma. O site da locadora LOCAKAR continua em locakar.com.br. */
export const PLATFORM_HOSTS = ["frotaeasy.com.br", "www.frotaeasy.com.br"] as const;
export const isPlatformHost = (host?: string | null) => Boolean(host && (PLATFORM_HOSTS as readonly string[]).includes(host.toLowerCase().split(":")[0]));

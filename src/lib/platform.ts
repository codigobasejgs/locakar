/**
 * Marca da PLATAFORMA (SaaS). Diferente da marca de cada locadora (organizations.branding):
 * aparece no Super Admin, na landing comercial, em e-mails sem contexto de locadora e como fallback.
 */
export const PLATFORM = {
  name: "LOCAKAR SaaS",
  shortName: "LOCAKAR",
  siteUrl: "https://www.locakar.com.br",
  landingPath: "/plataforma",
  logo: "/logos/locakar-logo.png",
  logoLight: "/logos/locakar-logo-light.png",
  primary: "#2563eb",
  whatsapp: { e164: "5519989615873", display: "(19) 98961-5873" },
  trialDays: 30,
} as const;

/** Dados oficiais da LOCAKAR — única fonte para contato, site e textos institucionais. */
export const COMPANY = {
  name: "LOCAKAR",
  tagline: "LOCADORA DE VEÍCULOS",
  whatsapp: {
    e164: "5519998615873",
    international: "+55 19 99861-5873",
    display: "(19) 99861-5873",
  },
  site: "www.locakar.com.br",
  siteUrl: "https://www.locakar.com.br",
  instagram: {
    handle: "@locakar",
    url: "https://www.instagram.com/locakar",
  },
  seo: {
    title: "LOCAKAR | Locadora de Veículos",
    description: "Aluguel de veículos com praticidade, segurança e atendimento personalizado.",
  },
} as const;

export const WHATSAPP_MESSAGES = {
  availability: "Olá, LOCAKAR! Gostaria de consultar a disponibilidade de um veículo.",
  fleet: "Olá, LOCAKAR! Gostaria de conhecer a frota disponível.",
  booking: "Olá, LOCAKAR! Gostaria de fazer uma reserva.",
  vehicle: (name: string) => `Olá, LOCAKAR! Gostaria de consultar a disponibilidade do veículo ${name}.`,
} as const;

/**
 * Contato oficial da LOCAKAR no app. Mesmo valor de src/lib/company.ts (site e painel).
 * Com o cliente logado, o app usa o número que vem do servidor (summary.support); este é o padrão
 * para telas antes do login.
 */
export const SUPPORT_WHATSAPP = { e164: "5519989615873", display: "(19) 98961-5873" };

export const whatsappUrl = (e164 = SUPPORT_WHATSAPP.e164, text?: string) =>
  `https://wa.me/${e164}${text ? `?text=${encodeURIComponent(text)}` : ""}`;

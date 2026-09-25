import { COMPANY } from "./company";

/** Link oficial do WhatsApp da LOCAKAR, opcionalmente com mensagem pré-preenchida. */
export function getWhatsAppUrl(message?: string): string {
  const base = `https://wa.me/${COMPANY.whatsapp.e164}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

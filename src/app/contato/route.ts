import { WHATSAPP_MESSAGES } from "@/lib/company";
import { getWhatsAppUrl } from "@/lib/whatsapp";

/** /contato → WhatsApp oficial. Usado pelo atalho do app instalado (atalhos precisam ficar no escopo do site). */
export function GET() {
  return Response.redirect(getWhatsAppUrl(WHATSAPP_MESSAGES.availability), 307);
}

/**
 * Contato padrão (LOCAKAR) para quando a locadora não informou WhatsApp.
 * Com o cliente logado, o app usa o número da locadora que vem do servidor (summary.support);
 * antes do login, o da marca pública da locadora do link (OrgProvider).
 */
export const SUPPORT_WHATSAPP = { e164: "5519989615873", display: "(19) 98961-5873" };

let orgWhatsapp: string | null = null;
/** Contato da locadora atual (definido pelo OrgProvider). */
export const setOrgWhatsapp = (digits: string | null) => {
  orgWhatsapp = digits;
};

const e164 = (v?: string | null) => {
  const d = (v ?? "").replace(/\D/g, "");
  if (!d) return null;
  return d.startsWith("55") ? d : `55${d}`;
};

export const whatsappUrl = (number?: string | null, text?: string) =>
  `https://wa.me/${e164(number) ?? e164(orgWhatsapp) ?? SUPPORT_WHATSAPP.e164}${text ? `?text=${encodeURIComponent(text)}` : ""}`;

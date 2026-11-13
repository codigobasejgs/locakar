/** Identificação do locatário pelo telefone. Puro: nenhuma consulta aqui. */
import { samePhone } from "../copilot/guard";

export interface ClientRef { id: string; name: string; phone?: string | null; backupPhone?: string | null; cpf?: string | null }

/**
 * Clientes cujo telefone (principal ou reserva) é o do WhatsApp, com ou sem o 9º dígito.
 * Mais de um resultado = ambíguo: o fluxo pede o CPF para desempatar (nunca adivinha).
 */
export function matchClients(phone: string, clients: ClientRef[]): ClientRef[] {
  const wa = phone.replace(/\D/g, "");
  const br = (p?: string | null) => {
    const d = (p ?? "").replace(/\D/g, "");
    return d.length === 10 || d.length === 11 ? `55${d}` : d;
  };
  return clients.filter((c) => [c.phone, c.backupPhone].some((p) => p && samePhone(br(p), wa)));
}

/** "Os 4 primeiros dígitos do CPF": aceita só 4 dígitos, compara em tempo de comparação simples (dado curto, sem segredo armazenado). */
export function pinMatches(input: string, cpf?: string | null) {
  const pin = input.replace(/\D/g, "");
  const digits = (cpf ?? "").replace(/\D/g, "");
  return pin.length === 4 && digits.length === 11 && digits.slice(0, 4) === pin;
}

/** Desempate de cadastro duplicado: CPF completo digitado. */
export function pickByCpf(input: string, candidates: ClientRef[]) {
  const cpf = input.replace(/\D/g, "");
  if (cpf.length !== 11) return undefined;
  const found = candidates.filter((c) => (c.cpf ?? "").replace(/\D/g, "") === cpf);
  return found.length === 1 ? found[0] : undefined;
}

/** Primeiro nome para saudação (nunca CPF, endereço ou nome completo antes da verificação). */
export const firstName = (name?: string | null) => (name ?? "").trim().split(/\s+/)[0] || "Cliente";

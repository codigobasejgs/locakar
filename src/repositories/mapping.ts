/**
 * Conversão entre entidades do app (camelCase, `undefined` = vazio)
 * e linhas do Postgres (snake_case, `null` = vazio). Só o 1º nível: JSON aninhado (receipts) fica como está.
 */
const toSnake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const toCamel = (key: string) => key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

// updated_at é só do banco. created_at volta como createdAt (histórico de e-mails usa); no envio ao banco é ignorado.
const DB_ONLY = new Set(["updated_at"]);
const READ_ONLY = new Set(["created_at", "updated_at"]);

/** Chaves presentes com `undefined` viram `null`, para limpar o campo no update. */
export function toRow(entity: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(entity)
      .map(([k, v]) => [toSnake(k), v === undefined ? null : v] as const)
      .filter(([k]) => !READ_ONLY.has(k)),
  );
}

export function fromRow<T>(row: Record<string, unknown>): T {
  return Object.fromEntries(
    Object.entries(row)
      .filter(([k, v]) => v !== null && !DB_ONLY.has(k))
      .map(([k, v]) => [toCamel(k), v]),
  ) as T;
}

/** Mensagens legíveis para erros do Postgres/PostgREST. */
export function dbErrorMessage(error: { code?: string; message: string }) {
  switch (error.code) {
    case "23505":
      return "Registro duplicado: placa, CPF, código ou nº do auto já cadastrado.";
    case "23P01":
      return "Conflito de período: o veículo já tem uma reserva nessas datas.";
    case "23503":
      return "Este registro está vinculado a outros (locações, reservas ou multas) e não pode ser excluído.";
    case "23514":
      return "Algum valor está fora do permitido (verifique datas, valores e placa).";
    case "42501":
    case "PGRST301":
      return "Sem permissão. Entre novamente com um usuário da equipe.";
    case "PGRST205":
    case "PGRST202":
      return "Banco não configurado: rode a migração em supabase/migrations no SQL Editor.";
    default:
      return error.message || "Erro ao acessar o banco de dados.";
  }
}

import { getSupabase } from "@/lib/supabase/client";
import type { CompanySettings } from "@/types";
import { dbErrorMessage, fromRow, toRow } from "./mapping";
import type { Entity, Repository, SettingsRepository } from "./types";
import { mergeSettings } from "./types";

type DbError = { code?: string; message: string } | null;

function check<T>({ data, error }: { data: T; error: DbError }): T {
  if (error) throw new Error(dbErrorMessage(error));
  return data;
}

/** insert/update com `.single()`: sem erro, a linha existe. Null aqui = RLS bloqueou a leitura de volta. */
function row(result: { data: Record<string, unknown> | null; error: DbError }) {
  const data = check(result);
  if (!data) throw new Error(dbErrorMessage({ code: "42501", message: "" }));
  return data;
}

/** Implementação Supabase da mesma interface usada pela UI. RLS restringe à equipe (tabela staff). */
export class SupabaseRepository<T extends Entity> implements Repository<T> {
  constructor(private readonly table: string) {}

  private get db() {
    return getSupabase().from(this.table);
  }

  async getAll() {
    const rows = check(await this.db.select("*").order("created_at", { ascending: true }));
    return (rows ?? []).map((r) => fromRow<T>(r));
  }

  async getById(id: string) {
    const found = check(await this.db.select("*").eq("id", id).maybeSingle());
    return found ? fromRow<T>(found) : null;
  }

  async create(item: T) {
    return fromRow<T>(row(await this.db.insert(toRow(item)).select().single()));
  }

  async update(id: string, patch: Partial<T>) {
    const { id: _ignored, ...rest } = patch as Partial<T> & { id?: string };
    void _ignored;
    return fromRow<T>(row(await this.db.update(toRow(rest)).eq("id", id).select().single()));
  }

  async delete(id: string) {
    check(await this.db.delete().eq("id", id));
  }
}

export class SupabaseSettingsRepository implements SettingsRepository {
  constructor(private readonly defaults: CompanySettings) {}

  // RLS devolve só a linha da locadora ativa; organization_id é preenchido pelo banco (inherit_org).
  async get() {
    const found = check(await getSupabase().from("settings").select("data").maybeSingle());
    return mergeSettings(this.defaults, found?.data as Partial<CompanySettings> | undefined);
  }

  async save(settings: CompanySettings) {
    const sb = getSupabase();
    const { data: orgId } = await sb.rpc("current_org_id");
    if (!orgId) throw new Error("Locadora não identificada. Entre novamente.");
    const saved = check(await sb.from("settings").upsert({ organization_id: orgId, data: settings }, { onConflict: "organization_id" }).select("data").single());
    return mergeSettings(this.defaults, saved?.data as Partial<CompanySettings>);
  }
}

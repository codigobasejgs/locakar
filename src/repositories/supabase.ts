import { assertSameOrg, pinnedOrg } from "@/lib/org-path";
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
    const rows = check(await this.db.select("*").eq("organization_id", pinnedOrg()).order("created_at", { ascending: true }));
    return (rows ?? []).map((r) => fromRow<T>(r));
  }

  async getById(id: string) {
    const found = check(await this.db.select("*").eq("id", id).eq("organization_id", pinnedOrg()).maybeSingle());
    return found ? fromRow<T>(found) : null;
  }

  // Gravações conferem a locadora desta aba e levam o id dela: o banco recusa se não for a ativa.
  async create(item: T) {
    await assertSameOrg();
    return fromRow<T>(row(await this.db.insert({ ...toRow(item), organization_id: pinnedOrg() }).select().single()));
  }

  async update(id: string, patch: Partial<T>) {
    await assertSameOrg();
    const { id: _ignored, ...rest } = patch as Partial<T> & { id?: string };
    void _ignored;
    return fromRow<T>(row(await this.db.update(toRow(rest)).eq("id", id).eq("organization_id", pinnedOrg()).select().single()));
  }

  async delete(id: string) {
    await assertSameOrg();
    check(await this.db.delete().eq("id", id).eq("organization_id", pinnedOrg()));
  }
}

export class SupabaseSettingsRepository implements SettingsRepository {
  constructor(private readonly defaults: CompanySettings) {}

  // RLS devolve só a linha da locadora ativa; organization_id é preenchido pelo banco (inherit_org).
  async get() {
    const found = check(await getSupabase().from("settings").select("data").eq("organization_id", pinnedOrg()).maybeSingle());
    return mergeSettings(this.defaults, found?.data as Partial<CompanySettings> | undefined);
  }

  async save(settings: CompanySettings) {
    const sb = getSupabase();
    await assertSameOrg();
    const orgId = pinnedOrg();
    const saved = check(await sb.from("settings").upsert({ organization_id: orgId, data: settings }, { onConflict: "organization_id" }).select("data").single());
    return mergeSettings(this.defaults, saved?.data as Partial<CompanySettings>);
  }
}

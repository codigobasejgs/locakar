import { storage } from "@/lib/storage";
import type { CompanySettings } from "@/types";
import type { Entity, Repository, SettingsRepository } from "./types";

const SAVE_ERROR = "Não foi possível salvar os dados neste navegador.";

/** Implementação inicial (frontend-only). Na primeira leitura, popula com dados de demonstração. */
export class LocalStorageRepository<T extends Entity> implements Repository<T> {
  constructor(
    private readonly key: string,
    private readonly seed: () => T[],
  ) {}

  private read(): T[] {
    const stored = storage.get<T[]>(this.key);
    if (stored) return stored;
    const seeded = this.seed();
    storage.set(this.key, seeded);
    return seeded;
  }

  private write(items: T[]) {
    if (!storage.set(this.key, items)) throw new Error(SAVE_ERROR);
  }

  async getAll() {
    return this.read();
  }

  async getById(id: string) {
    return this.read().find((item) => item.id === id) ?? null;
  }

  async create(item: T) {
    this.write([...this.read(), item]);
    return item;
  }

  async update(id: string, patch: Partial<T>) {
    const items = this.read();
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) throw new Error("Registro não encontrado.");
    const updated = { ...items[index], ...patch, id };
    items[index] = updated;
    this.write(items);
    return updated;
  }

  async delete(id: string) {
    this.write(this.read().filter((item) => item.id !== id));
  }
}

export class LocalStorageSettingsRepository implements SettingsRepository {
  constructor(private readonly defaults: CompanySettings) {}

  async get() {
    return { ...this.defaults, ...storage.get<Partial<CompanySettings>>("settings") };
  }

  async save(settings: CompanySettings) {
    if (!storage.set("settings", settings)) throw new Error(SAVE_ERROR);
    return settings;
  }
}

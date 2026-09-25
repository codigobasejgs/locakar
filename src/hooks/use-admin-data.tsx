"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { authService } from "@/lib/auth";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import { storage } from "@/lib/storage";
import { repositories, settingsRepository } from "@/repositories";
import type { CollectionKey, Collections, EntityFor, Repository } from "@/repositories/types";
import type { CompanySettings } from "@/types";

interface AdminDataContextValue {
  data: Collections | null;
  /** Falha ao carregar (ex.: banco sem tabelas, sem permissão). */
  loadError: string | null;
  settings: CompanySettings;
  create<K extends CollectionKey>(key: K, item: EntityFor<K>): Promise<boolean>;
  update<K extends CollectionKey>(key: K, id: string, patch: Partial<EntityFor<K>>): Promise<boolean>;
  remove<K extends CollectionKey>(key: K, id: string): Promise<boolean>;
  saveSettings(settings: CompanySettings): Promise<boolean>;
  resetDemo(): void;
}

const AdminDataContext = createContext<AdminDataContextValue | null>(null);

const KEYS = Object.keys(repositories) as CollectionKey[];
const repo = <K extends CollectionKey>(key: K) => repositories[key] as unknown as Repository<EntityFor<K>>;

async function loadAll(): Promise<Collections> {
  await authService.assertAccess();
  const lists = await Promise.all(KEYS.map((key) => repositories[key].getAll()));
  return Object.fromEntries(KEYS.map((key, i) => [key, lists[i]])) as Collections;
}

function fail(error: unknown) {
  toast.error(error instanceof Error ? error.message : "Não foi possível concluir a operação.");
  return false;
}

/** Carrega as coleções via repositories e expõe CRUD com estado otimista para as telas do admin. */
export function AdminDataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<Collections | null>(null);
  const [settings, setSettings] = useState<CompanySettings>(DEFAULT_SETTINGS);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadAll()
      .then(async (collections) => [collections, await settingsRepository.get()] as const)
      .then(([collections, stored]) => {
        if (!alive) return;
        setData(collections);
        setSettings(stored);
      })
      .catch((e: unknown) => alive && setLoadError(e instanceof Error ? e.message : "Não foi possível carregar os dados."));
    return () => {
      alive = false;
    };
  }, []);

  const patchCollection = useCallback(
    <K extends CollectionKey>(key: K, fn: (items: EntityFor<K>[]) => EntityFor<K>[]) =>
      setData((prev) => (prev ? { ...prev, [key]: fn(prev[key] as EntityFor<K>[]) } : prev)),
    [],
  );

  const value = useMemo<AdminDataContextValue>(
    () => ({
      data,
      loadError,
      settings,
      async create(key, item) {
        try {
          const created = await repo(key).create(item);
          patchCollection(key, (items) => [...items, created]);
          return true;
        } catch (e) {
          return fail(e);
        }
      },
      async update(key, id, patch) {
        try {
          const updated = await repo(key).update(id, patch);
          patchCollection(key, (items) => items.map((it) => (it.id === id ? updated : it)));
          return true;
        } catch (e) {
          return fail(e);
        }
      },
      async remove(key, id) {
        try {
          await repo(key).delete(id);
          patchCollection(key, (items) => items.filter((it) => it.id !== id));
          return true;
        } catch (e) {
          return fail(e);
        }
      },
      async saveSettings(next) {
        try {
          setSettings(await settingsRepository.save(next));
          return true;
        } catch (e) {
          return fail(e);
        }
      },
      resetDemo() {
        storage.clearAll();
        window.location.reload();
      },
    }),
    [data, loadError, settings, patchCollection],
  );

  return <AdminDataContext.Provider value={value}>{children}</AdminDataContext.Provider>;
}

export function useAdminData() {
  const ctx = useContext(AdminDataContext);
  if (!ctx) throw new Error("useAdminData deve ser usado dentro de <AdminDataProvider>.");
  return ctx;
}

/** Mapas de lookup e opções de select para relacionar registros (cliente, veículo). */
export function useLookups() {
  const { data } = useAdminData();
  return useMemo(() => {
    const clients = data?.clients ?? [];
    const vehicles = data?.vehicles ?? [];
    const clientById = new Map(clients.map((c) => [c.id, c]));
    const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
    return {
      clientById,
      vehicleById,
      clientName: (id?: string) => (id ? (clientById.get(id)?.name ?? "—") : "—"),
      vehicleLabel: (id?: string) => {
        const v = id ? vehicleById.get(id) : undefined;
        return v ? `${v.plate} · ${v.name}` : "—";
      },
      clientOptions: [...clients].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ value: c.id, label: c.name })),
      vehicleOptions: vehicles.map((v) => ({ value: v.id, label: `${v.plate} · ${v.name}` })),
    };
  }, [data]);
}

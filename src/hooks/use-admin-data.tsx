"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { authService } from "@/lib/auth";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import { detectEvents } from "@/lib/push-events";
import { isSupabaseEnabled } from "@/lib/supabase/env";
import { pinOrg } from "@/lib/org-path";
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
  /** Relê um registro do banco (ex.: alterado por uma rota do servidor) e atualiza a tela. */
  reload<K extends CollectionKey>(key: K, id: string): Promise<void>;
  saveSettings(settings: CompanySettings): Promise<boolean>;
  resetDemo(): void;
}

const AdminDataContext = createContext<AdminDataContextValue | null>(null);

const KEYS = Object.keys(repositories) as CollectionKey[];
const repo = <K extends CollectionKey>(key: K) => repositories[key] as unknown as Repository<EntityFor<K>>;

async function loadAll(): Promise<Collections> {
  await authService.assertAccess();
  await pinOrg(); // antes de ler: os dados e as gravações desta aba ficam presos a esta locadora
  const lists = await Promise.all(KEYS.map((key) => repositories[key].getAll()));
  return Object.fromEntries(KEYS.map((key, i) => [key, lists[i]])) as Collections;
}

/**
 * Avisa o servidor de um evento de negócio (nova locação, pagamento, multa...) para a central e o Web Push.
 * Em segundo plano: nunca bloqueia nem desfaz a gravação.
 */
function reportEvent(key: CollectionKey, before: object | undefined, after: object) {
  if (!isSupabaseEnabled) return;
  const events = detectEvents(key, before as Record<string, unknown> | undefined, after as Record<string, unknown>);
  if (!events.length) return;
  fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "event", collection: key, id: (after as { id: string }).id, events }),
    keepalive: true,
  }).catch(() => {});
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
          reportEvent(key, undefined, created);
          return true;
        } catch (e) {
          return fail(e);
        }
      },
      async update(key, id, patch) {
        try {
          const before = data?.[key].find((it) => it.id === id);
          const updated = await repo(key).update(id, patch);
          patchCollection(key, (items) => items.map((it) => (it.id === id ? updated : it)));
          reportEvent(key, before, updated);
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
      async reload(key, id) {
        const fresh = await repo(key).getById(id).catch(() => null);
        if (fresh) patchCollection(key, (items) => items.map((it) => (it.id === id ? fresh : it)));
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

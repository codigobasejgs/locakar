import { DEFAULT_SETTINGS } from "@/lib/constants";
import {
  seedClients,
  seedExpenses,
  seedFines,
  seedMaintenance,
  seedNotes,
  seedRentals,
  seedReservations,
  seedVehicles,
} from "@/data/mock";
import { LocalStorageRepository, LocalStorageSettingsRepository } from "./local-storage";
import type { Repositories, SettingsRepository } from "./types";

/**
 * Ponto único de troca da persistência.
 * Para Supabase: criar `SupabaseRepository<T>` implementando `Repository<T>` e instanciar aqui.
 */
export const repositories: Repositories = {
  vehicles: new LocalStorageRepository("vehicles", seedVehicles),
  clients: new LocalStorageRepository("clients", seedClients),
  rentals: new LocalStorageRepository("rentals", seedRentals),
  reservations: new LocalStorageRepository("reservations", seedReservations),
  expenses: new LocalStorageRepository("expenses", seedExpenses),
  maintenance: new LocalStorageRepository("maintenance", seedMaintenance),
  fines: new LocalStorageRepository("fines", seedFines),
  notes: new LocalStorageRepository("notes", seedNotes),
};

export const settingsRepository: SettingsRepository = new LocalStorageSettingsRepository(DEFAULT_SETTINGS);

export type * from "./types";

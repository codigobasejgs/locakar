import { DEFAULT_SETTINGS } from "@/lib/constants";
import { isSupabaseEnabled } from "@/lib/supabase/env";
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
import { SupabaseRepository, SupabaseSettingsRepository } from "./supabase";
import type { Repositories, SettingsRepository } from "./types";

/**
 * Ponto único de troca da persistência.
 * Com NEXT_PUBLIC_SUPABASE_* definidas → Supabase. Sem elas → modo demonstração (localStorage + dados fictícios).
 */
export const repositories: Repositories = isSupabaseEnabled
  ? {
      vehicles: new SupabaseRepository("vehicles"),
      clients: new SupabaseRepository("clients"),
      rentals: new SupabaseRepository("rentals"),
      reservations: new SupabaseRepository("reservations"),
      expenses: new SupabaseRepository("expenses"),
      maintenance: new SupabaseRepository("maintenance"),
      fines: new SupabaseRepository("fines"),
      notes: new SupabaseRepository("notes"),
    }
  : {
      vehicles: new LocalStorageRepository("vehicles", seedVehicles),
      clients: new LocalStorageRepository("clients", seedClients),
      rentals: new LocalStorageRepository("rentals", seedRentals),
      reservations: new LocalStorageRepository("reservations", seedReservations),
      expenses: new LocalStorageRepository("expenses", seedExpenses),
      maintenance: new LocalStorageRepository("maintenance", seedMaintenance),
      fines: new LocalStorageRepository("fines", seedFines),
      notes: new LocalStorageRepository("notes", seedNotes),
    };

export const settingsRepository: SettingsRepository = isSupabaseEnabled
  ? new SupabaseSettingsRepository(DEFAULT_SETTINGS)
  : new LocalStorageSettingsRepository(DEFAULT_SETTINGS);

export type * from "./types";

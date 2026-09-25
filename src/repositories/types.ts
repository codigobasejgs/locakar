import type {
  Client,
  CompanySettings,
  Expense,
  Fine,
  FleetVehicle,
  Maintenance,
  Note,
  Rental,
  Reservation,
} from "@/types";

export interface Entity {
  id: string;
}

/**
 * Contrato estável de persistência. Os componentes só conhecem esta interface —
 * trocar LocalStorage por Supabase não exige mudanças na UI.
 */
export interface Repository<T extends Entity> {
  getAll(): Promise<T[]>;
  getById(id: string): Promise<T | null>;
  create(item: T): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T>;
  delete(id: string): Promise<void>;
}

export type VehicleRepository = Repository<FleetVehicle>;
export type ClientRepository = Repository<Client>;
export type RentalRepository = Repository<Rental>;
export type ReservationRepository = Repository<Reservation>;
export type ExpenseRepository = Repository<Expense>;
export type MaintenanceRepository = Repository<Maintenance>;
export type FineRepository = Repository<Fine>;
export type NoteRepository = Repository<Note>;

export interface SettingsRepository {
  get(): Promise<CompanySettings>;
  save(settings: CompanySettings): Promise<CompanySettings>;
}

export interface Repositories {
  vehicles: VehicleRepository;
  clients: ClientRepository;
  rentals: RentalRepository;
  reservations: ReservationRepository;
  expenses: ExpenseRepository;
  maintenance: MaintenanceRepository;
  fines: FineRepository;
  notes: NoteRepository;
}

export type CollectionKey = keyof Repositories;
type EntityOf<R> = R extends Repository<infer T> ? T : never;
export type Collections = { [K in CollectionKey]: EntityOf<Repositories[K]>[] };
export type EntityFor<K extends CollectionKey> = Collections[K][number];

import { useEffect, useState, useCallback, createContext, useContext } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "../services/supabase";

export interface LocatarioProfile {
  id: string;
  name: string;
  cpf: string;
  email?: string;
  phone: string;
  cnhNumber?: string;
  cnhCategory?: string;
  cnhExpiry?: string;
}

export interface LocatarioRental {
  id: string;
  vehicleId: string;
  startDate: string;
  endDate: string;
  status: "active" | "finished" | "late" | "cancelled" | "pending";
  weeklyRate: number;
  receipts: Array<{
    id: string;
    dueDate: string;
    amount: number;
    paid: boolean;
    amountPaid?: number;
  }>;
  billing?: {
    period: string;
    amount: number;
    firstDue: string;
    until: string;
    lateFeePercent: number;
    interestPercent: number;
    interestPeriod: string;
    graceDays: number;
  };
  vehicle?: {
    id: string;
    name: string;
    brand: string;
    model: string;
    plate: string;
    image: string;
    fuel: string;
  };
}

interface LocatarioContextValue {
  user: User | null;
  session: Session | null;
  client: LocatarioProfile | null;
  rentals: LocatarioRental[];
  activeRental: LocatarioRental | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const LocatarioContext = createContext<LocatarioContextValue | null>(null);

export function useLocatario() {
  const ctx = useContext(LocatarioContext);
  if (!ctx) throw new Error("useLocatario deve ser usado dentro de LocatarioProvider");
  return ctx;
}

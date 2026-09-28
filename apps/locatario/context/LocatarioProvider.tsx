import React, { useEffect, useState, useCallback } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "../services/supabase";
import {
  LocatarioContext,
  LocatarioProfile,
  LocatarioRental,
} from "../hooks/useLocatario";

export function LocatarioProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [client, setClient] = useState<LocatarioProfile | null>(null);
  const [rentals, setRentals] = useState<LocatarioRental[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async (userId: string) => {
    try {
      // 1. Perfil do cliente (RLS: user_id = auth.uid())
      const { data: clientRow } = await supabase
        .from("clients")
        .select("id, name, cpf, email, phone, cnh_number, cnh_category, cnh_expiry")
        .eq("user_id", userId)
        .maybeSingle();

      if (!clientRow) {
        setClient(null);
        setRentals([]);
        return;
      }

      setClient({
        id: clientRow.id,
        name: clientRow.name,
        cpf: clientRow.cpf,
        email: clientRow.email,
        phone: clientRow.phone,
        cnhNumber: clientRow.cnh_number,
        cnhCategory: clientRow.cnh_category,
        cnhExpiry: clientRow.cnh_expiry,
      });

      // 2. Locações do cliente (RLS: client_id = current_client_id())
      const { data: rentalRows } = await supabase
        .from("rentals")
        .select(`
          id,
          vehicle_id,
          start_date,
          end_date,
          status,
          weekly_rate,
          receipts,
          billing:notes
        `)
        .eq("client_id", clientRow.id)
        .order("start_date", { ascending: false });

      if (rentalRows && rentalRows.length > 0) {
        // Carrega os veículos associados
        const vehicleIds = Array.from(new Set(rentalRows.map((r) => r.vehicle_id)));
        const { data: vehicleRows } = await supabase
          .from("vehicles")
          .select("id, name, brand, model, plate, image, fuel")
          .in("id", vehicleIds);

        const vMap = new Map((vehicleRows || []).map((v) => [v.id, v]));

        const mapped: LocatarioRental[] = rentalRows.map((r: any) => ({
          id: r.id,
          vehicleId: r.vehicle_id,
          startDate: r.start_date,
          endDate: r.end_date,
          status: r.status,
          weeklyRate: Number(r.weekly_rate),
          receipts: r.receipts || [],
          vehicle: vMap.get(r.vehicle_id),
        }));

        setRentals(mapped);
      } else {
        setRentals([]);
      }
    } catch (e) {
      console.error("[LocatarioProvider] Erro ao carregar dados:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (user?.id) {
      await loadData(user.id);
    }
  }, [user?.id, loadData]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadData(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadData(session.user.id);
      } else {
        setClient(null);
        setRentals([]);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadData]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const activeRental = rentals.find((r) => r.status === "active" || r.status === "late") ?? rentals[0] ?? null;

  return (
    <LocatarioContext.Provider
      value={{
        user,
        session,
        client,
        rentals,
        activeRental,
        loading,
        refresh,
        signOut,
      }}
    >
      {children}
    </LocatarioContext.Provider>
  );
}

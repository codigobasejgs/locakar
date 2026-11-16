-- Veículo "Alugado" volta a "Disponível" quando a última locação em curso dele é excluída,
-- cancelada, finalizada ou trocada de carro. Vale para qualquer caminho (painel, API, Copiloto).
-- Manutenção/vendido/reservado nunca são alterados aqui.
begin;

create or replace function public.release_vehicle_after_rental()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE'
     or (old.status in ('active', 'late') and new.status not in ('active', 'late'))
     or old.vehicle_id is distinct from new.vehicle_id then
    update public.vehicles v
       set status = 'available', updated_at = now()
     where v.id = old.vehicle_id
       and v.status = 'rented'
       and not exists (select 1 from public.rentals r where r.vehicle_id = old.vehicle_id and r.status in ('active', 'late'));
  end if;
  return null;
end $$;
revoke all on function public.release_vehicle_after_rental() from public, anon, authenticated;

drop trigger if exists release_vehicle_after_rental on public.rentals;
create trigger release_vehicle_after_rental after delete or update of status, vehicle_id on public.rentals
  for each row execute function public.release_vehicle_after_rental();

-- Corrige carros que ficaram "Alugado" sem locação em curso (locações excluídas antes deste ajuste).
update public.vehicles v set status = 'available', updated_at = now()
 where v.status = 'rented'
   and not exists (select 1 from public.rentals r where r.vehicle_id = v.id and r.status in ('active', 'late'));

commit;

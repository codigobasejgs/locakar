-- Vínculos Selsyn somente pelo backend; mantém o CRUD das demais colunas.
begin;
create or replace function public.guard_selsyn_vehicle_link() returns trigger
language plpgsql set search_path = '' as $guard$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.selsyn_rastreavel_id is not null or new.selsyn_identificador is not null or new.selsyn_linked_at is not null then
        raise exception 'Vínculo Selsyn deve ser validado pelo backend.' using errcode = '42501';
      end if;
    elsif new.selsyn_rastreavel_id is distinct from old.selsyn_rastreavel_id
       or new.selsyn_identificador is distinct from old.selsyn_identificador
       or new.selsyn_linked_at is distinct from old.selsyn_linked_at then
      raise exception 'Vínculo Selsyn deve ser validado pelo backend.' using errcode = '42501';
    end if;
  end if;
  return new;
end $guard$;
drop trigger if exists vehicles_selsyn_link_guard on public.vehicles;
create trigger vehicles_selsyn_link_guard before insert or update on public.vehicles
for each row execute function public.guard_selsyn_vehicle_link();
commit;

-- ===========================================================================
-- Migratia 71: contul din care s-a plasat fiecare comanda, pentru lista de comenzi
-- ===========================================================================
--
-- Cerut de un magazin (07.10.2026): un client cu cont comanda pentru mai multe persoane, deci
-- numele si emailul de pe comanda difera de la o comanda la alta. Masurat pe productie, la acel
-- magazin: 69 de comenzi legate de UN singur cont, cu destinatari si emailuri diferite. Lista de
-- comenzi nu arata contul nicaieri, iar tabelele contului stau in `privat`, pe care PostgREST nu
-- o expune.
--
-- Functia primeste id-urile comenzilor dintr-o pagina (sau dintr-un export) si intoarce contul
-- fiecareia: id, nume, email. Aceleasi reguli ca `cont_panou_lista`: numai conturile nesterse,
-- emailul confirmat intai. ⚠ Toate felurile de legatura, si `legat-de-comerciant`: comerciantul
-- a legat-o chiar el, deci trebuie sa vada de ce cont.
--
-- ⚠ SECURITY DEFINER si NUMAI pentru `service_role`: o cheama serverul dupa ce a dovedit ca
-- magazinul e al omului logat (`src/lib/cont/panou.ts`), ca toate functiile `cont_panou_*`.

create or replace function public.cont_panou_conturile_comenzilor(p_business uuid, p_orders uuid[])
returns table (order_id uuid, cont_id uuid, nume text, email text, temei text)
language sql stable security definer set search_path = '' as $fn$
  select l.order_id, l.cont_id,
         nullif(btrim(c.nume), ''),
         (select k.valoare_bruta from privat.cont_contact k
           where k.business_id = l.business_id and k.cont_id = l.cont_id and k.fel = 'email'
           order by k.verificat_la nulls last, k.creat_la limit 1),
         l.temei
    from privat.cont_comanda l
    join privat.cont_cumparator c on c.id = l.cont_id and c.business_id = l.business_id and c.sters_la is null
   where l.business_id = p_business
     and l.order_id = any(coalesce(p_orders, '{}'::uuid[]));
$fn$;

revoke all on function public.cont_panou_conturile_comenzilor(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.cont_panou_conturile_comenzilor(uuid, uuid[]) to service_role;

notify pgrst, 'reload schema';

-- Verificarea drepturilor, in migratie: o functie SECURITY DEFINER deschisa lui `anon` ar da
-- oricui contul oricarei comenzi.
do $$
begin
  if has_function_privilege('anon', 'public.cont_panou_conturile_comenzilor(uuid, uuid[])', 'execute')
     or has_function_privilege('authenticated', 'public.cont_panou_conturile_comenzilor(uuid, uuid[])', 'execute') then
    raise exception 'cont_panou_conturile_comenzilor e deschisa lui anon/authenticated';
  end if;
  if not has_function_privilege('service_role', 'public.cont_panou_conturile_comenzilor(uuid, uuid[])', 'execute') then
    raise exception 'cont_panou_conturile_comenzilor nu e deschisa lui service_role';
  end if;
end $$;

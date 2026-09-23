-- ═══════════════════════════════════════════════════════════════════════════
-- CONTURI DE CLIENT, migratia 9: ce vede comerciantul           (23.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O singura functie: cati cumparatori au cont la magazinul asta.
--
-- ⚠ Exista fiindca tabelele contului stau in schema `privat`, pe care PostgREST
-- NU o expune. Un `select count(*)` din panou n-ar avea ce sa citeasca, si
-- singura „reparatie" care ar fi parut evidenta (sa mutam tabelele in `public`)
-- ar fi desfacut chiar zidul pentru care au fost puse acolo.
--
-- ⚠ Se numara numai conturile VII: unul sters ramane in tabela doi ani, ca sa se
-- poata raspunde la „de ce nu mai pot intra", dar nu mai e al nimanui.

create or replace function public.cont_cate_conturi(p_business uuid)
returns integer
language sql stable security definer set search_path = '' as $fn$
  select count(*)::integer
    from privat.cont_cumparator c
   where c.business_id = p_business and c.sters_la is null;
$fn$;

revoke all on function public.cont_cate_conturi(uuid) from public, anon, authenticated;
grant execute on function public.cont_cate_conturi(uuid) to service_role;

do $$
begin
  if has_function_privilege('anon', 'public.cont_cate_conturi(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.cont_cate_conturi(uuid)', 'EXECUTE') then
    raise exception 'cont_cate_conturi e deschisa';
  end if;
  if not has_function_privilege('service_role', 'public.cont_cate_conturi(uuid)', 'EXECUTE') then
    raise exception 'service_role NU poate chema cont_cate_conturi';
  end if;
end $$;

notify pgrst, 'reload schema';

-- 26.09.2026, cerut de el: `email_automations` (jurnalul emailurilor automate trimise
-- comerciantilor, folosit ca dedup de cronul `email-automations`) nu avea cheie straina
-- spre `auth.users`. La orice stergere de cont, inclusiv din butonul din admin, randurile
-- ramaneau orfane: 13 in productie, masurat pe 26.09.2026 (din 996).
--
-- Orfanele nu mai au la cine trimite si nu apara nimic: dedup-ul e pe (user_id, email_key),
-- iar un cont sters nu mai revine cu acelasi id. Se sterg, apoi cheia cu cascada.
-- Idempotenta.

begin;

delete from public.email_automations e
where not exists (select 1 from auth.users u where u.id = e.user_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.email_automations'::regclass
      and conname = 'email_automations_user_id_fkey'
  ) then
    alter table public.email_automations
      add constraint email_automations_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
end $$;

commit;

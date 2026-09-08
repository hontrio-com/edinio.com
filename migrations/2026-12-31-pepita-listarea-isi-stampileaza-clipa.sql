-- ═══════════════════════════════════════════════════════════════════════════
-- PEPITA: ORICINE SCRIE O LISTARE II STAMPILEAZA SI CLIPA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ DE CE CONTEAZA CAMPUL ASTA MAI MULT DECAT PARE
--
-- `<LastMod>` din feedul de produse e singurul lucru dupa care Pepita hotaraste ce reciteste.
-- Se socoteste ca cel mai tarziu dintre `products.updated_at`, pragul magazinului si
-- `pepita_listari.actualizat_la` — iar ultimul e SINGURUL semn ca s-a schimbat un reglaj PER
-- PRODUS: pretul impus, stocul de siguranta, includerea.
--
-- ⚠ CE APARA DECLANSATORUL, SI DE CE NU AJUNGE O INTELEGERE INTRE OAMENI
--
-- Cei doi scriitori de azi (`includere-in-masa.ts` si `pepita.actions.ts`) pun campul cu mana, si
-- il pun corect. Dar asta e o obisnuinta, nu o regula. Ecranul care va scrie `pret_override` per
-- produs inca nu exista, iar primul care uita cele doua cuvinte ar INGHETA timpul exact pe
-- randurile pentru care el conteaza: Pepita ar vedea o data veche pe un produs al carui pret
-- tocmai s-a schimbat, si ar continua sa vanda la pretul de ieri.
--
-- Pana azi paza era o proba care SCANEAZA SURSA (`includere-in-masa.test.ts`). Ea spune ca
-- fiecare scriere numeste campul — nu ca valoarea scrisa e cea buna, si nu stie nimic despre o
-- scriere facuta din consola SQL sau dintr-o unealta viitoare. Declansatorul stie.
--
-- ⚠ `when (old.* is distinct from new.*)`, CA LA `aboutyou_marcheaza_listarea`. Fara clauza asta,
-- orice `update` care nu schimba nimic — un upsert care rescrie aceleasi valori — ar impinge
-- `<LastMod>` inainte, si Pepita ar reciti tot catalogul degeaba. Cu ea, clipa se muta doar cand
-- s-a miscat ceva.
--
-- ⚠ NU E `security definer`, dinadins. Functia nu atinge nicio alta tabela: schimba un camp din
-- `new` si atat. Un `security definer` de care nu e nevoie e o usa in plus catre `postgres`.

create or replace function public.pepita_stampileaza_listarea()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.actualizat_la := now();
  return new;
end;
$$;

comment on function public.pepita_stampileaza_listarea() is
  'Muta `pepita_listari.actualizat_la` la now() ori de cate ori randul chiar se schimba. De el atarna `<LastMod>` din feedul Pepita.';

drop trigger if exists pepita_listari_stampileaza_clipa on public.pepita_listari;
create trigger pepita_listari_stampileaza_clipa
  before update on public.pepita_listari
  for each row
  when (old.* is distinct from new.*)
  execute function public.pepita_stampileaza_listarea();

-- Vezi nota de sus: o functie noua primeste EXECUTE pentru `anon` si `authenticated` din
-- `pg_default_acl`, iar un `revoke ... from public` nu stinge un grant dat pe nume. O functie de
-- declansator n-are de ce sa fie chemabila de nimeni direct.
revoke all on function public.pepita_stampileaza_listarea() from public;
revoke all on function public.pepita_stampileaza_listarea() from anon;
revoke all on function public.pepita_stampileaza_listarea() from authenticated;

notify pgrst, 'reload schema';

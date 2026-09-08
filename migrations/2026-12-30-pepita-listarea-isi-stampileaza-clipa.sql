-- ══════════════════════════════════════════════════════════════════════════════
-- `pepita_listari.actualizat_la` nu mai atarna de bunavointa apelantului
-- ══════════════════════════════════════════════════════════════════════════════
--
-- DE CE. `<LastMod>` din feedul de produse e acum cel mai tarziu dintre data produsului, data
-- listarii si pragul magazinului. Partea „data listarii" e singura care spune ca s-a schimbat
-- un reglaj PER PRODUS: pretul propriu (`pret_override`), stocul de siguranta, sau chiar
-- includerea in feed.
--
-- Azi cei doi scriitori din cod pun `actualizat_la` cu mana, si o fac corect. Dar asta e o
-- intelegere intre oameni, nu o regula: ecranul care va scrie `pret_override` si `safety_stock`
-- per produs inca nu exista, iar primul care il scrie uitand cele doua cuvinte ar INGHETA
-- timpul exact pe randurile pentru care el conteaza. Pepita ar fi vazut o data veche pe un
-- produs al carui pret tocmai fusese schimbat, si ar fi putut sa nu-l mai citeasca.
--
-- ⚠ CU `WHEN`, ca la `aboutyou_marcheaza_listarea`. Fara el, orice UPDATE care nu schimba nimic
-- ar re-stampila randul, iar `LastMod` ar sari pe produse care n-au miscat. Un declansator care
-- minte in cealalta directie nu e mai bun decat cel care lipseste.
--
-- ⚠ NU SCHIMBA NICIO COLOANA si nu atinge niciun grant: codul care citeste `actualizat_la`
-- merge si fara migratia asta, fiindca la coloana exista de la inceput. Migratia doar face
-- invariantul sa nu mai poata fi incalcat.

create or replace function public.pepita_stampileaza_listarea()
  returns trigger
  language plpgsql
  set search_path to 'public', 'pg_temp'
as $function$
begin
  new.actualizat_la = now();
  return new;
end;
$function$;

drop trigger if exists pepita_stampileaza_listarea on public.pepita_listari;

create trigger pepita_stampileaza_listarea
  before update on public.pepita_listari
  for each row
  when (old.* is distinct from new.*)
  execute function public.pepita_stampileaza_listarea();

notify pgrst, 'reload schema';

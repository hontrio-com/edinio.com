-- ═══════════════════════════════════════════════════════════════════════════
-- FEREASTRA COMUNA CAPATA „ASTAZI" SI „IERI" (20.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Pagina Statistici cere opt perioade: azi, ieri, 7, 30, 90 de zile, luna
-- aceasta, anul acesta si personalizat. `fereastra_vanzari` le stia pe ultimele
-- sase.
--
-- ⚠ SE ADAUGA IN FEREASTRA COMUNA, nu in pagina. Toate ecranele care compara
-- perioade (graficul de vanzari, cardurile, traficul, harta) citesc de aici;
-- o socoteala scrisa separat pentru „azi" ar fi insemnat ca acelasi cuvant
-- inseamna doua lucruri in doua ecrane.
--
-- ⚠ „Azi" se compara cu IERI INTREG, nu cu ieri pana la aceeasi ora. Cardurile
-- din panoul principal fac altfel, dinadins (acolo e o singura cifra, si
-- dimineata ar arata mereu scadere); aici perioada e aleasa de om si scrie pe
-- ecran ce compara, deci ziua intreaga e raspunsul care nu surprinde pe nimeni.
create or replace function public.fereastra_vanzari(
  p_fel text default '7z',
  p_de_la date default null,
  p_pana_la date default null
)
returns table (
  de_la date, pana_la date,
  de_la_ant date, pana_la_ant date,
  granulatie text
)
language plpgsql
stable
set search_path to 'pg_catalog', 'pg_temp'
as $$
declare
  azi date := (now() at time zone 'Europe/Bucharest')::date;
  s date; e date; sa date; ea date; zile integer; g text;
begin
  case coalesce(p_fel, '7z')
    when 'azi'  then s := azi;      e := azi;
    when 'ieri' then s := azi - 1;  e := azi - 1;
    when '30z'  then s := azi - 29; e := azi;
    when '90z'  then s := azi - 89; e := azi;
    when 'luna' then s := date_trunc('month', azi)::date; e := azi;
    when 'an'   then s := date_trunc('year',  azi)::date; e := azi;
    when 'custom' then
      s := coalesce(p_de_la, azi - 6);
      e := coalesce(p_pana_la, azi);
      if e < s then
        declare t date := s; begin s := e; e := t; end;
      end if;
      if e - s > 730 then s := e - 730; end if;
      if e > azi then e := azi; end if;
      if s > e then s := e; end if;
    else s := azi - 6; e := azi;
  end case;

  zile := (e - s) + 1;

  if coalesce(p_fel, '7z') = 'luna' then
    sa := (s - interval '1 month')::date;
    ea := (e - interval '1 month')::date;
  elsif coalesce(p_fel, '7z') = 'an' then
    sa := (s - interval '1 year')::date;
    ea := (e - interval '1 year')::date;
  else
    ea := s - 1;
    sa := ea - (zile - 1);
  end if;

  g := case when zile <= 92 then 'zi' when zile <= 400 then 'saptamana' else 'luna' end;

  return query select s, e, sa, ea, g;
end;
$$;

notify pgrst, 'reload schema';

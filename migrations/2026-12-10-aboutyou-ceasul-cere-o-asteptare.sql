-- ═══════════════════════════════════════════════════════════════════════════
-- UN NUMAR MAI MARE NU INSEAMNA O CERERE MAI NOUA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE REPARA (28.08.2026, dupa-amiaza)
--
-- Ceasul de ieri da numere unice, si atat: cine cere ultimul primeste cel mai mare numar. Dar
-- „ultimul care a cerut" nu e „ultimul care a vrut ceva". Doua curse se strecoara exact pe-acolo.
--
-- ═══ 1. O REASERTARE VECHE POATE SARI PESTE O RELISTARE ═══
--
--     piatra de mormant 5, listarea nu mai exista
--     omul relisteaza -> ceasul 5 -> 6, dar randul nou nu s-a scris inca
--     un lot vechi de stare se aseaza -> reasertarea cere si ea -> ceasul 6 -> 7
--     relistarea se incheie: listare noua, generatia 6
--     reasertarea (7) se incheie -> 7 = 7 -> trece de comparare -> STERGE listarea noua ❌
--
-- Reasertarea s-a nascut din viata VECHE. N-are voie sa devina „mai noua" doar fiindca a cerut
-- numarul cu cateva milisecunde mai tarziu.
--
-- ═══ 2. UN `published` VECHI POATE INVIA UN PRODUS SCOS ═══
--
--     `setRemoteStatus` citeste listarea L… si se opreste o clipa
--     intre timp: scoatere -> ceasul 6 -> `inactive` la ei -> piatra 6 -> L STEARSA
--     `setRemoteStatus` isi reia drumul, cere ceasul 6 -> 7, si trimite `published`
--     la ei: PUBLICAT. La noi: listarea nu exista.
--     iar la asezare, piatra spune 6, lotul spune 7 -> 7 >= 6 -> nu se reaserteaza nimic ❌
--
-- Adica exact starea de care fugim de zile intregi: marfa vandabila la ei, uitata la noi.
--
-- ═══ LEACUL: ALOCAREA CERE O ASTEPTARE ═══
--
-- Numarul nu se mai da „oricui cere", ci numai daca lumea e inca cea din care a pornit cererea.
-- Doua feluri de asteptare, fiindca sunt doua feluri de cerere:
--
--   * o schimbare de stare porneste de la un RAND de listare anume — deci se cere `listing.id`.
--     `style_key` nu e destul: el supravietuieste relistarii, iar randul e chiar incarnarea.
--   * o reasertare porneste de la o PIATRA cu o generatie anume — deci se cere numarul ei.
--
-- ⚠ `aboutyou_ceas_urmator` RAMANE, si e chemat doar de relistare: acolo nu exista asteptare de
-- verificat, fiindca chiar ea e cea mai noua intentie. Semnatura veche nu se atinge, deci nu exista
-- fereastra intre migratie si desfasurare in care codul care ruleaza sa cheme ceva ce nu mai e.

/*
 * Numarul urmator, DACA listarea e inca aceeasi.
 *
 * ⚠ `null` inseamna „lumea s-a schimbat": cine cheama NU trebuie sa mai trimita nimic la ei.
 */
create or replace function public.aboutyou_ceas_pentru_listare(
  p_business_id uuid, p_style_key text, p_listare_id uuid, p_dorit text
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_gen integer;
begin
  -- Incuietoarea intai: fara ea, verificarea de dedesubt s-ar putea invechi chiar in clipa dintre
  -- citire si scriere — chiar defectul pe care il inchidem.
  perform 1 from public.aboutyou_ceas_stare
   where business_id = p_business_id and style_key = p_style_key
     for update;

  -- ⚠ RANDUL E INCARNAREA. Sters si refacut, are alt `id`, desi `style_key` e acelasi.
  if not exists (
    select 1 from public.aboutyou_listings
     where id = p_listare_id and business_id = p_business_id and style_key = p_style_key
  ) then
    return null;
  end if;

  insert into public.aboutyou_ceas_stare (business_id, style_key, generatie, dorit)
  values (p_business_id, p_style_key, 1, p_dorit)
  on conflict (business_id, style_key)
  do update set generatie = public.aboutyou_ceas_stare.generatie + 1,
                dorit = p_dorit,
                actualizat_la = now()
  returning generatie into v_gen;

  update public.aboutyou_listings
     set status_generatie = v_gen, status_dorit = p_dorit
   where id = p_listare_id;

  return v_gen;
end;
$$;

revoke all on function public.aboutyou_ceas_pentru_listare(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.aboutyou_ceas_pentru_listare(uuid, text, uuid, text) to service_role;

/*
 * Numarul urmator pentru o reasertare, DACA ceasul e inca acolo unde l-a lasat piatra.
 *
 * ⚠ `null` inseamna ca intre timp s-a intamplat altceva — cel mai adesea o relistare. Atunci
 * reasertarea nu mai are ce sa stinga: produsul are o viata noua, si ea e cea care conteaza.
 */
create or replace function public.aboutyou_ceas_pentru_reasertare(
  p_business_id uuid, p_style_key text, p_generatie_asteptata integer
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ceas integer;
  v_gen integer;
begin
  select generatie into v_ceas
    from public.aboutyou_ceas_stare
   where business_id = p_business_id and style_key = p_style_key
     for update;
  if not found then
    return null;
  end if;

  -- ⚠ EGALITATE, ca la incheierea scoaterii: „nu e mai vechi" ar lasa sa treaca orice.
  if p_generatie_asteptata is null or v_ceas <> p_generatie_asteptata then
    return null;
  end if;

  update public.aboutyou_ceas_stare
     set generatie = generatie + 1, dorit = 'inactive', actualizat_la = now()
   where business_id = p_business_id and style_key = p_style_key
  returning generatie into v_gen;

  return v_gen;
end;
$$;

revoke all on function public.aboutyou_ceas_pentru_reasertare(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.aboutyou_ceas_pentru_reasertare(uuid, text, integer) to service_role;

notify pgrst, 'reload schema';

/* ═══════════════════════════════════════════════════════════════════════════
   eMAG: sirul familiilor de variante
   ═══════════════════════════════════════════════════════════════════════════

   `emag_offers.family_id` exista de la prima migratie, dar nimic nu-l genera: era
   o coloana pe care importul o COPIA de la ei, si atat. La publicare, insa, familia
   trebuie sa fie a NOASTRA — un produs cu patru combinatii inseamna patru oferte
   eMAG plus o familie care le tine impreuna.

   ═══ ⚠ DE CE UN SIR PROPRIU SI NU `emag_id`-UL PRIMULUI MEMBRU ═══

   Prima idee e sa iei id-ul primei oferte drept id de familie. Merge — pana cand
   comerciantul scoate din vanzare tocmai marimea aceea. Atunci „primul membru"
   devine altul, familia isi schimba id-ul, si eMAG vede o familie NOUA: vechea
   grupare ramane acolo cu ofertele ei, iar produsul apare de doua ori pe site-ul lor.

   Un id de familie trebuie sa fie la fel de stabil ca un `emag_id`. Deci sir propriu.

   ═══ ⚠ ACELASI PRAG DE UN MILIARD, SI DIN ACELASI MOTIV ═══

   `family.id` e tot al vanzatorului, ca `emag_id`: si-l alege singur, iar importul
   PRELUA familiile care exista deja in contul lui. Pornit de la 1, primul produs pe
   care il publicam ar fi cerut o familie care se ciocneste cu una adusa de import.

   Sub un miliard stau numai familii preluate de la ei; peste, numai ale noastre.
   `emag_ridica_sirurile` de mai jos impinge sirul cand un import aduce familii de
   deasupra pragului.

   ⚠ Sirul e GLOBAL, ca al ofertelor. Unicitatea pe magazin o da
   `emag_offers_business_emag_key`; sirul global doar face ciocnirile si mai putin
   probabile, fara sa coste nimic — mai are noua miliarde de miliarde deasupra.
   ═══════════════════════════════════════════════════════════════════════════ */

begin;

create sequence if not exists public.emag_family_id_seq as bigint start with 1000000000;

comment on sequence public.emag_family_id_seq is
  'Id-urile de familie pe care le trimitem NOI la eMAG. Incepe de la 1.000.000.000 ca '
  'sa nu se ciocneasca cu familiile preluate de import din contul comerciantului.';

/**
 * O familie noua.
 *
 * ⚠ Nu e un `default` pe coloana, si nu poate fi: toate ofertele unui produs impart
 * ACEEASI familie, deci id-ul se cere o data pe produs, nu o data pe rand.
 */
create or replace function public.emag_familie_noua()
returns bigint
language sql
security definer
set search_path = public, pg_temp
as $$
  select nextval('public.emag_family_id_seq');
$$;

comment on function public.emag_familie_noua() is
  'Un id de familie nou, pentru un produs cu variante care se publica pe eMAG. '
  'Drepturile sunt retrase de la anon si authenticated: numai cheia de serviciu.';

revoke all on function public.emag_familie_noua() from public, anon, authenticated;

/**
 * Amandoua sirurile, impinse deasupra id-urilor preluate la import.
 *
 * ⚠ Inlocuieste `emag_ridica_sirul`, care stia numai de oferte. Pastrarea celei
 * vechi ar fi insemnat ca importul ridica sirul ofertelor si il uita pe al
 * familiilor — iar prima publicare de dupa un import cu familii mari ar fi cerut o
 * familie deja luata, si ar fi cazut pe `duplicate key` fara sa spuna de ce.
 *
 * ⚠ Sirurile NU se dau inapoi la rollback. Asa trebuie sa ramana: un import cazut
 * pierde niste id-uri dintr-un `bigint`, pe cand un sir dat inapoi ar da acelasi id
 * la doua oferte, iar la eMAG a doua ar suprascrie-o pe prima fara sa spuna nimic.
 * Masurat pe productie la migratia dinainte.
 */
create or replace function public.emag_ridica_sirurile(p_oferta bigint, p_familie bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_o bigint;
  v_f bigint;
begin
  select last_value into v_o from public.emag_offers_emag_id_seq;
  if p_oferta is not null and p_oferta >= v_o then
    /* ⚠ `false` la al treilea argument: urmatorul `nextval` intoarce CHIAR valoarea
       pusa, nu una peste ea. De aceea se scrie `+ 1` explicit.
       ⚠ `>=` si nu `>`: `last_value` inseamna „urmatoarea" la un sir abia repornit
       si „ultima" la unul folosit. Cu `>=` amandoua ies bine. */
    perform setval('public.emag_offers_emag_id_seq', p_oferta + 1, false);
    v_o := p_oferta + 1;
  end if;

  select last_value into v_f from public.emag_family_id_seq;
  if p_familie is not null and p_familie >= v_f then
    perform setval('public.emag_family_id_seq', p_familie + 1, false);
    v_f := p_familie + 1;
  end if;

  return jsonb_build_object('oferta', v_o, 'familie', v_f);
end;
$$;

comment on function public.emag_ridica_sirurile(bigint, bigint) is
  'Impinge AMANDOUA sirurile eMAG deasupra id-urilor preluate la import. Inlocuieste '
  'emag_ridica_sirul, care il uita pe cel al familiilor.';

revoke all on function public.emag_ridica_sirurile(bigint, bigint) from public, anon, authenticated;

drop function if exists public.emag_ridica_sirul(bigint);

commit;

notify pgrst, 'reload schema';

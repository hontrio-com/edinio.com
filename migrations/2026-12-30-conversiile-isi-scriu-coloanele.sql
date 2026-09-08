-- ═══════════════════════════════════════════════════════════════════════════
-- BAZA NU SE PUTEA REFACE DIN BASELINE. O SINGURA FUNCTIE DIN 166
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE ERA STRICAT
--
-- Baseline-ul emite sectiunea FUNCTII inaintea sectiunii TABELE. Din cele 166 de functii ale
-- productiei, EXACT UNA are un tip de TABELA in semnatura:
--
--     create or replace function public.edinio_revendica_conversii(limita integer)
--     returns setof public.edinio_conversion_outbox
--
-- Tipul `edinio_conversion_outbox` nu exista inca in clipa aceea, deci aplicarea pe o baza goala
-- cade. Si nu conteaza ca `check_function_bodies` e stins: acolo se verifica CORPUL, iar aici
-- pica TIPUL DE INTOARCERE, care se rezolva oricum.
--
-- ⚠ CAT DE MULT INSEMNA. Procedura de refacere scrisa in `migrations/CITESTE-INTAI.md`
-- (preludiu + baseline) NU mergea. Jobul de CI „schema se aplica pe o baza goala" cadea la pasul
-- „2 functii" cu iesirea 3, si cadea la fel si pe commiturile de dinaintea lucrarilor Pepita: nu
-- era o regresie, era un lucru pe care CI-ul rosu il striga de zile.
--
-- ⚠ LEACUL. Semnatura nu mai arata catre tipul tabelei, ci isi scrie coloanele. Verificat pe
-- 08.09.2026 ca ea e SINGURA: interogarea peste `pg_proc` care cauta tipuri de tabela in
-- `prorettype` SI in `proargtypes` intoarce exact acest rand, si nimic altceva.
--
-- ⚠ CORPUL RAMANE IDENTIC — aceeasi arenda de un minut, acelasi `for update skip locked`,
-- aceeasi margine de 500 — deci purtarea nu se schimba cu nimic. Coloanele sunt scrise in ORDINEA
-- din tabela (`ordinal_position` 1..12), deci nici forma raspunsului catre PostgREST nu se muta.
--
-- ⚠ SE DA JOS INTAI. `create or replace` nu poate schimba tipul de intoarcere al unei functii
-- („cannot change return type of existing function"), deci `drop` e obligatoriu, nu o preferinta.
-- Iar `drop` pierde granturile: de aceea se rescriu toate mai jos, si nu doar cel al lui
-- `service_role`.

drop function if exists public.edinio_revendica_conversii(integer);

create function public.edinio_revendica_conversii(limita integer)
returns table (
  id uuid,
  destinatie text,
  nume_eveniment text,
  event_id text,
  sarcina jsonb,
  incercari integer,
  next_retry_at timestamp with time zone,
  trimis_la timestamp with time zone,
  ultima_eroare text,
  abandonat_la timestamp with time zone,
  creat_la timestamp with time zone,
  vizitator text
)
language sql
set search_path = public, pg_temp
as $$
  update public.edinio_conversion_outbox o
     -- ⚠ ARENDA DE UN MINUT, nu o incuietoare: daca rularea moare la jumatate, randul se
     -- elibereaza singur. O incuietoare ar trebui desfacuta de cineva, iar cine moare nu desface.
     -- `ARENDA_MS` din `coada-conversii.ts` e chiar minutul asta, citit de acolo.
     set next_retry_at = now() + interval '1 minute'
   where o.id in (
     select c.id
       from public.edinio_conversion_outbox c
      where c.trimis_la is null
        and c.abandonat_la is null
        and c.next_retry_at <= now()
      order by c.next_retry_at asc
      limit greatest(1, least(limita, 500))
      -- ⚠ `skip locked` e mai tare decat serializarea scrierilor: a doua rulare SARE peste
      -- randurile incuiate, in loc sa astepte dupa ele.
      for update skip locked
   )
  returning
    o.id, o.destinatie, o.nume_eveniment, o.event_id, o.sarcina, o.incercari,
    o.next_retry_at, o.trimis_la, o.ultima_eroare, o.abandonat_la, o.creat_la, o.vizitator;
$$;

-- ⚠ O FUNCTIE PROASPAT CREATA PRIMESTE EXECUTE PENTRU `anon` SI `authenticated`, PE NUME.
-- `pg_default_acl` al proiectului le da din oficiu (masurat 03.09.2026), iar un
-- `revoke ... from public` NU stinge un grant dat pe nume. Coada de conversii citeste si scrie
-- evenimente de marketing legate de vizitatori: n-are ce cauta la o cheie publica.
revoke all on function public.edinio_revendica_conversii(integer) from public;
revoke all on function public.edinio_revendica_conversii(integer) from anon;
revoke all on function public.edinio_revendica_conversii(integer) from authenticated;
grant execute on function public.edinio_revendica_conversii(integer) to service_role;

notify pgrst, 'reload schema';

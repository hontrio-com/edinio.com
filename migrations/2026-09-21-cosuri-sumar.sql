-- ═══════════════════════════════════════════════════════════════════════════
-- C1 + C2: aceeasi perioada peste tot, si cifre care nu depind de cate randuri
--          au incaput in memorie
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE ERA GRESIT DE DOUA ORI.
--
-- 1. Cardurile se socoteau in TypeScript, dintr-o citire de cel mult 1.000 de
--    randuri pe 90 de zile. PostgREST taie oricum la 1.000. Azi cel mai mare
--    magazin are 393 de cosuri in tot istoricul, deci nimeni nu loveste pragul
--    - dar cand il va lovi, cifrele NU vor da eroare: vor scadea in tacere, si
--    vor arata ca merge mai bine.
--
-- 2. Perioadele erau amestecate. „Cosuri abandonate" era pe tot ce incapea in
--    citire, „Rata de abandon" pe luna curenta, „Recuperate" tot pe luna.
--    Trei cifre una langa alta, despre trei rastimpuri diferite.
--
-- Functia ia o fereastra si raspunde despre EA, socotind in baza.
--
-- ⚠ ATRIBUIREA DE AICI TREBUIE SA SPUNA ACELASI LUCRU CA `felulRecuperarii`
-- din `lib/abandoned/atribuire.ts`. Sunt doua scrieri ale aceleiasi reguli,
-- si o proba le pune fata in fata pe date adevarate tocmai fiindca doua copii
-- se departeaza una de alta fara sa anunte.
create or replace function public.cosuri_abandonate_sumar(
  p_business uuid,
  p_de_la timestamptz,
  p_pana timestamptz,
  -- Dupa cate minute de liniste un cos deschis se socoteste abandonat.
  p_minute integer default 60,
  -- Fereastra de atribuire, in zile. Aceeasi valoare ca `ZILE_ATRIBUIRE`.
  p_zile integer default 7
)
returns table (
  abandonate integer,
  valoare_abandonata numeric,
  valoare_medie numeric,
  convertite integer,
  rata_abandon integer,
  atribuite integer,
  valoare_atribuita numeric,
  asistate integer,
  valoare_asistata numeric,
  organice integer,
  valoare_organica numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with fereastra as (
    select
      c.id, c.subtotal, c.status, c.converted_at, c.last_activity_at,
      c.recovery_email_sent_at, c.recovery_sms_sent_at
    from public.abandoned_carts c
    where c.business_id = p_business
      and c.created_at >= p_de_la
      and c.created_at < p_pana
  ),
  /*
    ⚠ „Abandonat" nu e o stare scrisa in tabela: e un cos DESCHIS pe care nu
    l-a mai atins nimeni de `p_minute`. Un cos deschis acum zece minute nu e
    abandonat, e in lucru.
  */
  abandonate_r as (select * from fereastra where status = 'open' and last_activity_at < now() - make_interval(mins => p_minute)),
  convertite_r as (select * from fereastra where status = 'converted'),
  /* Mesajele deschise ale cosurilor convertite, cu fereastra de atribuire. */
  atribuire as (
    select
      cv.id,
      cv.subtotal,
      exists (
        select 1 from public.recovery_sends s
        where s.cart_id = cv.id
          and s.deschis_la is not null
          /* ⚠ De la DESCHIDERE, nu de la trimitere. Si niciodata inaintea comenzii. */
          and cv.converted_at >= s.deschis_la
          and cv.converted_at <= s.deschis_la + make_interval(days => p_zile)
      ) as prin_link,
      (
        exists (select 1 from public.recovery_sends s where s.cart_id = cv.id)
        /*
          ⚠ Caderea inapoi pe datele de dinainte de jurnal: cosurile convertite
          inainte de 21.09.2026 n-au randuri in `recovery_sends`, dar unele chiar
          au primit mesaje. Fara asta, tot istoricul ar trece la „organic".
        */
        or cv.recovery_email_sent_at is not null
        or cv.recovery_sms_sent_at is not null
      ) as a_primit
    from convertite_r cv
  )
  select
    (select count(*) from abandonate_r)::integer,
    coalesce((select sum(subtotal) from abandonate_r), 0)::numeric,
    coalesce((select avg(subtotal) from abandonate_r), 0)::numeric,
    (select count(*) from convertite_r)::integer,
    case
      when (select count(*) from abandonate_r) + (select count(*) from convertite_r) = 0 then 0
      else round(
        100.0 * (select count(*) from abandonate_r)
        / ((select count(*) from abandonate_r) + (select count(*) from convertite_r))
      )::integer
    end,
    (select count(*) from atribuire where prin_link)::integer,
    coalesce((select sum(subtotal) from atribuire where prin_link), 0)::numeric,
    (select count(*) from atribuire where not prin_link and a_primit)::integer,
    coalesce((select sum(subtotal) from atribuire where not prin_link and a_primit), 0)::numeric,
    (select count(*) from atribuire where not prin_link and not a_primit)::integer,
    coalesce((select sum(subtotal) from atribuire where not prin_link and not a_primit), 0)::numeric;
$$;

-- ⚠ `security invoker` + RLS pe `abandoned_carts` fac toata apararea: functia
-- vede numai ce vede cel care o cheama. Dar implicitul Postgresului da EXECUTE
-- lui `public`, deci si lui `anon`.
revoke all on function public.cosuri_abandonate_sumar(uuid, timestamptz, timestamptz, integer, integer) from public;
revoke all on function public.cosuri_abandonate_sumar(uuid, timestamptz, timestamptz, integer, integer) from anon;
grant execute on function public.cosuri_abandonate_sumar(uuid, timestamptz, timestamptz, integer, integer) to authenticated;

notify pgrst, 'reload schema';

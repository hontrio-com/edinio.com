-- ═══════════════════════════════════════════════════════════════════════════
-- D2: graficul, palnia si tabelul de produse al filei Prezentare
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ TOATE TREI SE SOCOTESC IN BAZA, din acelasi motiv ca `cosuri_abandonate_sumar`:
-- stranse in memorie, ar depinde de cate randuri incap intr-o citire, si ar
-- scadea in tacere cand magazinul creste.

-- ── Graficul: abandonate si recuperate, zi cu zi ───────────────────────────
--
-- ⚠ ZIUA E CEA ROMANEASCA, nu UTC. Grupata pe UTC, o comanda de la 01:30 ar
-- cadea in ziua precedenta - chiar defectul gasit la panoul principal, unde
-- `orders_daily_revenue` grupa pe ziua UTC.
create or replace function public.cosuri_abandonate_grafic(
  p_business uuid,
  p_de_la timestamptz,
  p_pana timestamptz,
  p_minute integer default 60,
  p_zile integer default 7
)
returns table (
  ziua date,
  abandonate integer,
  valoare_abandonata numeric,
  recuperate integer,
  valoare_recuperata numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with zile as (
    select generate_series(
      (p_de_la at time zone 'Europe/Bucharest')::date,
      (least(p_pana, now()) at time zone 'Europe/Bucharest')::date,
      interval '1 day'
    )::date as ziua
  ),
  abandonate_r as (
    select (c.created_at at time zone 'Europe/Bucharest')::date as ziua,
           count(*)::integer as n, coalesce(sum(c.subtotal), 0)::numeric as v
    from public.abandoned_carts c
    where c.business_id = p_business
      and c.created_at >= p_de_la and c.created_at < p_pana
      and c.status = 'open'
      and c.last_activity_at < now() - make_interval(mins => p_minute)
    group by 1
  ),
  /*
    ⚠ „Recuperate" AICI INSEAMNA ATRIBUITE: linkul deschis, apoi comanda in
    fereastra. Aceeasi regula ca in `cosuri_abandonate_sumar`, altfel graficul
    si cardul de deasupra lui ar spune doua lucruri diferite.

    ⚠ Se grupeaza pe ziua CONVERSIEI, nu pe a abandonului: un cos abandonat
    luni si recuperat joi e o recuperare de joi. Grupat pe abandon, ziua de
    azi n-ar avea niciodata recuperari, fiindca ele vin mai tarziu.
  */
  recuperate_r as (
    select (c.converted_at at time zone 'Europe/Bucharest')::date as ziua,
           count(*)::integer as n, coalesce(sum(c.subtotal), 0)::numeric as v
    from public.abandoned_carts c
    where c.business_id = p_business
      and c.converted_at >= p_de_la and c.converted_at < p_pana
      and c.status = 'converted'
      and exists (
        select 1 from public.recovery_sends s
        where s.cart_id = c.id and s.deschis_la is not null
          and c.converted_at >= s.deschis_la
          and c.converted_at <= s.deschis_la + make_interval(days => p_zile)
      )
    group by 1
  )
  select z.ziua,
         coalesce(a.n, 0)::integer, coalesce(a.v, 0)::numeric,
         coalesce(r.n, 0)::integer, coalesce(r.v, 0)::numeric
  from zile z
  left join abandonate_r a on a.ziua = z.ziua
  left join recuperate_r r on r.ziua = z.ziua
  order by z.ziua;
$$;

-- ── Palnia recuperarii ─────────────────────────────────────────────────────
--
-- ⚠ NU E PALNIA MAGAZINULUI (vizitatori → cos → comanda): aia sta la Statistici
-- si se sprijina pe `site_analytics`. Asta incepe de unde incepe pagina: de la
-- cosurile SALVATE, adica de la oamenii care si-au lasat datele de contact.
-- Amestecate, ar fi parut ca pagina stie cati vizitatori are magazinul.
--
-- Treptele: salvate → au ramas neterminate → contactate → au deschis linkul
-- → au comandat dupa. Fiecare treapta e o submultime a celei dinaintea ei,
-- deci palnia nu poate creste nicaieri; o proba masoara chiar asta.
create or replace function public.cosuri_abandonate_palnie(
  p_business uuid,
  p_de_la timestamptz,
  p_pana timestamptz,
  p_minute integer default 60,
  p_zile integer default 7
)
returns table (
  salvate integer,
  -- ⚠ „neterminate", NU „abandonate": vezi mai jos de ce nu e acelasi lucru.
  neterminate integer,
  contactate integer,
  deschise integer,
  recuperate integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with f as (
    select c.* from public.abandoned_carts c
    where c.business_id = p_business
      and c.created_at >= p_de_la and c.created_at < p_pana
  ),
  ab as (
    select * from f
    /*
      ⚠⚠ „A RAMAS NETERMINAT" NU E „E ABANDONAT ACUM", SI ASTA A FOST UN DEFECT.

      Prima scriere punea aici `or status = 'converted'`, adica NUMARA toate
      conversiile ca pe niste cosuri abandonate. Palnia iesea „28 salvate → 28
      abandonate": doua trepte egale, care nu spun nimic. Iar un cos finalizat
      pe loc, fara nicio ezitare, n-a fost abandonat niciodata.

      Se poate spune ADEVARAT despre un cos convertit daca a stat parasit:
      `markCartConverted` NU atinge `last_activity_at`, deci distanta dintre
      ultima miscare a omului si comanda e chiar cat a stat cosul uitat.
      Masurat pe datele demo: 12 din 13 conversii au stat parasite peste prag.

      ⚠ O conversie cu ceasurile pe dos (`converted_at` inaintea ultimei
      miscari - una exista in demo) da o durata negativa, deci pica singura in
      afara, fara sa fie nevoie de o verificare aparte.

      ⚠ PARANTEZELE NU SUNT DE PRISOS. `and` leaga mai strans decat `or`, dar
      cine adauga a treia conditie peste sase luni o pune langa `or` si schimba
      tacut ce numara palnia.
    */
    where (status = 'open' and last_activity_at < now() - make_interval(mins => p_minute))
       or (status = 'converted' and converted_at - last_activity_at > make_interval(mins => p_minute))
  )
  select
    (select count(*) from f)::integer,
    (select count(*) from ab)::integer,
    (select count(*) from ab where
        exists (select 1 from public.recovery_sends s where s.cart_id = ab.id)
        or ab.recovery_email_sent_at is not null or ab.recovery_sms_sent_at is not null)::integer,
    (select count(*) from ab where
        exists (select 1 from public.recovery_sends s where s.cart_id = ab.id and s.deschis_la is not null))::integer,
    (select count(*) from ab where ab.status = 'converted' and exists (
        select 1 from public.recovery_sends s
        where s.cart_id = ab.id and s.deschis_la is not null
          and ab.converted_at >= s.deschis_la
          and ab.converted_at <= s.deschis_la + make_interval(days => p_zile)
      ))::integer;
$$;

-- ── Produsele, cu rata lor de abandon si de recuperare ─────────────────────
--
-- ⚠ CE ADAUGA FATA DE „cele mai abandonate produse". Lista veche spunea doar
-- cat s-a lasat in cos. Dar un produs care apare in o suta de cosuri din care
-- nouazeci se finalizeaza NU e o problema, iar unul care apare in zece din
-- care noua se abandoneaza este - chiar daca in bani pare mai mic. Fara
-- numitor, lista arata produsele POPULARE, nu pe cele care pierd vanzari.
create or replace function public.cosuri_abandonate_produse(
  p_business uuid,
  p_de_la timestamptz,
  p_pana timestamptz,
  p_minute integer default 60,
  p_zile integer default 7,
  p_limita integer default 10
)
returns table (
  produs_id text,
  nume text,
  poza text,
  cosuri integer,
  cosuri_abandonate integer,
  bucati_abandonate numeric,
  valoare_abandonata numeric,
  recuperate integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with f as (
    select c.id, c.status, c.converted_at, c.last_activity_at, c.items
    from public.abandoned_carts c
    where c.business_id = p_business
      and c.created_at >= p_de_la and c.created_at < p_pana
  ),
  linii as (
    select
      f.id as cart_id,
      f.status,
      /*
        ⚠ ACEEASI DEFINITIE CA IN PALNIE. Lasata pe „e abandonat ACUM", un
        produs dintr-un cos parasit si apoi finalizat ar fi intrat la numitor
        si nu si la numarator: rata lui de abandon ar fi iesit mai mica decat
        e, si tocmai produsele care se recupereaza ar fi aratat cel mai bine.
      */
      ((f.status = 'open' and f.last_activity_at < now() - make_interval(mins => p_minute))
       or (f.status = 'converted' and f.converted_at - f.last_activity_at > make_interval(mins => p_minute))) as e_abandonat,
      (f.status = 'converted' and exists (
        select 1 from public.recovery_sends s
        where s.cart_id = f.id and s.deschis_la is not null
          and f.converted_at >= s.deschis_la
          and f.converted_at <= s.deschis_la + make_interval(days => p_zile)
      )) as e_recuperat,
      coalesce(i->>'product_id', i->>'name') as produs_id,
      i->>'name' as nume,
      i->>'image_url' as poza,
      coalesce((i->>'quantity')::numeric, 0) as cantitate,
      coalesce((i->>'price')::numeric, 0) as pret
    from f, lateral jsonb_array_elements(
      case when jsonb_typeof(f.items) = 'array' then f.items else '[]'::jsonb end
    ) as i
    where coalesce(i->>'product_id', i->>'name') is not null
  ),
  /*
    ⚠ UN PRODUS SE NUMARA O SINGURA DATA PE COS, chiar daca apare pe doua linii
    (marimi diferite). Altfel „in cate cosuri apare" ar fi fost mai mare decat
    numarul cosurilor, si rata ar fi putut trece de 100%.
  */
  pe_cos as (
    select produs_id,
           max(nume) as nume,
           max(poza) as poza,
           cart_id,
           bool_or(e_abandonat) as e_abandonat,
           bool_or(e_recuperat) as e_recuperat,
           sum(cantitate) as cantitate,
           sum(cantitate * pret) as valoare
    from linii group by produs_id, cart_id
  )
  select
    produs_id,
    max(nume),
    max(poza),
    count(*)::integer,
    count(*) filter (where e_abandonat)::integer,
    coalesce(sum(cantitate) filter (where e_abandonat), 0)::numeric,
    coalesce(sum(valoare) filter (where e_abandonat), 0)::numeric,
    count(*) filter (where e_recuperat)::integer
  from pe_cos
  group by produs_id
  order by coalesce(sum(valoare) filter (where e_abandonat), 0) desc
  limit p_limita;
$$;

-- ⚠ Implicitul Postgresului da EXECUTE lui `public`, deci si lui `anon`.
do $$
declare f text;
begin
  foreach f in array array[
    'public.cosuri_abandonate_grafic(uuid, timestamptz, timestamptz, integer, integer)',
    'public.cosuri_abandonate_palnie(uuid, timestamptz, timestamptz, integer, integer)',
    'public.cosuri_abandonate_produse(uuid, timestamptz, timestamptz, integer, integer, integer)'
  ] loop
    execute format('revoke all on function %s from public', f);
    execute format('revoke all on function %s from anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';

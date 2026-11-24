-- ═══════════════════════════════════════════════════════════════════════════
-- CONTUL CLIENTULUI: CAUTARE DUPA DESTINATAR / TELEFON / AWB, PERIOADA PE ZILE,
-- RAPORT DESCARCABIL                                              (23.11.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Cerut de un magazin (JHBijuterii) ai carui clienti cu cont comanda pentru alte
-- persoane: 758 de comenzi din 21 de conturi. Omul isi cauta comanda dupa cine
-- o primeste, dupa telefon sau dupa numarul de AWB, nu dupa numarul comenzii, si
-- vrea un raport pe zilele alese de el („de la 15.11 la 30.11”).
--
-- Ce se schimba:
--
--   1. `cont_comenzile_mele` primeste `p_pana_la` (capatul de sus al perioadei) si
--      cauta fiecare cuvant SI in numele destinatarului, in telefon si in AWB-uri.
--      Corpul de dinainte ramane intreg, rand cu rand: filtrele se ADAUGA.
--   2. `cont_raportul_comenzilor`: aceleasi filtre, fara paginare, cu coloanele
--      raportului (destinatar, telefon, adresa, AWB, produse).
--   3. Doua ajutoare in `privat`: AWB-urile unei comenzi si potrivirea unui cuvant
--      cu destinatarul.
--
-- ⚠⚠ POARTA VEDERII. O comanda legata de cont cu vederea „redusa” nu-si arata
-- destinatarul, telefonul si AWB-ul. Deci nici nu se CAUTA in ele: altfel campul
-- de cautare ar fi raspuns cu „da / nu” la „comanda asta e pe numele X?”, adica
-- exact ce ascunde vederea redusa. Peste tot: `l.vedere = 'intreaga' and ...`.
--
-- ⚠ TELEFONUL se compara pe CIFRE, in cele trei scrieri (0722…, 40722…, 0040722…),
-- si numai pentru un cuvant facut din cifre, de cel putin sase: „12”, cautat ca
-- numar de comanda, nu aduce toate telefoanele care contin 12. Un numar scris cu
-- spatii e lipit de aplicatie inainte sa plece (`textulDeCautat`).
--
-- ⚠ AWB-ul se cauta de la patru caractere in sus, din acelasi motiv.
--
-- ⚠ DROP + CREATE la `cont_comenzile_mele`: lista de argumente se schimba, iar
-- `create or replace` ar lasa alaturi functia veche (vezi migratia din 19.10.2026).
-- Apelurile sunt cu argumente NUMITE, deci cele vechi merg neschimbate.

-- ── 1. AWB-urile unei comenzi, intr-un singur text ───────────────────────────
-- Un singur loc pentru lista de coloane: o folosesc si cautarea, si raportul.
-- Primeste ID-ul, nu randul: un parametru de tipul tabelei rupe refacerea bazei
-- din schema de referinta (lectia lui `cont_documentul_comenzii`).
create or replace function privat.cont_awburile_comenzii(p_order uuid)
returns text
language sql stable set search_path = '' as $fn$
  select nullif(concat_ws(' ',
           o.curiera_awb_number, o.curiera_partener_awb, o.dpd_awb_number, o.fan_courier_awb_number,
           o.sameday_awb_number, o.cargus_awb_number, o.gls_awb_number, o.woot_awb_number,
           o.colete_awb_number, o.pallex_awb_number, o.ecolet_awb_number, o.posta_awb_number,
           o.innoship_awb_number, o.packeta_packet_id, o.packeta_external_tracking,
           o.smartship_awb_number, o.shipo_awb_number, o.fedex_awb_number, o.ups_awb_number,
           o.dhl_awb_number, o.epacket_awb_number), '')
    from public.orders o
   where o.id = p_order;
$fn$;

-- ── 2. Un cuvant cautat se potriveste cu destinatarul? ───────────────────────
-- `p_tipar` e tiparul LIKE facut de `cautarea` („%cuvant%”, fara diacritice, cu
-- `%`, `_` si `\` scapate).
create or replace function privat.cont_potrivire_destinatar(p_tipar text, p_nume text, p_telefon text, p_awburi text)
returns boolean
language sql immutable set search_path = '' as $fn$
  select
    lower(public.fara_diacritice(coalesce(p_nume, ''))) like p_tipar
    or (length(v.cuvant) >= 4 and lower(coalesce(p_awburi, '')) like p_tipar)
    or (v.cuvant ~ '^[0-9+]+$' and length(v.cifre) >= 6 and t.forme like '%' || v.cifre || '%')
  from (select btrim(p_tipar, '%') as cuvant, regexp_replace(p_tipar, '[^0-9]', '', 'g') as cifre) v,
       (select d.c || ' 0' || d.n || ' 40' || d.n || ' 0040' || d.n as forme
          from (select x.c, regexp_replace(x.c, '^(0040|40|0)', '') as n
                  from (select regexp_replace(coalesce(p_telefon, ''), '[^0-9]', '', 'g') as c) x) d) t;
$fn$;

revoke all on function privat.cont_awburile_comenzii(uuid) from public, anon, authenticated;
revoke all on function privat.cont_potrivire_destinatar(text, text, text, text) from public, anon, authenticated;

-- ── 3. Lista paginata ────────────────────────────────────────────────────────
drop function if exists public.cont_comenzile_mele(uuid, uuid, integer, integer, text, text, timestamptz);
/* Si forma noua, ca fisierul sa se poata rula din nou. */
drop function if exists public.cont_comenzile_mele(uuid, uuid, integer, integer, text, text, timestamptz, timestamptz);

create function public.cont_comenzile_mele(
  p_business uuid,
  p_cont uuid,
  p_limita integer default 20,
  p_decalaj integer default 0,
  p_cautare text default null,
  p_stare text default null,
  p_de_la timestamptz default null,
  p_pana_la timestamptz default null
) returns table (
  order_id uuid,
  numar text,
  creata_la timestamptz,
  stare text,
  incasata boolean,
  total numeric,
  bucati bigint,
  vedere text,
  total_randuri bigint,
  miniaturi jsonb,
  produse integer,
  are_factura boolean
)
language sql stable security definer set search_path = '' as $fn$
  with cautarea as (
    /* Cuvintele omului, curatate o data: fara diacritice si majuscule, fara „#” in
       fata, cu `%`, `_` si `\` scapate, cel mult opt. Lista goala = fara filtru. */
    select coalesce(array_agg('%' || replace(replace(replace(x.w, '\', '\\'), '%', '\%'), '_', '\_') || '%' order by x.n), '{}') as tipare
      from (
        select ltrim(w.w, '#') as w, w.n
          from regexp_split_to_table(lower(public.fara_diacritice(btrim(coalesce(p_cautare, '')))), '\s+')
               with ordinality as w(w, n)
      ) x
     where x.w <> '' and x.n <= 8
  )
  select
    o.id,
    o.order_number,
    o.created_at,
    o.status,
    public.comanda_incasata(o.status, o.payment_status, o.payment_method),
    o.total,
    m.bucati,
    l.vedere,
    count(*) over (),
    m.miniaturi,
    m.produse,
    case when l.vedere = 'intreaga' then privat.cont_documentul_comenzii(o) is not null else false end
  from privat.cont_comanda l
  join public.orders o
    on o.id = l.order_id
   and o.business_id = l.business_id
  cross join cautarea c
  /* AWB-urile comenzii, citite o data pe comanda, numai cand se cauta ceva si numai la
     vederea intreaga (vezi poarta vederii, in capul fisierului). */
  cross join lateral (
    select case when c.tipare <> '{}' and l.vedere = 'intreaga' then privat.cont_awburile_comenzii(o.id) end as awburi
  ) a
  cross join lateral (
    select
      coalesce(sum(
        case when x.li->>'quantity' ~ '^[0-9]+(\.[0-9]+)?$' then (x.li->>'quantity')::numeric else 0 end
      ) filter (where not x.extra), 0)::bigint as bucati,
      (count(*) filter (where not x.extra))::integer as produse,
      coalesce((
        select jsonb_agg(jsonb_build_object('nume', y.li->>'name', 'imagine', y.imagine) order by y.ord)
          from (
            select z.li, z.ord,
                   (select case when jsonb_typeof(p.images->0) = 'string' then p.images->>0 end
                      from public.products p
                     where p.business_id = o.business_id
                       and p.id = case
                                    when coalesce(z.li->>'product_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                                      then (z.li->>'product_id')::uuid
                                  end) as imagine
              from jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) with ordinality as z(li, ord)
             where not (coalesce(z.li->>'product_id', '') like 'extra\_%')
             order by z.ord
             limit 4
          ) y
      ), '[]'::jsonb) as miniaturi
    from (
      select t.li, coalesce(t.li->>'product_id', '') like 'extra\_%' as extra
        from jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) as t(li)
    ) x
  ) m
  where l.business_id = p_business
    and l.cont_id = p_cont
    /* <filtrele> aceleasi, litera cu litera, in lista si in raport */
    and (p_stare is null or o.status = p_stare)
    and (p_de_la is null or o.created_at >= p_de_la)
    and (p_pana_la is null or o.created_at <= p_pana_la)
    /* Niciun cuvant care sa nu se gaseasca: fiecare, in numarul comenzii SAU in numele
       unei linii (si al unei extraoptiuni: „cadou” gaseste comanda cu ambalaj cadou,
       ceea ce omul chiar cauta). Fara cuvinte, `not exists` pe lista goala trece tot. */
    and not exists (
      select 1
        from unnest(c.tipare) as t(tipar)
       where not (
         lower(public.fara_diacritice(coalesce(o.order_number, ''))) like t.tipar
         or exists (
           select 1
             from jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) as s(li)
            where lower(public.fara_diacritice(coalesce(s.li->>'name', ''))) like t.tipar
         )
         or (l.vedere = 'intreaga' and privat.cont_potrivire_destinatar(t.tipar, o.customer_name, o.customer_phone, a.awburi))
       )
    )
    /* </filtrele> */
  /* ⚠ Departajator pe `id`: fara el, doua comenzi din aceeasi secunda pot aparea
     pe doua pagini deodata si alta poate lipsi. */
  order by o.created_at desc, o.id desc
  limit greatest(1, least(100, coalesce(p_limita, 20)))
  offset greatest(0, coalesce(p_decalaj, 0));
$fn$;

-- ── 4. Raportul: aceleasi filtre, toate comenzile gasite, coloanele raportului ─
-- ⚠ Destinatarul, telefonul, adresa si AWB-ul ies NUMAI la vederea intreaga.
-- ⚠ Plafon 5.000: un raport nu e o descarcare a bazei. `total_randuri` spune cate
-- erau, ca aplicatia sa poata spune cand a taiat.
drop function if exists public.cont_raportul_comenzilor(uuid, uuid, text, text, timestamptz, timestamptz, integer);

create function public.cont_raportul_comenzilor(
  p_business uuid,
  p_cont uuid,
  p_cautare text default null,
  p_stare text default null,
  p_de_la timestamptz default null,
  p_pana_la timestamptz default null,
  p_limita integer default 2000
) returns table (
  numar text,
  creata_la timestamptz,
  stare text,
  incasata boolean,
  total numeric,
  vedere text,
  destinatar text,
  telefon text,
  adresa_livrare jsonb,
  awburi text,
  produse text,
  bucati bigint,
  total_randuri bigint
)
language sql stable security definer set search_path = '' as $fn$
  with cautarea as (
    select coalesce(array_agg('%' || replace(replace(replace(x.w, '\', '\\'), '%', '\%'), '_', '\_') || '%' order by x.n), '{}') as tipare
      from (
        select ltrim(w.w, '#') as w, w.n
          from regexp_split_to_table(lower(public.fara_diacritice(btrim(coalesce(p_cautare, '')))), '\s+')
               with ordinality as w(w, n)
      ) x
     where x.w <> '' and x.n <= 8
  )
  select
    o.order_number,
    o.created_at,
    o.status,
    public.comanda_incasata(o.status, o.payment_status, o.payment_method),
    o.total,
    l.vedere,
    case when l.vedere = 'intreaga' then o.customer_name end,
    case when l.vedere = 'intreaga' then o.customer_phone end,
    case when l.vedere = 'intreaga' then o.shipping_address end,
    a.awburi,
    m.produse,
    m.bucati,
    count(*) over ()
  from privat.cont_comanda l
  join public.orders o
    on o.id = l.order_id
   and o.business_id = l.business_id
  cross join cautarea c
  /* Aici AWB-urile se citesc mereu la vederea intreaga: sunt si coloana a raportului. */
  cross join lateral (
    select case when l.vedere = 'intreaga' then privat.cont_awburile_comenzii(o.id) end as awburi
  ) a
  cross join lateral (
    select
      coalesce(sum(
        case when x.li->>'quantity' ~ '^[0-9]+(\.[0-9]+)?$' then (x.li->>'quantity')::numeric else 0 end
      ), 0)::bigint as bucati,
      string_agg(
        coalesce(nullif(x.li->>'quantity', ''), '1') || ' x ' || coalesce(x.li->>'name', ''),
        '; ' order by x.ord
      ) as produse
    from jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) with ordinality as x(li, ord)
    where not (coalesce(x.li->>'product_id', '') like 'extra\_%')
  ) m
  where l.business_id = p_business
    and l.cont_id = p_cont
    /* <filtrele> aceleasi, litera cu litera, in lista si in raport */
    and (p_stare is null or o.status = p_stare)
    and (p_de_la is null or o.created_at >= p_de_la)
    and (p_pana_la is null or o.created_at <= p_pana_la)
    /* Niciun cuvant care sa nu se gaseasca: fiecare, in numarul comenzii SAU in numele
       unei linii (si al unei extraoptiuni: „cadou” gaseste comanda cu ambalaj cadou,
       ceea ce omul chiar cauta). Fara cuvinte, `not exists` pe lista goala trece tot. */
    and not exists (
      select 1
        from unnest(c.tipare) as t(tipar)
       where not (
         lower(public.fara_diacritice(coalesce(o.order_number, ''))) like t.tipar
         or exists (
           select 1
             from jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) as s(li)
            where lower(public.fara_diacritice(coalesce(s.li->>'name', ''))) like t.tipar
         )
         or (l.vedere = 'intreaga' and privat.cont_potrivire_destinatar(t.tipar, o.customer_name, o.customer_phone, a.awburi))
       )
    )
    /* </filtrele> */
  order by o.created_at desc, o.id desc
  limit greatest(1, least(5000, coalesce(p_limita, 2000)));
$fn$;

revoke all on function public.cont_comenzile_mele(uuid, uuid, integer, integer, text, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.cont_comenzile_mele(uuid, uuid, integer, integer, text, text, timestamptz, timestamptz) to service_role;
revoke all on function public.cont_raportul_comenzilor(uuid, uuid, text, text, timestamptz, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.cont_raportul_comenzilor(uuid, uuid, text, text, timestamptz, timestamptz, integer) to service_role;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.cont_comenzile_mele(uuid, uuid, integer, integer, text, text, timestamptz, timestamptz)',
    'public.cont_raportul_comenzilor(uuid, uuid, text, text, timestamptz, timestamptz, integer)'
  ] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception 'anon sau authenticated poate chema %', f;
    end if;
    if not has_function_privilege('service_role', f, 'EXECUTE') then
      raise exception 'service_role NU poate chema %', f;
    end if;
  end loop;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'cont_comenzile_mele'
       and pg_get_function_identity_arguments(p.oid) <> 'p_business uuid, p_cont uuid, p_limita integer, p_decalaj integer, p_cautare text, p_stare text, p_de_la timestamp with time zone, p_pana_la timestamp with time zone'
  ) then
    raise exception 'a ramas o a doua forma a lui cont_comenzile_mele';
  end if;
end $$;

notify pgrst, 'reload schema';

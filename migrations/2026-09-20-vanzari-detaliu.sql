-- ═══════════════════════════════════════════════════════════════════════════
-- FILA VANZARI: CE S-A VANDUT, DIN CE CATEGORIE, PE CE CANAL, IN CE STARE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Pana acum, pagina spunea CAT s-a vandut, nu CE s-a vandut. Un comerciant care
-- vede „34.000 lei" nu poate face nimic cu cifra; unul care vede ca jumatate din
-- ea vine din doua produse si ca o categorie intreaga n-a vandut nimic, poate.
--
-- ⚠ ACEEASI DEFINITIE A VANZARII ca in restul panoului: orice comanda care nu e
-- `cancelled` sau `refunded`. Daca aici s-ar socoti altfel, tabelele ar
-- contrazice cardul de deasupra lor, si n-ar fi limpede care minte.
--
-- ⚠ ACEEASI FEREASTRA, luata din `fereastra_vanzari`, nu recalculata. „Luna
-- aceasta" trebuie sa insemne acelasi lucru pe tot ecranul.
--
-- ⚠ SUMA PE PRODUSE NU DA TOTALUL COMENZILOR, si asta se si scrie sub tabel.
-- Liniile poarta pretul lor (`pret x bucati`), pe cand totalul comenzii mai are
-- transport in plus si reduceri de cod, de card sau de ramburs in minus. Doua
-- cifre apropiate dar diferite, fara explicatie, arata ca un defect.
--
-- ⚠ SECURITY INVOKER (implicit): RLS de pe `orders` ramane poarta.

-- ── Tabelele filei Vanzari ──────────────────────────────────────────────────
create or replace function public.vanzari_detaliu(
  p_business uuid,
  p_fel text default '30z',
  p_de_la date default null,
  p_pana_la date default null,
  p_canal text default null
)
returns jsonb
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  with f as (select * from public.fereastra_vanzari(p_fel, p_de_la, p_pana_la)),
  -- Toate comenzile ferestrei, ORICE stare: de aici se vede si rata de anulare.
  toate as (
    select o.id, o.status, o.total, o.subtotal, o.shipping_cost, o.vat_amount,
           o.items,
           coalesce(o.discount_amount, 0) + coalesce(o.card_discount_amount, 0)
             + coalesce(o.cod_discount_amount, 0) + coalesce(o.offer_discount_amount, 0) as reduceri,
           coalesce(o.cod_fee_amount, 0) as taxa_ramburs,
           coalesce(o.order_source ->> 'marketplace', 'magazin') as canal
      from f, public.orders o
     where o.business_id = p_business
       and o.created_at >= ((f.de_la)::timestamp at time zone 'Europe/Bucharest')
       and o.created_at <  (((f.pana_la + 1))::timestamp at time zone 'Europe/Bucharest')
       and (
         p_canal is null
         or (p_canal = 'magazin' and o.order_source ->> 'marketplace' is null)
         or (p_canal <> 'magazin' and o.order_source ->> 'marketplace' = p_canal)
       )
  ),
  -- Cele care se numara ca vanzare.
  bune as (select * from toate where status not in ('cancelled', 'refunded')),
  -- O linie de comanda pe rand, cu produsul ei de azi (daca mai exista).
  linii as (
    select b.id,
           it ->> 'product_id' as product_id,
           coalesce(nullif(p.name, ''), nullif(it ->> 'name', ''), 'Produs sters') as nume,
           coalesce(nullif(p.category, ''), 'Fara categorie') as categorie,
           coalesce((it ->> 'quantity')::numeric, 0) as bucati,
           coalesce((it ->> 'price')::numeric, 0) * coalesce((it ->> 'quantity')::numeric, 0) as valoare
      from bune b
      cross join lateral jsonb_array_elements(coalesce(b.items, '[]'::jsonb)) it
      left join public.products p
        on p.business_id = p_business
       and p.id::text = (it ->> 'product_id')
  )
  select jsonb_build_object(
    'sumar', (
      select jsonb_build_object(
        'comenzi',      (select count(*) from bune),
        'vanzari',      round(coalesce((select sum(total) from bune), 0), 2),
        'produse',      round(coalesce((select sum(subtotal) from bune), 0), 2),
        'transport',    round(coalesce((select sum(shipping_cost) from bune), 0), 2),
        'reduceri',     round(coalesce((select sum(reduceri) from bune), 0), 2),
        'taxa_ramburs', round(coalesce((select sum(taxa_ramburs) from bune), 0), 2),
        'tva',          round(coalesce((select sum(vat_amount) from bune), 0), 2),
        'bucati',       coalesce((select sum(bucati) from linii), 0),
        'anulate',      (select count(*) from toate where status = 'cancelled'),
        'rambursate',   (select count(*) from toate where status = 'refunded'),
        'pierdute',     round(coalesce((select sum(total) from toate where status in ('cancelled', 'refunded')), 0), 2)
      )
    ),
    'produse', (
      select coalesce(jsonb_agg(x order by x.vanzari desc), '[]'::jsonb) from (
        select product_id, nume,
               sum(bucati)::numeric as bucati,
               round(sum(valoare), 2) as vanzari,
               count(distinct id)::int as comenzi
          from linii group by 1, 2 order by 4 desc limit 15
      ) x
    ),
    'categorii', (
      select coalesce(jsonb_agg(x order by x.vanzari desc), '[]'::jsonb) from (
        select categorie,
               sum(bucati)::numeric as bucati,
               round(sum(valoare), 2) as vanzari,
               count(distinct id)::int as comenzi
          from linii group by 1 order by 3 desc limit 15
      ) x
    ),
    'canale', (
      select coalesce(jsonb_agg(x order by x.vanzari desc), '[]'::jsonb) from (
        select canal, count(*)::int as comenzi, round(sum(total), 2) as vanzari
          from bune group by 1
      ) x
    ),
    'statusuri', (
      select coalesce(jsonb_agg(x order by x.comenzi desc), '[]'::jsonb) from (
        select status, count(*)::int as comenzi, round(sum(total), 2) as vanzari
          from toate group by 1
      ) x
    )
  )
$$;

-- ── Cardurile de jos: cine cumpara si cat se pierde ─────────────────────────
/*
  ⚠ „CLIENT NOU" SE JUDECA PE TOATA ISTORIA, nu pe fereastra. Altfel, oricine
  n-a mai cumparat de la inceputul lunii ar fi aparut ca „nou", iar de fiecare
  data cand comerciantul scurta perioada, numarul de clienti noi ar fi crescut.
  Aici, nou inseamna ca PRIMA lui comanda din magazin cade in fereastra.

  ⚠ Clientul e adresa de email, in litere mici. Nu exista cont obligatoriu la
  finalizare, deci nu exista un identificator mai bun; comenzile fara email nu
  se numara la niciuna dintre cele doua cifre, si nici nu se pot numara.
*/
create or replace function public.carduri_secundare(
  p_business uuid,
  p_fel text default '30z',
  p_de_la date default null,
  p_pana_la date default null,
  p_canal text default null
)
returns jsonb
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  with f as (select * from public.fereastra_vanzari(p_fel, p_de_la, p_pana_la)),
  toate as (
    select o.id, o.status, o.total, o.items,
           lower(nullif(btrim(coalesce(o.customer_email, '')), '')) as client,
           case when (o.created_at at time zone 'Europe/Bucharest')::date
                     between (select de_la from f) and (select pana_la from f)
                then 'acum' else 'inainte' end as fereastra
      from f, public.orders o
     where o.business_id = p_business
       and o.created_at >= ((least(f.de_la, f.de_la_ant))::timestamp at time zone 'Europe/Bucharest')
       and o.created_at <  (((f.pana_la + 1))::timestamp at time zone 'Europe/Bucharest')
       and ((o.created_at at time zone 'Europe/Bucharest')::date between f.de_la and f.pana_la
         or (o.created_at at time zone 'Europe/Bucharest')::date between f.de_la_ant and f.pana_la_ant)
       and (
         p_canal is null
         or (p_canal = 'magazin' and o.order_source ->> 'marketplace' is null)
         or (p_canal <> 'magazin' and o.order_source ->> 'marketplace' = p_canal)
       )
  ),
  -- Prima comanda a fiecarui client, pe toata istoria magazinului.
  prima as (
    select lower(btrim(o.customer_email)) as client,
           min((o.created_at at time zone 'Europe/Bucharest')::date) as intaia
      from public.orders o
     where o.business_id = p_business
       and o.status not in ('cancelled', 'refunded')
       and nullif(btrim(coalesce(o.customer_email, '')), '') is not null
     group by 1
  ),
  clienti as (
    select distinct t.fereastra, t.client,
           (select intaia from prima where prima.client = t.client) as intaia
      from toate t
     where t.status not in ('cancelled', 'refunded') and t.client is not null
  ),
  pe_fereastra as (
    select c.fereastra,
           count(*) filter (
             where c.intaia between
               (case when c.fereastra = 'acum' then (select de_la from f) else (select de_la_ant from f) end)
               and
               (case when c.fereastra = 'acum' then (select pana_la from f) else (select pana_la_ant from f) end)
           )::int as noi,
           count(*) filter (
             where c.intaia < (case when c.fereastra = 'acum' then (select de_la from f) else (select de_la_ant from f) end)
           )::int as recurenti
      from clienti c group by 1
  ),
  restul as (
    select t.fereastra,
           coalesce(sum((
             select coalesce(sum(coalesce((it ->> 'quantity')::numeric, 0)), 0)
               from jsonb_array_elements(coalesce(t.items, '[]'::jsonb)) it
           )) filter (where t.status not in ('cancelled', 'refunded')), 0) as bucati,
           count(*) filter (where t.status = 'cancelled')::int as anulate,
           count(*)::int as toate_nr
      from toate t group by 1
  ),
  -- Amandoua ferestrele in acelasi obiect, chiar daca una a ramas goala:
  -- o fereastra lipsa ar fi trimis „fara date" acolo unde raspunsul e „zero".
  imbinat as (
    select w.fereastra,
           coalesce(p.noi, 0) as clienti_noi,
           coalesce(p.recurenti, 0) as clienti_recurenti,
           coalesce(r.bucati, 0) as bucati,
           coalesce(r.anulate, 0) as anulate,
           coalesce(r.toate_nr, 0) as comenzi_toate
      from (values ('acum'), ('inainte')) w(fereastra)
      left join pe_fereastra p on p.fereastra = w.fereastra
      left join restul r on r.fereastra = w.fereastra
  )
  select jsonb_object_agg(fereastra, to_jsonb(imbinat) - 'fereastra') from imbinat
$$;

-- ── Drepturi ────────────────────────────────────────────────────────────────
-- ⚠ Si de la `anon`, PE NUME: privilegiile implicite ale proiectului dau
-- grantul pe nume fiecarei functii noi, iar `revoke ... from public` nu-l
-- stinge. Fara randurile astea, cifra de afaceri a oricarui magazin ar fi la
-- indemana oricui are cheia publica.
revoke execute on function public.vanzari_detaliu(uuid, text, date, date, text) from public, anon;
revoke execute on function public.carduri_secundare(uuid, text, date, date, text) from public, anon;
grant execute on function public.vanzari_detaliu(uuid, text, date, date, text) to authenticated, service_role;
grant execute on function public.carduri_secundare(uuid, text, date, date, text) to authenticated, service_role;

notify pgrst, 'reload schema';

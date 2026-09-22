-- ═══════════════════════════════════════════════════════════════════════════
-- OFERTE: starea, pagina si cifrele din cap                      (22.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Ecranul de Oferte aducea pana azi TOATE ofertele magazinului (`listOffers`,
-- fara `limit` si fara `range`), le cauta in memoria browserului si arata o
-- singura eticheta: un chip cenusiu „Inactiv" cand comutatorul era stins. O
-- oferta a carei perioada trecuse arata exact ca una care merge.
--
-- ⚠⚠ DE CE PAGINARE ACUM, CAND CEL MAI INCARCAT MAGAZIN ARE SAPTE OFERTE.
-- Masurat pe productie la 22.09.2026: 13 oferte in 4 magazine, cea mai plina
-- vitrina are 7. Marginea adevarata nu e numarul acela, ci plafonul PostgREST —
-- o mie de randuri, dupa care lista s-ar fi TAIAT IN TACERE. Aceeasi hotarare
-- ca la Discounturi, ceruta de el acolo: „trebuie rezolvat de acum pentru
-- viitor".
--
-- ⚠⚠ SI ASTA ADUCE REGULA DE STARE IN DOUA COPII: una in SQL (aici) si una in
-- TypeScript (`src/lib/offers/stare.ts`), fiindca filtrul alege randurile in
-- baza iar eticheta se deseneaza pe ecran. Doua copii se despart — de-aia sunt
-- lipite de o proba care compara literal ordinea si conditiile:
-- `src/lib/offers/starea-ofertei-e-aceeasi-si-in-baza.test.ts`. Fara ea, filtrul
-- „Expirate" ar fi aratat alte oferte decat cele scrise „Expirată" in tabel, si
-- nimic n-ar fi dat vreo eroare.
--
-- ⚠ PATRU STARI, NU CINCI. La coduri exista si „epuizat", fiindca un cod are
-- `max_uses`. O oferta n-are plafon de utilizari, deci starea aia n-ar fi cazut
-- niciodata pe nimic — iar o optiune de filtru care nu gaseste nimic e o
-- promisiune goala care-l trimite pe om sa caute un defect.

-- ── 1. Starea unei oferte, scrisa in baza ─────────────────────────────────
--
-- ⚠⚠ ORDINEA E CEA A LUCRULUI DE FACUT, si e aceeasi cu cea din `stare.ts`:
--   1. oprit     comutatorul e pe nu — singura stare pusa de om
--   2. expirat   a trecut data
--   3. programat nu e nimic de reparat: porneste singura
--   4. activ     nimic n-o tine
-- O oferta poate fi deodata oprita SI expirata; pe rand incape o singura
-- eticheta, si trebuie sa fie cea care spune ce ai de facut INTAI.

create or replace function public.offer_state(
  p_is_active boolean,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns text
language sql
stable
parallel safe
set search_path to ''
as $function$
  select case
    when not p_is_active then 'oprit'
    when p_ends_at is not null and p_ends_at < now() then 'expirat'
    when p_starts_at is not null and p_starts_at > now() then 'programat'
    else 'activ'
  end
$function$;

revoke all on function public.offer_state(boolean, timestamptz, timestamptz) from public;
grant execute on function public.offer_state(boolean, timestamptz, timestamptz) to authenticated, service_role;

-- ── 2. O pagina de oferte ─────────────────────────────────────────────────
--
-- ⚠ `security invoker`: granita e RLS-ul de pe `offers`, ca peste tot in panou.
-- `definer` ar fi dat oricui ofertele oricarui magazin.
--
-- ⚠ `count(*) over ()` da numarul TOTAL al multimii filtrate, in acelasi drum.
-- Cerut separat, ar fi fost a doua interogare si a doua sansa sa nu se
-- potriveasca cu pagina.
--
-- ⚠⚠ CIFRELE OFERTEI VIN DIN CHIAR RANDUL EI (`impressions`, `conversions`,
-- `revenue_added`), nu dintr-o socoteala peste comenzi — si nici nu se pot lua
-- de acolo: `orders` nu pastreaza NICIO legatura catre oferta folosita, doar o
-- suma totala in `offer_discount_amount`. Urmarea, scrisa si pe ecran: cifrele
-- astea nu scad cand o comanda se anuleaza.

create or replace function public.offers_page(
  bid uuid,
  search text default null,
  p_stare text default 'toate',
  sort_key text default 'noi',
  page_limit integer default 25,
  page_offset integer default 0
)
returns table (
  id uuid, type text, name text, is_active boolean, priority integer,
  trigger jsonb, config jsonb, display jsonb,
  starts_at timestamptz, ends_at timestamptz,
  impressions bigint, conversions bigint, revenue_added numeric,
  created_at timestamptz, updated_at timestamptz,
  stare text,
  total_count bigint
)
language sql
stable
security invoker
set search_path to ''
as $function$
  with cautat as (
    /*
      ⚠ `%` si `_` din ce tasteaza omul se ESCAPEAZA. Sunt metacaractere in
      `like`: fara asta, cine scrie `%` primea toate ofertele, iar cautarea ar
      fi mintit tocmai cand pare ca merge.
    */
    select replace(replace(replace(coalesce(search, ''), '\', '\\'), '%', '\%'), '_', '\_') as q
  ),
  randuri as (
    select
      o.*,
      public.offer_state(o.is_active, o.starts_at, o.ends_at) as st
    from public.offers o
    cross join cautat c
    where o.business_id = bid
      /*
        ⚠ SE CAUTA SI IN TIP, pe cheia lui („order_bump"), nu pe eticheta
        romaneasca. Eticheta („Ofertă la checkout") traieste in TypeScript, si
        scrisa si aici ar fi fost a doua copie care se desparte de prima. Cine
        cauta pe nume gaseste pe nume; cine vrea toate bump-urile are filtrul.
      */
      and (c.q = '' or o.name ilike '%' || c.q || '%' escape '\'
                    or o.type ilike '%' || c.q || '%' escape '\')
  ),
  filtrate as (
    select r.* from randuri r
    where coalesce(p_stare, 'toate') = 'toate' or r.st = p_stare
  )
  select
    f.id, f.type, f.name, f.is_active, f.priority,
    f.trigger, f.config, f.display,
    f.starts_at, f.ends_at,
    f.impressions, f.conversions, f.revenue_added,
    f.created_at, f.updated_at,
    f.st,
    count(*) over () as total_count
  from filtrate f
  order by
    /*
      ⚠ „Alfabetic" cu asezarea ROMANEASCA A CASEI, `public.ro_numeric` — aceeasi
      pe care o folosesc catalogul, categoriile si codurile de reducere. Pe cea
      implicita, Ș si Ț ajung dupa Z, iar numele ofertelor sunt scrise de mana,
      cu diacritice.
    */
    case when sort_key = 'alfabetic' then f.name collate public.ro_numeric end asc nulls last,
    case when sort_key = 'vazute' then f.impressions end desc nulls last,
    case when sort_key = 'acceptate' then f.conversions end desc nulls last,
    case when sort_key = 'venit' then f.revenue_added end desc nulls last,
    f.created_at desc
  limit greatest(1, least(coalesce(page_limit, 25), 100))
  offset greatest(0, coalesce(page_offset, 0))
$function$;

revoke all on function public.offers_page(uuid, text, text, text, integer, integer) from public;
revoke all on function public.offers_page(uuid, text, text, text, integer, integer) from anon;
grant execute on function public.offers_page(uuid, text, text, text, integer, integer) to authenticated;

-- ── 3. Cate oferte are fiecare stare ──────────────────────────────────────
--
-- ⚠⚠ SE NUMARA PESTE CAUTARE, nu peste tot. Altfel omul cauta „Vara", vede
-- „Expirate (3)" si apasa, iar lista iese goala fiindca cele trei expirate erau
-- alte oferte. Cifra de langa un filtru trebuie sa spuna cate randuri VA ARATA
-- apasarea lui.

create or replace function public.offer_state_counts(bid uuid, search text default null)
returns table (stare text, cate bigint)
language sql
stable
security invoker
set search_path to ''
as $function$
  with cautat as (
    select replace(replace(replace(coalesce(search, ''), '\', '\\'), '%', '\%'), '_', '\_') as q
  )
  select
    public.offer_state(o.is_active, o.starts_at, o.ends_at) as stare,
    count(*) as cate
  from public.offers o
  cross join cautat c
  where o.business_id = bid
    and (c.q = '' or o.name ilike '%' || c.q || '%' escape '\'
                  or o.type ilike '%' || c.q || '%' escape '\')
  group by 1
$function$;

revoke all on function public.offer_state_counts(uuid, text) from public;
revoke all on function public.offer_state_counts(uuid, text) from anon;
grant execute on function public.offer_state_counts(uuid, text) to authenticated;

-- ── 4. Cifrele din cap, socotite pe TOT magazinul ─────────────────────────
--
-- ⚠⚠ NU PE PAGINA ADUSA. Adunate din lista incarcata, cele patru carduri ar fi
-- aratat afisarile primelor douazeci si cinci de oferte si ar fi SCAZUT cu
-- fiecare pagina rasfoita. Un raport care scade cand rasfoiesti e mai rau decat
-- niciun raport.
--
-- ⚠ `comenzi_cazute` NU vine din `offers`, ci din comenzi: cate comenzi cu
-- reducere din oferta s-au anulat sau s-au rambursat. Contoarele de mai sus nu
-- scad la anulare (n-au de unde: nu exista legatura comanda → oferta), deci
-- cifra asta e singurul fel de a spune pe ecran CAT de mult nu scad. Cand e
-- zero, randul nici nu apare.

create or replace function public.offer_totaluri(bid uuid)
returns table (
  oferte bigint,
  oferte_active bigint,
  afisari bigint,
  acceptari bigint,
  venit numeric,
  comenzi_cazute bigint,
  bani_dati_cazuti numeric
)
language sql
stable
security invoker
set search_path to ''
as $function$
  select
    (select count(*) from public.offers o where o.business_id = bid),
    (select count(*) from public.offers o
      where o.business_id = bid
        and public.offer_state(o.is_active, o.starts_at, o.ends_at) = 'activ'),
    (select coalesce(sum(o.impressions), 0) from public.offers o where o.business_id = bid),
    (select coalesce(sum(o.conversions), 0) from public.offers o where o.business_id = bid),
    (select round(coalesce(sum(o.revenue_added), 0), 2) from public.offers o where o.business_id = bid),
    (select count(*) from public.orders r
      where r.business_id = bid
        and coalesce(r.offer_discount_amount, 0) > 0
        and r.status in ('cancelled', 'refunded')),
    (select round(coalesce(sum(r.offer_discount_amount), 0), 2) from public.orders r
      where r.business_id = bid
        and coalesce(r.offer_discount_amount, 0) > 0
        and r.status in ('cancelled', 'refunded'))
$function$;

revoke all on function public.offer_totaluri(uuid) from public;
revoke all on function public.offer_totaluri(uuid) from anon;
grant execute on function public.offer_totaluri(uuid) to authenticated;

-- ── 5. Indexul pentru asezarea implicita ──────────────────────────────────
--
-- ⚠ Aceeasi pereche ca la coduri: filtrul pe magazin plus asezarea implicita.
-- Fara el, fiecare pagina ar fi cerut o sortare peste toate ofertele magazinului.

create index if not exists idx_offers_business_created
  on public.offers (business_id, created_at desc);

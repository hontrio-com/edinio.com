-- ═══════════════════════════════════════════════════════════════════════════
-- OFERTE: ce a ramas fara stoc, si ce se vinde cel mai bine     (23.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Doua cereri de-ale lui, amandoua despre ce se poate CITI din baza:
--
--   (5) „Eliminarea automata a produselor fara stoc + notificare cand un produs
--       din pachet ramane fara stoc."
--   (6) „La Recomandari sa poti seta metoda: cele mai vandute din categorie."
--
-- ⚠ DATA DIN NUME E A ZILEI URMATOARE, dinadins: fisierul se aseaza DUPA
-- `2026-09-22-oferte-lista-si-cifre.sql`, care creeaza `offers_page`. Aici se
-- rescrie `offers_page` ca sa aduca si starea de stoc, deci ordinea conteaza pe
-- o baza refacuta din dosar. Aceeasi capcana ca la codurile de reducere.

-- ── 1. Cat din ce ofera o oferta se mai poate cumpara ─────────────────────
--
-- ⚠⚠ SE NUMARA STOCUL, NU „se poate lua dintr-o apasare". Un produs cu variante
-- sau cu personalizare e aruncat din set de vitrina (`needsChoice`), fiindca
-- setul se cumpara dintr-o apasare si n-are unde sa intrebe ce marime. Asta NU se
-- poate judeca in SQL: steagul sta in `products.page_sections`, un jsonb de
-- sectiuni pe care vitrina il citeste cu doua functii de TypeScript.
--
-- Deci `ramase` e o margine DE SUS: cat mai exista pe stoc. O oferta poate fi
-- moarta pe ecran cu `ramase > 0`. Se spune pe fata, si aici, si in panou.
--
-- ⚠ CE NU SE NUMARA DELOC, si de ce:
--   * `volume` nu OFERA produse, ci ieftineste ce e deja in cos;
--   * recomandarile automate n-au lista fixa — bazinul se alege la afisare;
--   * tipurile inca nefacute (`bogo`, `gift`, …) n-au ce pierde.
--
-- ⚠⚠ SI CANTITATILE CONTEAZA. De cand un set poate cere „2 becuri", un stoc de
-- unu nu mai ajunge. Numarat fara ele, panoul ar fi scris „intreaga" despre o
-- oferta pe care vitrina n-o mai arata.

create or replace function public.offer_stoc(bid uuid)
returns table (offer_id uuid, cerute integer, ramase integer)
language sql
stable
security invoker
set search_path to ''
as $function$
  with baza as (
    select
      o.id,
      o.type,
      coalesce((o.config->>'autoByCategory')::boolean, false) as automat,
      coalesce(o.config->'productIds', '[]'::jsonb) as ids,
      coalesce(o.config->'cantitati', '{}'::jsonb) as cant
    from public.offers o
    where o.business_id = bid
      and o.type in ('frequently_bought', 'cross_sell', 'order_bump')
  ),
  linii as (
    select
      b.id as offer_id,
      e.pid,
      /* ⚠ Podea la 1: o cantitate stricata n-are voie sa scoata produsul din socoteala. */
      greatest(1, coalesce((b.cant->>e.pid)::integer, 1)) as cerute
    from baza b
    cross join lateral jsonb_array_elements_text(b.ids) as e(pid)
    where not b.automat
      /* ⚠ Numai ce arata a uuid se compara cu o coloana `uuid`: altfel conversia
         ridica exceptie si cade TOATA interogarea, pentru tot magazinul. */
      and e.pid ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  )
  select
    l.offer_id,
    count(*)::integer,
    count(*) filter (
      where p.id is not null
        and p.is_active
        and not p.is_bundle
        /* Stocul neurmarit sau `null` inseamna NELIMITAT, nu zero. */
        and (not p.track_inventory or p.stock_quantity is null or p.stock_quantity >= l.cerute)
    )::integer
  from linii l
  left join public.products p on p.id = l.pid::uuid and p.business_id = bid
  group by l.offer_id
$function$;

revoke all on function public.offer_stoc(uuid) from public;
revoke all on function public.offer_stoc(uuid) from anon;
grant execute on function public.offer_stoc(uuid) to authenticated, service_role;

-- ── 2. Pagina de oferte aduce si starea de stoc ───────────────────────────
--
-- ⚠ Se rescrie `offers_page` ca sa intoarca doua coloane in plus, in ACELASI
-- drum. Cerute separat, ar fi fost inca o interogare peste toate ofertele
-- magazinului si inca o sansa sa nu se potriveasca cu randurile aratate.

/*
  ⚠⚠ SE STERGE INTAI, nu se rescrie peste. `create or replace` NU poate schimba
  tipul intors („cannot change return type of existing function"), iar aici se
  adauga coloane. Aceeasi capcana ca la `customers_aggregate`.

  ⚠ Si stergerea ia cu ea GRANTURILE, deci se refac dedesubt. Uitate, pagina ar
  fi raspuns „permission denied" pentru toti comerciantii.
*/
drop function if exists public.offers_page(uuid, text, text, text, integer, integer);

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
  produse_cerute integer, produse_ramase integer,
  total_count bigint
)
language sql
stable
security invoker
set search_path to ''
as $function$
  with cautat as (
    select replace(replace(replace(coalesce(search, ''), '\', '\\'), '%', '\%'), '_', '\_') as q
  ),
  randuri as (
    select
      o.*,
      public.offer_state(o.is_active, o.starts_at, o.ends_at) as st,
      s.cerute as st_cerute,
      s.ramase as st_ramase
    from public.offers o
    cross join cautat c
    left join public.offer_stoc(bid) s on s.offer_id = o.id
    where o.business_id = bid
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
    f.st_cerute, f.st_ramase,
    count(*) over () as total_count
  from filtrate f
  order by
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

-- ── 3. Cate oferte sunt ciuntite, pentru banda din cap ────────────────────

/*
  ⚠⚠ SE STERGE INTAI, nu se rescrie peste. `create or replace` NU poate schimba
  tipul intors („cannot change return type of existing function"), iar aici se
  adauga coloane. Aceeasi capcana ca la `customers_aggregate`.

  ⚠ Si stergerea ia cu ea GRANTURILE, deci se refac dedesubt. Uitate, pagina ar
  fi raspuns „permission denied" pentru toti comerciantii.
*/
drop function if exists public.offer_totaluri(uuid);

create or replace function public.offer_totaluri(bid uuid)
returns table (
  oferte bigint,
  oferte_active bigint,
  afisari bigint,
  acceptari bigint,
  venit numeric,
  comenzi_cazute bigint,
  bani_dati_cazuti numeric,
  oferte_ciuntite bigint,
  oferte_moarte bigint
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
        and r.status in ('cancelled', 'refunded')),
    /*
      ⚠⚠ DOUA CIFRE DEOSEBITE, si nu sunt acelasi lucru:
        * CIUNTITA  i-a cazut ceva, dar inca arata — merita stiut, nu e o urgenta;
        * MOARTA    n-a mai ramas niciun produs, deci nu se mai vede DELOC.
      Adunate intr-una, comerciantul n-ar fi stiut daca trebuie sa se miste acum
      sau cand are timp.

      ⚠ Se numara doar ofertele care chiar pot rula (pornite si in perioada): una
      oprita n-are ce pierde, iar o alarma pe ea ar fi zgomot.
    */
    (select count(*) from public.offers o
      join public.offer_stoc(bid) s on s.offer_id = o.id
      where o.business_id = bid
        and public.offer_state(o.is_active, o.starts_at, o.ends_at) = 'activ'
        and s.ramase > 0 and s.ramase < s.cerute),
    (select count(*) from public.offers o
      join public.offer_stoc(bid) s on s.offer_id = o.id
      where o.business_id = bid
        and public.offer_state(o.is_active, o.starts_at, o.ends_at) = 'activ'
        and s.cerute > 0 and s.ramase = 0)
$function$;

revoke all on function public.offer_totaluri(uuid) from public;
revoke all on function public.offer_totaluri(uuid) from anon;
grant execute on function public.offer_totaluri(uuid) to authenticated;

-- ── 4. Ca sa nu se anunte de doua ori acelasi lucru ───────────────────────
--
-- ⚠⚠ FARA ASTA, NOTIFICAREA AR FI FOST ZGOMOT. Cronul ruleaza zilnic; fara o
-- urma, un magazin cu un produs epuizat ar fi primit acelasi rand in clopotel in
-- fiecare zi, pana l-ar fi stins cu totul. Se insemneaza CAND s-a spus, si se
-- sterge cand oferta se intregeste la loc — asa, daca produsul se epuizeaza din
-- nou peste o luna, se spune din nou.

alter table public.offers
  add column if not exists fara_stoc_anuntat_la timestamptz;

comment on column public.offers.fara_stoc_anuntat_la is
  'Cand i s-a spus comerciantului ca oferta a ramas fara produse. Se sterge cand oferta se intregeste.';

-- ── 5. Ofertele de anuntat, peste toate magazinele ────────────────────────
--
-- ⚠ Pentru CRON, deci peste toate magazinele. `security invoker` ramane: cronul
-- ruleaza cu `service_role`, care oricum trece peste RLS, iar `definer` ar fi
-- deschis aceeasi usa si celui logat.

create or replace function public.oferte_de_anuntat_fara_stoc(plafon integer default 500)
returns table (
  offer_id uuid,
  business_id uuid,
  user_id uuid,
  nume text,
  cerute integer,
  ramase integer
)
language sql
stable
security invoker
set search_path to ''
as $function$
  select o.id, o.business_id, b.user_id, o.name, s.cerute, s.ramase
  from public.offers o
  join public.businesses b on b.id = o.business_id
  join lateral public.offer_stoc(o.business_id) s on s.offer_id = o.id
  where public.offer_state(o.is_active, o.starts_at, o.ends_at) = 'activ'
    /*
      ⚠ SE ANUNTA DOAR CE A MURIT DE TOT. O oferta careia i-a cazut unul din
      patru inca se vede si inca vinde; un rand in clopotel pentru ea ar fi
      transformat notificarea in zgomot, si atunci nici cea adevarata n-ar mai
      fi citita.
    */
    and s.cerute > 0 and s.ramase = 0
    and o.fara_stoc_anuntat_la is null
  order by o.updated_at desc
  limit greatest(1, least(coalesce(plafon, 500), 5000))
$function$;

revoke all on function public.oferte_de_anuntat_fara_stoc(integer) from public;
revoke all on function public.oferte_de_anuntat_fara_stoc(integer) from anon;
revoke all on function public.oferte_de_anuntat_fara_stoc(integer) from authenticated;
grant execute on function public.oferte_de_anuntat_fara_stoc(integer) to service_role;

-- ── 6. Cele mai vandute produse dintr-un bazin de categorii ───────────────
--
-- Pentru metoda noua de recomandare, ceruta de el: „cele mai vandute din
-- categorie", in locul celei de azi, care e „cele mai noi".
--
-- ⚠⚠ NU EXISTA TABELA DE LINII DE COMANDA. Liniile stau in `orders.items`, un
-- tablou jsonb cu `product_id`, `quantity` si `price`. Deci „cele mai vandute"
-- inseamna o desfacere de JSON peste comenzile magazinului.
--
-- ⚠⚠ UNDE SE RUPE, scris pe fata: masurat pe productie la 22.09.2026, toata
-- platforma are 544 de comenzi si 679 de linii, iar cel mai mare magazin are 276
-- de comenzi. La scara asta e nimic. Peste cateva zeci de mii de comenzi pe
-- magazin, asta trebuie sa devina un tabel tinut la zi de un cron — si atunci se
-- schimba AICI, intr-un singur loc. Fereastra de zile e prima centura: se numara
-- ce s-a vandut de curand, nu tot istoricul.
--
-- ⚠ NU SE TINE INTR-UN CACHE ACUM, dinadins. Un tabel de agregat n-ar fi putut
-- deosebi „zero vanzari" de „inca n-am socotit pentru magazinul asta": zero
-- randuri ar fi insemnat amandoua. Socotit la cerere, raspunsul exista mereu.

create or replace function public.produse_vandute(
  bid uuid,
  categorii text[],
  exclude_ids uuid[] default '{}',
  p_limit integer default 4,
  zile integer default 90
)
returns table (product_id uuid, bucati bigint)
language sql
stable
security invoker
set search_path to ''
as $function$
  select
    p.id,
    sum(greatest(0, coalesce((l.item->>'quantity')::integer, 0)))::bigint as bucati
  from public.orders o
  cross join lateral jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) as l(item)
  join public.products p
    on p.id::text = (l.item->>'product_id')
   and p.business_id = bid
  where o.business_id = bid
    and o.created_at >= now() - make_interval(days => greatest(1, least(coalesce(zile, 90), 730)))
    /*
      ⚠ COMENZILE CAZUTE NU SE NUMARA. „Cel mai vandut" pe anulari ar fi
      recomandat tocmai produsele pe care oamenii le-au refuzat.
    */
    and o.status not in ('cancelled', 'refunded')
    and p.is_active
    and not p.is_bundle
    and p.category = any (categorii)
    and not (p.id = any (coalesce(exclude_ids, '{}')))
  group by p.id
  /* ⚠ Si `p.id` in ordonare: fara el, doua produse cu aceleasi vanzari ar fi
     iesit in alta ordine la fiecare cerere, iar cardurile ar fi dansat. */
  order by bucati desc, p.id
  limit greatest(1, least(coalesce(p_limit, 4), 24))
$function$;

revoke all on function public.produse_vandute(uuid, text[], uuid[], integer, integer) from public;
revoke all on function public.produse_vandute(uuid, text[], uuid[], integer, integer) from anon;
grant execute on function public.produse_vandute(uuid, text[], uuid[], integer, integer) to authenticated, service_role;

-- ⚠ Indexul care face desfacerea suportabila cat timp se socoteste la cerere.
create index if not exists idx_orders_business_created_status
  on public.orders (business_id, created_at desc)
  where status not in ('cancelled', 'refunded');

-- ── 7. PostgREST isi reciteste catalogul ─────────────────────────────────
--
-- ⚠ Functiile si-au schimbat semnatura. Fara asta, PostgREST tine minte forma
-- veche pana la urmatoarea repornire, iar pagina ar fi primit „function not
-- found" pentru coloanele noi.
notify pgrst, 'reload schema';

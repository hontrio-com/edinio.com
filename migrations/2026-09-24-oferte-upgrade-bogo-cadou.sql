-- ═══════════════════════════════════════════════════════════════════════════
-- TREI TIPURI NOI DE OFERTA: UPGRADE, „CUMPERI X PRIMESTI Y", CADOU  (24.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠⚠ NU SE SCHIMBA NICIO COLOANA SI NICIO CONSTRANGERE. `offers.type` e `text`
-- fara `check` (verificat in `000-schema-baseline.sql`), iar tot ce descrie cele
-- trei tipuri noi sta in `config`, un jsonb: `inlocuieste`, `cumperiBucati`,
-- `primestiBucati`, `cadouLaAlegere`. Deci randurile de azi raman litera cu
-- litera cum sunt.
--
-- Singurul lucru de facut in baza e SEMNUL DE STOC. `offer_stoc` numara cat se
-- mai poate cumpara din ce ofera o oferta, si era ingradit la cele trei tipuri
-- care existau. Cele trei noi ofera si ele produse dintr-o lista fixa, deci fara
-- randul asta o oferta de cadou ramasa fara stoc ar fi aratat „intreaga" pe
-- ecranul de Oferte si n-ar fi intrat niciodata in notificarea de dimineata.
--
-- ⚠ DATA DIN NUME E A ZILEI URMATOARE, dinadins: fisierul trebuie sa se aseze
-- DUPA `2026-09-23-oferte-stoc-si-cele-mai-vandute.sql`, care creeaza chiar
-- functia rescrisa aici. Dosarul n-are numere de ordine, deci ordinea e cea
-- alfabetica. Aceeasi capcana ca la codurile de reducere.
--
-- ⚠ `create or replace` AICI E BUN: tipul intors nu se schimba (aceleasi trei
-- coloane), se schimba doar corpul. Cand se schimba si tipul, trebuie `drop`
-- intai — vezi migratia de ieri.

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
      coalesce(o.config->'cantitati', '{}'::jsonb) as cant,
      /*
        ⚠ Cate bucati da „cumperi X, primesti Y" din produsul oferit. Se ia AICI,
        in acelasi rand, nu printr-o subinterogare in `linii`: acolo ar fi fost
        chemata o data pentru fiecare produs al fiecarei oferte.

        ⚠ `->>` pe un camp lipsa da `null`, iar `coalesce` il face 1 — deci o
        oferta de alt tip, sau una fara campul scris, se poarta ca pana azi.
      */
      case when o.type = 'bogo'
        then greatest(1, coalesce((o.config->>'primestiBucati')::integer, 1))
        else 1
      end as bucati_oferite
    from public.offers o
    where o.business_id = bid
      /*
        ⚠ Cele sase tipuri care OFERA produse dintr-o lista scrisa de comerciant.
        Ce ramane pe dinafara, si de ce:
          * `volume` nu ofera produse, ci ieftineste ce e deja in cos;
          * recomandarile automate n-au lista fixa — bazinul se alege la afisare;
          * `post_purchase` si `spend_reward` inca nu se pot face din formular.
      */
      and o.type in ('frequently_bought', 'cross_sell', 'order_bump', 'upgrade', 'bogo', 'gift')
  ),
  linii as (
    select
      b.id as offer_id,
      e.pid,
      /*
        ⚠ Cate bucati cere oferta din produsul asta.

        La set, numarul sta pe produs in `cantitati`. La „cumperi X primesti Y"
        e `primestiBucati`, ACELASI pentru produsul oferit — iar un stoc de unu
        nu ajunge pentru o oferta care da doua bucati. Numarat cu unu, panoul ar
        fi scris „intreaga" despre o oferta pe care vitrina n-o mai arata.

        ⚠ Podea la 1: o cantitate stricata n-are voie sa scoata produsul din
        socoteala.
      */
      greatest(1, coalesce((b.cant->>e.pid)::integer, b.bucati_oferite)) as cerute
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

-- ⚠ PostgREST tine minte forma functiilor. Fara asta, corpul nou e in baza dar
-- cererile merg mai departe pe cel vechi pana la urmatoarea repornire.
notify pgrst, 'reload schema';

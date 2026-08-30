-- Stocul se da inapoi cand vanzarea se intoarce.
--
-- ═══ DEFECTUL ═══
--
-- `elibereaza_stoc_batch` exista de la `2026-08-05-revendicare-stoc.sql`, dar e
-- chemata DOAR pe cele trei cai „insertul a esuat" (`order.actions.ts:1273, 2283,
-- 2943`). O comanda anulata, rambursata sau stearsa nu da nimic inapoi: marfa
-- ramane scazuta pentru o vanzare care nu s-a facut. Masurat in productie:
-- 27 din 114 comenzi (24%) sunt in `cancelled`/`refunded`/`returned`.
--
-- Utilizarea CUPONULUI se elibereaza deja corect, in aceeasi functie
-- (`updateOrderStatus`), cu marcaj de idempotenta in baza. Stocul ramasese pe
-- dinafara. Migratia asta ii da perechea, dupa exact acelasi tipar.
--
-- ═══ DE CE NU SE POATE DEDUCE DIN `orders.items` ═══
--
-- Ar fi fost tentant sa se citeasca `items` la anulare si sa se puna inapoi de
-- acolo. Nu merge, din trei motive, si toate trei strica STOCUL:
--
--   1. PACHETELE nu-si scriu componentele in `items`. La plasare,
--      `expandBundleStock` desface pachetul si scade COMPONENTELE; `items` retine
--      doar pachetul, care are `track_inventory = false`. Repus din `items`,
--      pachetul primeste un increment care nu face nimic, iar componentele raman
--      scazute pentru totdeauna.
--   2. VARIANTELE se scad separat, pe combinatie (`decrement_variant_stock_batch`),
--      si acolo conteaza care combinatie anume — „prima activa cu titlul cerut".
--   3. `items[].product_id` e spatiu de nume AMESTECAT: contine si `extra_<id>`
--      pentru optiunile suplimentare, adica siruri care nu sunt UUID.
--
-- Si peste toate: compozitia unui pachet se poate schimba intre vanzare si
-- anulare. Dedus la anulare, s-ar da inapoi ALTCEVA decat s-a luat.
--
-- Deci se retine CE S-A REZERVAT, la plasare, pe comanda. Exact prin constructie,
-- imun la orice s-ar schimba pe urma in catalog.
--
-- ═══ ORDINEA CONTEAZA: PRODUSE, APOI VARIANTE ═══
--
-- La plasare se scad DOUA lucruri: `revendica_stoc_batch` scade
-- `products.stock_quantity`, iar `decrement_variant_stock_batch` scade combinatia
-- — iar a doua scriere atinge `page_sections`, deci aprinde declansatorul
-- `products_sync_variant_stock`, care pune `stock_quantity = suma variantelor`.
-- (Declansatorul se aprinde NUMAI cand chiar s-au schimbat variantele; o scriere
-- doar pe `stock_quantity` trece nevatamata.)
--
-- Eliberarea merge in ACEEASI ordine, si de aia: la un produs cu toate
-- combinatiile numerotate, repunerea pe coloana produsului e apoi suprascrisa de
-- suma — care e valoarea corecta. Invers, suma ar fi fost pusa prima si coloana ar
-- fi ramas umflata cu o cantitate in plus.

alter table public.orders
  /*
   * CE s-a rezervat, exact cum s-a rezervat:
   *   {"produse":  [{"product_id": uuid, "quantity": n}],
   *    "variante": [{"product_id": uuid, "variant_title": text, "quantity": n}]}
   * NULL inseamna „comanda de dinainte de migratia asta" — vezi mai jos.
   */
  add column if not exists stoc_rezervat    jsonb,
  -- Marcajul de idempotenta. Se pune in ACEEASI instructiune cu eliberarea.
  add column if not exists stoc_eliberat_la timestamptz;

comment on column public.orders.stoc_rezervat is
  'Ce stoc a consumat comanda, scris la plasare. Nu se deduce din items: pachetele nu-si scriu componentele acolo.';

/*
 * Inversul lui `decrement_variant_stock_batch`, linie cu linie.
 *
 * Aceleasi reguli de alegere a combinatiei — PRIMA activa cu titlul cerut si cu
 * stocul scris ca numar — fiindca aia e combinatia din care s-a scazut. Alta
 * alegere ar fi pus bucata inapoi pe alta marime.
 *
 * Si aceeasi pastrare a TIPULUI din JSON: importurile scriu numar (13.630 de
 * combinatii in productie), formularul scrie sir (39). Aduse la un singur fel,
 * s-ar rescrie date care n-au nicio treaba cu comanda asta.
 */
create or replace function public.restaureaza_variante_batch(p_items jsonb)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  r      record;
  v_idx  int;
  v_stoc int;
  v_tip  text;
begin
  for r in
    select (i->>'product_id')::uuid as pid,
           i->>'variant_title'      as titlu,
           greatest(0, coalesce((i->>'quantity')::int, 0)) as cerut
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i
     where i->>'product_id' is not null
       and i->>'variant_title' is not null
     -- Ordine stabila pe id, ca doua eliberari simultane sa nu se incuie reciproc.
     order by 1, 2
  loop
    if r.cerut <= 0 then continue; end if;

    perform 1 from products where id = r.pid for update;

    v_idx := null;
    select t.idx,
           floor((t.c->>'stock_quantity')::numeric)::int,
           jsonb_typeof(t.c->'stock_quantity')
      into v_idx, v_stoc, v_tip
    from products p,
         lateral jsonb_array_elements(p.page_sections->'variants'->'combinations')
                 with ordinality as t(c, idx)
    where p.id = r.pid
      and t.c->>'title' = r.titlu
      and (t.c->>'enabled')::boolean is true
      and (t.c->>'stock_quantity') ~ '^\s*\d+(\.\d+)?\s*$'
    order by t.idx
    limit 1;

    -- Combinatia a disparut, a fost stinsa, sau nu mai tine socoteala pe numar:
    -- nu se inventeaza una. Comanda a fost anulata, dar catalogul s-a schimbat
    -- intre timp — nu e treaba anularii sa-l aduca inapoi.
    if v_idx is null then continue; end if;

    update products p
    set page_sections = jsonb_set(
          p.page_sections,
          array['variants', 'combinations', (v_idx - 1)::text, 'stock_quantity'],
          case when v_tip = 'string' then to_jsonb((v_stoc + r.cerut)::text)
               else to_jsonb(v_stoc + r.cerut) end
        )
    where p.id = r.pid;
  end loop;
end;
$$;

/*
 * Da inapoi stocul unei comenzi care nu se mai face.
 *
 * CINE HOTARASTE CA S-A DAT DEJA INAPOI E BAZA, nu codul apelant. Marcajul se
 * pune cu `update ... where stoc_eliberat_la is null ... returning`, deci doua
 * anulari simultane (sau „anulata din panou si stearsa pe urma") elibereaza O
 * SINGURA DATA: a doua nu gaseste randul si iese cu `nimic`. Fara asta, stocul
 * s-ar umfla la fiecare apasare — iar un stoc umflat vinde marfa care nu exista,
 * deci e mai rau decat unul blocat.
 *
 * Raspunsuri: `eliberat`, `nimic` (deja eliberat, sau nu exista ce),
 * `necunoscut` (comanda de dinainte de migratie, fara `stoc_rezervat`).
 */
create or replace function public.elibereaza_stoc_comanda(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_rez jsonb;
  v_are boolean;
begin
  select stoc_rezervat is not null into v_are from public.orders where id = p_order_id;
  if v_are is null then return 'nimic'; end if;
  -- Comanda veche: NU se ghiceste din `items`. Vezi antetul migratiei.
  if not v_are then return 'necunoscut'; end if;

  update public.orders
     set stoc_eliberat_la = now()
   where id = p_order_id
     and stoc_eliberat_la is null
  returning stoc_rezervat into v_rez;

  if v_rez is null then return 'nimic'; end if;

  -- Produsele intai, variantele dupa. Vezi „ORDINEA CONTEAZA" din antet.
  perform public.elibereaza_stoc_batch(coalesce(v_rez->'produse', '[]'::jsonb));
  perform public.restaureaza_variante_batch(coalesce(v_rez->'variante', '[]'::jsonb));

  return 'eliberat';
end;
$$;

/*
 * Ia stocul inapoi cand comanda iese din anulare.
 *
 * Perechea lui `reclaim_order_discount`, si din acelasi motiv: comerciantul care
 * duce o comanda `cancelled -> confirmed` chiar o vinde, deci marfa trebuie sa
 * iasa din nou din stoc. Garda e tot in baza — fara marcaj de eliberare nu se
 * poate revendica ce n-a fost dat inapoi.
 *
 * Se scade NECONDITIONAT, fara verdict de disponibilitate: comanda exista deja si
 * a fost reactivata deliberat de comerciant, deci un refuz aici n-ar avea ce sa
 * anuleze. Daca stocul a fost intre timp vandut altcuiva, coloana poate ajunge
 * negativa — si asta se RAPORTEAZA, in loc sa fie plafonata la zero, ca sa ramana
 * urma. Exact lectia din `2026-08-05-revendicare-stoc.sql`: `greatest(0, ...)`
 * ascunde supravanzarea in loc s-o arate.
 */
create or replace function public.revendica_stoc_comanda(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_rez      jsonb;
  r          record;
  v_negative jsonb := '[]'::jsonb;
  v_nou      int;
begin
  update public.orders
     set stoc_eliberat_la = null
   where id = p_order_id
     and stoc_eliberat_la is not null
     and stoc_rezervat is not null
  returning stoc_rezervat into v_rez;

  if v_rez is null then return jsonb_build_object('fel', 'nimic'); end if;

  for r in
    select (e->>'product_id')::uuid as pid,
           sum(greatest(0, coalesce((e->>'quantity')::int, 0)))::int as qty
      from jsonb_array_elements(coalesce(v_rez->'produse', '[]'::jsonb)) e
     where e->>'product_id' is not null
     group by 1
    having sum(greatest(0, coalesce((e->>'quantity')::int, 0))) > 0
     order by 1
  loop
    update products
       set stock_quantity = stock_quantity - r.qty
     where id = r.pid and track_inventory = true and stock_quantity is not null
    returning stock_quantity into v_nou;
    if v_nou is not null and v_nou < 0 then
      v_negative := v_negative || jsonb_build_object('product_id', r.pid, 'stoc', v_nou);
    end if;
  end loop;

  perform public.decrement_variant_stock_batch(coalesce(v_rez->'variante', '[]'::jsonb));

  return jsonb_build_object('fel', 'revendicat', 'negative', v_negative);
end;
$$;

-- Numai `service_role`, ca toate celelalte functii de stoc. Lasate la indemana lui
-- `anon`, oricine cu cheia publica din pachetul browserului ar putea umfla sau
-- goli stocurile oricarui magazin.
revoke all on function public.restaureaza_variante_batch(jsonb) from public, anon, authenticated;
grant execute on function public.restaureaza_variante_batch(jsonb) to service_role;
revoke all on function public.elibereaza_stoc_comanda(uuid) from public, anon, authenticated;
grant execute on function public.elibereaza_stoc_comanda(uuid) to service_role;
revoke all on function public.revendica_stoc_comanda(uuid) from public, anon, authenticated;
grant execute on function public.revendica_stoc_comanda(uuid) to service_role;

notify pgrst, 'reload schema';

-- ═══ CE NU FACE MIGRATIA: NU REPARA RETROACTIV ═══
--
-- Cele 27 de comenzi deja anulate raman cum sunt. Masurat: cele 40 de linii ale
-- lor contin ZERO pachete, ZERO variante si ZERO id-uri care nu sunt UUID, iar
-- doar SAPTE dintre ele sunt pe produse cu `track_inventory` — deci expunerea
-- reala e mica si perfect identificabila.
--
-- Nu se repara automat fiindca ar fi o schimbare de stoc pe care comerciantul n-a
-- cerut-o si n-ar vedea-o nicaieri. Acelasi precedent ca la eliberarea cupoanelor,
-- unde s-a hotarat la fel. Lista, daca cineva vrea sa decida:
--
--   select o.id, o.order_number, o.status, p.name, (i->>'quantity')::int as buc
--     from orders o
--     cross join lateral jsonb_array_elements(o.items) i
--     join products p on p.id::text = i->>'product_id'
--    where o.status in ('cancelled','refunded','returned')
--      and p.track_inventory
--    order by o.created_at;

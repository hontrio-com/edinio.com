-- Verdictul de stoc si scaderea lui, in ACEEASI instructiune.
--
-- Pana acum comanda mergea pe doua drumuri separate: `expandBundleStock` citea
-- `stock_quantity` cu un SELECT si compara in aplicatie, iar `decrement_stock_batch`
-- scadea abia DUPA ce comanda era deja inserata. Intre cele doua incap trei-patru
-- dus-intorsuri la baza (numarul comenzii, revendicarea cuponului, insertul), deci
-- fereastra e de ordinul sutelor de milisecunde: cinci finalizari trimise in
-- aceeasi secunda pe un produs cu `stock_quantity = 1` treceau toate cinci de
-- verificare si produceau cinci comenzi platibile pentru o bucata.
--
-- Doua lucruri au facut defectul TACUT:
--   * `decrement_stock_batch` e `returns void`, deci nu are ce raspunde si
--     apelantul nici nu citeste nimic;
--   * scade cu `greatest(0, stock_quantity - qty)`, deci supravanzarea se opreste
--     la 0 in loc sa lase un numar negativ — nu ramane nici macar urma ei in date.
-- Verificat in productie: pe `public.products` nu exista niciun CHECK pe
-- `stock_quantity` si niciun trigger care sa apere, iar limita de rata e in
-- memoria instantei (10/minut pe IP), deci cinci cumparatori reali trec oricum.
--
-- Acelasi fisier tratase deja problema identica pe cupoane, cu revendicare
-- atomica (`claim_discount_use` / `release_discount_use`); stocul ramasese pe
-- vechiul tipar. Migratia asta ii da perechea:
--
--   revendica_stoc_batch  — incuie randurile, da verdictul PESTE TOT, si abia apoi
--                           scade. Ori rezerva tot, ori nu atinge nimic si spune
--                           care produs a picat.
--   elibereaza_stoc_batch — da inapoi ce s-a rezervat, cand comanda nu mai intra
--                           (insert cazut). Perechea lui `release_discount_use`.
--
-- CE NU REZOLVA: stocul declarat pe VARIANTA (combinatiile din
-- `page_sections -> variants`). Acolo scaderea are deja lock
-- (`decrement_variant_stock_batch`), dar verdictul a ramas in aplicatie. Efectul e
-- insa marginit de functia asta: la produsele care isi declara stocul pe toate
-- combinatiile, `products.stock_quantity` E suma variantelor (trigger
-- `products_sync_variant_stock`, migratia 2026-08-02), deci totalul vandut nu mai
-- poate depasi stocul real al produsului — se pot incurca doar marimile intre ele.
--
-- ORDINEA LA LIVRARE: se aplica INAINTE de codul care o foloseste, dar codul
-- suporta si lipsa ei. `revendicaStocul` (src/lib/actions/order.actions.ts) trateaza
-- eroarea „functia nu exista" ca „nerevendicat" si cade inapoi pe scaderea de dupa
-- insert, adica exact purtarea de azi — un refuz acolo ar fi oprit toate comenzile
-- platformei, mult mai rau decat cursa. Ramura aceea scrie in `error_logs` cu
-- severitatea `critical`: cat timp apare in /admin/logs, cursa e inca deschisa.

-- `pg_temp` e listat EXPLICIT, si la sfarsit. Daca nu apare in `search_path`,
-- Postgres il cauta IMPLICIT PRIMUL — iar intr-o functie `security definer` asta
-- inseamna ca cine poate crea o tabela temporara numita `products` in aceeasi
-- sesiune ar putea sa o puna in fata celei reale. Prin API nu se poate ajunge
-- acolo (functia e acordata doar lui `service_role`, care nu executa SQL
-- arbitrar), dar forma corecta nu costa nimic. Celelalte functii ale casei
-- (`decrement_variant_stock_batch`, `eliberare-cupon`) au ramas pe forma veche.
create or replace function public.revendica_stoc_batch(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_cerute jsonb;
  r        record;
  v_track  boolean;
  v_stoc   int;
  v_nume   text;
begin
  /*
   * Cantitatile se ADUNA pe produs si se parcurg in ordinea id-ului.
   *
   * Adunarea: acelasi produs poate veni pe doua linii — produsul din formular
   * plus acelasi produs din cosul lipicios, sau doua pachete cu aceeasi
   * componenta. Verificate separat, doua cereri de cate 1 ar trece amandoua pe un
   * stoc de 1.
   *
   * Ordinea: randurile se incuie mereu crescator dupa id, in orice apel, deci doua
   * comenzi cu aceleasi produse in ordine diferita nu se pot bloca reciproc.
   */
  select coalesce(jsonb_agg(jsonb_build_object('pid', pid, 'qty', qty) order by pid), '[]'::jsonb)
    into v_cerute
  from (
    select (i->>'product_id')::uuid as pid,
           sum(greatest(0, coalesce((i->>'quantity')::int, 0)))::int as qty
    from jsonb_array_elements(p_items) i
    where i->>'product_id' is not null
    group by 1
  ) t
  where qty > 0;

  -- Pasul 1: incuie si judeca TOT, fara sa scrie nimic.
  --
  -- Verdictul se da peste tot inainte de prima scadere, tocmai ca un refuz sa nu
  -- lase comanda pe jumatate rezervata. Randurile raman incuiate pana la finalul
  -- tranzactiei, deci intre pasul 1 si pasul 2 nu mai poate interveni nimeni.
  for r in select (e->>'pid')::uuid as pid, (e->>'qty')::int as qty
           from jsonb_array_elements(v_cerute) e
  loop
    -- `for update` reciteste versiunea comisa cea mai noua a randului: o comanda
    -- care tocmai a scazut stocul e VAZUTA aici, nu ocolita cu valoarea veche.
    select p.track_inventory, p.stock_quantity, p.name
      into v_track, v_stoc, v_nume
    from products p
    where p.id = r.pid
    for update;

    -- Produs inexistent sau care nu tine socoteala stocului: nu e nimic de
    -- rezervat, si nu e nici un refuz. Produsele sterse sau dezactivate sunt deja
    -- oprite mai sus de `expandBundleStock`, care da si mesajul omenesc.
    if not found or v_track is not true or v_stoc is null then
      continue;
    end if;

    if v_stoc < r.qty then
      return jsonb_build_object(
        'ok', false, 'produs', r.pid, 'nume', v_nume, 'disponibil', greatest(0, v_stoc)
      );
    end if;
  end loop;

  -- Pasul 2: scaderea. Aceleasi conditii ca la `decrement_stock_batch`, ca sa se
  -- atinga exact aceleasi randuri — dar FARA `greatest(0, ...)`: aici stocul e
  -- deja verificat, si o plafonare la zero ar ascunde din nou o supravanzare.
  for r in select (e->>'pid')::uuid as pid, (e->>'qty')::int as qty
           from jsonb_array_elements(v_cerute) e
  loop
    update products
    set stock_quantity = stock_quantity - r.qty
    where id = r.pid
      and track_inventory = true
      and stock_quantity is not null;
  end loop;

  return jsonb_build_object('ok', true);
end;
$$;

-- Da inapoi stocul rezervat de o comanda care nu mai intra.
--
-- Fara ea, un insert cazut lasa marfa scazuta pentru o comanda care nu exista
-- nicaieri — adica exact pe dos fata de cursa pe care o reparam.
create or replace function public.elibereaza_stoc_batch(p_items jsonb)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  r record;
begin
  for r in
    select (i->>'product_id')::uuid as pid,
           sum(greatest(0, coalesce((i->>'quantity')::int, 0)))::int as qty
    from jsonb_array_elements(p_items) i
    where i->>'product_id' is not null
    group by 1
    having sum(greatest(0, coalesce((i->>'quantity')::int, 0))) > 0
    order by 1
  loop
    update products
    set stock_quantity = stock_quantity + r.qty
    where id = r.pid
      and track_inventory = true
      and stock_quantity is not null;
  end loop;
end;
$$;

-- Numai `service_role`, ca la `decrement_stock_batch` si la functiile de cupon.
-- Amandoua se cheama exclusiv din actiuni de server cu clientul admin. Lasate la
-- indemana lui `anon`, oricine cu cheia publica din pachetul browserului ar putea
-- goli — sau umfla — stocurile oricarui magazin.
revoke all on function public.revendica_stoc_batch(jsonb) from public;
revoke all on function public.revendica_stoc_batch(jsonb) from anon;
revoke all on function public.revendica_stoc_batch(jsonb) from authenticated;
grant execute on function public.revendica_stoc_batch(jsonb) to service_role;

revoke all on function public.elibereaza_stoc_batch(jsonb) from public;
revoke all on function public.elibereaza_stoc_batch(jsonb) from anon;
revoke all on function public.elibereaza_stoc_batch(jsonb) from authenticated;
grant execute on function public.elibereaza_stoc_batch(jsonb) to service_role;

-- Dupa GRANT/REVOKE, PostgREST trebuie sa-si reia schema. Fara asta functia noua
-- nu e vizibila prin RPC si `revendicaStocul` ar cadea pe ramura de rezerva in
-- tacere (jurnalizata `critical`, dar tot ar merge pe drumul vechi).
notify pgrst, 'reload schema';

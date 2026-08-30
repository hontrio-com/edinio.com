-- ═══════════════════════════════════════════════════════════════════════════
-- REVENDICAREA STOCULUI: si variantele, nu doar produsele
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `revendica_stoc_batch` incuie randurile, da verdictul pe TOATE produsele si
-- abia apoi scade — ori rezerva tot, ori nu atinge nimic. Variantele nu treceau
-- pe acolo deloc: se verificau in aplicatie (`eroareStocPeVarianta`, o simpla
-- citire) si se scadeau DUPA inserarea comenzii, cu
-- `decrement_variant_stock_batch`, care plafoneaza:
--
--     v_nou := greatest(0, v_stoc - v_cerut);
--
-- Adica nu REFUZA niciodata.
--
-- Verificarea de produs nu acopera gaura, si aici e partea care se vede greu:
-- `products.stock_quantity` e SUMA combinatiilor (declansatorul BEFORE
-- `sync_product_stock_from_variants`). La S=5 si XL=1 produsul are 6, deci doua
-- comenzi de XL trec amandoua verificarea de produs — suma avea loc — si abia pe
-- urma se bat pe singura bucata de XL:
--
--     start                     produs 6   XL 1
--     A revendica_stoc_batch    produs 5   XL 1
--     B revendica_stoc_batch    produs 4   XL 1   <- trece, mai era "stoc"
--     A scade varianta          produs 5   XL 0   (declansatorul reface suma)
--     B scade varianta          produs 5   XL 0   <- greatest(0, 0 - 1)
--
-- Doua comenzi dintr-o bucata. Iar plafonarea la zero face ca baza sa nu ramana
-- niciodata cu numar negativ, deci supravanzarea nu lasa NICIO urma: sistemul se
-- intoarce la 5 si arata perfect coerent.
--
-- Masurat in productie inainte de reparatie: 2.390 de produse active au doua sau
-- mai multe combinatii cu stoc numeric (2.252 si cu `track_inventory`), in 7
-- magazine. Nu e un caz de laborator, e aproape toata populatia cu variante.
--
-- Un singur produs cu o singura combinatie NU era expus: acolo suma e chiar
-- stocul combinatiei, deci verificarea de produs incuia corect. De asta cursa a
-- putut trai nevazuta — se rupe abia de la a doua marime in sus.

-- ── Revendicarea ──────────────────────────────────────────────────────────────
create or replace function public.revendica_stoc_complet(
  p_produse  jsonb,
  p_variante jsonb
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_prod  jsonb;
  v_var   jsonb;
  r       record;
  v_track boolean;
  v_stoc  int;
  v_nume  text;
  v_idx   int;
  v_tip   text;
begin
  -- Acelasi produs poate veni pe mai multe linii (si prin desfacerea pachetelor),
  -- deci cantitatile se aduna INAINTE de comparatie: doua linii de cate 3 dintr-un
  -- produs cu 5 bucati trebuie sa pice, nu sa treaca de doua ori cate 3 < 5.
  select coalesce(jsonb_agg(jsonb_build_object('pid', pid, 'qty', qty) order by pid), '[]'::jsonb)
    into v_prod
  from (
    select (i->>'product_id')::uuid as pid,
           sum(greatest(0, coalesce((i->>'quantity')::int, 0)))::int as qty
      from jsonb_array_elements(coalesce(p_produse, '[]'::jsonb)) i
     where i->>'product_id' is not null
     group by 1
  ) t
  where qty > 0;

  select coalesce(jsonb_agg(jsonb_build_object('pid', pid, 'titlu', titlu, 'qty', qty)
                            order by pid, titlu), '[]'::jsonb)
    into v_var
  from (
    select (i->>'product_id')::uuid as pid,
           i->>'variant_title'      as titlu,
           sum(greatest(0, coalesce((i->>'quantity')::int, 0)))::int as qty
      from jsonb_array_elements(coalesce(p_variante, '[]'::jsonb)) i
     where i->>'product_id' is not null
       and i->>'variant_title' is not null
     group by 1, 2
  ) t
  where qty > 0;

  /*
   * TOATE randurile atinse se incuie INTAI, in ordinea id-ului.
   *
   * Ordinea nu e cosmetica: doua comenzi care ating aceleasi doua produse in
   * ordine inversa se incuie reciproc, si Postgres omoara una cu deadlock. Un
   * `order by` intr-un `select ... for update` nu garanteaza ordinea incuierii,
   * de asta se face intr-o bucla explicita.
   *
   * Se incuie si produsele care apar DOAR pe lista de variante: fara ele,
   * fereastra pe care o inchidem aici ar ramane deschisa exact pentru cazul din
   * antet.
   */
  for r in
    select pid from (
      select (e->>'pid')::uuid as pid from jsonb_array_elements(v_prod) e
      union
      select (e->>'pid')::uuid as pid from jsonb_array_elements(v_var) e
    ) t order by pid
  loop
    perform 1 from products where id = r.pid for update;
  end loop;

  -- ── Verdictul pe produse ────────────────────────────────────────────────────
  for r in select (e->>'pid')::uuid as pid, (e->>'qty')::int as qty
             from jsonb_array_elements(v_prod) e
  loop
    select p.track_inventory, p.stock_quantity, p.name
      into v_track, v_stoc, v_nume
      from products p where p.id = r.pid;

    -- Fara urmarire de stoc nu exista limita de respectat.
    if not found or v_track is not true or v_stoc is null then continue; end if;

    if v_stoc < r.qty then
      return jsonb_build_object(
        'ok', false, 'produs', r.pid, 'nume', v_nume, 'disponibil', greatest(0, v_stoc));
    end if;
  end loop;

  -- ── Verdictul pe variante — ASTA LIPSEA ─────────────────────────────────────
  for r in select (e->>'pid')::uuid as pid, e->>'titlu' as titlu, (e->>'qty')::int as qty
             from jsonb_array_elements(v_var) e
  loop
    v_idx := null;
    select t.idx, floor((t.c->>'stock_quantity')::numeric)::int, p.name
      into v_idx, v_stoc, v_nume
      from products p,
           lateral jsonb_array_elements(p.page_sections->'variants'->'combinations')
                   with ordinality as t(c, idx)
     where p.id = r.pid
       and t.c->>'title' = r.titlu
       and (t.c->>'enabled')::boolean is true
       and (t.c->>'stock_quantity') ~ '^\s*\d+(\.\d+)?\s*$'
     order by t.idx
     limit 1;

    /*
     * Combinatia fara stoc completat NU e o eroare si nu se refuza: pentru ea nu
     * exista numar de respectat, guverneaza stocul produsului intreg — exact ce
     * face si `eroareStocPeVarianta` in aplicatie. Masurat: 862 de produse cu
     * variante sunt in situatia asta. Un refuz aici le-ar opri vanzarea cu totul.
     */
    if v_idx is null then continue; end if;

    if v_stoc < r.qty then
      return jsonb_build_object(
        'ok', false, 'produs', r.pid, 'nume', v_nume,
        'varianta', r.titlu, 'disponibil', greatest(0, v_stoc));
    end if;
  end loop;

  -- ── Abia acum se scade. Ori tot, ori nimic. ────────────────────────────────
  for r in select (e->>'pid')::uuid as pid, (e->>'qty')::int as qty
             from jsonb_array_elements(v_prod) e
  loop
    update products
       set stock_quantity = stock_quantity - r.qty
     where id = r.pid and track_inventory = true and stock_quantity is not null;
  end loop;

  /*
   * Variantele DUPA produse, si asta conteaza.
   *
   * Scrierea in `page_sections` porneste declansatorul BEFORE, care pune
   * `stock_quantity` = suma combinatiilor. Pentru un produs guvernat de
   * declansator asta suprascrie scaderea de mai sus — cu ACELASI numar, fiindca
   * suma veche era chiar stocul vechi. Invers (variante, apoi produse) am scadea
   * de doua ori.
   *
   * Pozitia (`idx`) se reciteste la fiecare pas: doua marimi ale aceluiasi produs
   * vin pe randuri diferite, iar `v_stoc` de la prima nu mai e adevarat la a doua.
   */
  for r in select (e->>'pid')::uuid as pid, e->>'titlu' as titlu, (e->>'qty')::int as qty
             from jsonb_array_elements(v_var) e
  loop
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
    if v_idx is null then continue; end if;

    update products p
       set page_sections = jsonb_set(
             p.page_sections,
             array['variants', 'combinations', (v_idx - 1)::text, 'stock_quantity'],
             -- Tipul se pastreaza: unele magazine tin stocul ca sir, si o
             -- schimbare de tip ar rupe citirile care compara cu regex.
             case when v_tip = 'string' then to_jsonb((v_stoc - r.qty)::text)
                  else to_jsonb(v_stoc - r.qty) end)
     where p.id = r.pid;
  end loop;

  return jsonb_build_object('ok', true);
end;
$$;

-- ── Perechea ei: darea inapoi, cand comanda nu mai intra ──────────────────────
--
-- Fara ea, mutarea scaderii variantelor INAINTE de insert ar fi deschis o gaura
-- noua: un insert esuat ar fi lasat marimea consumata pentru o comanda care nu
-- exista. Produsele si variantele se dau inapoi in ACEEASI tranzactie, altfel
-- doua apeluri separate pot reusi doar pe jumatate.
create or replace function public.elibereaza_stoc_complet(
  p_produse  jsonb,
  p_variante jsonb
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  perform public.elibereaza_stoc_batch(coalesce(p_produse, '[]'::jsonb));
  perform public.restaureaza_variante_batch(coalesce(p_variante, '[]'::jsonb));
end;
$$;

-- ── Editarea comenzii: ce s-a mai consumat se ADAUGA la ce scria deja ─────────
--
-- `updateOrderDetails` adauga linii pe o comanda existenta, scade stocul pentru
-- ele... si nu atingea deloc `orders.stoc_rezervat`. Deci o comanda editata si
-- apoi anulata dadea inapoi doar cantitatile de la plasare, iar liniile adaugate
-- ramaneau consumate pentru totdeauna. Aceeasi gaura ca pe calea cosului, doar ca
-- pe a treia cale.
--
-- Se face in baza, nu in aplicatie, fiindca altfel ar fi citire-modificare-scriere
-- pe acelasi camp: doua editari in aceeasi clipa si una din ele dispare.
create or replace function public.adauga_stoc_rezervat(
  p_order_id uuid,
  p_produse  jsonb,
  p_variante jsonb
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_rez jsonb;
begin
  select stoc_rezervat into v_rez from public.orders where id = p_order_id for update;
  if not found then return; end if;

  /*
   * Comanda dinainte de coloana (`stoc_rezervat is null`) ramane NULL.
   *
   * Scrisa acum doar cu liniile adaugate, ar arata ca si cum aia ar fi tot ce a
   * consumat comanda, iar `elibereaza_stoc_comanda` ar raporta „eliberat" dupa ce
   * ar da inapoi o farama din ce s-a luat. Mai bine "necunoscut", care se vede in
   * loguri si se corecteaza de mana.
   */
  if v_rez is null then return; end if;

  update public.orders
     set stoc_rezervat = jsonb_build_object(
           'produse',  coalesce(v_rez->'produse',  '[]'::jsonb) || coalesce(p_produse,  '[]'::jsonb),
           'variante', coalesce(v_rez->'variante', '[]'::jsonb) || coalesce(p_variante, '[]'::jsonb))
   where id = p_order_id;
end;
$$;

revoke all on function public.revendica_stoc_complet(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.elibereaza_stoc_complet(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.adauga_stoc_rezervat(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.revendica_stoc_complet(jsonb, jsonb) to service_role;
grant execute on function public.elibereaza_stoc_complet(jsonb, jsonb) to service_role;
grant execute on function public.adauga_stoc_rezervat(uuid, jsonb, jsonb) to service_role;

notify pgrst, 'reload schema';

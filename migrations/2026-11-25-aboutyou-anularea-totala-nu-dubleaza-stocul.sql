-- ═══════════════════════════════════════════════════════════════════════════
-- ANULAREA TOTALA ELIBERA STOCUL DE DOUA ORI
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ MASURAT PE PRODUCTIE (27.08.2026), intr-o tranzactie data inapoi:
--
--     stoc la inceput ........................ 120
--     dupa tranzitia intregii comenzi ........ 122   (+2, corect)
--     dupa eliberarea per linie .............. 124   (+2 INCA O DATA)
--
-- Doua bucati rezervate, patru eliberate. Stocul umflat se vinde, si se vinde ce nu exista.
--
-- ⚠ DE CE SE INTAMPLA. `ingestOrder` face doua lucruri cand About You trece comanda pe
-- `cancelled`: cheama `aplica_tranzitia_comenzii` cu `p_elibereaza_stoc = true`, care elibereaza
-- REZERVAREA INTREAGA, si apoi `aboutyou_elibereaza_anulari`, care elibereaza FIECARE LINIE
-- anulata. La o anulare partiala e exact ce trebuie: statusul comenzii ramane `mixed`, deci prima
-- cale nici nu porneste. La una TOTALA pornesc amandoua.
--
-- ⚠ FIECARE SE APARA DE SINE, NICIUNA DE CEALALTA. `elibereaza_stoc_comanda` are `stoc_eliberat_la
-- is null`, iar RPC-ul per linie are lista `anulate_eliberate` — doua paze bune care nu se vad
-- una pe alta. E tiparul „hotararea agregata inghiata bucata", pe dos: doua mecanisme corecte,
-- fiecare in lumea lui.
--
-- ⚠ PAZA SE PUNE IN BAZA, nu doar in TypeScript. Acolo se intalnesc cele doua cai, si acolo tine
-- oricare ar fi ordinea chemarilor. In cod se sare oricum peste chemare (vezi `elibereazaAnularile`),
-- dar aia e economie, nu siguranta.
--
-- ⚠ LINIILE SE MARCHEAZA TOTUSI CA ELIBERATE. Nemarcate, fiecare trecere a ingestului le-ar lua
-- de la capat, ar gasi iar `stoc_eliberat_la` pus, si ar iesi — corect, dar la nesfarsit. Iar
-- daca mai tarziu comanda s-ar redeschide, ar fi eliberate a doua oara pe bune.

create or replace function public.aboutyou_elibereaza_anulari(
  p_business_id uuid, p_order_number text, p_linii jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_rand public.aboutyou_orders%rowtype;
  v_deja jsonb;
  v_noi jsonb;
  v_produse jsonb;
  v_variante jsonb;
  v_deja_eliberat_tot boolean;
begin
  select * into v_rand
    from public.aboutyou_orders
   where business_id = p_business_id
     and aboutyou_order_number = p_order_number
   for update;

  if not found then
    return jsonb_build_object('stare', 'lipsa', 'eliberate', 0);
  end if;

  v_deja := coalesce(v_rand.anulate_eliberate, '[]'::jsonb);

  select coalesce(jsonb_agg(l), '[]'::jsonb) into v_noi
    from jsonb_array_elements(coalesce(p_linii, '[]'::jsonb)) as l
   where not (v_deja @> to_jsonb(array[l->>'linie_cheie']));

  if jsonb_array_length(v_noi) = 0 then
    return jsonb_build_object('stare', 'deja', 'eliberate', 0);
  end if;

  -- ⚠ PAZA NOUA. Rezervarea intreaga a fost deja intoarsa pe raft de calea de comanda
  -- (`elibereaza_stoc_comanda` pune `stoc_eliberat_la`). Mai eliberam o data pe linie ar umfla
  -- stocul cu exact cantitatea anulata. Vezi masuratoarea din antet.
  v_deja_eliberat_tot := false;
  if v_rand.order_id is not null then
    select o.stoc_eliberat_la is not null into v_deja_eliberat_tot
      from public.orders o where o.id = v_rand.order_id;
  end if;

  if coalesce(v_deja_eliberat_tot, false) then
    -- Se marcheaza, ca sa nu se reia la fiecare trecere, dar NU se elibereaza nimic.
    update public.aboutyou_orders
       set anulate_eliberate = v_deja || (
             select coalesce(jsonb_agg(l->>'linie_cheie'), '[]'::jsonb)
               from jsonb_array_elements(v_noi) as l),
           updated_at = now()
     where id = v_rand.id;
    return jsonb_build_object('stare', 'acoperit-de-comanda', 'eliberate', 0,
                              'marcate', jsonb_array_length(v_noi));
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('product_id', pid, 'quantity', q)), '[]'::jsonb)
    into v_produse
    from (
      select l->>'product_id' as pid, sum((l->>'quantity')::int) as q
        from jsonb_array_elements(v_noi) as l
       where l->>'product_id' is not null
       group by l->>'product_id'
    ) s;

  select coalesce(jsonb_agg(jsonb_build_object(
           'product_id', pid, 'variant_title', vt, 'quantity', q)), '[]'::jsonb)
    into v_variante
    from (
      select l->>'product_id' as pid, l->>'variant_title' as vt, sum((l->>'quantity')::int) as q
        from jsonb_array_elements(v_noi) as l
       where l->>'product_id' is not null
         and coalesce(l->>'variant_title', '') <> ''
       group by l->>'product_id', l->>'variant_title'
    ) s;

  perform public.elibereaza_stoc_complet(
    case when jsonb_array_length(v_variante) > 0 then '[]'::jsonb else v_produse end,
    v_variante);

  update public.aboutyou_orders
     set anulate_eliberate = v_deja || (
           select coalesce(jsonb_agg(l->>'linie_cheie'), '[]'::jsonb)
             from jsonb_array_elements(v_noi) as l),
         updated_at = now()
   where id = v_rand.id;

  return jsonb_build_object('stare', 'eliberat', 'eliberate', jsonb_array_length(v_noi));
end;
$function$;

notify pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- Anularea unei singure linii elibereaza stocul acelei linii
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ LA EI STATUSUL STA PE LINIE, NU PE COMANDA (26.08.2026)
--
-- `AboutYouOrderItem.status` poate fi `open`, `shipped`, `cancelled` sau `returned`, iar comanda
-- intreaga devine `mixed` cand liniile ei nu spun acelasi lucru.
--
-- Ingestul nostru trecea prin motorul de stoc DOAR cand toata comanda ajungea `cancelled` sau
-- `returned` (`orders.ts`, poarta `order.status === "cancelled" || ... === "returned"`). Deci:
--
--     comanda: A x 1, B x 1   -> se consuma stoc pentru amandoua
--     A -> cancelled, B -> open
--     comanda -> `mixed`
--
-- Poarta nu se deschide. Iar `consuma_stoc_comanda_marketplace` e idempotenta prin
-- `stoc_marketplace_la`: la trecerea urmatoare, A e scoasa din socoteala, dar consumul NU se mai
-- reface — intoarce `deja: true`. Stocul lui A ramane consumat pentru totdeauna, pentru marfa care
-- n-a plecat nicaieri.
--
-- ⚠ SI ANULAREA CHIAR ELIBEREAZA, spre deosebire de retur. Deosebirea e scrisa deja in `orders.ts`
-- si ramane: la o anulare marfa n-a plecat, deci e pe raft; la un retur vine desfacuta, zgariata
-- sau alta, deci repunerea e o a doua apasare, dupa ce omul se uita la ce a primit.
--
-- ⚠ DE CE O FUNCTIE SI NU DOUA APELURI DIN COD. Eliberarea si marcarea trebuie sa fie ACELASI
-- lucru. Facute separat — elibereaza, apoi scrie ca ai eliberat — o cadere intre ele lasa stocul
-- crescut si marcajul nescris, iar trecerea urmatoare il creste iar. Aceeasi hotarare ca la
-- `trendyol_repune_stoc_retur`.

alter table public.aboutyou_orders
  add column if not exists anulate_eliberate jsonb default '[]'::jsonb not null;

comment on column public.aboutyou_orders.anulate_eliberate is
  'Id-urile liniilor anulate pentru care stocul a fost deja eliberat. Tine idempotenta pe LINIE, nu pe comanda.';

CREATE OR REPLACE FUNCTION public.aboutyou_elibereaza_anulari(
  p_business_id uuid,
  p_order_number text,
  p_linii jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_rand public.aboutyou_orders%rowtype;
  v_deja jsonb;
  v_noi jsonb;
  v_produse jsonb;
  v_variante jsonb;
begin
  -- for update: fara el, doua treceri ale cronului pot citi amandoua acelasi marcaj si pot
  -- elibera amandoua aceeasi linie.
  select * into v_rand
    from public.aboutyou_orders
   where business_id = p_business_id
     and aboutyou_order_number = p_order_number
   for update;

  if not found then
    return jsonb_build_object('stare', 'lipsa', 'eliberate', 0);
  end if;

  v_deja := coalesce(v_rand.anulate_eliberate, '[]'::jsonb);

  -- Numai liniile pe care nu le-am eliberat deja. `linie_cheie` e id-ul liniei de la ei.
  select coalesce(jsonb_agg(l), '[]'::jsonb) into v_noi
    from jsonb_array_elements(coalesce(p_linii, '[]'::jsonb)) as l
   where not (v_deja @> to_jsonb(array[l->>'linie_cheie']));

  if jsonb_array_length(v_noi) = 0 then
    return jsonb_build_object('stare', 'deja', 'eliberate', 0);
  end if;

  -- Produsele fara varianta, adunate pe product_id.
  select coalesce(jsonb_agg(jsonb_build_object('product_id', pid, 'quantity', q)), '[]'::jsonb)
    into v_produse
    from (
      select l->>'product_id' as pid, sum((l->>'quantity')::int) as q
        from jsonb_array_elements(v_noi) as l
       where l->>'product_id' is not null
       group by l->>'product_id'
    ) s;

  -- Variantele, adunate pe (product_id, variant_title).
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

  -- ⚠ Cu variante, se elibereaza NUMAI pe varianta: `elibereaza_stoc_complet` scade si din
  -- produs cand primeste ambele liste, iar stocul produsului cu variante e DERIVAT din ele.
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

revoke execute on function public.aboutyou_elibereaza_anulari(uuid, text, jsonb) from public;
grant execute on function public.aboutyou_elibereaza_anulari(uuid, text, jsonb) to service_role;

notify pgrst, 'reload schema';

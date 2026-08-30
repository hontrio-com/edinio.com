-- Scaderea stocului pe VARIANTA la comanda.
--
-- Pana acum se scadea doar `products.stock_quantity`, adica stocul produsului
-- intreg. Numarul de pe fiecare marime era o declaratie pe care comerciantul o
-- tinea de mana: bloca vanzarea cand scria el zero, dar o marime cu cinci bucati
-- ramanea cinci oricat s-ar fi vandut din ea.
--
-- Stocul unei combinatii sta in JSON, la
-- `page_sections -> variants -> combinations -> [i] -> stock_quantity`, deci nu
-- se poate scadea cu un UPDATE simplu pe o coloana. Citirea in aplicatie,
-- modificarea si scrierea inapoi ar pierde comenzi simultane: doua comenzi in
-- aceeasi clipa ar citi amandoua cinci si ar scrie amandoua patru. De asta totul
-- se intampla aici, sub un lock luat INAINTE de citire.

create or replace function public.decrement_variant_stock_batch(p_items jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  item    jsonb;
  v_pid   uuid;
  v_titlu text;
  v_cerut int;
  v_idx   int;   -- pozitia in array, de la 1 (with ordinality)
  v_stoc  int;
  v_tip   text;
  v_nou   int;
begin
  for item in select * from jsonb_array_elements(p_items)
  loop
    v_pid   := (item->>'product_id')::uuid;
    v_titlu := item->>'variant_title';
    v_cerut := greatest(0, coalesce((item->>'quantity')::int, 0));
    if v_pid is null or v_titlu is null or v_cerut = 0 then
      continue;
    end if;

    -- Lock inainte de citire. Intre SELECT si UPDATE nimeni nu mai poate atinge
    -- randul, deci doua comenzi simultane se aseaza una dupa alta in loc sa
    -- citeasca amandoua aceeasi valoare.
    perform 1 from products where id = v_pid for update;

    -- PRIMA combinatie activa cu titlul cerut si cu stocul scris ca numar.
    --
    -- Prima, nu oricare: exista produse cu doua combinatii cu acelasi titlu, iar
    -- pretul platit de client vine tot de la prima (`findCombo` in aplicatie).
    -- Scazand din amandoua, o singura bucata vanduta ar consuma doua.
    --
    -- Stocul necompletat inseamna „nu tin socoteala pe varianta asta", deci acea
    -- combinatie nu se atinge: altfel ar intra singura sub urmarire.
    v_idx := null;
    select t.idx,
           floor((t.c->>'stock_quantity')::numeric)::int,
           jsonb_typeof(t.c->'stock_quantity')
      into v_idx, v_stoc, v_tip
    from products p,
         lateral jsonb_array_elements(p.page_sections->'variants'->'combinations')
                 with ordinality as t(c, idx)
    where p.id = v_pid
      and t.c->>'title' = v_titlu
      and (t.c->>'enabled')::boolean is true
      and (t.c->>'stock_quantity') ~ '^\s*\d+(\.\d+)?\s*$'
    order by t.idx
    limit 1;

    if v_idx is null then
      continue;
    end if;

    v_nou := greatest(0, v_stoc - v_cerut);

    -- Tipul din JSON se pastreaza cum e. Importurile scriu numar (13.630 de
    -- combinatii in productie), formularul scrie sir (39). Aduse toate la un
    -- singur fel, s-ar schimba date care nu au nicio treaba cu comanda asta.
    update products p
    set page_sections = jsonb_set(
          p.page_sections,
          array['variants', 'combinations', (v_idx - 1)::text, 'stock_quantity'],
          case when v_tip = 'string' then to_jsonb(v_nou::text) else to_jsonb(v_nou) end
        )
    where p.id = v_pid;
  end loop;
end;
$$;

-- Aceleasi drepturi ca `decrement_stock_batch`: numai `service_role`. Lasata la
-- indemana lui `anon`, oricine ar putea goli stocurile unui magazin.
revoke all on function public.decrement_variant_stock_batch(jsonb) from public;
revoke all on function public.decrement_variant_stock_batch(jsonb) from anon;
revoke all on function public.decrement_variant_stock_batch(jsonb) from authenticated;
grant execute on function public.decrement_variant_stock_batch(jsonb) to service_role;

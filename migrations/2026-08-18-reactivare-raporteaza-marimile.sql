-- ═══════════════════════════════════════════════════════════════════════════
-- REACTIVAREA UNEI COMENZI: scaderea pe marimi nu mai tace
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `revendica_stoc_comanda` (comanda scoasa din anulare) scadea marimile cu
-- `decrement_variant_stock_batch`, care plafoneaza la zero:
--
--     v_nou := greatest(0, v_stoc - v_cerut);
--
-- La REVENDICARE, plafonarea e purtarea corecta — spre deosebire de plasarea unei
-- comenzi noi. Comerciantul a decis deja reactivarea; un refuz i-ar lasa comanda
-- intr-o stare imposibila, nici anulata, nici confirmata. Deci NU se schimba ce
-- face, ci ce SPUNE.
--
-- Fiindca tacerea era problema: daca marfa s-a vandut altcuiva intre anulare si
-- reactivare, stocul iese din realitate si nimeni nu afla. La produse se raporta
-- deja (`negative`, cu stocul ajuns sub zero); la combinatii, nu — si acolo nici
-- macar nu ramane un numar negativ care sa dea de banuit, fiindca `greatest`
-- il sterge.
--
-- Verificat pe date sintetice, in tranzactie anulata: marime cu 1 bucata, vanduta
-- altcuiva intre timp, apoi reactivare →
--   negative: [{"cerut": 1, "disponibil": 0, "variant_title": "M", "product_id": ...}]
-- Apelantii (`updateOrder`, `bulkUpdateOrderStatus`) scriu deja asta in
-- `/admin/logs` ca `warning`.

create or replace function public.scade_variante_raportat(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  r record; v_idx int; v_stoc int; v_tip text;
  v_lipsa jsonb := '[]'::jsonb;
begin
  for r in
    select (i->>'product_id')::uuid as pid, i->>'variant_title' as titlu,
           greatest(0, coalesce((i->>'quantity')::int, 0)) as cerut
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i
     where i->>'product_id' is not null and i->>'variant_title' is not null
     order by 1, 2   -- ordine determinista: altfel doua reactivari concurente se incuie reciproc
  loop
    if r.cerut <= 0 then continue; end if;
    perform 1 from products where id = r.pid for update;

    v_idx := null;
    select t.idx, floor((t.c->>'stock_quantity')::numeric)::int, jsonb_typeof(t.c->'stock_quantity')
      into v_idx, v_stoc, v_tip
      from products p,
           lateral jsonb_array_elements(p.page_sections->'variants'->'combinations')
                   with ordinality as t(c, idx)
     where p.id = r.pid and t.c->>'title' = r.titlu
       and (t.c->>'enabled')::boolean is true
       and (t.c->>'stock_quantity') ~ '^\s*\d+(\.\d+)?\s*$'
     order by t.idx limit 1;
    -- Combinatia fara stoc completat: guverneaza stocul produsului, nu e o eroare.
    if v_idx is null then continue; end if;

    if v_stoc < r.cerut then
      v_lipsa := v_lipsa || jsonb_build_object(
        'product_id', r.pid, 'variant_title', r.titlu,
        'cerut', r.cerut, 'disponibil', v_stoc);
    end if;

    update products p
       set page_sections = jsonb_set(
             p.page_sections,
             array['variants', 'combinations', (v_idx - 1)::text, 'stock_quantity'],
             -- Tipul se pastreaza: unele magazine tin stocul ca SIR.
             case when v_tip = 'string' then to_jsonb(greatest(0, v_stoc - r.cerut)::text)
                  else to_jsonb(greatest(0, v_stoc - r.cerut)) end)
     where p.id = r.pid;
  end loop;
  return v_lipsa;
end;
$$;

create or replace function public.revendica_stoc_comanda(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_rez jsonb; r record; v_negative jsonb := '[]'::jsonb; v_nou int; v_lipsa jsonb;
begin
  -- Marcajul se sterge in ACEEASI instructiune cu citirea lui: doua reactivari
  -- nu scad de doua ori, si nu se poate revendica ce n-a fost dat inapoi.
  update public.orders
     set stoc_eliberat_la = null
   where id = p_order_id and stoc_eliberat_la is not null and stoc_rezervat is not null
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

  v_lipsa := public.scade_variante_raportat(coalesce(v_rez->'variante', '[]'::jsonb));
  if jsonb_array_length(v_lipsa) > 0 then
    v_negative := v_negative || v_lipsa;
  end if;

  return jsonb_build_object('fel', 'revendicat', 'negative', v_negative);
end;
$$;

revoke all on function public.scade_variante_raportat(jsonb) from public, anon, authenticated;
grant execute on function public.scade_variante_raportat(jsonb) to service_role;

notify pgrst, 'reload schema';

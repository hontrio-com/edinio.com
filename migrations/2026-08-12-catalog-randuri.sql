-- Randurile de produse ale paginii principale, dintr-un singur apel.
--
-- Pagina principala nu e doar o grila: are randul „Recomandate" si oricate
-- randuri custom, fiecare cu regula lui de alegere. Toate se rezolvau in browser,
-- filtrand catalogul INTREG — deci erau inca un motiv pentru care tot catalogul
-- trebuia trimis.
--
-- Un singur apel pentru toate randurile, nu unul per rand: un magazin cu patru
-- randuri ar fi insemnat patru dus-intorsuri in plus, adica exact tiparul pe
-- care modelul asta de citire exista ca sa-l stearga.
--
-- CE NU FACE: nu rezolva arborele de categorii. Subarborele („si subcategoriile")
-- se calculeaza in TS, cu `numeSubarbore`, si vine gata rezolvat in `categorii`.
-- Regula aia are deja un singur loc si un test; rescrisa aici, ar fi fost a doua.

create or replace function public.catalog_randuri(
  p_business uuid,
  p_spec     jsonb
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_fara_img  boolean := coalesce((p_spec->>'faraImagini')::boolean, false);
  v_fara_stoc boolean := coalesce((p_spec->>'faraStocAscuns')::boolean, false);
  v_featured  int     := coalesce((p_spec->>'featuredLimit')::int, 0);
  v_sectiuni  jsonb   := case when jsonb_typeof(p_spec->'sectiuni') = 'array'
                              then p_spec->'sectiuni' else '[]'::jsonb end;
  v_out       jsonb   := '{}'::jsonb;
  v_randuri   jsonb;
  s           jsonb;
  v_mod       text;
  v_lim       int;
  v_ids       uuid[];
  v_cat       text[];
begin
  -- Aceeasi poarta ca `catalog_pagina`: publicat, sau proprietarul lui.
  -- `auth.uid()`, nu un argument — un argument ar fi forjabil cu cheia anon.
  if not exists (
    select 1 from public.businesses b
     where b.id = p_business and (b.is_published or b.user_id = auth.uid())
  ) then
    return jsonb_build_object('featured', '[]'::jsonb, 'sectiuni', '{}'::jsonb);
  end if;

  -- Randul „Recomandate": produsele marcate, in ordinea de catalog.
  if v_featured > 0 then
    select coalesce(jsonb_agg(to_jsonb(t) - 'business_id' - 'cauta_norm' - 'proiectat_la'), '[]'::jsonb)
      into v_randuri
      from (
        select c.* from public.catalog_produs c
         where c.business_id = p_business
           and c.is_featured
           and (not v_fara_img  or c.are_imagine)
           and (not v_fara_stoc or not c.fara_stoc)
         order by c.sort_order, c.product_id
         limit least(v_featured, 96)
      ) t;
    v_out := jsonb_set(v_out, '{featured}', v_randuri);
  else
    v_out := jsonb_set(v_out, '{featured}', '[]'::jsonb);
  end if;

  v_out := jsonb_set(v_out, '{sectiuni}', '{}'::jsonb);

  for s in select * from jsonb_array_elements(v_sectiuni) loop
    v_mod := s->>'mode';
    -- Acelasi plafon ca `SECTION_MAX` din store-sections.ts.
    v_lim := least(greatest(coalesce((s->>'limit')::int, 8), 1), 24);

    if v_mod = 'selected' then
      -- Ordinea ALEASA DE MANA de comerciant, nu cea de catalog. `array_position`
      -- pe lista trimisa e echivalentul lui `order.get(id)` din TS.
      v_ids := case when jsonb_typeof(s->'productIds') = 'array'
                    then (select array_agg((x #>> '{}')::uuid) from jsonb_array_elements(s->'productIds') x)
               end;
      select coalesce(jsonb_agg(to_jsonb(t) - 'business_id' - 'cauta_norm' - 'proiectat_la'), '[]'::jsonb)
        into v_randuri
        from (
          select c.* from public.catalog_produs c
           where c.business_id = p_business
             and v_ids is not null and c.product_id = any(v_ids)
             and (not v_fara_img  or c.are_imagine)
             and (not v_fara_stoc or not c.fara_stoc)
           order by array_position(v_ids, c.product_id)
           limit v_lim
        ) t;

    elsif v_mod = 'category' then
      -- `categorii` vine gata rezolvat din TS (subarborele, daca sectiunea il cere).
      -- Pachetele INTRA, ca la filtrul principal de categorie: altfel sectiunea si
      -- linkul ei „Vezi toate" ar arata liste diferite.
      v_cat := case when jsonb_typeof(s->'categorii') = 'array'
                    then (select array_agg(x #>> '{}') from jsonb_array_elements(s->'categorii') x)
               end;
      select coalesce(jsonb_agg(to_jsonb(t) - 'business_id' - 'cauta_norm' - 'proiectat_la'), '[]'::jsonb)
        into v_randuri
        from (
          select c.* from public.catalog_produs c
           where c.business_id = p_business
             and v_cat is not null and c.category = any(v_cat)
             and (not v_fara_img  or c.are_imagine)
             and (not v_fara_stoc or not c.fara_stoc)
           order by (case when c.is_featured then 0 else 1 end), c.sort_order, c.product_id
           limit v_lim
        ) t;

    else
      -- „Pachete"
      select coalesce(jsonb_agg(to_jsonb(t) - 'business_id' - 'cauta_norm' - 'proiectat_la'), '[]'::jsonb)
        into v_randuri
        from (
          select c.* from public.catalog_produs c
           where c.business_id = p_business
             and c.is_bundle
             and (not v_fara_img  or c.are_imagine)
             and (not v_fara_stoc or not c.fara_stoc)
           order by (case when c.is_featured then 0 else 1 end), c.sort_order, c.product_id
           limit v_lim
        ) t;
    end if;

    -- Sectiunile goale raman goale aici; cine le arunca e apelantul, cu aceeasi
    -- regula ca azi (`items.length > 0`).
    v_out := jsonb_set(v_out, array['sectiuni', s->>'id'], coalesce(v_randuri, '[]'::jsonb));
  end loop;

  return v_out;
end;
$$;

revoke all on function public.catalog_randuri(uuid, jsonb) from public;
grant execute on function public.catalog_randuri(uuid, jsonb) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

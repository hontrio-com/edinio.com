-- ═══════════════════════════════════════════════════════════════════════════
-- PRODUSUL REACTIVAT INTRA IN COADA PROIECTORULUI   (24.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Gasit construind paginile de brand: pe productie, la OKXI, 1114 produse (active,
-- vizibile in grila) n-aveau NICIODATA proiectia calculata (`proiectat_la` NULL,
-- `fatete` gol, `cauta_norm` gol). Deci nu le gaseau nici cautarea, nici filtrele,
-- nici pagina de brand (AMIO: 259 de produse active, 0 in filtrul „Brand”). Plus
-- cate un produs la Mokka si la Cleanixo.
--
-- ⚠ CAUZA, probata pe demo intr-o tranzactie intoarsa:
--   1. dezactivarea STERGE randul din `catalog_produs` (si din coada);
--   2. reactivarea il RECREEAZA, cu coloanele mecanice si `proiectat_la` NULL;
--   3. dar o schimbare NUMAI de `is_active` trecea drept „doar stoc”
--      (`v_doar_stoc`: niciunul dintre numele, descrierea, pretul... nu s-a schimbat),
--      deci produsul NU intra in coada si randul ramanea gol pentru totdeauna.
--
-- REPARATIA: un produs care NU era activ inainte de scriere intra MEREU in coada.
-- Restul functiei e copiat mecanic din productie (definitia citita pe 24.09.2026).
--
-- Plus o singura data: toate randurile ramase neproiectate intra in coada; cronul
-- de la minut le ia cate 1000.

create or replace function public.trg_catalog_proiectie()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
  v_doar_stoc boolean := false;
begin
  v_id := coalesce(new.id, old.id);

  if (tg_op = 'DELETE') or not coalesce(new.is_active, false) then
    delete from public.catalog_produs where product_id = v_id;
    delete from public.catalog_murdar where product_id = v_id;
    update public.catalog_produs cp
       set fara_stoc = public.catalog_fara_stoc(cp.product_id)
     where cp.is_bundle
       and exists (
         select 1 from public.products b
          where b.id = cp.product_id
            and b.page_sections->'bundle'->'items'
                @> jsonb_build_array(jsonb_build_object('product_id', v_id::text)));
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' then
    -- ⚠ Un produs inactiv pana acum n-avea rand in catalog: il primeste chiar mai jos,
    -- GOL, deci trebuie proiectat oricat de putin s-ar fi schimbat in rest.
    v_doar_stoc :=
      coalesce(old.is_active, false)
      and new.name             is not distinct from old.name
      and new.description  is not distinct from old.description
      and new.category     is not distinct from old.category
      and new.tags         is not distinct from old.tags
      and new.price        is not distinct from old.price
      and new.page_sections is not distinct from old.page_sections
      and new.images       is not distinct from old.images
      and new.slug         is not distinct from old.slug;
  end if;

  insert into public.catalog_produs as cp (
    product_id, business_id, name, slug, category, prima_imagine,
    price, compare_at_price, is_featured, is_bundle, track_inventory, stock_quantity,
    sort_order, creat, are_imagine, fara_stoc, price_min, price_max, proiectat_la)
  values (
    new.id, new.business_id, new.name, new.slug, new.category,
    nullif(new.images->>0, ''),
    new.price, new.compare_at_price,
    coalesce(new.is_featured, false), coalesce(new.is_bundle, false),
    coalesce(new.track_inventory, false), new.stock_quantity,
    coalesce(new.sort_order, 0), new.created_at,
    coalesce(jsonb_array_length(coalesce(new.images, '[]'::jsonb)), 0) > 0,
    public.catalog_fara_stoc(new.id),
    new.price, new.price, null)
  on conflict (product_id) do update set
    business_id      = excluded.business_id,
    name             = excluded.name,
    slug             = excluded.slug,
    category         = excluded.category,
    prima_imagine    = excluded.prima_imagine,
    price            = excluded.price,
    compare_at_price = excluded.compare_at_price,
    is_featured      = excluded.is_featured,
    is_bundle        = excluded.is_bundle,
    track_inventory  = excluded.track_inventory,
    stock_quantity   = excluded.stock_quantity,
    sort_order       = excluded.sort_order,
    creat            = excluded.creat,
    are_imagine      = excluded.are_imagine,
    fara_stoc        = excluded.fara_stoc,
    proiectat_la     = cp.proiectat_la;

  if tg_op <> 'INSERT' and not coalesce(new.is_bundle, false) then
    update public.catalog_produs cp
       set fara_stoc = public.catalog_fara_stoc(cp.product_id)
     where cp.business_id = new.business_id
       and cp.is_bundle
       and exists (
         select 1 from public.products b
          where b.id = cp.product_id
            and b.page_sections->'bundle'->'items'
                @> jsonb_build_array(jsonb_build_object('product_id', new.id::text)));
  end if;

  if tg_op = 'INSERT' or not v_doar_stoc then
    insert into public.catalog_murdar (product_id, business_id)
    values (new.id, new.business_id)
    on conflict (product_id) do update set marcat_la = now();
  end if;

  return new;
end;
$function$;

-- O singura data: randurile ramase goale intra in coada.
insert into public.catalog_murdar (product_id, business_id)
select c.product_id, c.business_id from public.catalog_produs c where c.proiectat_la is null
on conflict (product_id) do update set marcat_la = now();

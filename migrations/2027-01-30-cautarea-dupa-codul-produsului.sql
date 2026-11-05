-- Cautarea din magazin gaseste produsul dupa COD (SKU-ul lui sau al unei variante).
--
-- ═══ DE CE (eSAFE, 05.11.2026) ═══
--
-- „La bara de cautare nu gasesc produsele daca caut dupa codul de produs." Masurat pe
-- esafe.ro: „Vesta Half Mesh" gasea vesta, „C494" (codul ei) nu gasea nimic. Doua cauze:
--
--   1. `cauta_norm` (textul in care se cauta) n-a continut niciodata SKU-ul, nici al
--      produsului, nici al variantelor.
--   2. Si daca l-ar fi continut: cuvintele se despart la granita litera/cifra, deci „C494"
--      devine „c" + „494", iar un cuvant sub trei litere face `catalog_cauta` sa renunte
--      (`cuvant_scurt`).
--
-- Deci codurile NU intra in vocabular. Stau separat, LIPITE (`compactCod` din
-- product-search.ts: litere mici, fara diacritice, doar [a-z0-9]), in `catalog_produs.coduri`,
-- scrise de proiector. Codul cautat e cuvintele interogarii lipite la loc, adica exact
-- `tokenize(q).join("")` din TS.
--
-- Regula (aceeasi si in `scorCod` din TS): codul INTREG potriveste mereu; INCEPUTUL de cod
-- doar cand cautarea are o cifra („vesta" nu e un cod); sub trei caractere, nimic.
--
-- ⚠ COMPATIBILA CU CODUL VECHI, deci se aplica INAINTEA pushului: coloana are implicit `{}`,
-- iar `catalog_aplica_proiectii` pastreaza `coduri` cand randul primit nu-l are. Dupa deploy
-- toate produsele se pun in `catalog_murdar`, ca proiectorul nou sa le scrie codurile.

alter table public.catalog_produs add column if not exists coduri text[] not null default '{}'::text[];

create or replace function public.catalog_potriveste_cod(p_coduri text[], p_cod text)
 returns boolean
 language sql
 immutable
 set search_path to ''
as $function$
  select coalesce(length(p_cod), 0) >= 3
     and exists (
       select 1 from unnest(coalesce(p_coduri, '{}'::text[])) k
        where k = p_cod
           -- `p_cod` are doar [a-z0-9] (vine din cuvintele tokenizate), deci `like` n-are
           -- caractere speciale de scapat.
           or (p_cod ~ '[0-9]' and k like p_cod || '%'));
$function$;

revoke execute on function public.catalog_potriveste_cod(text[], text) from public, anon, authenticated;
grant execute on function public.catalog_potriveste_cod(text[], text) to service_role;

create or replace function public.catalog_aplica_proiectii(p_randuri jsonb)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_afectate int;
begin
  update public.catalog_produs cp set
    price_min        = (r->>'price_min')::numeric,
    price_max        = (r->>'price_max')::numeric,
    has_range        = (r->>'has_range')::boolean,
    fara_oferta      = (r->>'fara_oferta')::boolean,
    optiuni          = case when jsonb_typeof(r->'optiuni') = 'null' then null else r->'optiuni' end,
    descriere_scurta = coalesce(r->>'descriere_scurta', ''),
    cauta_norm       = coalesce(r->>'cauta_norm', ''),
    -- `text[]` dintr-un array jsonb de siruri. `coalesce` pe array gol, nu pe
    -- null: coloana e `not null`.
    fatete           = coalesce(
                         (select array_agg(x #>> '{}') from jsonb_array_elements(r->'fatete') x),
                         '{}'::text[]),
    -- ⚠ Randul fara `coduri` (proiectorul de dinaintea migratiei) PASTREAZA ce era.
    coduri           = case when jsonb_typeof(r->'coduri') = 'array'
                            then coalesce(
                                   (select array_agg(x #>> '{}') from jsonb_array_elements(r->'coduri') x),
                                   '{}'::text[])
                            else cp.coduri end,
    proiectat_la     = (r->>'proiectat_la')::timestamptz
  from jsonb_array_elements(p_randuri) r
  where cp.product_id = (r->>'product_id')::uuid;

  get diagnostics v_afectate = row_count;
  return v_afectate;
end;
$function$;

create or replace function public.catalog_candidati(p_business uuid, p_cuvinte text[], p_filtre jsonb)
 returns table(product_id uuid)
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp', 'extensions'
as $function$
  with cerute as (
    select w, public.semnatura_cuvant(w) as semn,
           case when length(w) >= 7 then 2 when length(w) >= 4 then 1 else 0 end as buget
      from unnest(coalesce(p_cuvinte, '{}'::text[])) w
     where length(w) >= 1
       -- ⚠ Cu un cuvant sub trei litere, ramura pe cuvinte NU ruleaza: vocabularul incepe de
       -- la trei litere, iar `catalog_cauta` ajunge aici cu el doar cand codul a gasit ceva.
       and not exists (select 1 from unnest(coalesce(p_cuvinte, '{}'::text[])) z where length(z) < 3)
  ),
  potrivite as (
    select distinct c.w as cerut, v.cuvant
      from cerute c
      join public.catalog_cuvant v
        on v.business_id = p_business
       and (
         v.cuvant like c.w || '%'
         or (length(c.w) >= 3 and v.cuvant like '%' || c.w || '%')
         or (c.buget > 0
             and extensions.levenshtein_less_equal(v.cuvant, c.w, c.buget) <= c.buget)
         or (c.buget > 0 and length(v.cuvant) > length(c.w) and exists (
              select 1 from generate_series(greatest(1, length(c.w) - 1), length(c.w) + c.buget) k
               where extensions.levenshtein_less_equal(left(v.cuvant, k), c.w, c.buget) <= c.buget
                  or public.semnatura_cuvant(left(v.cuvant, k)) = c.semn))
         or v.semnatura = c.semn
       )
  ),
  pe_cerut as (
    select distinct p.cerut, i.product_id
      from potrivite p
      join public.catalog_index_cuvant i
        on i.business_id = p_business and i.cuvant = p.cuvant
  ),
  gasite as (
    select g.product_id
      from pe_cerut g
     group by g.product_id
    having count(*) = (select count(*) from cerute)
    union
    -- Produsele gasite dupa COD. Vezi antetul migratiei 2027-01-30.
    select c.product_id
      from public.catalog_produs c
     where c.business_id = p_business
       and public.catalog_potriveste_cod(c.coduri, array_to_string(coalesce(p_cuvinte, '{}'::text[]), ''))
  ),
  filtru as (
    select coalesce((p_filtre->>'faraImagini')::boolean, false)     as fara_img,
           coalesce((p_filtre->>'faraStocAscuns')::boolean, false)  as fara_stoc_ascuns,
           case when jsonb_typeof(p_filtre->'categorii') = 'array'
                then (select array_agg(x #>> '{}') from jsonb_array_elements(p_filtre->'categorii') x)
                else null end                                      as categorii,
           public.categorii_ascunse(p_business)                     as ascunse,
           nullif(p_filtre->>'pretMin', '')::numeric               as pmin,
           nullif(p_filtre->>'pretMax', '')::numeric               as pmax,
           coalesce((p_filtre->>'reduceri')::boolean, false)        as reduceri,
           coalesce((p_filtre->>'stoc')::boolean, false)            as stoc,
           case when jsonb_typeof(p_filtre->'fatete') = 'array'
                then p_filtre->'fatete' else '[]'::jsonb end        as grupuri
  )
  select c.product_id
    from public.catalog_produs c
    join gasite g on g.product_id = c.product_id
   cross join filtru f
   where c.business_id = p_business
     and (not f.fara_img or c.are_imagine)
     and (not f.fara_stoc_ascuns or not c.fara_stoc)
     and (c.category is null or c.category <> all (f.ascunse))
     and (f.categorii is null or c.category = any (f.categorii))
     and (f.pmin is null or c.price_min >= f.pmin)
     and (f.pmax is null or c.price_min <= f.pmax)
     and (not f.reduceri or (c.compare_at_price is not null and c.compare_at_price > c.price_min))
     and (not f.stoc or not c.fara_stoc)
     and (
       jsonb_array_length(f.grupuri) = 0
       or not exists (
         select 1
           from jsonb_array_elements(f.grupuri) g2
          where jsonb_typeof(g2) = 'array'
            and not (c.fatete && (select array_agg(x #>> '{}') from jsonb_array_elements(g2) x))
       )
     )
$function$;

create or replace function public.catalog_cauta(p_business uuid, p_cuvinte text[], p_filtre jsonb, p_plafon integer default 3000)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp', 'extensions'
as $function$
declare
  v_plafon    int := least(greatest(coalesce(p_plafon, 3000), 1), 6000);
  v_vocabular int;
  v_nr        int;
  v_out       jsonb;
begin
  if not exists (
    select 1 from public.businesses b
     where b.id = p_business and (b.is_published or b.user_id = auth.uid())
  ) then
    return jsonb_build_object('randuri', '[]'::jsonb, 'vocabular', 0, 'prea_larg', false, 'cuvant_scurt', false);
  end if;

  select count(*) into v_vocabular from public.catalog_cuvant where business_id = p_business;
  if v_vocabular = 0 then
    return jsonb_build_object('randuri', '[]'::jsonb, 'vocabular', 0, 'prea_larg', false, 'cuvant_scurt', false);
  end if;

  -- ⚠ Un cuvant scurt nu mai inchide cautarea cand interogarea e un COD gasit: „C494" se
  -- tokenizeaza „c" + „494". Fara potrivire de cod, purtarea e cea de pana acum.
  if exists (select 1 from unnest(coalesce(p_cuvinte, '{}'::text[])) w where length(w) < 3)
     and not exists (
       select 1 from public.catalog_produs c
        where c.business_id = p_business
          and public.catalog_potriveste_cod(c.coduri, array_to_string(coalesce(p_cuvinte, '{}'::text[]), ''))
     ) then
    return jsonb_build_object('randuri', '[]'::jsonb, 'vocabular', v_vocabular,
                              'prea_larg', false, 'cuvant_scurt', true);
  end if;

  select count(*) into v_nr from public.catalog_candidati(p_business, p_cuvinte, p_filtre);
  if v_nr > v_plafon then
    return jsonb_build_object('randuri', '[]'::jsonb, 'vocabular', v_vocabular, 'prea_larg', true, 'cuvant_scurt', false);
  end if;

  select coalesce(
           jsonb_agg(to_jsonb(c) - 'business_id' - 'cauta_norm' - 'proiectat_la'),
           '[]'::jsonb)
    into v_out
    from public.catalog_produs c
    join public.catalog_candidati(p_business, p_cuvinte, p_filtre) k
      on k.product_id = c.product_id;

  return jsonb_build_object(
    'randuri', coalesce(v_out, '[]'::jsonb),
    'vocabular', v_vocabular,
    'prea_larg', false,
    'cuvant_scurt', false);
end;
$function$;

-- Schimbarea DOAR a SKU-ului produsului trebuie sa-l reproiecteze, altfel codul vechi ramane
-- in cautare. Pana acum `sku` nu era nici in lista declansatorului, nici in `v_doar_stoc`.
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
      and new.slug         is not distinct from old.slug
      and new.sku          is not distinct from old.sku;
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

drop trigger if exists products_catalog_proiectie on public.products;
create trigger products_catalog_proiectie
  after insert or delete or update of name, slug, description, price, compare_at_price, images, category,
    tags, is_featured, is_active, is_bundle, track_inventory, stock_quantity, sort_order, page_sections, sku
  on public.products for each row execute function public.trg_catalog_proiectie();

notify pgrst, 'reload schema';

-- ═══ DUPA DEPLOY (nu in migratie): proiectorul nou scrie codurile ═══
-- insert into public.catalog_murdar (product_id, business_id)
-- select product_id, business_id from public.catalog_produs
-- on conflict (product_id) do update set marcat_la = now();

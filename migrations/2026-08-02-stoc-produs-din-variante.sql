-- Stocul unui produs cu variante ESTE suma variantelor lui.
--
-- Pana acum erau doua contabilitati pentru aceeasi marfa: `stock_quantity` pe
-- produs si `stock_quantity` pe fiecare combinatie, tinute amandoua de mana.
-- Feedul de stocuri scrie numai pe variante si nu atinge niciodata coloana, iar
-- formularul de produs cere un numar separat, asa ca cele doua se departasera
-- deja: din 1.102 produse care isi declara stocul pe toate variantele, 429 aveau
-- coloana diferita de suma.
--
-- Directia care doare e coloana MAI MICA decat suma: produsul se declara
-- „Stoc epuizat" desi marimile lui au marfa, si nu se mai poate cumpara nimic
-- din el. Erau 114 produse pe drumul asta si unul deja ajuns acolo, publicat.
--
-- Solutia nu e sa invatam zece locuri care citesc stocul (catalog, carduri,
-- cautare, date structurate, oferte, panou, feeduri) sa adune singure
-- variantele, ci sa facem numarul din coloana ADEVARAT. Asa toti cititorii de
-- azi si de maine sunt corecti fara sa stie nimic despre asta.

create or replace function public.sync_product_stock_from_variants()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_active  int;
  v_cu_numar int;
  v_suma    int;
begin
  -- La UPDATE se recalculeaza NUMAI cand s-au schimbat chiar variantele.
  --
  -- Fara conditia asta, orice scriere pe `stock_quantity` ar fi anulata la loc
  -- de suma. Cazul concret: un pachet care contine un produs cu variante.
  -- Vanzarea pachetului scade stocul componentei, dar nu spune din ce marime,
  -- deci variantele raman cum erau — iar recalcularea ar pune scaderea inapoi.
  -- Azi nu exista niciun pachet cu asemenea componenta, dar poate exista maine.
  if tg_op = 'UPDATE'
     and new.page_sections->'variants' is not distinct from old.page_sections->'variants' then
    return new;
  end if;

  if coalesce((new.page_sections->'variants'->>'enabled')::boolean, false) is not true
     or jsonb_typeof(new.page_sections->'variants'->'combinations') <> 'array' then
    return new;
  end if;

  select count(*) filter (where (c->>'enabled')::boolean is true),
         count(*) filter (where (c->>'enabled')::boolean is true
                            and (c->>'stock_quantity') ~ '^\s*\d+(\.\d+)?\s*$'),
         coalesce(sum(case when (c->>'enabled')::boolean is true
                            and (c->>'stock_quantity') ~ '^\s*\d+(\.\d+)?\s*$'
                           then floor((c->>'stock_quantity')::numeric)::int end), 0)
    into v_active, v_cu_numar, v_suma
  from jsonb_array_elements(new.page_sections->'variants'->'combinations') as c;

  -- Numai cand TOATE combinatiile active isi declara stocul.
  --
  -- Una singura fara numar inseamna „nelimitata", iar o suma partiala ar plafona
  -- produsul intreg la cat au celelalte si l-ar inchide cand ele se termina.
  -- In productie impartirea e curata: 1.102 produse au numar peste tot si ZERO
  -- au doar pe unele.
  if v_active = 0 or v_cu_numar <> v_active then
    return new;
  end if;

  new.stock_quantity := v_suma;
  return new;
end;
$$;

-- Numele incepe cu `p`, deci se aseaza inaintea lui `set_products_updated_at`
-- (declansatoarele BEFORE ruleaza in ordine alfabetica). Nu conteaza pentru
-- corectitudine, dar e bine stiut cand cineva mai adauga unul.
drop trigger if exists products_sync_variant_stock on public.products;
create trigger products_sync_variant_stock
  before insert or update on public.products
  for each row execute function public.sync_product_stock_from_variants();

-- Aducerea la zi a produselor existente.
--
-- `is distinct from` lasa neatinse cele 385 care erau deja corecte: fiecare rand
-- scris ar mai bate o data si `updated_at`.
with sume as (
  select p.id,
         count(*) filter (where (c->>'enabled')::boolean is true) as active,
         count(*) filter (where (c->>'enabled')::boolean is true
                            and (c->>'stock_quantity') ~ '^\s*\d+(\.\d+)?\s*$') as cu_numar,
         coalesce(sum(case when (c->>'enabled')::boolean is true
                            and (c->>'stock_quantity') ~ '^\s*\d+(\.\d+)?\s*$'
                           then floor((c->>'stock_quantity')::numeric)::int end), 0) as suma
  from products p,
       lateral jsonb_array_elements(p.page_sections->'variants'->'combinations') as c
  where jsonb_typeof(p.page_sections->'variants'->'combinations') = 'array'
    and (p.page_sections->'variants'->>'enabled')::boolean is true
  group by p.id
)
update products p
set stock_quantity = s.suma
from sume s
where p.id = s.id
  and s.active > 0
  and s.cu_numar = s.active
  and p.stock_quantity is distinct from s.suma;

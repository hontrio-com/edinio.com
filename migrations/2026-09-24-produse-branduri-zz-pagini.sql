-- ═══════════════════════════════════════════════════════════════════════════
-- BRANDURILE IN MAGAZIN: logo, descriere, pagina fiecarui brand   (24.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Pasul 3 din planul brandurilor, cerut de proprietar: „Fa-le pe toate 3”.
-- Vine DUPA `2026-09-24-produse-branduri-z-lista.sql` (58).
--
-- ⚠ Pagina unui brand e pagina de catalog filtrata pe jetonul `brand` din
-- `catalog_produs.fatete` (acelasi pe care il scrie proiectorul pentru filtrul
-- „Brand”). Jetonul exista pe FIECARE produs cu brand, oricare ar fi pragurile
-- filtrului din bara laterala (min. 2 produse, min. 2 branduri, max. 40), deci
-- pagina merge si la un magazin cu un singur brand.

alter table public.brands add column if not exists logo_url text;
alter table public.brands add column if not exists description text;

alter table public.brands drop constraint if exists brands_logo_https;
alter table public.brands add constraint brands_logo_https
  check (logo_url is null or (logo_url ~ '^https://' and char_length(logo_url) <= 1000));
alter table public.brands drop constraint if exists brands_descriere_lungime;
alter table public.brands add constraint brands_descriere_lungime
  check (description is null or char_length(description) <= 5000);

-- ═══ 1. Redenumirea pastreaza logo-ul si descrierea ═════════════════════════
--
-- In 58 numele nou se INSERA si randul vechi se stergea, deci logo-ul si
-- descrierea s-ar fi pierdut la prima redenumire. Acum:
--   * daca numele nou exista deja in lista, el ramane (unire: tinta isi pastreaza
--     logo-ul), doar i se aliniaza forma de majuscule;
--   * altfel, daca brandul vechi nu mai are produse, randul LUI se redenumeste;
--   * altfel (alta forma a lui inca e folosita) se adauga un rand nou.
-- Stergerea randului vechi ramane regula din 58.

create or replace function public.produse_redenumeste_brandul(p_business uuid, p_vechi text, p_nou text)
returns setof uuid
language plpgsql volatile security invoker set search_path = '' as $$
declare
  v_vechi text := btrim(coalesce(p_vechi, ''));
  v_nou   text := nullif(left(btrim(coalesce(p_nou, '')), 120), '');
  v_vechi_folosit boolean;
begin
  return query
    select * from public.produse_seteaza_brandul(
      p_business,
      array(select p.id from public.products p
             where p.business_id = p_business
               and nullif(btrim(p.page_sections -> 'google' ->> 'brand'), '') = v_vechi),
      v_nou);

  v_vechi_folosit := exists (
    select 1 from public.products p
     where p.business_id = p_business
       and lower(nullif(btrim(p.page_sections -> 'google' ->> 'brand'), '')) = lower(v_vechi));

  if v_nou is not null then
    if exists (select 1 from public.brands l where l.business_id = p_business and lower(l.name) = lower(v_nou)) then
      update public.brands l set name = v_nou
       where l.business_id = p_business and lower(l.name) = lower(v_nou) and l.name <> v_nou;
    elsif not v_vechi_folosit
      and exists (select 1 from public.brands l where l.business_id = p_business and lower(l.name) = lower(v_vechi)) then
      update public.brands l set name = v_nou
       where l.business_id = p_business and lower(l.name) = lower(v_vechi);
    else
      insert into public.brands (business_id, name) values (p_business, v_nou)
        on conflict (business_id, lower(name)) do nothing;
    end if;
  end if;

  delete from public.brands l
   where l.business_id = p_business
     and lower(l.name) = lower(v_vechi)
     and lower(l.name) <> lower(coalesce(v_nou, ''))
     and not v_vechi_folosit;
end $$;

-- ═══ 2. Logo si descriere, din panou ═══════════════════════════════════════
--
-- Un brand purtat doar de produse n-are inca rand in lista: il primeste acum.
-- `security invoker`: RLS-ul de pe `brands` (numai proprietarul) margineste scrierea.

create or replace function public.brand_salveaza_detalii(p_business uuid, p_nume text, p_logo text, p_descriere text)
returns void
language sql volatile security invoker set search_path = '' as $$
  insert into public.brands (business_id, name, logo_url, description)
  values (p_business, left(btrim(p_nume), 120), nullif(btrim(coalesce(p_logo, '')), ''), nullif(btrim(coalesce(p_descriere, '')), ''))
  on conflict (business_id, lower(name)) do update
    set logo_url = excluded.logo_url, description = excluded.description;
$$;

-- ═══ 3. Brandurile, asa cum le vede VIZITATORUL ════════════════════════════
--
-- Pentru paginile de brand si pentru sitemap. Toate brandurile cunoscute (de pe
-- produse, oricare ar fi starea lor, si din lista), fiecare cu:
--   * `produse`: cate produse VIZIBILE are, numarate EXACT ca `catalog_pagina`
--     (produse active din proiectie, comutatoarele magazinului, categoriile
--     stinse). 0 = pagina exista, dar nu se indexeaza si nu intra in sitemap;
--   * logo-ul si descrierea din lista.
-- Jetonul poarta valoarea normalizata de proiector (spatii stranse, cel mult 60
-- de caractere), deci potrivirea se face pe aceeasi forma.
--
-- ⚠ Numai `service_role`: se cheama de pe server, pentru un magazin deja verificat
-- ca publicat. `catalog_produs` n-are politici, deci oricum n-ar merge altfel.

create or replace function public.catalog_branduri(p_business uuid, p_fara_imagini boolean, p_fara_stoc_ascuns boolean)
returns table (brand text, produse bigint, logo_url text, descriere text)
language sql stable security invoker set search_path = '' as $$
  with ascunse as (select public.categorii_ascunse(p_business) as a),
  vizibile as (
    select substr(t, 7) as b, count(*) as n
      from public.catalog_produs c
      cross join ascunse
      cross join lateral unnest(c.fatete) t
     where c.business_id = p_business
       and (not coalesce(p_fara_imagini, false) or c.are_imagine)
       and (not coalesce(p_fara_stoc_ascuns, false) or not c.fara_stoc)
       and (c.category is null or c.category <> all (ascunse.a))
       and left(t, 6) = 'brand' || chr(1)
     group by 1
  ),
  toate as (
    select b.brand from public.produse_branduri(p_business) b
  )
  select t.brand, coalesce(v.n, 0), l.logo_url, l.description
    from toate t
    left join vizibile v on v.b = regexp_replace(t.brand, '\s+', ' ', 'g')
    left join public.brands l on l.business_id = p_business and lower(l.name) = lower(t.brand)
   order by coalesce(v.n, 0) desc, lower(t.brand), t.brand;
$$;

-- ═══ Drepturile ═══════════════════════════════════════════════════════════════

do $$
declare f text;
begin
  foreach f in array array[
    'public.produse_redenumeste_brandul(uuid, text, text)',
    'public.brand_salveaza_detalii(uuid, text, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
    if has_function_privilege('anon', f, 'EXECUTE') then
      raise exception 'anon poate chema %', f;
    end if;
    if (select p.prosecdef from pg_proc p where p.oid = f::regprocedure) then
      raise exception '% trebuie sa fie security invoker (RLS-ul o margineste)', f;
    end if;
  end loop;

  revoke all on function public.catalog_branduri(uuid, boolean, boolean) from public, anon, authenticated;
  grant execute on function public.catalog_branduri(uuid, boolean, boolean) to service_role;
  if has_function_privilege('anon', 'public.catalog_branduri(uuid, boolean, boolean)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.catalog_branduri(uuid, boolean, boolean)', 'EXECUTE') then
    raise exception 'catalog_branduri e deschisa altcuiva decat service_role';
  end if;
end $$;

notify pgrst, 'reload schema';

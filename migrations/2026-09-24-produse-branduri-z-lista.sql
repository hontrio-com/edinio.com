-- ═══════════════════════════════════════════════════════════════════════════
-- BRANDURILE: lista proprie a magazinului, ca la categorii   (24.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Cerut de proprietar, dupa ce a vazut pagina Branduri: „utilizatorul nu poate
-- adauga de aici branduri si eventual ulterior sa le poata aplica la produse? Cum
-- e la categorii de exemplu".
--
-- Vine DUPA `2026-09-24-produse-branduri.sql` (57), pe care o completeaza.
--
-- ⚠⚠ Produsul isi pastreaza brandul unde il avea: `page_sections.google.brand`,
-- ca text, exact cum isi tine si categoria (`products.category`, text, cu lista in
-- `categories`). Acolo il citesc feedurile si marketplace-urile, deci nu se muta.
-- Tabela e numai LISTA magazinului: un brand poate exista inainte sa fie pus pe
-- vreun produs. Pagina Branduri arata reuniunea: brandurile de pe produse plus cele
-- din lista care n-au inca produse.
--
-- ⚠ Doua branduri care difera numai prin majuscule sunt ACELASI rand in lista
-- (index unic pe `lower(name)`), la fel cum formularul aduce „armaf" la „Armaf".

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  constraint brands_name_curat check (name = btrim(name) and char_length(name) between 1 and 120)
);

create unique index if not exists brands_business_nume_key on public.brands (business_id, lower(name));

alter table public.brands enable row level security;

drop policy if exists "Owners manage own brands" on public.brands;
create policy "Owners manage own brands" on public.brands
  for all to authenticated
  using (business_id in (select b.id from public.businesses b where b.user_id = (select auth.uid())))
  with check (business_id in (select b.id from public.businesses b where b.user_id = (select auth.uid())));

-- ⚠ Nicio citire publica deocamdata: vitrina nu foloseste lista (paginile de brand
-- din magazin vin separat, cu politica lor).
revoke all on table public.brands from public, anon, authenticated;
grant select, insert, update, delete on table public.brands to authenticated;
grant all on table public.brands to service_role;

-- ═══ 1. Brandurile magazinului: de pe produse, plus cele din lista fara produse ══
--
-- Aceeasi semnatura si acelasi tip intors ca in 57, deci `create or replace` e
-- de ajuns. Un rand din lista se ascunde cand exista pe produse un brand cu
-- acelasi nume in alte majuscule: pe ecran ramane forma de pe produse, care e si
-- cea din feeduri.

create or replace function public.produse_branduri(p_business uuid)
returns table (brand text, produse bigint)
language sql stable security invoker set search_path = '' as $$
  with numarate as (
    select x.b, count(*) as n
      from (select nullif(btrim(p.page_sections -> 'google' ->> 'brand'), '') as b
              from public.products p
             where p.business_id = p_business) x
     where x.b is not null
     group by x.b
  )
  select u.brand, u.produse
    from (select n.b as brand, n.n as produse from numarate n
          union all
          select l.name, 0::bigint
            from public.brands l
           where l.business_id = p_business
             and not exists (select 1 from numarate n where lower(n.b) = lower(l.name))) u
   order by lower(u.brand), u.brand;
$$;

-- ═══ 2. Redenumirea, unirea si stergerea tin si lista la zi ══════════════════
--
-- Produsele se schimba ca in 57. Apoi:
--   * numele nou intra in lista (sau, daca exista in alte majuscule, ii ia forma);
--   * randul vechi pleaca NUMAI daca nu mai are niciun produs, in nicio forma de
--     majuscule: „Sterge ARMAF" nu scoate din lista „Armaf", care inca e folosit.

create or replace function public.produse_redenumeste_brandul(p_business uuid, p_vechi text, p_nou text)
returns setof uuid
language plpgsql volatile security invoker set search_path = '' as $$
declare
  v_vechi text := btrim(coalesce(p_vechi, ''));
  v_nou   text := nullif(left(btrim(coalesce(p_nou, '')), 120), '');
begin
  return query
    select * from public.produse_seteaza_brandul(
      p_business,
      array(select p.id from public.products p
             where p.business_id = p_business
               and nullif(btrim(p.page_sections -> 'google' ->> 'brand'), '') = v_vechi),
      v_nou);

  if v_nou is not null then
    insert into public.brands (business_id, name) values (p_business, v_nou)
      on conflict (business_id, lower(name)) do update set name = excluded.name;
  end if;

  delete from public.brands l
   where l.business_id = p_business
     and lower(l.name) = lower(v_vechi)
     and lower(l.name) <> lower(coalesce(v_nou, ''))
     and not exists (select 1 from public.products p
                      where p.business_id = p_business
                        and lower(nullif(btrim(p.page_sections -> 'google' ->> 'brand'), '')) = lower(v_vechi));
end $$;

-- ═══ Drepturile ═══════════════════════════════════════════════════════════════

do $$
declare f text;
begin
  foreach f in array array[
    'public.produse_branduri(uuid)',
    'public.produse_redenumeste_brandul(uuid, text, text)'
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
  if has_table_privilege('anon', 'public.brands', 'SELECT') then
    raise exception 'anon poate citi public.brands';
  end if;
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.brands'::regclass) then
    raise exception 'public.brands fara RLS';
  end if;
end $$;

notify pgrst, 'reload schema';

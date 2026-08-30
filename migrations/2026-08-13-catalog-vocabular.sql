-- Vocabularul de cautare: cuvintele distincte ale unui magazin.
--
-- DE CE. Prima incercare de cautare pe server a potrivit trigramele pe
-- `cauta_norm`, care e un DOCUMENT (nume + categorie + optiuni + descriere). Nu
-- merge, si testul de recall a aratat-o imediat: `similarity` intre un cuvant
-- scurt si un text lung e aproape zero INTOTDEAUNA, deci „bocani" scris gresit
-- intorcea ZERO candidati, iar `like '%bocani%'` nu gaseste „bocanci".
--
-- Pe CUVINTE, trigramele merg. Si scaleaza, fiindca vocabularul creste mult mai
-- incet decat catalogul: eSAFE 3.351 produse -> 7.827 cuvinte, bricosmart 1.049
-- -> 3.740, nordic 468 -> 264. La 100.000 de produse, ~40.000 de cuvinte.
--
-- DOUA CAI DE POTRIVIRE, fiindca una singura nu ajunge:
--   * trigrame  — pentru litere schimbate, adaugate sau lipsa
--   * SEMNATURA — literele sortate. O transpozitie NU o schimba („csaca" si
--     „casca" dau amandoua „aaccs"), iar trigramele tocmai la transpozitii cad:
--     masurat, `csaca` nu gasea `casca` la niciun prag rezonabil, iar `vesat` nu
--     gasea `vesta`. Motorul TS le trateaza explicit (Damerau-Levenshtein include
--     transpozitia adiacenta), deci fara asta candidatii ar fi fost mai saraci
--     decat ce gaseste cautarea de azi.
--
-- Scorul si ordinea NU se calculeaza aici. Raman in `product-search.ts`, rulate
-- pe candidati — asa ranking-ul e identic prin CONSTRUCTIE, nu prin speranta.

create table if not exists public.catalog_cuvant (
  business_id uuid not null references public.businesses(id) on delete cascade,
  cuvant      text not null,
  cate        integer not null default 0,
  primary key (business_id, cuvant)
);
alter table public.catalog_cuvant enable row level security;
create index if not exists cw_trgm on public.catalog_cuvant using gin (cuvant extensions.gin_trgm_ops);

create or replace function public.semnatura_cuvant(w text) returns text
language sql immutable parallel safe as $$
  select string_agg(c, '' order by c) from regexp_split_to_table(w, '') c
$$;

alter table public.catalog_cuvant
  add column if not exists semnatura text generated always as (public.semnatura_cuvant(cuvant)) stored;
create index if not exists cw_semn on public.catalog_cuvant (business_id, semnatura);

-- Despicarea oglindeste `tokenize()` din product-search.ts: intai granitele
-- litera/cifra („iphone15" -> „iphone 15"), apoi orice nu e litera sau cifra.
-- `cauta_norm` e deja fara diacritice si cu litere mici, din TS.
-- Prima versiune despica doar pe spatiu, si punctuatia ramanea lipita: `manusa`,
-- `manusa,` si `manusa.` erau trei cuvinte. Umfla vocabularul cu ~30%.
create or replace function public.catalog_reface_cuvinte(p_business uuid)
returns int
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare v_nr int;
begin
  create temporary table if not exists _cuv (cuvant text, cate int) on commit drop;
  delete from _cuv;
  insert into _cuv (cuvant, cate)
  select w, count(distinct c.product_id)
    from public.catalog_produs c
    cross join lateral regexp_split_to_table(
      regexp_replace(regexp_replace(c.cauta_norm, '([0-9])([a-z])', '\1 \2', 'g'),
                     '([a-z])([0-9])', '\1 \2', 'g'), '[^a-z0-9]+') w
   where c.business_id = p_business and length(w) >= 3
   group by w;
  delete from public.catalog_cuvant
   where business_id = p_business and cuvant not in (select cuvant from _cuv);
  insert into public.catalog_cuvant (business_id, cuvant, cate)
  select p_business, cuvant, cate from _cuv
  on conflict (business_id, cuvant) do update set cate = excluded.cate;
  select count(*) into v_nr from _cuv;
  return v_nr;
end;
$$;

revoke all on function public.catalog_reface_cuvinte(uuid) from public, anon, authenticated;
grant execute on function public.catalog_reface_cuvinte(uuid) to service_role;

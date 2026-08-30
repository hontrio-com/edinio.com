-- `catalog_reface_cuvinte` esua TACUT ori de cate ori o chema cronul.
--
-- Simptomul, din logurile de runtime:
--   [cuvinte] <business_id>: DELETE requires a WHERE clause
--
-- Cauza: rolul `service_role` ruleaza cu paza „safeupdate", care respinge orice
-- DELETE fara WHERE. Functia incepea cu `delete from _per;` — o tabela TEMPORARA,
-- unde un DELETE gol pare cu totul inofensiv — si arunca acolo, inainte sa apuce
-- sa faca ceva.
--
-- DE CE N-A IESIT LA IVEALA PANA ACUM. Rulata de mana din consola, functia MERGE:
-- acolo rolul e altul si n-are paza. Asa au capatat vocabular cele patru magazine
-- mari, si asa am „verificat" ca merge. Din cron, unde chiar conteaza, n-a mers
-- niciodata — iar rezultatul arata identic cu „magazinul asta n-are ce indexa".
--
-- Efectul real: indexul de cautare al oricarui magazin ramanea inghetat la ce
-- fusese construit manual. Un produs nou nu devenea niciodata gasibil, fara nicio
-- eroare vizibila. `cautaPeServer` cade pe calea veche cand vocabularul lipseste,
-- deci cautarea nu se rupea — doar imbatranea.
--
-- Dupa reparatie, verificat: coada golita, 48 de magazine cu vocabular (erau 4),
-- 20.483 de cuvinte, 162.228 de perechi.
create or replace function public.catalog_reface_cuvinte(p_business uuid)
returns int language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare v_nr int;
begin
  create temporary table if not exists _per (cuvant text, product_id uuid) on commit drop;
  -- `where true` nu e decor: vezi antetul.
  delete from _per where true;
  insert into _per (cuvant, product_id)
  select distinct w, c.product_id
    from public.catalog_produs c
    cross join lateral regexp_split_to_table(
      regexp_replace(regexp_replace(c.cauta_norm, '([0-9])([a-z])', '\1 \2', 'g'),
                     '([a-z])([0-9])', '\1 \2', 'g'), '[^a-z0-9]+') w
   where c.business_id = p_business and length(w) >= 3;

  delete from public.catalog_cuvant
   where business_id = p_business and cuvant not in (select cuvant from _per);
  insert into public.catalog_cuvant (business_id, cuvant, cate)
  select p_business, cuvant, count(*) from _per group by cuvant
  on conflict (business_id, cuvant) do update set cate = excluded.cate;

  delete from public.catalog_index_cuvant i
   where i.business_id = p_business
     and not exists (select 1 from _per p where p.cuvant = i.cuvant and p.product_id = i.product_id);
  insert into public.catalog_index_cuvant (business_id, cuvant, product_id)
  select p_business, cuvant, product_id from _per on conflict do nothing;

  select count(distinct cuvant) into v_nr from _per;
  return v_nr;
end;
$$;
revoke all on function public.catalog_reface_cuvinte(uuid) from public, anon, authenticated;
grant execute on function public.catalog_reface_cuvinte(uuid) to service_role;
notify pgrst, 'reload schema';

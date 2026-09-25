-- ═══════════════════════════════════════════════════════════════════════════
-- DOMENIUL PROPRIU AL UNUI MAGAZIN NEPUBLICAT: proxy-ul il vede   (25.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Raportat de proprietar: pe `jhbijouxmagazin.ro` (magazinul `jhbijuterii`, domeniu
-- legat corect, magazin inca NEPUBLICAT) aparea „Acest domeniu nu este conectat la
-- niciun magazin”. Deci exact mesajul care trimite pe toata lumea sa caute o legatura
-- rupta care nu exista (vezi comentariul din `proxy.ts`, 24.08.2026, okxi.ro).
--
-- ⚠ CAUZA: proxy-ul cauta domeniul cu cheia ANONIMA, iar RLS-ul de pe `businesses`
-- („Public can view published businesses”) ii arata numai magazinele PUBLICATE. Deci
-- reparatia din 24.08 („`is_published` se citeste, nu se filtreaza”) n-a lucrat
-- niciodata: filtrul il facea RLS-ul, tacut. Proba proxy-ului n-a prins, fiindca baza ei
-- falsa intorcea si randurile nepublicate.
--
-- REPARATIA: o functie ingusta, `security definer`, data lui `anon`, care intoarce
-- pentru domeniile cerute NUMAI ce trebuie ecranului: slug, domeniu, daca e publicat,
-- numele, logo-ul si culoarea magazinului. Nimic din ce nu se vede oricum pe vitrina
-- (numele si logo-ul le arata si pagina „in curand” de pe platforma).
--
-- ⚠ Cel mult 4 domenii pe apel (proxy-ul trimite 1 sau 2: domeniul si perechea fara
-- `www.`), ca functia sa nu devina o unealta de listat magazine.

create or replace function public.domeniu_pentru_proxy(p_domenii text[])
returns table (slug text, custom_domain text, is_published boolean, nume text, logo_url text, culoare text)
language sql stable security definer set search_path = '' as $$
  select b.slug, b.custom_domain, coalesce(b.is_published, false),
         coalesce(nullif(btrim(b.store_name), ''), b.business_name),
         b.logo_url, b.primary_color
    from public.businesses b
   where b.custom_domain = any (p_domenii[1:4])
     and b.custom_domain is not null;
$$;

do $$
begin
  revoke all on function public.domeniu_pentru_proxy(text[]) from public;
  grant execute on function public.domeniu_pentru_proxy(text[]) to anon, authenticated, service_role;
  if not (select p.prosecdef from pg_proc p where p.oid = 'public.domeniu_pentru_proxy(text[])'::regprocedure) then
    raise exception 'domeniu_pentru_proxy trebuie sa fie security definer: RLS-ul ascunde magazinele nepublicate';
  end if;
end $$;

notify pgrst, 'reload schema';

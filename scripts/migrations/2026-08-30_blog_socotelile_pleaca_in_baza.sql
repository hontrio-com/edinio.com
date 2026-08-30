-- Trei liste se socoteau in JavaScript, din randurile care se nimereau sa fie in
-- mana, si toate trei minteau in tacere.
--
-- Din auditul din 30.08.2026: #11, #15, #30, #34.

-- ═══ ETICHETELE ═══
--
-- `eticheteFolosite()` cerea id-urile TUTUROR articolelor publicate, apoi
-- legaturile lor cu `.in("post_id", idUri)`. Doua plafoane tacute pe acelasi
-- drum: PostgREST taie la 1000 de randuri fara sa spuna nimic, deci de la al
-- 1001-lea articol lista devenea gresita, si nimic n-ar fi dat eroare. Aceeasi
-- capcana ca in cronuri: o taietura pusa inaintea adunarii.
--
-- ⚠ SI SE SAR ARTICOLELE `noindex`. Pana acum nu se sareau, deci o eticheta ale
-- carei articole erau TOATE `noindex` ajungea in sitemap si in lista de sub
-- articole. Adica ii spuneam lui Google „uite o pagina" si, cand venea, gasea pe
-- ea numai lucruri despre care ii ceruseram sa nu le indexeze.
--
-- ⚠ `ultima` e pentru `lastModified` din sitemap. Fara ea, toate paginile de
-- eticheta spuneau „s-a schimbat chiar acum", la fiecare cerere — iar un sitemap
-- care spune asta despre tot nu mai spune nimic despre nimic.
--
-- ⚠ `security invoker` (implicit), nu `definer`. Se cheama cu cheia anonima de pe
-- paginile publice, deci RLS ramane plasa: chiar daca `where`-ul de aici ar fi
-- scris gresit candva, `blog_posts_public_read` tot n-ar lasa o ciorna sa iasa.
create or replace function public.blog_etichete_folosite()
returns table (slug text, name text, cate bigint, ultima timestamptz)
language sql
stable
set search_path = public, pg_temp
as $$
  select t.slug, t.name, count(*) as cate, max(p.published_at) as ultima
  from public.blog_tags t
  join public.blog_post_tags pt on pt.tag_id = t.id
  join public.blog_posts p      on p.id = pt.post_id
  where p.status = 'published'
    and p.published_at is not null
    and p.published_at <= now()
    and p.noindex is not true
  group by t.slug, t.name
  order by t.name;
$$;

-- ═══ RUBRICILE ═══
--
-- Pagina `/blog` isi facea lista de rubrici din articolele PAGINII CURENTE, desi
-- comentariul de langa spunea „pe TOATE articolele". Urmarea: navigatia se
-- schimba sub picioarele omului de la o pagina la alta, iar o rubrica ale carei
-- articole erau abia in pagina 3 nu se vedea de nicaieri.
create or replace function public.blog_categorii_folosite()
returns table (slug text, name text, cate bigint)
language sql
stable
set search_path = public, pg_temp
as $$
  select c.slug, c.name, count(*) as cate
  from public.blog_categories c
  join public.blog_posts p on p.category_id = c.id
  where p.status = 'published'
    and p.published_at is not null
    and p.published_at <= now()
  group by c.slug, c.name, c.sort_order
  order by c.sort_order, c.name;
$$;

-- ═══ SUBIECTELE UNUI AUTOR ═══
--
-- `knowsAbout` din datele structurate se socotea tot din pagina curenta, deci
-- aceeasi persoana avea alte competente pe pagina 1 fata de pagina 2. Un `@id`
-- care descrie de fiecare data altceva nu e o identitate, e zgomot — iar
-- identitatea autorului e tocmai ce trebuie sa dovedeasca pagina aceea.
create or replace function public.blog_subiectele_autorului(p_autor uuid)
returns table (name text)
language sql
stable
set search_path = public, pg_temp
as $$
  select distinct c.name
  from public.blog_categories c
  join public.blog_posts p on p.category_id = c.id
  where p.author_id = p_autor
    and p.status = 'published'
    and p.published_at is not null
    and p.published_at <= now()
  order by c.name;
$$;

grant execute on function public.blog_etichete_folosite()        to anon, authenticated, service_role;
grant execute on function public.blog_categorii_folosite()       to anon, authenticated, service_role;
grant execute on function public.blog_subiectele_autorului(uuid) to anon, authenticated, service_role;

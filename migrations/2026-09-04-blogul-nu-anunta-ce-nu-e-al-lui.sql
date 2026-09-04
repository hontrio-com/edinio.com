-- ═══════════════════════════════════════════════════════════════════════════
-- Blogul nu anunta ca al lui un text al carui original e in alta parte
-- 04.09.2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ DE CE: REGULA EXISTA DEJA, DAR NUMAI IN TYPESCRIPT.
--
-- Pe 04.09.2026 a aparut `anuntabil()` in `src/app/sitemap.ts`: un articol cu
-- `canonical_url` completat spune ca originalul e in ALTA PARTE, deci nu-l mai
-- anuntam noi ca fiind al nostru. Filtrul a fost pus in sitemap si in
-- `llms.txt` — adica in DOUA din cele PATRU locuri prin care ARATAM MASINILOR
-- articolele ca fiind ale noastre. Celelalte doua traiesc aici, in SQL, si
-- filtrau doar `noindex`:
--
--   * `blog_articole_pentru_feed` — fluxul RSS de la `/blog/feed`. Publica
--     articolul cu `<link>` si `<guid isPermaLink="true">` pe adresa NOASTRA:
--     adica exact afirmatia „originalul e la noi", pe care sitemapul tocmai o
--     retrasese. Cea mai contradictorie dintre cele patru.
--
--   * `blog_etichete_folosite` — de aici isi ia sitemapul paginile de eticheta.
--     O eticheta al carei singur purtator e un articol republicat ramanea
--     anuntata: o pagina al carei intreg continut e chiar textul despre care i-am
--     spus lui Google ca nu e al nostru.
--
-- ⚠ SI DOUA FUNCTII PE CARE LE-AM ATINS SI APOI LE-AM DUS INAPOI.
--
-- `blog_categorii_folosite` (navigatia rubricilor de pe /blog) si
-- `blog_subiectele_autorului` (randul „Scrie despre: …" de pe pagina autorului si
-- `knowsAbout` din datele lui structurate) nu filtreaza nici azi nimic din astea
-- doua. Le pusesem si lor regula, cu motivul „o rubrica al carei singur articol e
-- `noindex` duce la o pagina goala".
--
-- ⚠ MOTIVUL ERA FALS, si l-am verificat abia dupa ce aplicasem: `articoleleCategoriei`,
-- `articoleleAutorului` si `articoleleEtichetei` NU filtreaza `noindex`, deci
-- pagina rubricii chiar arata articolul. `noindex` inseamna „nu indexa", nu
-- „ascunde de cititori" — iar cele doua functii sunt VIZIBILE pentru oameni.
-- Filtrandu-le, ascundeam de un cititor un articol pe care il poate deschide.
--
-- Deci s-au intors la corpurile lor de dinainte. Daca vreodata se vrea altfel, e
-- o hotarare de continut, cu urmare vizibila pe pagina, si nu e a mea. Faptul ca
-- raman dinadins pe dinafara e scris in `src/lib/blog/regula-canonical.test.ts`,
-- ca sa nu para o scapare si ca sa nu se strecoare acolo tacut.
--
-- ⚠ CE SE SCHIMBA IN PRODUCTIE AZI: NIMIC, si o spun ca sa nu para altfel.
-- Masurat inainte de scriere, cu cheia de serviciu: blogul are UN singur articol
-- publicat, zero cu `canonical_url` si zero cu `noindex`. Migratia e o plasa
-- pusa inainte sa cada cineva in ea, nu o reparatie de date.
--
-- ⚠ ACEEASI CONDITIE CA IN TYPESCRIPT — SI `btrim()` SIMPLU NU ERA ACEEASI.
--
--   TS:  !a.noindex && !a.canonical_url?.trim()
--   SQL: p.noindex is not true
--        and (p.canonical_url is null or btrim(p.canonical_url, SPATIILE_JS) = '')
--
-- Prima scriere a acestui fisier folosea `btrim(p.canonical_url)`, fara al doilea
-- argument. Masurat pe baza, caz cu caz: `btrim()` fara lista taie DOAR spatiul
-- obisnuit, in timp ce `.trim()` din JavaScript taie tot spatiul alb. Deci un
-- `canonical_url` format dintr-un TAB ar fi insemnat lucruri OPUSE in cele doua
-- locuri — TypeScript l-ar fi socotit gol (articolul se anunta), SQL l-ar fi
-- socotit adresa adevarata (articolul dispare din flux si din etichete). Exact
-- despartirea pe care fisierul asta a fost scris s-o inchida.
--
-- `SPATIILE_JS` e chiar multimea taiata de `.trim()`, si se scrie asa:
--
--     E' \t\n\r\f' || chr(11) || chr(160) || chr(65279)
--
-- adica spatiu, tab, linie noua, retur de car, form feed, apoi tab vertical,
-- spatiu nedespartit si BOM.
--
-- ⚠ ULTIMELE TREI PRIN `chr()`, SI ASTA NU E O PREFERINTA DE STIL. Scrise ca
-- secvente de forma bara-inversa-u-patru-cifre, au fost MANCATE de un strat JSON — masurat:
-- prima aplicare a ajuns acolo cu ele deja convertite in caractere adevarate.
-- Lipite ca atare in fisier, ar fi trei caractere INVIZIBILE intr-un `.sql`, pe
-- care le poate pierde tacut orice unealta care atinge fisierul. `chr()` e numai
-- ASCII in sursa si nu poate fi transformat de nimeni, pe niciun drum.
--
-- Verificat pe baza, la RULARE, ca lista da exact opt caractere:
-- 20 9 a d c b a0 feff. Si confruntata cu `.trim()` din JavaScript pe zece
-- intrari, toate zece la fel.

CREATE OR REPLACE FUNCTION public.blog_articole_pentru_feed(p_cate integer)
 RETURNS TABLE(slug text, title text, excerpt text, published_at timestamp with time zone, content_updated_at timestamp with time zone, autor text, categorie text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select p.slug, p.title, p.excerpt, p.published_at, p.content_updated_at,
         a.name as autor, c.name as categorie
  from public.blog_posts p
  left join public.blog_authors a    on a.id = p.author_id
  left join public.blog_categories c on c.id = p.category_id
  where p.status = 'published'
    and p.published_at is not null
    and p.published_at <= now()
    and p.noindex is not true
    -- Originalul e in alta parte: nu-l sindicalizam cu permalinkul nostru.
    and (p.canonical_url is null or btrim(p.canonical_url, E' \t\n\r\f' || chr(11) || chr(160) || chr(65279)) = '')
  -- ⚠ FARA `is_pinned`. Vezi nota de sus.
  order by p.published_at desc
  limit greatest(p_cate, 1);
$function$
;

CREATE OR REPLACE FUNCTION public.blog_etichete_folosite()
 RETURNS TABLE(slug text, name text, cate bigint, ultima timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select t.slug, t.name, count(*) as cate,
         max(greatest(p.published_at, p.content_updated_at)) as ultima
  from public.blog_tags t
  join public.blog_post_tags pt on pt.tag_id = t.id
  join public.blog_posts p      on p.id = pt.post_id
  where p.status = 'published'
    and p.published_at is not null
    and p.published_at <= now()
    and p.noindex is not true
    -- De aici isi ia sitemapul paginile de eticheta.
    and (p.canonical_url is null or btrim(p.canonical_url, E' \t\n\r\f' || chr(11) || chr(160) || chr(65279)) = '')
  group by t.slug, t.name
  order by t.name;
$function$
;


-- ⚠ `CREATE OR REPLACE` pe o functie care EXISTA ii pastreaza lista de drepturi,
-- deci randurile astea nu schimba nimic azi. Sunt scrise fiindca acelasi fisier
-- poate fi rulat pe o baza unde functia lipseste — si acolo ar fi creata cu
-- drepturile implicite ale proiectului, care nu sunt ale noastre.
-- Sunt EXACT cele din baseline, nici unul in plus.
grant execute on function public.blog_articole_pentru_feed(p_cate integer) to anon;
grant execute on function public.blog_articole_pentru_feed(p_cate integer) to authenticated;
grant execute on function public.blog_articole_pentru_feed(p_cate integer) to service_role;
grant execute on function public.blog_etichete_folosite() to anon;
grant execute on function public.blog_etichete_folosite() to authenticated;
grant execute on function public.blog_etichete_folosite() to service_role;

-- Fara asta, PostgREST tine minte semnaturile vechi pana la urmatoarea repornire.
NOTIFY pgrst, 'reload schema';

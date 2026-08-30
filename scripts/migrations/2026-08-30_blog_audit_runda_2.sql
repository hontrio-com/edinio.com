-- ═══════════════════════════════════════════════════════════════════════════
-- BLOG — RUNDA A DOUA DE AUDIT, 30.08.2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ ADEVARUL REPRODUCTIBIL E `migrations/000-schema-baseline.sql`, NU FISIERUL
-- ASTA. Vezi `migrations/CITESTE-INTAI.md`: fisierele cu data sunt ISTORIC si nu
-- se reaplica. Aici se scrie CE s-a schimbat si DE CE, ca sa se poata citi.
--
-- Invariantele care conteaza sunt probate de `scripts/tests/blog-integrare.mjs`,
-- care intreaba BAZA, nu fisierul asta. Daca cele doua se despart, proba aceea
-- cade — nu comentariul de aici.
--
-- Ce a gasit auditul si ce s-a facut:
--
--   #1  Fisierul de migratie ramasese cu `on conflict (from_slug)` dupa ce cheia
--       devenise `(fel, from_slug)`. In PRODUCTIE era deja reparat; in DEPOZIT
--       nu. Un fisier de migratie care nu descrie baza e mai rau decat unul care
--       lipseste: reaplicat, chiar strica.
--   #3  Doua file deschise pe acelasi articol: ultima scriere castiga, in tacere.
--   #4  Daca emailul de confirmare nu pleaca, jetonul ramanea viu 48h si blocase
--       orice reincercare.
--   #5  Crearea articolului nu era tranzactionala cu etichetele.
--   #6  Nici stergerea, cu redirectarile.
--   #7  Nici redenumirea unei rubrici sau a unui autor.
--   #8  Un cont putea fi legat de doi autori.
--   #9  Redactorul putea strecura o revizie inventata prin REST.
--   #10 `updated_at` se muta la orice bifa, si din el ieseau `dateModified`,
--       eticheta „Actualizat" si `lastModified` din sitemap.
--   #11 Fiecare salvare automata scria o revizie, deci cele 50 de sloturi se
--       umpleau in 25 de minute.
--   #13 Listele din admin citeau tot, cu plafonul tacut de 1000 de randuri.
--   #18 `blog_authors.user_id` pleca in fiecare pagina publica.
--
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Doua coloane noi pe articol ────────────────────────────────────────

-- Cine salveaza al doilea trebuie sa AFLE, nu sa scrie peste in tacere.
alter table public.blog_posts
  add column if not exists edit_version bigint not null default 1;

-- Ce inseamna cu adevarat „modificat". `updated_at` se muta la ORICE atingere
-- administrativa: ridici alt articol in vitrina si triggerul il coboara pe asta,
-- il fixezi, il ascunzi de Google, il arhivezi. Din el ieseau trei lucruri care
-- AJUNG LA GOOGLE. Coloana asta se muta doar cand se schimba ce citeste omul.
alter table public.blog_posts
  add column if not exists content_updated_at timestamptz not null default now();

update public.blog_posts set content_updated_at = updated_at
where content_updated_at > updated_at;

-- ⚠ COLOANELE SE ENUMERA PE NUME, SI ASTA E O ALEGERE, NU LENE.
--
-- Varianta scurta ar fi fost „daca s-a schimbat orice in afara de lista X".
-- Aceea imbatraneste prost: cine adauga maine o coloana administrativa noua o
-- vede socotita drept CONTINUT si nu afla niciodata — pagina incepe doar sa spuna
-- „Actualizat azi" mai des. Asa, o coloana noua nu misca data pana nu hotaraste
-- cineva ca e continut. Greseala se face in partea tacuta, nu in cea care minte.
create or replace function public.blog_continut_atins()
returns trigger language plpgsql as $$
begin
  if (new.title            is distinct from old.title)
  or (new.slug             is distinct from old.slug)
  or (new.excerpt          is distinct from old.excerpt)
  or (new.answer_summary   is distinct from old.answer_summary)
  or (new.content_html     is distinct from old.content_html)
  or (new.cover_url        is distinct from old.cover_url)
  or (new.cover_alt        is distinct from old.cover_alt)
  or (new.og_image_url     is distinct from old.og_image_url)
  or (new.author_id        is distinct from old.author_id)
  or (new.category_id      is distinct from old.category_id)
  or (new.cta              is distinct from old.cta)
  or (new.faq             is distinct from old.faq)
  or (new.seo_title        is distinct from old.seo_title)
  or (new.seo_description  is distinct from old.seo_description)
  or (new.canonical_url    is distinct from old.canonical_url)
  then
    new.content_updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists blog_posts_continut on public.blog_posts;
create trigger blog_posts_continut
  before update on public.blog_posts
  for each row execute function public.blog_continut_atins();

-- ── 2. Un cont, un singur autor ───────────────────────────────────────────
--
-- `autorulMeu()` cauta cu `.maybeSingle()`. Cu doua randuri legate de acelasi
-- cont, interogarea aceea nu alege gresit — CADE, iar articolul nou ramane fara
-- autor fara sa spuna de ce.
create unique index if not exists blog_authors_un_cont
  on public.blog_authors (user_id) where user_id is not null;

-- ── 3. Reviziile nu se mai scriu direct de redactor ───────────────────────
--
-- Aplicatia le scrie prin `blog_salveaza_articol`, cu cheia de serviciu. Deci
-- redactorul n-are nevoie de INSERT — dar il AVEA, si cu el putea strecura prin
-- REST o revizie inventata pentru orice articol, inclusiv publicat, cu `saved_by`
-- pus pe cine voia. Adica putea falsifica exact tabela care e proba a ce s-a
-- schimbat si cine a schimbat. Citirea ramane.
drop policy if exists blog_post_revisions_editor_insert on public.blog_post_revisions;

-- ── 4. Autorul nu-si mai arata contul in public ───────────────────────────
--
-- RLS verifica RANDURI, nu COLOANE. Deci `user_id` — identificatorul contului
-- Supabase al omului — pleca in fiecare pagina publica de autor.
--
-- ⚠ CODUL TREBUIE SA NUMEASCA DEJA COLOANELE (`CAMPURI_AUTOR` din `citire.ts`):
-- cu `select("*")`, Postgres nu intoarce mai putin, ci REFUZA interogarea
-- intreaga. Verificat cu cheia anonima adevarata: `select=*` da 42501.
revoke select on table public.blog_authors from anon;
grant select (
  id, slug, name, role_title, bio, avatar_url, sameas, created_at, updated_at
) on table public.blog_authors to anon;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. FUNCTIILE — SI DE CE CORPURILE LOR NU SUNT AICI
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ ASTA E O ALEGERE, LUATA DUPA CE PARTEA CEALALTA A DAT GRES.
--
-- Pana azi, fiecare migratie purta corpul intreg al functiei. Asa s-a nascut
-- defectul #1 din auditul de fata: `blog_salveaza_articol` a fost corectata in
-- productie printr-o a doua migratie, iar fisierul primei a ramas pe loc — cu
-- `on conflict (from_slug)`, care dupa schimbarea cheii ar strica baza daca l-ar
-- aplica cineva. Depozitul avea DOUA adevaruri despre aceeasi functie, si pe cel
-- gresit il citea mai intai.
--
-- Corpul unei functii se schimba des; o coloana, un index si o politica, aproape
-- niciodata. Deci al doilea fel de lucruri sta aici, iar primul sta ACOLO UNDE
-- ORICUM E ADEVARUL: `migrations/000-schema-baseline.sql`, regenerat din
-- productie la fiecare schimbare de schema.
--
-- Ce s-a schimbat, si unde se citeste:
--
--   public.blog_salveaza_articol(uuid, jsonb, jsonb, uuid, int, bigint, boolean)
--     Rescrisa. Isi citeste SINGURA starea veche, sub `for update` — inainte
--     primea slugul, titlul si HTML-ul vechi de la client, dintr-o citire facuta
--     in alta tranzactie. Verifica `p_versiune_asteptata` si ridica `P0409` daca
--     articolul s-a schimbat intre timp. Redirectarile filtreaza pe
--     `fel = 'articol'` si folosesc `on conflict (fel, from_slug)`. Revizia se
--     scrie doar daca `p_creeaza_versiune`, ca salvarea automata sa nu umple
--     istoricul.
--
--   public.blog_creeaza_articol(jsonb, jsonb)
--     Noua. Articolul si etichetele lui, intr-o tranzactie.
--     ⚠ Enumera coloanele pe nume si pune `coalesce` pe cele NOT NULL: cu
--     `(jsonb_populate_record(null::blog_posts, …)).*` cadea pe coloana derivata
--     `cauta`, iar cu NULL-uri explicite cadea pe `is_featured`.
--
--   public.blog_sterge_articol(uuid)
--     Noua. Redirectarile catre el si randul, intr-o tranzactie.
--
--   public.blog_actualizeaza_taxonomia(text, uuid, jsonb)
--     Noua. Redenumirea unei rubrici sau a unui autor, CU redirectarea, intr-o
--     tranzactie. Strange lanturile si se fereste de bucla dus-intors.
--
--   public.blog_sterge_taxonomia(text, uuid)
--     Noua. Sterge si redirectarile care plecau de la ea sau duceau catre ea.
--
--   public.blog_anuleaza_confirmare(text, text)
--     Noua. Stinge jetonul cand emailul de confirmare nu pleaca — altfel omul
--     ramanea blocat 48 de ore, iar a doua incercare primea „ti-am trimis un
--     email" si nu trimitea nimic. Conditia pe amprenta apara cererile mai noi.
--
--   public.blog_articole_admin(int, int, text, text)
--   public.blog_etichete_admin()
--     Noi. Listele din admin, numarate si paginate in baza. Citeau tot, cu
--     plafonul tacut de 1000 de randuri al PostgREST — deci de la al 1001-lea
--     articol cele vechi pur si simplu nu mai apareau in admin.
--
-- ⚠ `public.blog_muta_taxonomia` a ramas in baza, dar nu mai e chemata de nimeni:
-- `blog_actualizeaza_taxonomia` face si redenumirea, si redirectarea, in aceeasi
-- tranzactie. Se pastreaza pentru reparatii facute de mana din consola.
--
-- Toate sunt revocate de la `public`, `anon` si `authenticated`, si date doar lui
-- `service_role`. `npm run verifica:rpc-blog` verifica asta in AMANDOUA sensurile,
-- pe baza adevarata.

-- ═══ INDEMNUL DIN ARTICOL ═══
-- Aplicata pe 30.08.2026 ca `blog_indemn_in_articol`.
--
-- Pana acum, TOATE articolele se terminau cu aceeasi banda de final a site-ului.
-- Potrivit pentru o pagina de prezentare, slab pentru un articol: cine tocmai a
-- citit despre curierat are alt pas urmator decat cine a citit despre facturare.
--
-- Se tine ca `jsonb`, ca si `faq`, dintr-un motiv anume: campurile lui n-au de ce
-- sa fie cautate sau filtrate vreodata, iar cinci coloane care sunt mereu goale
-- impreuna sau pline impreuna sunt cinci locuri de tinut in acord in loc de unul.
--
-- Forma: {"tip": "preturi" | "start" | "migrare" | "contact" | "propriu",
--         "titlu"?, "text"?, "eticheta"?, "adresa"?}
-- Gol (`null`) inseamna „fara indemn in articol", care ramane purtarea implicita.
--
-- ⚠ PRESETARILE STAU IN COD (`src/lib/blog/indemn.ts`), nu aici. Adresele lor se
-- schimba odata cu paginile catre care duc, iar in baza s-ar fi invechit tacut:
-- o presetare care trimite la o pagina stearsa e un buton catre 404.
alter table public.blog_posts
  add column if not exists cta jsonb;

-- ⚠ Obiect sau nimic. Fara constrangere, un sir sau un numar strecurat de un
-- import ar fi ajuns la randare, unde citirea campurilor lui ar fi aruncat.
alter table public.blog_posts
  drop constraint if exists blog_posts_cta_is_object;
alter table public.blog_posts
  add constraint blog_posts_cta_is_object
  check (cta is null or jsonb_typeof(cta) = 'object');

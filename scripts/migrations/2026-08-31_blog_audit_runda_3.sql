-- ═══════════════════════════════════════════════════════════════════════════
-- BLOG — RUNDA A TREIA DE AUDIT, 31.08.2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ ADEVARUL REPRODUCTIBIL E `migrations/000-schema-baseline.sql`. Aici se scrie
-- CE s-a schimbat si DE CE. Corpurile functiilor nu se mai copiaza in fisiere cu
-- data — asa s-a nascut defectul #1 din runda a doua, cand depozitul a ajuns sa
-- aiba doua adevaruri despre aceeasi functie si il citea pe cel gresit intai.
--
-- Invariantele sunt probate de `scripts/tests/blog-integrare.sql`, sectiunile K
-- si L, care intreaba BAZA — nu fisierul de fata.
--
-- ═══ 1. VITRINA PUTEA FI GOLITA DE O CIORNA ═══
--
-- Dovedit pe baza inainte de reparatie, cu numere: articolul A publicat si in
-- vitrina; cineva bifeaza „scoate-l in fata" pe o CIORNA; declansatorul il
-- cobora pe A; ciorna nu apare pe site fiindca pagina publica cere
-- `status = published`. Masurat atunci: ZERO articole in vitrina publica, si
-- nicio eroare nicaieri. Nu era nevoie de nicio cerere mestesugita — se facea
-- din ecran, cu o bifa, de catre un redactor care nici macar nu poate publica.
--
-- `blog_o_singura_vitrina()` cere acum ca articolul care ia vitrina sa fie
-- VIZIBIL ACUM. Si declansatorul se aprinde pe mai multe coloane: cel vechi era
-- `update of is_featured`, deci nu se aprindea cand un articol din vitrina era
-- trecut in ciorna sau arhivat — si atunci ramanea `is_featured = true` fiind
-- nevazut, iar vitrina publica se golea din nou.
--
-- ═══ 2. COBORAREA DIN VITRINA OCOLEA BLOCAJUL OPTIMIST ═══
--
-- A avea versiunea 5 si o fila deschisa. In alta fila, cineva pune B in vitrina.
-- A devenea `is_featured = false` dar RAMANEA la versiunea 5. Fila veche salva cu
-- `expected = 5`, baza spunea „potrivit", iar sarcina veche continea
-- `is_featured = true` — deci A se intorcea in vitrina si B era coborat.
--
-- Acum coborarea creste `edit_version` pe cel coborat. `content_updated_at` NU se
-- misca: vitrina nu e continut.
--
-- ═══ 3. REVENIREA LA O VERSIUNE ═══
--
-- `blog_restaureaza_versiune(...)` — noua. Cea mai distructiva operatie din
-- editor (inlocuieste tot textul) era si singura fara paze:
--
--   * trimitea `p_versiune_asteptata: null`, deci oprea dinadins blocajul
--     optimist. Admin A deschide istoricul, admin B salveaza, A revine — munca
--     lui B dispare fara ca nimeni sa afle;
--   * citea revizia doar dupa `id`, nu si dupa `post_id`. Prin ecran nu se poate
--     gresi, dar actiunea e o adresa POST: cu o revizie a lui A si id-ul lui B,
--     textul lui A ajungea peste B;
--   * nu intorcea nimic, iar editorul se bizuia pe `router.refresh()` — care
--     aduce datele noi de la server dar NU atinge `useState`. Formularul ramanea
--     cu textul de dinainte, si prima salvare de dupa pica cu P0409.
--
-- Acum: lacat, verificare de versiune, domeniu verificat, si intoarce ce a scris.
--
-- ═══ 4. BLOGUL AVEA DOUA SISTEME DE AUTORIZARE ═══
--
-- Tot ce scrie in blog trece prin actiuni de server: rol + claim semnat + MFA +
-- plafoane de lungime + poarta pe gazdele de imagini, si scrie cu cheia de
-- serviciu. Dar baza mai avea o usa: politici prin care `authenticated` scria
-- DIRECT prin REST, bizuindu-se doar pe rolul din `users_profile`. Calea aceea nu
-- trecea prin nimic din ce e mai sus.
--
-- Defectul cu vitrina era chiar o dovada a deosebirii: regula „un redactor nu
-- atinge un articol publicat" era tinuta in RLS, dar nimic nu oprea `is_featured`
-- — fiindca RLS verifica RANDURI, nu INTELESURI.
--
-- Toate politicile de admin si de redactor au fost sterse, si granturile de
-- scriere retrase de la `anon` si `authenticated`. Raman citirile publice, de
-- unde traieste site-ul. Ciornele nu se mai vad prin REST.
--
-- Cu asta, `is_blog_editor()` nu mai e chemata de nicio politica — deci i s-a
-- retras si ei EXECUTE de la `authenticated`, iar exceptia din
-- `granturi-rpc.test.ts` a putut fi STEARSA. Lista aceea trebuie sa se scurteze.

-- Un articol care nu se vede nu poate tine vitrina, iar coborarea se vede.
drop trigger if exists blog_posts_o_singura_vitrina on public.blog_posts;
create trigger blog_posts_o_singura_vitrina
  before insert or update of is_featured, status, published_at on public.blog_posts
  for each row execute function public.blog_o_singura_vitrina();

-- ── Nicio scriere directa prin REST ───────────────────────────────────────
drop policy if exists blog_posts_admin_all            on public.blog_posts;
drop policy if exists blog_posts_editor_read          on public.blog_posts;
drop policy if exists blog_posts_editor_insert        on public.blog_posts;
drop policy if exists blog_posts_editor_update        on public.blog_posts;
drop policy if exists blog_posts_editor_delete        on public.blog_posts;
drop policy if exists blog_tags_admin_all             on public.blog_tags;
drop policy if exists blog_tags_editor_write          on public.blog_tags;
drop policy if exists blog_post_tags_admin_all        on public.blog_post_tags;
drop policy if exists blog_post_tags_editor_read      on public.blog_post_tags;
drop policy if exists blog_post_tags_editor_insert    on public.blog_post_tags;
drop policy if exists blog_post_tags_editor_delete    on public.blog_post_tags;
drop policy if exists blog_authors_admin_all          on public.blog_authors;
drop policy if exists blog_categories_admin_all       on public.blog_categories;
drop policy if exists blog_redirects_admin_all        on public.blog_redirects;
drop policy if exists blog_subscribers_admin_all      on public.blog_subscribers;
drop policy if exists blog_post_revisions_admin_all   on public.blog_post_revisions;
drop policy if exists blog_post_revisions_editor_read on public.blog_post_revisions;
drop policy if exists blog_post_stats_editor_read     on public.blog_post_stats;

revoke insert, update, delete, truncate on table public.blog_posts          from anon, authenticated;
revoke insert, update, delete, truncate on table public.blog_tags           from anon, authenticated;
revoke insert, update, delete, truncate on table public.blog_post_tags      from anon, authenticated;
revoke insert, update, delete, truncate on table public.blog_authors        from anon, authenticated;
revoke insert, update, delete, truncate on table public.blog_categories     from anon, authenticated;
revoke insert, update, delete, truncate on table public.blog_redirects      from anon, authenticated;
revoke insert, update, delete, truncate on table public.blog_subscribers    from anon, authenticated;
revoke insert, update, delete, truncate on table public.blog_post_revisions from anon, authenticated;

-- Ce nu se arata niciodata public nu se citeste nici de un cont oarecare.
revoke select on table public.blog_post_revisions from anon, authenticated;
revoke select on table public.blog_post_stats     from anon, authenticated;
revoke select on table public.blog_subscribers    from anon, authenticated;

-- `user_id` al autorului: nici pentru `authenticated`. Fusese scos doar de la
-- `anon`, deci orice utilizator Edinio putea afla identificatorul de cont
-- Supabase al fiecarui autor, direct din REST.
--
-- ⚠ CODUL TREBUIE SA NUMEASCA DEJA COLOANELE. Cu `select("*")`, Postgres nu
-- intoarce mai putin — REFUZA interogarea intreaga.
revoke select on table public.blog_authors from authenticated;
grant select (
  id, slug, name, role_title, bio, avatar_url, sameas, created_at, updated_at
) on table public.blog_authors to authenticated;

revoke execute on function public.is_blog_editor()          from public, anon, authenticated;
revoke execute on function public.blog_o_singura_vitrina()  from public, anon, authenticated;

-- ═══ FUNCTII NOI SAU RESCRISE — corpurile stau in baseline ═══
--
--   public.blog_o_singura_vitrina()        rescrisa (vezi 1 si 2)
--   public.blog_restaureaza_versiune(...)  noua (vezi 3)
--   public.blog_articole_pentru_feed(int)  noua — feedul e cronologic, nu ordonat
--                                          cu fixatele in fata: un feed e un flux,
--                                          nu o copie a asezarii de pe pagina. Pe
--                                          feedul de dinainte, un articol fixat
--                                          din ianuarie statea inaintea celui de
--                                          ieri, iar `lastBuildDate` se lua din
--                                          primul element — deci putea fi mai
--                                          VECHE decat alte articole din feed.
--   public.blog_etichete_folosite()        `max(greatest(published_at,
--                                          content_updated_at))`: pagina unei
--                                          etichete se schimba si cand se rescrie
--                                          un articol deja publicat.
--   public.blog_articole_admin(...)        intorc un jsonb cu randurile SI
--   public.blog_etichete_admin(...)        totalul. Cu `count(*) over ()`, totalul
--                                          calatorea pe randuri — deci la o pagina
--                                          de dupa ultimul rand se pierdea, si
--                                          ecranul spunea „niciun articol" pe o
--                                          baza plina. Etichetele sunt si ele
--                                          paginate acum, cu cautare.

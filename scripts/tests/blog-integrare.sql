-- ═══════════════════════════════════════════════════════════════════════════
-- BLOG — PROBA DE INTEGRARE, PE BAZA ADEVARATA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ═══ DE CE EXISTA ═══
--
-- Probele din `npm test` ruleaza offline: nu vad nici baza, nici PostgREST. Dar
-- jumatate din blog TRAIESTE in baza — tranzactii, lacate, declansatoare,
-- politici RLS, chei unice. Un audit din 30.08.2026 a spus-o limpede:
--
--   „verifica:rpc-blog nu e suficient pentru acest bug daca doar verifica
--    semnatura. Trebuie integration test care modifica efectiv slugul unui
--    articol existent."
--
-- Avea dreptate. Fisierul asta face exact asta.
--
-- ═══ CE ACOPERA ═══
--
--   A  redirectari: lanturi, dus-intors, ciocnire intre feluri, ciorne
--   B  concurenta: versiunea de editare, si ce se intampla cu una veche
--   C  data continutului: citiri, vitrina, fixare, arhivare, text schimbat
--   D  istoricul: salvare automata fata de salvare de mana, si plafonul
--   E  creare si stergere de articol, intr-o tranzactie
--   F  taxonomii: redenumire cu redirectare, stergere, un cont-un autor
--   G  newsletter: jetoane, anulare, confirmare, dezabonare, reinscriere
--   H  RLS: ce poate un redactor cu jetonul lui (in tranzactie proprie)
--   I  listele din admin: paginare, filtre, cautare cu diacritice
--   K  vitrina, revenirea si concurenta lor (runda a treia)
--   L  usa directa prin REST e inchisa
--   M  versiunea obligatorie, fixarea pastrata, etichetele si taxonomiile
--   N  modificarile INDIRECTE cresc versiunea; redirectarile taxonomiilor
--   T  data continutului pe rubrici si autori (ce vede cititorul, nu orice atingere)
--   G  drepturile de prisos luate, declansatoarele neatinse
--   R  retentia abonarilor neconfirmate (si CE NU se sterge)
--   J  nimic n-a ramas in urma
--
-- ═══ CUM SE RULEAZA ═══
--
--   * din consola SQL a Supabase: se lipeste tot si se apasa Run;
--   * sau: psql "$DATABASE_URL" -f scripts/tests/blog-integrare.sql
--
-- Nu scrie nimic in iesire daca totul e bine (in afara de `notice`-uri). La
-- primul lucru gresit ARUNCA, cu un mesaj care spune ce anume.
--
-- ⚠ SCRIE SI STERGE DATE ADEVARATE. Toate randurile pe care le face incep cu
-- `zz-proba-` si se sterg la final, inclusiv daca proba cade (vezi blocul de
-- curatenie de la inceput, care ruleaza intai). Nu atinge niciun rand care nu
-- incepe asa.
--
-- ⚠ IMPRUMUTA UN CONT pentru proba de RLS, il face redactor pentru cateva
-- instructiuni, si ii pune rolul la loc. Daca proba cade la mijloc, rolul NU
-- ramane schimbat: blocul acela e intr-o tranzactie proprie care se intoarce.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  a uuid; b uuid; c uuid; m uuid; cat uuid; aut uuid; aut2 uuid;
  v bigint; d1 timestamptz; d2 timestamptz; u1 timestamptz;
  n int; t text; ok boolean; em text; r1 boolean; r2 boolean;
  coloane_trigger text;
begin
  -- ── Curatenie, inainte de orice ─────────────────────────────────────────
  delete from public.blog_posts       where slug like 'zz-proba-%';
  delete from public.blog_categories  where slug like 'zz-proba-%';
  delete from public.blog_authors     where slug like 'zz-proba-%';
  delete from public.blog_tags        where slug like 'zz-proba-%';
  delete from public.blog_redirects   where from_slug like 'zz-proba-%' or to_slug like 'zz-proba-%';
  delete from public.blog_subscribers where email like 'zz-proba-%';

  -- ═══════════════════════════════════════════════════════════════════════
  -- A. REDIRECTARI
  -- ═══════════════════════════════════════════════════════════════════════

  insert into public.blog_posts (slug, title, content_html, status, published_at)
  values ('zz-proba-a','A','<p>a</p>','published', now() - interval '1 day') returning id into a;

  -- A1. Lant: a → b, apoi b → c. Trebuie sa iasa a → c, nu a → b → c.
  select edit_version into v from public.blog_posts where id = a;
  v := public.blog_salveaza_articol(a, jsonb_build_object('slug','zz-proba-b'), null, null, 50, v, true);
  v := public.blog_salveaza_articol(a, jsonb_build_object('slug','zz-proba-c'), null, null, 50, v, true);

  select to_slug into t from public.blog_redirects where fel='articol' and from_slug='zz-proba-a';
  if t <> 'zz-proba-c' then raise exception 'A1 LANT: zz-proba-a duce la %, nu la zz-proba-c', t; end if;
  select to_slug into t from public.blog_redirects where fel='articol' and from_slug='zz-proba-b';
  if t <> 'zz-proba-c' then raise exception 'A1 LANT: zz-proba-b duce la %', t; end if;
  raise notice 'A1 lant a→b→c: amandoua arata DIRECT catre c';

  -- A2. Dus-intors: c → a. Fara bucla, fara redirectare catre sine.
  v := public.blog_salveaza_articol(a, jsonb_build_object('slug','zz-proba-a'), null, null, 50, v, true);
  if exists (select 1 from public.blog_redirects where fel='articol' and from_slug = to_slug) then
    raise exception 'A2 DUS-INTORS: a ramas o redirectare catre ea insasi'; end if;
  if exists (select 1 from public.blog_redirects where fel='articol' and from_slug='zz-proba-a') then
    raise exception 'A2 DUS-INTORS: BUCLA — zz-proba-a inca trimite undeva'; end if;
  raise notice 'A2 dus-intors c→a: fara bucla';

  -- A3. Ciocnire intre feluri: acelasi slug istoric, cai diferite.
  insert into public.blog_redirects (fel, from_slug, to_slug) values ('categorie','zz-proba-a','zz-proba-rubrica');
  insert into public.blog_redirects (fel, from_slug, to_slug) values ('autor','zz-proba-a','zz-proba-autor');
  v := public.blog_salveaza_articol(a, jsonb_build_object('slug','zz-proba-d'), null, null, 50, v, true);

  select to_slug into t from public.blog_redirects where fel='categorie' and from_slug='zz-proba-a';
  if t is distinct from 'zz-proba-rubrica' then raise exception 'A3: redirectarea de RUBRICA a fost atinsa (%)', t; end if;
  select to_slug into t from public.blog_redirects where fel='autor' and from_slug='zz-proba-a';
  if t is distinct from 'zz-proba-autor' then raise exception 'A3: redirectarea de AUTOR a fost atinsa (%)', t; end if;
  raise notice 'A3 ciocnire: articol, rubrica si autor pot pleca de la acelasi slug';

  -- A4. Ciorna NU lasa redirectare: adresa n-a fost niciodata nicaieri.
  update public.blog_posts set status='draft', published_at=null where id = a;
  select edit_version into v from public.blog_posts where id = a;
  delete from public.blog_redirects where fel='articol' and from_slug='zz-proba-d';
  v := public.blog_salveaza_articol(a, jsonb_build_object('slug','zz-proba-e'), null, null, 50, v, true);
  if exists (select 1 from public.blog_redirects where fel='articol' and from_slug='zz-proba-d') then
    raise exception 'A4: o CIORNA a lasat redirectare'; end if;
  raise notice 'A4 ciorna redenumita: nicio redirectare inventata';

  -- ═══════════════════════════════════════════════════════════════════════
  -- B. CONCURENTA (versiunea de editare)
  -- ═══════════════════════════════════════════════════════════════════════

  select edit_version into v from public.blog_posts where id = a;

  -- B1. Cine pleaca de la o versiune veche e refuzat.
  begin
    perform public.blog_salveaza_articol(a, jsonb_build_object('title','de la B'), null, null, 50, 1, true);
    raise exception 'B1: a scris peste, desi plecase de la versiunea 1';
  exception when sqlstate 'P0409' then
    raise notice 'B1 versiune veche: refuzata cu P0409';
  end;

  select title into t from public.blog_posts where id = a;
  if t = 'de la B' then raise exception 'B1: refuzul n-a impiedicat scrierea'; end if;

  -- B2. Versiunea buna trece si creste.
  v := public.blog_salveaza_articol(a, jsonb_build_object('title','de la A'), null, null, 50, v, true);
  select title, edit_version into t, n from public.blog_posts where id = a;
  if t <> 'de la A' then raise exception 'B2: scrierea buna n-a intrat'; end if;
  if n::bigint <> v then raise exception 'B2: numarul intors (%) nu e cel din baza (%)', v, n; end if;
  raise notice 'B2 versiunea buna trece, si numarul intors e cel din baza';

  -- B3. `null` NU MAI SARE PESTE VERIFICARE: e refuzat.
  --
  -- ⚠ PROBA ASTA SPUNEA PE DOS PANA PE 31.08.2026, si trecea. Scrisesem dinadins
  -- „null sare peste verificare — pentru unelte si reparatii", iar proba apara
  -- purtarea aceea. Suna a chibzuinta si era o gaura: actiunea de server trimitea
  -- `intrare.edit_version ?? null`, deci orice cerere care nu purta campul stingea
  -- blocajul optimist cu totul — din neatentie, nu din rea-vointa.
  --
  -- O proba care apara o portita e mai rea decat lipsa ei: da incredere.
  begin
    perform public.blog_salveaza_articol(a, jsonb_build_object('title','fara versiune'),
                                         null, null, 50, null, true);
    raise exception 'B3: a scris FARA versiune asteptata';
  exception when sqlstate 'P0400' then
    raise notice 'B3 salvare fara versiune: refuzata cu P0400';
  end;

  -- ═══════════════════════════════════════════════════════════════════════
  -- C. DATA CONTINUTULUI
  -- ═══════════════════════════════════════════════════════════════════════

  -- C0. Lista de coloane din declansator e cea despre care vorbeste migratia.
  /*
    ⚠ DOUA CAPCANE INTR-O SINGURA INSTRUCTIUNE, si amandoua au muscat.

    1. `regexp_matches` intoarce un TABLOU pe fiecare rand, nu un text — deci
       `m2[1]`, nu `m2`. Fara asta pica cu „function string_agg(text[],
       unknown) does not exist", iar o proba care nu PORNESTE nu apara nimic.

    2. Aliasul se cheama `m2`, nu `m`, fiindca mai sus e declarata o variabila
       `m uuid`. Un alias cu acelasi nume o umbreste, si `m[1]` ar incerca sa
       indexeze un uuid. Asta s-a vazut abia RULAND FISIERUL INTREG: blocurile
       incercate pe rand n-aveau variabila aceea, deci treceau linistite.
  */
  select string_agg(m2[1], ',' order by m2[1]) into coloane_trigger
  from regexp_matches(
         pg_get_functiondef((select oid from pg_proc where proname = 'blog_continut_atins')),
         'new\.([a-z_]+)\s+is distinct from', 'g') as m2;

  if coloane_trigger is null or coloane_trigger = '' then
    raise exception 'C0: n-am putut citi coloanele din blog_continut_atins';
  end if;
  if position('is_featured' in coloane_trigger) > 0
  or position('is_pinned'   in coloane_trigger) > 0
  or position('noindex'     in coloane_trigger) > 0
  or position('status'      in coloane_trigger) > 0 then
    raise exception 'C0: o coloana ADMINISTRATIVA a ajuns in declansatorul de continut: %', coloane_trigger;
  end if;
  if position('content_html' in coloane_trigger) = 0 or position('title' in coloane_trigger) = 0 then
    raise exception 'C0: declansatorul nu mai urmareste textul sau titlul: %', coloane_trigger;
  end if;
  raise notice 'C0 declansatorul de continut urmareste doar continut';

  update public.blog_posts set status='published', published_at = now() - interval '10 days' where id = a;
  update public.blog_posts set content_updated_at = now() - interval '10 days',
                               updated_at = now() - interval '10 days' where id = a;

  insert into public.blog_posts (slug, title, content_html, status, published_at)
  values ('zz-proba-b2','B','<p>b</p>','published', now() - interval '10 days') returning id into b;

  -- C1. Citirile nu ating data continutului.
  select content_updated_at into d1 from public.blog_posts where id = a;
  select slug into t from public.blog_posts where id = a;
  perform public.blog_creste_citirile(t);
  perform public.blog_creste_citirile(t);
  select content_updated_at into d2 from public.blog_posts where id = a;
  if d1 <> d2 then raise exception 'C1 CITIRI: content_updated_at s-a mutat'; end if;
  select views into n from public.blog_post_stats where post_id = a;
  if n <> 2 then raise exception 'C1 CITIRI: s-au numarat % in loc de 2', n; end if;
  raise notice 'C1 doua citiri numarate, data continutului neatinsa';

  -- C2. Vitrina: ridic B, declansatorul il coboara pe A. A nu pare editat.
  select content_updated_at into d1 from public.blog_posts where id = a;
  update public.blog_posts set is_featured = true where id = a;
  update public.blog_posts set is_featured = true where id = b;
  if (select is_featured from public.blog_posts where id = a) then
    raise exception 'C2 VITRINA: A a ramas in fata — invariantul nu tine'; end if;
  select content_updated_at into d2 from public.blog_posts where id = a;
  if d1 <> d2 then raise exception 'C2 VITRINA: coborarea lui A i-a mutat data continutului'; end if;
  raise notice 'C2 A coborat din vitrina, data continutului neatinsa';

  -- C3. Fixare, ascundere, arhivare: administrative.
  select content_updated_at into d1 from public.blog_posts where id = a;
  update public.blog_posts set is_pinned = true where id = a;
  update public.blog_posts set noindex   = true where id = a;
  update public.blog_posts set status    = 'archived' where id = a;
  select content_updated_at, updated_at into d2, u1 from public.blog_posts where id = a;
  if d1 <> d2 then raise exception 'C3 ADMIN: o bifa a mutat data continutului'; end if;
  if u1 <= d1 then raise exception 'C3 ADMIN: updated_at NU s-a mutat, desi trebuia'; end if;
  raise notice 'C3 pin/noindex/arhivare: updated_at da, content_updated_at nu';

  -- C4. Textul schimbat MUTA data.
  update public.blog_posts set status='published' where id = a;
  select content_updated_at into d1 from public.blog_posts where id = a;
  perform pg_sleep(0.05);
  update public.blog_posts set content_html = '<p>alt text</p>' where id = a;
  select content_updated_at into d2 from public.blog_posts where id = a;
  if d2 <= d1 then raise exception 'C4 CONTINUT: textul s-a schimbat si data n-a miscat'; end if;
  raise notice 'C4 text schimbat → data continutului s-a mutat';

  -- ═══════════════════════════════════════════════════════════════════════
  -- D. ISTORICUL VERSIUNILOR
  -- ═══════════════════════════════════════════════════════════════════════

  select edit_version into v from public.blog_posts where id = a;
  select count(*) into n from public.blog_post_revisions where post_id = a;

  -- D1. Salvarea automata NU scrie versiune.
  v := public.blog_salveaza_articol(a, jsonb_build_object('title','autosave 1'), null, null, 50, v, false);
  v := public.blog_salveaza_articol(a, jsonb_build_object('title','autosave 2'), null, null, 50, v, false);
  if (select count(*) from public.blog_post_revisions where post_id = a) <> n then
    raise exception 'D1: salvarea automata a scris versiuni'; end if;

  -- D2. Cea de mana, da.
  v := public.blog_salveaza_articol(a, jsonb_build_object('title','de mana'), null, null, 50, v, true);
  if (select count(*) from public.blog_post_revisions where post_id = a) <> n + 1 then
    raise exception 'D2: salvarea de mana NU a scris versiune'; end if;
  raise notice 'D1/D2 doua automate: zero versiuni; una de mana: o versiune';

  -- D3. Plafonul taie la fiecare salvare, nu doar la revenire.
  for n in 1..6 loop
    v := public.blog_salveaza_articol(a, jsonb_build_object('title','T'||n), null, null, 3, v, true);
  end loop;
  select count(*) into n from public.blog_post_revisions where post_id = a;
  if n <> 3 then raise exception 'D3: au ramas % versiuni, nu 3', n; end if;
  raise notice 'D3 istoricul se taie la fiecare salvare';

  -- ═══════════════════════════════════════════════════════════════════════
  -- E. CREARE SI STERGERE, INTR-O TRANZACTIE
  -- ═══════════════════════════════════════════════════════════════════════

  -- E1. Creare cu jsonb MINIM: valorile implicite tin.
  select id into m from public.blog_creeaza_articol(
    jsonb_build_object('slug','zz-proba-minim','title','Minim'), null);
  select is_featured::int + is_pinned::int + noindex::int into n from public.blog_posts where id = m;
  if n <> 0 then raise exception 'E1: bifele n-au luat valorile implicite'; end if;
  if (select status from public.blog_posts where id = m) <> 'draft' then raise exception 'E1: starea implicita'; end if;
  if (select faq from public.blog_posts where id = m) <> '[]'::jsonb then raise exception 'E1: faq implicit'; end if;
  if (select cauta from public.blog_posts where id = m) is null then raise exception 'E1: coloana derivata `cauta` a ramas goala'; end if;
  raise notice 'E1 creare cu jsonb minim: valorile implicite tin, si `cauta` s-a socotit';

  -- E2. Creare cu etichete.
  select id into c from public.blog_creeaza_articol(
    jsonb_build_object('slug','zz-proba-nou','title','Nou','content_html','<p>n</p>'),
    '[{"slug":"zz-proba-et","name":"Zz Proba Et"}]'::jsonb);
  if (select count(*) from public.blog_post_tags where post_id = c) <> 1 then
    raise exception 'E2: eticheta n-a fost legata'; end if;
  raise notice 'E2 creare: articol + eticheta, dintr-o miscare';

  -- E3. Creare cazuta: nu ramane nimic.
  begin
    perform public.blog_creeaza_articol(jsonb_build_object('slug','zz-proba-nou','title','Duplicat'), null);
    raise exception 'E3: a ingaduit slug duplicat';
  exception when unique_violation then
    if (select count(*) from public.blog_posts where title = 'Duplicat') <> 0 then
      raise exception 'E3: a ramas un articol dupa esec'; end if;
    raise notice 'E3 creare cazuta: n-a ramas nimic in urma';
  end;

  -- E4. Stergere: redirectarile articolului pleaca, ale rubricii raman.
  insert into public.blog_redirects (fel, from_slug, to_slug) values ('articol','zz-proba-vechi','zz-proba-nou');
  insert into public.blog_redirects (fel, from_slug, to_slug) values ('categorie','zz-proba-vechi','zz-proba-alta');
  ok := public.blog_sterge_articol(c);
  if not ok then raise exception 'E4: n-a sters'; end if;
  if exists (select 1 from public.blog_redirects where fel='articol' and to_slug='zz-proba-nou') then
    raise exception 'E4: a ramas o redirectare catre articolul sters'; end if;
  if not exists (select 1 from public.blog_redirects where fel='categorie' and from_slug='zz-proba-vechi') then
    raise exception 'E4: a sters redirectarea unei RUBRICI cu acelasi slug'; end if;
  raise notice 'E4 stergere: ale articolului au plecat, ale rubricii au ramas';

  -- E5. Stergerea unui id inexistent spune „nu", nu arunca.
  if public.blog_sterge_articol('00000000-0000-0000-0000-000000000000') then
    raise exception 'E5: a spus ca a sters un articol care nu exista'; end if;
  raise notice 'E5 stergerea unui id inexistent: raspunde cinstit';

  -- ═══════════════════════════════════════════════════════════════════════
  -- F. TAXONOMII
  -- ═══════════════════════════════════════════════════════════════════════

  insert into public.blog_categories (slug, name) values ('zz-proba-mkt-online','Marketing online') returning id into cat;
  insert into public.blog_authors (slug, name) values ('zz-proba-ion','Ion') returning id into aut;

  -- F1. Redenumire cu redirectare, dintr-o miscare.
  perform public.blog_actualizeaza_taxonomia('categorie', cat,
    jsonb_build_object('name','Marketing','slug','zz-proba-mkt'));
  if (select slug from public.blog_categories where id = cat) <> 'zz-proba-mkt' then
    raise exception 'F1: slugul nu s-a schimbat'; end if;
  select to_slug into t from public.blog_redirects where fel='categorie' and from_slug='zz-proba-mkt-online';
  if t <> 'zz-proba-mkt' then raise exception 'F1: redirectarea lipseste (%)', t; end if;
  raise notice 'F1 rubrica redenumita, cu redirectare, dintr-o miscare';

  -- F2. Lantul se strange.
  perform public.blog_actualizeaza_taxonomia('categorie', cat, jsonb_build_object('slug','zz-proba-m'));
  select to_slug into t from public.blog_redirects where fel='categorie' and from_slug='zz-proba-mkt-online';
  if t <> 'zz-proba-m' then raise exception 'F2: lantul nu s-a strans (%)', t; end if;
  raise notice 'F2 lantul de rubrica s-a strans';

  -- F3. Cheile lipsa nu sterg ce era.
  if (select name from public.blog_categories where id = cat) <> 'Marketing' then
    raise exception 'F3: numele a fost sters de o cheie lipsa'; end if;
  raise notice 'F3 cheile netrimise au ramas intacte';

  -- F4. Un cont, un singur autor.
  select id into m from public.users_profile limit 1;
  if m is null then
    raise notice 'F4 SARITA: niciun cont in users_profile';
  else
    perform public.blog_actualizeaza_taxonomia('autor', aut, jsonb_build_object('user_id', m));
    insert into public.blog_authors (slug, name) values ('zz-proba-al-doilea','Al doilea') returning id into aut2;
    begin
      perform public.blog_actualizeaza_taxonomia('autor', aut2, jsonb_build_object('user_id', m));
      raise exception 'F4: acelasi cont a fost legat de doi autori';
    exception when unique_violation then
      raise notice 'F4 al doilea autor pe acelasi cont: refuzat de baza';
    end;
  end if;

  -- F5. Stergerea unei rubrici curata redirectarile ei, si numai ale ei.
  insert into public.blog_redirects (fel, from_slug, to_slug) values ('articol','zz-proba-mkt-online','zz-proba-un-articol');
  ok := public.blog_sterge_taxonomia('categorie', cat);
  if not ok then raise exception 'F5: n-a sters rubrica'; end if;
  if exists (select 1 from public.blog_redirects where fel='categorie' and to_slug='zz-proba-m') then
    raise exception 'F5: a ramas o redirectare catre rubrica stearsa'; end if;
  if not exists (select 1 from public.blog_redirects where fel='articol' and from_slug='zz-proba-mkt-online') then
    raise exception 'F5: a atins redirectarea unui ARTICOL cu acelasi slug'; end if;
  raise notice 'F5 rubrica stearsa: redirectarile ei au plecat, ale articolului au ramas';

  -- ═══════════════════════════════════════════════════════════════════════
  -- G. NEWSLETTER
  -- ═══════════════════════════════════════════════════════════════════════

  -- G1. Cat timp jetonul e viu, nu se emite altul.
  r1 := public.blog_cere_confirmare('zz-proba-nl@edinio.test', 'zz-amp-1', now() + interval '48 hours', 'blog');
  if coalesce(r1,false) is not true then raise exception 'G1: n-a emis primul jeton'; end if;
  r2 := public.blog_cere_confirmare('zz-proba-nl@edinio.test', 'zz-amp-2', now() + interval '48 hours', 'blog');
  if coalesce(r2,false) is not false then raise exception 'G1: a emis doua jetoane deodata'; end if;
  raise notice 'G1 al doilea email nu pleaca cat timp primul jeton e viu';

  -- G2. Daca emailul n-a plecat, jetonul se stinge si se poate reincerca.
  if coalesce(public.blog_anuleaza_confirmare('zz-proba-nl@edinio.test','zz-amp-1'), false) is not true then
    raise exception 'G2: anularea n-a mers'; end if;
  r2 := public.blog_cere_confirmare('zz-proba-nl@edinio.test', 'zz-amp-3', now() + interval '48 hours', 'blog');
  if coalesce(r2,false) is not true then raise exception 'G2: reincercarea tot n-a emis'; end if;
  raise notice 'G2 dupa anulare, reincercarea imediata emite si trimite';

  -- G3. Anularea unui jeton VECHI nu atinge cererea mai noua.
  if public.blog_anuleaza_confirmare('zz-proba-nl@edinio.test','zz-amp-1') is not null then
    raise exception 'G3: a anulat cu o amprenta veche'; end if;
  if (select token_hash from public.blog_subscribers where email='zz-proba-nl@edinio.test') is distinct from 'zz-amp-3' then
    raise exception 'G3: jetonul nou a fost atins'; end if;
  raise notice 'G3 anularea unui jeton vechi nu atinge cererea mai noua';

  -- G4. Jetonul expirat si amprenta gresita nu confirma.
  update public.blog_subscribers set token_expires_at = now() - interval '1 minute'
   where email='zz-proba-nl@edinio.test';
  if public.blog_confirma('zz-amp-3','1.2.3.4') is not null then
    raise exception 'G4: a confirmat cu jeton EXPIRAT'; end if;
  update public.blog_subscribers set token_expires_at = now() + interval '1 hour'
   where email='zz-proba-nl@edinio.test';
  if public.blog_confirma('zz-amprenta-gresita','1.2.3.4') is not null then
    raise exception 'G4: a confirmat cu amprenta GRESITA'; end if;
  raise notice 'G4 jeton expirat si amprenta gresita: amandoua respinse';

  -- G5. Confirmarea buna stinge jetonul si pregateste dezabonarea.
  em := public.blog_confirma('zz-amp-3','1.2.3.4');
  if em is null then raise exception 'G5: confirmarea buna a picat'; end if;
  if not exists (select 1 from public.blog_subscribers
                  where email=em and confirmed_at is not null
                    and token_hash is null and unsub_token is not null) then
    raise exception 'G5: dupa confirmare starea e gresita'; end if;
  raise notice 'G5 confirmare: jeton stins, dezabonare pregatita';

  -- G6. Dezabonarea e idempotenta si refuza jetoane straine.
  select unsub_token into t from public.blog_subscribers where email='zz-proba-nl@edinio.test';
  if coalesce(public.blog_dezaboneaza(t), false) is not true then raise exception 'G6: nu s-a dezabonat'; end if;
  if coalesce(public.blog_dezaboneaza(t), false) is not true then raise exception 'G6: a doua apasare da eroare'; end if;
  if public.blog_dezaboneaza('zz-jeton-inexistent') is not null then
    raise exception 'G6: a acceptat un jeton strain'; end if;
  raise notice 'G6 dezabonare: merge, e idempotenta, refuza jetonul strain';

  -- G7. Reinscrierea cere confirmare din nou.
  r1 := public.blog_cere_confirmare('zz-proba-nl@edinio.test', 'zz-amp-4', now() + interval '1 hour', 'blog');
  if coalesce(r1,false) is not true then raise exception 'G7: reinscrierea a fost refuzata'; end if;
  if exists (select 1 from public.blog_subscribers where email='zz-proba-nl@edinio.test' and confirmed_at is not null) then
    raise exception 'G7: reinscrierea a pastrat vechiul consimtamant'; end if;
  raise notice 'G7 reinscriere: cere confirmare din nou';

  -- ── Curatenie ───────────────────────────────────────────────────────────
  delete from public.blog_posts       where slug like 'zz-proba-%';
  delete from public.blog_categories  where slug like 'zz-proba-%';
  delete from public.blog_authors     where slug like 'zz-proba-%';
  delete from public.blog_tags        where slug like 'zz-proba-%';
  delete from public.blog_redirects   where from_slug like 'zz-proba-%' or to_slug like 'zz-proba-%';
  delete from public.blog_subscribers where email like 'zz-proba-%';

  raise notice '';
  raise notice '════ A-G: redirectari, concurenta, date, istoric, creare, stergere, taxonomii, newsletter ════';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- H. RLS — CE POATE UN REDACTOR, CU JETONUL LUI
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ TRANZACTIE PROPRIE, SI SE INTOARCE INTOTDEAUNA.
--
-- Blocul asta imprumuta un cont adevarat si il face redactor pentru cateva
-- instructiuni. `rollback` de la final il pune la loc ORICE s-ar intampla —
-- inclusiv daca proba cade la mijloc, fiindca atunci tranzactia se intoarce
-- singura. Fara asta, o probă cazuta ar lasa pe cineva cu alt rol decat avea.
begin;

do $$
declare id_editor uuid; a uuid; n int;
begin
  select id into id_editor from public.users_profile order by created_at limit 1;
  if id_editor is null then raise notice 'H SARITA: niciun cont'; return; end if;

  insert into public.blog_posts (slug, title, content_html, status, published_at)
  values ('zz-proba-rls','Publicat','<p>p</p>','published', now() - interval '1 day') returning id into a;
  insert into public.blog_post_revisions (post_id, title, content_html) values (a, 'v1', '<p>v1</p>');
  insert into public.blog_tags (slug, name) values ('zz-proba-rls-et','Et') on conflict (slug) do nothing;

  update public.users_profile set role = 'editor' where id = id_editor;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', id_editor, 'role','authenticated')::text, true);

  if not public.is_blog_editor() then raise exception 'H MONTAJ: nu ma vede ca redactor'; end if;

  -- H1. INSERT de revizie inventata: REFUZAT.
  begin
    insert into public.blog_post_revisions (post_id, title, content_html)
    values (a, 'revizie inventata', '<p>fals</p>');
    raise exception 'H1: redactorul A PUTUT scrie o revizie direct';
  exception when insufficient_privilege then
    raise notice 'H1 INSERT de revizie: refuzat';
  end;

  -- H2. UPDATE pe revizie: zero randuri.
  update public.blog_post_revisions set title = 'rescris' where post_id = a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'H2: redactorul a rescris % revizii', n; end if;

  -- H3. DELETE pe revizie: zero randuri.
  delete from public.blog_post_revisions where post_id = a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'H3: redactorul a sters % revizii', n; end if;
  raise notice 'H2/H3 UPDATE si DELETE pe revizii: zero randuri atinse';

  -- H4. Citirea istoricului ramane: asa spune si interfata.
  select count(*) into n from public.blog_post_revisions where post_id = a;
  if n <> 1 then raise exception 'H4: redactorul nu mai vede istoricul (%)', n; end if;
  raise notice 'H4 citirea istoricului: merge';

  -- H5. Eticheta pe un articol PUBLICAT: refuzata.
  begin
    insert into public.blog_post_tags (post_id, tag_id)
    select a, id from public.blog_tags where slug = 'zz-proba-rls-et';
    raise exception 'H5: redactorul a etichetat un articol PUBLICAT';
  exception when insufficient_privilege then
    raise notice 'H5 eticheta pe articol publicat: refuzata';
  end;

  -- H6. Textul unui articol publicat: zero randuri.
  update public.blog_posts set title = 'schimbat de redactor' where id = a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'H6: redactorul a schimbat un articol PUBLICAT'; end if;
  raise notice 'H6 textul unui articol publicat: zero randuri atinse';

  reset role;
  raise notice '════════ H: toate au trecut (rolul se pune la loc prin rollback) ════════';
end $$;

rollback;


-- ═══════════════════════════════════════════════════════════════════════════
-- I. LISTELE DIN ADMIN
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Citeau tot, cu plafonul tacut de 1000 de randuri al PostgREST: de la al
-- 1001-lea articol, cele vechi pur si simplu nu mai apareau in admin — si nu
-- aparea nici vreun semn ca lipsesc. Un articol pe care nu-l mai gasesti in
-- admin e, practic, pierdut: ramane pe site, dar nimeni nu-l mai poate edita.
do $
declare n int; total bigint; et uuid; publice int;
begin
  delete from public.blog_posts where slug like 'zz-adm-%';
  delete from public.blog_tags  where slug like 'zz-adm-%';

  -- 30 de articole, ca sa treaca de o pagina de 25. Fiecare al treilea, publicat.
  -- ⚠ `published_at` se pune in ACEEASI inserare: `blog_posts_published_has_date`
  -- e un `check`, iar un `check` picat opreste INTREGUL rand, nu doar campul.
  for n in 1..30 loop
    insert into public.blog_posts (slug, title, content_html, status, published_at)
    values ('zz-adm-'||lpad(n::text,2,'0'), 'Articol '||n, '<p>despre livrări și plăți</p>',
            case when n % 3 = 0 then 'published' else 'draft' end,
            case when n % 3 = 0 then now() - interval '1 day' else null end);
  end loop;

  -- J1. Pagina 1 are exact cate s-au cerut, iar `total` spune cate sunt cu totul.
  select count(*), max(x.total) into n, total
  from public.blog_articole_admin(0, 25, null, null) x where x.slug like 'zz-adm-%';
  if n <> 25 then raise exception 'I1: pagina 1 are % randuri, nu 25', n; end if;
  if total < 30 then raise exception 'I1: total = %, sub 30', total; end if;
  raise notice 'I1 pagina 1: 25 de randuri, totalul %', total;

  -- J2. Pagina 2 aduce restul.
  select count(*) into n from public.blog_articole_admin(25, 25, null, null) x where x.slug like 'zz-adm-%';
  if n <> 5 then raise exception 'I2: pagina 2 are % randuri, nu 5', n; end if;
  raise notice 'I2 pagina 2: restul de 5';

  -- J3. Filtrul de stare.
  select count(*) into n from public.blog_articole_admin(0, 100, null, 'published') x where x.slug like 'zz-adm-%';
  if n <> 10 then raise exception 'I3: % publicate, nu 10', n; end if;
  raise notice 'I3 filtrul de stare: 10 publicate din 30';

  -- J4. Cautarea gaseste textul scris CU diacritice, cerut FARA.
  --     Termenul vine pliat de sus, de `pregatesteCautarea`; coloana `cauta` e
  --     pliata de `fara_diacritice`. Daca cele doua se despart, aici se vede.
  select count(*) into n from public.blog_articole_admin(0, 100, 'livrari', null) x where x.slug like 'zz-adm-%';
  if n <> 30 then raise exception 'I4: „livrari" a gasit %, nu 30', n; end if;
  raise notice 'I4 cauta „livrari", gaseste „livrări"';

  -- J5. `%` NU intoarce toata baza: are inteles in `like` si vine scapat de sus.
  select count(*) into n from public.blog_articole_admin(0, 100, '\%', null) x;
  if n <> 0 then raise exception 'I5: procentul scapat a intors % randuri', n; end if;
  raise notice 'I5 procentul scapat nu mai intoarce toata baza';

  -- J6. Un termen inexistent intoarce zero, nu tot.
  select count(*) into n from public.blog_articole_admin(0, 100, 'zz-nu-exista-asa-ceva', null) x;
  if n <> 0 then raise exception 'I6: un termen inexistent a intors % randuri', n; end if;
  raise notice 'I6 termen inexistent: zero randuri';

  -- J7. Adminul numara SI ciornele; publicul, doar publicatele.
  --     Doua functii diferite dinadins: adminul care nu vede ciornele ar sterge o
  --     eticheta crezand ca nu e folosita nicaieri.
  insert into public.blog_tags (slug, name) values ('zz-adm-et','Zz Adm Et') returning id into et;
  insert into public.blog_post_tags (post_id, tag_id)
  select id, et from public.blog_posts where slug like 'zz-adm-0%';
  select cate into total from public.blog_etichete_admin() where slug = 'zz-adm-et';
  if total <> 9 then raise exception 'I7: adminul vede % legaturi, nu 9', total; end if;
  select coalesce(sum(cate),0) into publice from public.blog_etichete_folosite() where slug = 'zz-adm-et';
  if publice <> 3 then raise exception 'I7: publicul vede %, nu 3', publice; end if;
  raise notice 'I7 eticheta: adminul 9 (cu ciorne), publicul 3 (doar publicate)';

  delete from public.blog_posts where slug like 'zz-adm-%';
  delete from public.blog_tags  where slug like 'zz-adm-%';
  raise notice '════ I: toate au trecut ════';
end $;


-- ═══════════════════════════════════════════════════════════════════════════
-- K. VITRINA, REVENIREA SI USA DIRECTA (runda a treia de audit, 31.08.2026)
-- ═══════════════════════════════════════════════════════════════════════════
do $
declare a uuid; b uuid; ra uuid; v bigint; v_a bigint; r record; d1 timestamptz; d2 timestamptz; n int;
begin
  delete from public.blog_posts where slug like 'zz-k-%';

  -- ── K1. O CIORNA NU POATE GOLI VITRINA PUBLICA ─────────────────────────
  --
  -- Dovedit pe baza inainte de reparatie: A publicat si in vitrina; cineva
  -- bifeaza „scoate-l in fata" pe o CIORNA; declansatorul il cobora pe A; ciorna
  -- nu apare pe site. Masurat atunci: ZERO articole in vitrina publica.
  insert into public.blog_posts (slug, title, content_html, status, published_at, is_featured)
  values ('zz-k-public','A','<p>a</p>','published', now() - interval '1 day', true) returning id into a;
  select edit_version into v_a from public.blog_posts where id = a;

  insert into public.blog_posts (slug, title, content_html, status)
  values ('zz-k-ciorna','B','<p>b</p>','draft') returning id into b;
  update public.blog_posts set is_featured = true where id = b;

  if (select is_featured from public.blog_posts where id = b) then
    raise exception 'K1: o CIORNA a luat vitrina'; end if;
  if not (select is_featured from public.blog_posts where id = a) then
    raise exception 'K1: A a fost coborat de o ciorna'; end if;
  if (select edit_version from public.blog_posts where id = a) <> v_a then
    raise exception 'K1: versiunea lui A s-a miscat degeaba'; end if;
  raise notice 'K1 ciorna respinsa, A neatins';

  -- ── K2. NICI UN ARTICOL PROGRAMAT ──────────────────────────────────────
  update public.blog_posts set status='published', published_at = now() + interval '3 days' where id = b;
  update public.blog_posts set is_featured = true where id = b;
  if (select is_featured from public.blog_posts where id = b) then
    raise exception 'K2: un articol PROGRAMAT a luat vitrina'; end if;
  raise notice 'K2 articolul programat respins';

  -- ── K3. CEL VIZIBIL IA VITRINA, SI VERSIUNEA CELUI COBORAT CRESTE ──────
  --
  -- Fara cresterea aceea, coborarea e o schimbare pe care blocajul optimist n-o
  -- vede: o fila deschisa peste A ar salva cu versiunea veche, ar trece, iar
  -- sarcina ei ar readuce vitrina la A.
  select content_updated_at into d1 from public.blog_posts where id = a;
  update public.blog_posts set published_at = now() - interval '1 hour' where id = b;
  update public.blog_posts set is_featured = true where id = b;
  if not (select is_featured from public.blog_posts where id = b) then
    raise exception 'K3: vizibilul NU a luat vitrina'; end if;
  if (select is_featured from public.blog_posts where id = a) then
    raise exception 'K3: A a ramas in vitrina'; end if;
  if (select edit_version from public.blog_posts where id = a) <> v_a + 1 then
    raise exception 'K3: versiunea lui A nu a crescut'; end if;
  raise notice 'K3 vitrina a trecut la B, si versiunea lui A a crescut';

  -- ── K4. DAR NU SI DATA CONTINUTULUI: vitrina nu e continut ─────────────
  select content_updated_at into d2 from public.blog_posts where id = a;
  if d1 <> d2 then raise exception 'K4: coborarea a mutat data continutului'; end if;
  raise notice 'K4 data continutului lui A: neatinsa';

  -- ── K5. FILA VECHE PESTE A PRIMESTE P0409 ──────────────────────────────
  begin
    perform public.blog_salveaza_articol(a, jsonb_build_object('title','de la fila veche'),
                                         null, null, 50, v_a, true);
    raise exception 'K5: fila veche a scris peste, desi vitrina se mutase';
  exception when sqlstate 'P0409' then
    raise notice 'K5 fila veche: refuzata cu P0409';
  end;

  -- ── K6. IESIREA DIN PUBLIC SCOATE DIN VITRINA ──────────────────────────
  update public.blog_posts set status='archived' where id = b;
  if (select is_featured from public.blog_posts where id = b) then
    raise exception 'K6: a ramas in vitrina desi a fost arhivat'; end if;
  raise notice 'K6 arhivat → iese singur din vitrina';

  -- ── K7. REVENIREA CERE VERSIUNEA ───────────────────────────────────────
  select edit_version into v from public.blog_posts where id = a;
  v := public.blog_salveaza_articol(a, jsonb_build_object('title','A2','content_html','<p>doi</p>'),
                                    null, null, 50, v, true);
  select id into ra from public.blog_post_revisions where post_id = a order by created_at desc limit 1;

  begin
    perform public.blog_restaureaza_versiune(a, ra, 1, null, 2, 50);
    raise exception 'K7: a restaurat cu o versiune veche';
  exception when sqlstate 'P0409' then
    raise notice 'K7 revenire cu versiune veche: P0409';
  end;

  -- ── K8. REVIZIA TREBUIE SA FIE A ARTICOLULUI ───────────────────────────
  --
  -- Prin ecran nu se poate gresi, dar actiunea e o adresa POST: chemata de mana
  -- cu o revizie a lui A si id-ul lui B, textul lui A ajungea peste B.
  begin
    -- ⚠ Versiunea lui B, nu `null`: de la 31.08.2026 `null` e refuzat mai
    -- devreme (P0400), deci proba n-ar mai ajunge la ce vrea sa arate.
    perform public.blog_restaureaza_versiune(
      b, ra, (select edit_version from public.blog_posts where id = b), null, 2, 50);
    raise exception 'K8: a restaurat o revizie a ALTUI articol';
  exception when no_data_found then
    raise notice 'K8 revizie straina: refuzata';
  end;

  -- ── K9. REVENIREA BUNA INTOARCE CE A SCRIS ─────────────────────────────
  --
  -- Editorul isi pune starea din raspuns: `router.refresh()` singur nu atinge
  -- `useState`, deci formularul ramanea cu textul de dinainte.
  select edit_version into v from public.blog_posts where id = a;
  select * into r from public.blog_restaureaza_versiune(a, ra, v, null, 9, 50);
  if r.edit_version <> v + 1 then raise exception 'K9: versiunea intoarsa e %, nu %', r.edit_version, v+1; end if;
  if r.reading_minutes <> 9 then raise exception 'K9: minutele intoarse sunt %', r.reading_minutes; end if;
  if (select title from public.blog_posts where id = a) <> r.title then
    raise exception 'K9: ce a intors nu e ce e in baza'; end if;
  raise notice 'K9 revenirea intoarce titlul, textul, minutele si versiunea — si sunt cele din baza';

  -- ── K10. DATA ETICHETEI TINE SEAMA DE CONTINUT ─────────────────────────
  --
  -- Pagina unei etichete se schimba si cand se rescrie un articol DEJA publicat.
  -- `max(published_at)` spunea mai departe data publicarii.
  update public.blog_posts set status='published', published_at = now() - interval '30 days' where id = a;
  update public.blog_posts set content_updated_at = now() - interval '1 hour' where id = a;
  insert into public.blog_tags (slug, name) values ('zz-k-et','Zz K Et') on conflict (slug) do nothing;
  insert into public.blog_post_tags (post_id, tag_id)
  select a, id from public.blog_tags where slug = 'zz-k-et' on conflict do nothing;

  select ultima into d1 from public.blog_etichete_folosite() where slug = 'zz-k-et';
  if d1 < now() - interval '2 hours' then
    raise exception 'K10: data etichetei e %, deci s-a luat published_at, nu continutul', d1; end if;
  raise notice 'K10 data etichetei tine seama de continut, nu doar de publicare';

  -- ── K11. FEEDUL E CRONOLOGIC, NU DUPA FIXARE ───────────────────────────
  --
  -- `paginaDeArticole` ordoneaza `is_pinned` intai — bun pentru /blog, gresit
  -- pentru un feed: un articol fixat din ianuarie statea inaintea celui de ieri.
  update public.blog_posts set is_pinned = true where id = a;              -- vechi si FIXAT
  update public.blog_posts set status='published', published_at = now() - interval '1 hour',
                               is_pinned = false where id = b;             -- nou, nefixat
  select slug into r from public.blog_articole_pentru_feed(10) limit 1;
  if r.slug <> 'zz-k-ciorna' then
    raise exception 'K11: primul din feed e %, nu cel mai NOU articol', r.slug; end if;
  raise notice 'K11 feedul incepe cu cel mai nou, nu cu cel fixat';

  delete from public.blog_posts where slug like 'zz-k-%';
  delete from public.blog_tags  where slug like 'zz-k-%';
  raise notice '════ K: toate au trecut ════';
end $;

-- ═══════════════════════════════════════════════════════════════════════════
-- L. USA DIRECTA E INCHISA (RLS + granturi)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Blogul avea doua sisteme de autorizare, iar cel din RLS era mai slab decat cel
-- din actiunile de server: nu trecea prin MFA, nici prin plafoanele de lungime,
-- nici prin poarta pe gazdele de imagini, nici prin regulile de rol. Doua
-- sisteme inseamna ca cel mai slab hotaraste.
begin;

do $
declare cine uuid; a uuid; n int;
begin
  select id into cine from public.users_profile order by created_at limit 1;
  if cine is null then raise notice 'L SARITA: niciun cont'; return; end if;

  insert into public.blog_posts (slug, title, content_html, status, published_at)
  values ('zz-l-public','Public','<p>p</p>','published', now() - interval '1 day') returning id into a;
  insert into public.blog_posts (slug, title, content_html, status)
  values ('zz-l-ciorna','Ciorna','<p>c</p>','draft');

  update public.users_profile set role = 'editor' where id = cine;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', cine, 'role','authenticated')::text, true);

  begin
    insert into public.blog_posts (slug, title, content_html) values ('zz-l-nou','Nou','<p>n</p>');
    raise exception 'L1: a INSERAT un articol';
  exception when insufficient_privilege then raise notice 'L1 INSERT articol: refuzat'; end;

  begin
    update public.blog_posts set title = 'schimbat' where id = a;
    raise exception 'L2: a SCHIMBAT un articol';
  exception when insufficient_privilege then raise notice 'L2 UPDATE articol: refuzat'; end;

  begin
    delete from public.blog_posts where id = a;
    raise exception 'L3: a STERS un articol';
  exception when insufficient_privilege then raise notice 'L3 DELETE articol: refuzat'; end;

  begin
    insert into public.blog_tags (slug, name) values ('zz-l-et','Et');
    raise exception 'L4: a inserat o eticheta';
  exception when insufficient_privilege then raise notice 'L4 INSERT eticheta: refuzat'; end;

  -- Citirea PUBLICULUI ramane: de acolo traieste site-ul.
  select count(*) into n from public.blog_posts where slug = 'zz-l-public';
  if n <> 1 then raise exception 'L5: nu mai vede nici articolele publicate'; end if;
  raise notice 'L5 citirea publicului: neatinsa';

  -- Dar CIORNELE nu se mai vad prin REST.
  select count(*) into n from public.blog_posts where slug = 'zz-l-ciorna';
  if n <> 0 then raise exception 'L6: ciornele inca se vad prin REST'; end if;
  raise notice 'L6 ciornele: nu se mai vad prin REST';

  begin
    perform count(*) from public.blog_post_revisions;
    raise exception 'L7: inca vede reviziile';
  exception when insufficient_privilege then raise notice 'L7 reviziile: refuzate'; end;

  begin
    perform count(*) from public.blog_subscribers;
    raise exception 'L8: inca vede abonatii';
  exception when insufficient_privilege then raise notice 'L8 abonatii: refuzati'; end;

  -- `user_id` al autorului: nici pentru un cont autentificat.
  begin
    perform user_id from public.blog_authors limit 1;
    raise exception 'L9: inca vede user_id al autorilor';
  exception when insufficient_privilege then raise notice 'L9 user_id al autorului: refuzat'; end;

  reset role;
  raise notice '════ L: usa directa e inchisa ════';
end $;

rollback;


-- ═══════════════════════════════════════════════════════════════════════════
-- M. RUNDA A PATRA: versiunea obligatorie, fixarea pastrata, etichetele
-- ═══════════════════════════════════════════════════════════════════════════
do $
declare aut uuid; cat uuid; et uuid; a uuid; v bigint; d1 timestamptz; d2 timestamptz;
begin
  delete from public.blog_posts where slug like 'zz-m-%';
  delete from public.blog_authors where slug like 'zz-m-%';
  delete from public.blog_categories where slug like 'zz-m-%';
  delete from public.blog_tags where slug like 'zz-m-%';

  insert into public.blog_authors (slug, name, bio) values ('zz-m-autor','Neanuntat','biografie') returning id into aut;
  insert into public.blog_categories (slug, name) values ('zz-m-rubrica','Rubrica') returning id into cat;
  insert into public.blog_tags (slug, name) values ('zz-m-et','Eticheta') returning id into et;

  -- ── M1. O taxonomie FARA articol public nu exista public ───────────────
  --
  -- Paginile lor dau deja 404 dinadins. Dar RLS spunea `using (true)`, deci
  -- REST-ul le intorcea oricum: un autor pregatit pentru cineva neanuntat inca —
  -- nume, rol, biografie — se putea citi de oricine.
  set local role anon;
  if exists (select 1 from public.blog_authors where slug='zz-m-autor') then
    raise exception 'M1: un autor FARA articol public se vede de anon'; end if;
  if exists (select 1 from public.blog_categories where slug='zz-m-rubrica') then
    raise exception 'M1: o rubrica fara articol public se vede'; end if;
  if exists (select 1 from public.blog_tags where slug='zz-m-et') then
    raise exception 'M1: o eticheta fara articol public se vede'; end if;
  reset role;
  raise notice 'M1 fara continut public: nu exista public';

  insert into public.blog_posts (slug, title, content_html, status, published_at, author_id, category_id)
  values ('zz-m-art','Art','<p>x</p>','published', now() - interval '1 day', aut, cat) returning id into a;
  insert into public.blog_post_tags (post_id, tag_id) values (a, et);

  set local role anon;
  if not exists (select 1 from public.blog_authors where slug='zz-m-autor') then
    raise exception 'M2: autorul CU articol public nu se mai vede'; end if;
  if not exists (select 1 from public.blog_categories where slug='zz-m-rubrica') then
    raise exception 'M2: rubrica cu articol public nu se vede'; end if;
  if not exists (select 1 from public.blog_tags where slug='zz-m-et') then
    raise exception 'M2: eticheta cu articol public nu se vede'; end if;
  reset role;
  raise notice 'M2 cu articol public: toate trei se vad';

  -- ── M3. Versiunea e obligatorie, si la salvare si la revenire ──────────
  begin
    perform public.blog_salveaza_articol(a, jsonb_build_object('title','x'), null, null, 50, null, true);
    raise exception 'M3: a salvat FARA versiune';
  exception when sqlstate 'P0400' then raise notice 'M3 salvare fara versiune: P0400'; end;

  begin
    perform public.blog_restaureaza_versiune(a, gen_random_uuid(), null, null, 2, 50);
    raise exception 'M3: a revenit FARA versiune';
  exception when sqlstate 'P0400' then raise notice 'M3 revenire fara versiune: P0400'; end;

  -- ── M4. Eticheta schimbata MUTA data continutului ──────────────────────
  --
  -- Etichetele nu stau pe `blog_posts`, deci declansatorul de continut nu le
  -- vede. Dar ele apar sub articol si pe pagina etichetei — deci schimbarea lor
  -- chiar schimba ce vede cititorul.
  update public.blog_posts set content_updated_at = now() - interval '10 days' where id = a;
  select content_updated_at, edit_version into d1, v from public.blog_posts where id = a;
  v := public.blog_salveaza_articol(a, '{}'::jsonb,
        '[{"slug":"zz-m-et","name":"Eticheta"},{"slug":"zz-m-et2","name":"A doua"}]'::jsonb,
        null, 50, v, false);
  select content_updated_at into d2 from public.blog_posts where id = a;
  if d2 <= d1 then raise exception 'M4: eticheta noua NU a mutat data continutului'; end if;
  raise notice 'M4 eticheta adaugata → data continutului s-a mutat';

  -- ── M5. Aceleasi etichete, alta ordine: data NU se misca ───────────────
  select content_updated_at, edit_version into d1, v from public.blog_posts where id = a;
  v := public.blog_salveaza_articol(a, '{}'::jsonb,
        '[{"slug":"zz-m-et2","name":"A doua"},{"slug":"zz-m-et","name":"Eticheta"}]'::jsonb,
        null, 50, v, false);
  select content_updated_at into d2 from public.blog_posts where id = a;
  if d1 <> d2 then raise exception 'M5: o REORDONARE a mutat data continutului'; end if;
  raise notice 'M5 aceleasi etichete, alta ordine → data neatinsa';

  -- ── M6. O cheie lipsa pastreaza fixarea ────────────────────────────────
  --
  -- Un admin fixeaza un articol la verificare; un redactor ii schimba un
  -- paragraf si salveaza. Inainte, actiunea trimitea `is_pinned: false` pentru
  -- redactori — deci fixarea adminului disparea, iar redactorul n-avea de unde
  -- sa stie: bifa nici nu i se arata.
  update public.blog_posts set is_pinned = true where id = a;
  select edit_version into v from public.blog_posts where id = a;
  v := public.blog_salveaza_articol(a, jsonb_build_object('content_html','<p>alt paragraf</p>'),
                                    null, null, 50, v, false);
  if not (select is_pinned from public.blog_posts where id = a) then
    raise exception 'M6: o salvare fara cheia is_pinned a stins fixarea'; end if;
  raise notice 'M6 cheia lipsa pastreaza fixarea';

  -- ── M7/M8. CE N-AM SCHIMBAT, DAR AM REscris ────────────────────────────
  --
  -- ⚠ ASTEA DOUA NU PAZESC O SCHIMBARE, PAZESC O REscriere.
  --
  -- Pe 31.08.2026 am refacut corpul lui `blog_salveaza_articol` ca sa cer
  -- versiunea. Am pastrat logica si am pierdut TOATE comentariile din el — 47 de
  -- randuri de „de ce", sterse fara sa bage nimeni de seama, fiindca baseline-ul
  -- e un dump al bazei: la prima regenerare ar fi disparut si din repo.
  --
  -- Daca o rescriere poate pierde tacut comentariile, poate pierde tacut si un
  -- `if`. Redirectarea si istoricul sunt cele doua bucati din functie de care
  -- runda asta nu s-a atins deloc — deci exact cele pe care nimeni nu s-ar gandi
  -- sa le verifice dupa.
  select edit_version into v from public.blog_posts where id = a;
  v := public.blog_salveaza_articol(a, jsonb_build_object('slug','zz-m-mutat'),
                                    null, null, 50, v, true);
  if not exists (select 1 from public.blog_redirects
                  where fel = 'articol' and from_slug = 'zz-m-art' and to_slug = 'zz-m-mutat') then
    raise exception 'M7: slugul schimbat pe un articol VIZIBIL nu a lasat redirectare';
  end if;
  raise notice 'M7 redirectarea a supravietuit rescrierii';

  if (select count(*) from public.blog_post_revisions where post_id = a) = 0 then
    raise exception 'M8: p_creeaza_versiune = true nu a scris nicio revizie';
  end if;
  raise notice 'M8 istoricul a supravietuit rescrierii';

  delete from public.blog_posts where slug like 'zz-m-%';
  delete from public.blog_authors where slug like 'zz-m-%';
  delete from public.blog_categories where slug like 'zz-m-%';
  delete from public.blog_tags where slug like 'zz-m-%';
  delete from public.blog_redirects where from_slug like 'zz-m-%' or to_slug like 'zz-m-%';
  raise notice '════ M: toate au trecut ════';
end $;


-- ═══════════════════════════════════════════════════════════════════════════
-- N. MODIFICARILE INDIRECTE ALE ARTICOLULUI CRESC `edit_version`
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ INVARIANTUL, SCRIS O DATA: orice schimbare pe care o VEDE CITITORUL trebuie
-- sa creasca `edit_version`. Nu doar cele facute prin `blog_salveaza_articol`.
--
-- Pana pe 31.08.2026 numarul crestea numai la scrierea articolului. Dar articolul
-- se schimba si altfel: stergi o eticheta si ea dispare de sub el; stergi un
-- autor si semnatura se goleste. Fila deschisa a altcuiva nu afla nimic si scrie
-- peste — iar la etichete e mai rau, fiindca salvarea REINVIE eticheta stearsa.
do $do$
declare aut uuid; cat uuid; et uuid; a uuid; v0 bigint; v1 bigint; d0 timestamptz; d1 timestamptz;
begin
  delete from public.blog_posts where slug like 'zz-n-%';
  delete from public.blog_authors where slug like 'zz-n-%';
  delete from public.blog_categories where slug like 'zz-n-%';
  delete from public.blog_tags where slug like 'zz-n-%';
  delete from public.blog_redirects where from_slug like 'zz-n-%' or to_slug like 'zz-n-%';

  insert into public.blog_authors (slug,name) values ('zz-n-aut','Aut') returning id into aut;
  insert into public.blog_categories (slug,name) values ('zz-n-cat','Cat') returning id into cat;
  insert into public.blog_tags (slug,name) values ('zz-n-et','Et') returning id into et;
  insert into public.blog_posts (slug,title,content_html,status,published_at,author_id,category_id)
    values ('zz-n-art','Art','<p>x</p>','published', now()-interval '1 day', aut, cat) returning id into a;
  insert into public.blog_post_tags (post_id,tag_id) values (a,et);

  -- ── N1. Stergerea etichetei misca si versiunea, si data continutului ────
  update public.blog_posts set content_updated_at = now()-interval '10 days' where id = a;
  select edit_version, content_updated_at into v0, d0 from public.blog_posts where id = a;

  if not public.blog_sterge_eticheta(et) then raise exception 'N1: functia a intors false'; end if;

  select edit_version, content_updated_at into v1, d1 from public.blog_posts where id = a;
  if v1 <> v0 + 1 then raise exception 'N1: versiunea NU a crescut (% -> %)', v0, v1; end if;
  if d1 <= d0 then raise exception 'N1: content_updated_at NU s-a miscat'; end if;
  if exists (select 1 from public.blog_post_tags where post_id = a) then
    raise exception 'N1: legatura a ramas dupa stergere'; end if;
  raise notice 'N1 stergerea etichetei: versiune % -> %, data mutata', v0, v1;

  -- ── N1b. MIEZUL: fila veche e refuzata SI eticheta nu reinvie ───────────
  --
  -- Fara N1 inaintea ei, proba asta ar trece degeaba. Cu N1, e chiar lantul
  -- care se rupea: eticheta stearsa reaparea la prima salvare a filei vechi.
  begin
    perform public.blog_salveaza_articol(a, '{}'::jsonb,
      '[{"slug":"zz-n-et","name":"Et"}]'::jsonb, null, 50, v0, false);
    raise exception 'N1b: fila veche A SCRIS, desi versiunea era depasita';
  exception when sqlstate 'P0409' then null; end;

  if exists (select 1 from public.blog_tags where slug = 'zz-n-et') then
    raise exception 'N1b: eticheta a fost REINVIATA de fila veche';
  end if;
  raise notice 'N1b fila veche: P0409, iar eticheta ramane stearsa';

  -- ── N2. Stergerea rubricii ──────────────────────────────────────────────
  update public.blog_posts set content_updated_at = now()-interval '10 days' where id = a;
  select edit_version, content_updated_at into v0, d0 from public.blog_posts where id = a;

  if not public.blog_sterge_taxonomia('categorie', cat) then raise exception 'N2: a intors false'; end if;

  select edit_version, content_updated_at, category_id into v1, d1, cat from public.blog_posts where id = a;
  if v1 <> v0 + 1 then raise exception 'N2: versiunea NU a crescut (% -> %)', v0, v1; end if;
  if d1 <= d0 then raise exception 'N2: content_updated_at NU s-a miscat'; end if;
  if cat is not null then raise exception 'N2: category_id nu s-a golit'; end if;
  raise notice 'N2 stergerea rubricii: % -> %', v0, v1;

  begin
    perform public.blog_salveaza_articol(a, jsonb_build_object('title','x'), null, null, 50, v0, false);
    raise exception 'N2b: fila veche a scris dupa stergerea rubricii';
  exception when sqlstate 'P0409' then raise notice 'N2b fila veche: P0409'; end;

  -- ── N3. Stergerea autorului ─────────────────────────────────────────────
  update public.blog_posts set content_updated_at = now()-interval '10 days' where id = a;
  select edit_version, content_updated_at into v0, d0 from public.blog_posts where id = a;

  if not public.blog_sterge_taxonomia('autor', aut) then raise exception 'N3: a intors false'; end if;

  select edit_version, content_updated_at, author_id into v1, d1, aut from public.blog_posts where id = a;
  if v1 <> v0 + 1 then raise exception 'N3: versiunea NU a crescut'; end if;
  if d1 <= d0 then raise exception 'N3: data NU s-a miscat'; end if;
  if aut is not null then raise exception 'N3: author_id nu s-a golit'; end if;
  raise notice 'N3 stergerea autorului: % -> %', v0, v1;

  delete from public.blog_posts where slug like 'zz-n-%';
  delete from public.blog_authors where slug like 'zz-n-%';
  delete from public.blog_categories where slug like 'zz-n-%';
  delete from public.blog_tags where slug like 'zz-n-%';
  delete from public.blog_redirects where from_slug like 'zz-n-%' or to_slug like 'zz-n-%';
  raise notice '════ N1-N3: toate au trecut ════';
end $do$;

-- ═══════════════════════════════════════════════════════════════════════════
-- N4. REDIRECTARILE TAXONOMIILOR SUNT LA FEL DE DISCRETE CA TAXONOMIILE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Politica veche era `fel <> 'articol' OR (articolul tinta e publicat)`: pentru
-- articole se cerea o tinta vizibila, pentru rubrici si autori NIMIC. Dupa ce am
-- ascuns taxonomiile fara continut public (runda a patra), asimetria expunea
-- slugul unei rubrici nepublicate si dadea 308 catre o pagina care raspunde 404.
do $do$
declare cat uuid; aut uuid; a uuid;
begin
  delete from public.blog_posts where slug like 'zz-r-%';
  delete from public.blog_categories where slug like 'zz-r-%';
  delete from public.blog_authors where slug like 'zz-r-%';
  delete from public.blog_redirects where from_slug like 'zz-r-%' or to_slug like 'zz-r-%';

  insert into public.blog_categories (slug,name) values ('zz-r-nou','Rubrica') returning id into cat;
  insert into public.blog_authors (slug,name) values ('zz-r-anou','Autor') returning id into aut;
  insert into public.blog_redirects (fel,from_slug,to_slug) values ('categorie','zz-r-vechi','zz-r-nou');
  insert into public.blog_redirects (fel,from_slug,to_slug) values ('autor','zz-r-avechi','zz-r-anou');

  set local role anon;
  if exists (select 1 from public.blog_redirects where from_slug='zz-r-vechi') then
    raise exception 'N4a: redirectarea unei RUBRICI fara articol public se vede'; end if;
  if exists (select 1 from public.blog_redirects where from_slug='zz-r-avechi') then
    raise exception 'N4a: redirectarea unui AUTOR fara articol public se vede'; end if;
  reset role;
  raise notice 'N4a fara continut public: redirectarile nu exista public';

  insert into public.blog_posts (slug,title,content_html,status,published_at,category_id,author_id)
    values ('zz-r-art','A','<p>x</p>','published', now()-interval '1 day', cat, aut) returning id into a;

  -- ⚠ SENSUL AL DOILEA E OBLIGATORIU. Fara el, o politica `using (false)` ar
  -- trece proba N4a si ar strica TOATE redirectarile, fara ca nimeni sa afle.
  set local role anon;
  if not exists (select 1 from public.blog_redirects where from_slug='zz-r-vechi') then
    raise exception 'N4b: redirectarea rubricii NU se vede desi are articol public'; end if;
  if not exists (select 1 from public.blog_redirects where from_slug='zz-r-avechi') then
    raise exception 'N4b: redirectarea autorului NU se vede desi are articol public'; end if;
  reset role;
  raise notice 'N4b cu articol public: amandoua se vad';

  update public.blog_posts set status='draft' where id = a;
  set local role anon;
  if exists (select 1 from public.blog_redirects where from_slug='zz-r-vechi') then
    raise exception 'N4c: redirectarea a ramas vizibila dupa ce articolul a devenit ciorna'; end if;
  reset role;
  raise notice 'N4c articolul ascuns → redirectarea se ascunde';

  -- ⚠ Ce mergea inainte trebuie sa mearga si dupa: politica a fost rescrisa
  -- INTREAGA, deci ramura articolelor putea fi stricata fara sa observe nimeni.
  update public.blog_posts set status='published' where id = a;
  insert into public.blog_redirects (fel,from_slug,to_slug) values ('articol','zz-r-vart','zz-r-art');
  set local role anon;
  if not exists (select 1 from public.blog_redirects where from_slug='zz-r-vart') then
    raise exception 'N4d: redirectarea de ARTICOL nu se mai vede — am stricat ce mergea'; end if;
  reset role;
  raise notice 'N4d redirectarea de articol merge mai departe';

  delete from public.blog_posts where slug like 'zz-r-%';
  delete from public.blog_categories where slug like 'zz-r-%';
  delete from public.blog_authors where slug like 'zz-r-%';
  delete from public.blog_redirects where from_slug like 'zz-r-%' or to_slug like 'zz-r-%';
  raise notice '════ N4: toate au trecut ════';
end $do$;


-- ═══════════════════════════════════════════════════════════════════════════
-- T. DATA CONTINUTULUI PE TAXONOMII (runda a sasea, 31.08.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Sitemapul lua data unei rubrici sau a unui autor NUMAI din articolele lor.
-- Deci o descriere de rubrica sau o biografie schimbata nu ajungea la Google.
--
-- ⚠ REMEDIUL EVIDENT AR FI FOST GRESIT. Auditul cerea sa se foloseasca
-- `updated_at`. Dar acela se muta la ORICE atingere administrativa, iar regula
-- „`updated_at` nu ajunge la Google" e scrisa in patru locuri din depozit —
-- pentru articole s-a platit o coloana noua tocmai ca sa se poata deosebi o
-- editare de o bifa. Taxonomiile au primit acum acelasi lucru.
do $do$
declare cat uuid; aut uuid; d0 timestamptz; d1 timestamptz;
begin
  delete from public.blog_categories where slug like 'zz-t-%';
  delete from public.blog_authors where slug like 'zz-t-%';
  delete from public.blog_redirects where from_slug like 'zz-t-%' or to_slug like 'zz-t-%';

  insert into public.blog_categories (slug,name,description) values ('zz-t-cat','Cat','veche') returning id into cat;
  insert into public.blog_authors (slug,name,bio,role_title) values ('zz-t-aut','Aut','bio veche','rol') returning id into aut;

  -- ── T1. Ce VEDE cititorul muta data ────────────────────────────────────
  update public.blog_categories set content_updated_at = now() - interval '10 days' where id = cat;
  select content_updated_at into d0 from public.blog_categories where id = cat;
  perform public.blog_actualizeaza_taxonomia('categorie', cat,
    jsonb_build_object('name','Cat','slug','zz-t-cat','description','ALTA descriere','sort_order',0));
  select content_updated_at into d1 from public.blog_categories where id = cat;
  if d1 <= d0 then raise exception 'T1: descrierea schimbata NU a mutat data'; end if;
  raise notice 'T1 descrierea rubricii muta data';

  -- ── T2. Ce NU vede, nu o muta ──────────────────────────────────────────
  --
  -- ⚠ SENSUL ASTA E MIEZUL. Fara el, o functie care ar muta data la fiecare
  -- salvare ar trece T1 si ar reintroduce chiar minciuna pe care o reparam.
  update public.blog_categories set content_updated_at = now() - interval '10 days' where id = cat;
  select content_updated_at into d0 from public.blog_categories where id = cat;
  perform public.blog_actualizeaza_taxonomia('categorie', cat,
    jsonb_build_object('name','Cat','slug','zz-t-cat','description','ALTA descriere','sort_order',99));
  select content_updated_at into d1 from public.blog_categories where id = cat;
  if d1 <> d0 then raise exception 'T2: `sort_order` a mutat data, desi nu se vede pe pagina'; end if;
  raise notice 'T2 reasezarea in lista nu misca data';

  -- ── T3/T4. Acelasi lucru la autor ──────────────────────────────────────
  update public.blog_authors set content_updated_at = now() - interval '10 days' where id = aut;
  select content_updated_at into d0 from public.blog_authors where id = aut;
  perform public.blog_actualizeaza_taxonomia('autor', aut,
    jsonb_build_object('name','Aut','slug','zz-t-aut','role_title','rol','bio','BIO NOUA',
                       'sameas', array[]::text[]));
  select content_updated_at into d1 from public.blog_authors where id = aut;
  if d1 <= d0 then raise exception 'T3: biografia schimbata NU a mutat data'; end if;
  raise notice 'T3 biografia muta data';

  update public.blog_authors set content_updated_at = now() - interval '10 days' where id = aut;
  select content_updated_at into d0 from public.blog_authors where id = aut;
  perform public.blog_actualizeaza_taxonomia('autor', aut,
    jsonb_build_object('name','Aut','slug','zz-t-aut','role_title','rol','bio','BIO NOUA',
                       'sameas', array[]::text[], 'user_id', (select id from auth.users limit 1)));
  select content_updated_at into d1 from public.blog_authors where id = aut;
  if d1 <> d0 then raise exception 'T4: legarea contului a mutat data, desi nu se vede'; end if;
  raise notice 'T4 legarea contului nu misca data';

  -- ── T5. Ce mergea inainte merge si dupa ────────────────────────────────
  perform public.blog_actualizeaza_taxonomia('categorie', cat,
    jsonb_build_object('name','Cat','slug','zz-t-cat-nou','description','ALTA descriere','sort_order',99));
  if not exists (select 1 from public.blog_redirects
                  where fel='categorie' and from_slug='zz-t-cat' and to_slug='zz-t-cat-nou') then
    raise exception 'T5: redenumirea NU a lasat redirectare — am stricat ce mergea';
  end if;
  raise notice 'T5 redirectarea la redenumire merge mai departe';

  delete from public.blog_categories where slug like 'zz-t-%';
  delete from public.blog_authors where slug like 'zz-t-%';
  delete from public.blog_redirects where from_slug like 'zz-t-%' or to_slug like 'zz-t-%';
  raise notice '════ T: toate au trecut ════';
end $do$;

-- ═══════════════════════════════════════════════════════════════════════════
-- G. DREPTURILE DE PRISOS SUNT LUATE, IAR DECLANSATOARELE MERG MAI DEPARTE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ A DOUA JUMATATE E CEA CARE CONTEAZA. O revocare care merge dar opreste un
-- declansator ar fi mai rea decat drepturile de prisos.
do $do$
declare a uuid; d0 timestamptz; d1 timestamptz; n int;
begin
  select count(*) into n
  from pg_class c
  join pg_namespace ns on ns.oid = c.relnamespace
  cross join lateral aclexplode(c.relacl) g
  where ns.nspname = 'public' and c.relname like 'blog\_%'
    and pg_get_userbyid(g.grantee) in ('anon','authenticated')
    and g.privilege_type in ('REFERENCES','TRIGGER','INSERT','UPDATE','DELETE','TRUNCATE');
  if n <> 0 then
    raise exception 'G0: `anon`/`authenticated` mai au % drepturi de scriere sau DDL pe tabelele blogului', n;
  end if;
  raise notice 'G0 niciun drept de prisos ramas';

  delete from public.blog_posts where slug like 'zz-g-%';
  insert into public.blog_posts (slug,title,content_html,status)
    values ('zz-g-art','T','<p>x</p>','draft') returning id into a;

  update public.blog_posts set content_updated_at = now() - interval '10 days' where id = a;
  select content_updated_at into d0 from public.blog_posts where id = a;
  update public.blog_posts set title = 'ALT TITLU' where id = a;
  select content_updated_at into d1 from public.blog_posts where id = a;
  if d1 <= d0 then raise exception 'G1: declansatorul de continut NU mai porneste dupa revocare'; end if;
  raise notice 'G1 declansatorul de continut merge mai departe';

  update public.blog_posts set status='published', published_at=now()-interval '1 day' where id = a;
  update public.blog_posts set is_featured = true where id = a;
  if not (select is_featured from public.blog_posts where id = a) then
    raise exception 'G2: declansatorul de vitrina s-a stricat';
  end if;
  raise notice 'G2 declansatorul de vitrina merge mai departe';

  delete from public.blog_posts where slug like 'zz-g-%';
  raise notice '════ G: toate au trecut ════';
end $do$;


-- ═══════════════════════════════════════════════════════════════════════════
-- R. RETENTIA ABONARILOR NECONFIRMATE (runda a saptea, 31.08.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Dubla confirmare spune pe fata ca nu socotim pe nimeni abonat pana nu apasa.
-- Dar randul ramanea in baza oricum, cu adresa cu tot, desi nu poate primi nimic
-- si jetonul lui e demult stins. Si nu neaparat adresa celui care a scris-o:
-- oricine poate tasta adresa altcuiva. Exact de aceea exista dubla confirmare.
--
-- ⚠ CELE PATRU AFIRMATII DE „RAMANE" SUNT MIEZUL, nu cea de „se sterge". O
-- conditie prea larga aici goleste lista fara ca nimeni sa afle pana la prima
-- campanie — si nu se mai poate lua inapoi.
do $do$
declare n integer;
begin
  delete from public.blog_subscribers where email like 'zz-ret-%';

  -- rest adevarat: neconfirmat, vechi, jeton stins
  insert into public.blog_subscribers (email, source, created_at, token_expires_at)
    values ('zz-ret-vechi@x.ro','proba', now() - interval '90 days', now() - interval '88 days');
  -- ⚠ vechi, DAR cu jeton proaspat: a reincercat ieri, e o confirmare IN CURS
  insert into public.blog_subscribers (email, source, created_at, token_expires_at)
    values ('zz-ret-reincercat@x.ro','proba', now() - interval '90 days', now() + interval '1 day');
  -- recent
  insert into public.blog_subscribers (email, source, created_at, token_expires_at)
    values ('zz-ret-recent@x.ro','proba', now() - interval '2 days', now() - interval '1 day');
  -- CONFIRMAT si vechi
  insert into public.blog_subscribers (email, source, created_at, confirmed_at, token_expires_at)
    values ('zz-ret-confirmat@x.ro','proba', now() - interval '90 days', now() - interval '89 days', now() - interval '88 days');
  -- DEZABONAT: o hotarare a omului, nu o abonare esuata
  insert into public.blog_subscribers (email, source, created_at, unsubscribed_at, token_expires_at)
    values ('zz-ret-dezabonat@x.ro','proba', now() - interval '90 days', now() - interval '80 days', now() - interval '88 days');

  n := public.blog_curata_abonari_neconfirmate(30);
  if n <> 1 then raise exception 'R1: trebuia sters exact 1 rand, s-au sters %', n; end if;
  if exists (select 1 from public.blog_subscribers where email='zz-ret-vechi@x.ro') then
    raise exception 'R1: restul vechi n-a fost sters'; end if;
  raise notice 'R1 restul vechi cu jeton stins: sters';

  if not exists (select 1 from public.blog_subscribers where email='zz-ret-reincercat@x.ro') then
    raise exception 'R2: o confirmare IN CURS a fost stearsa (jeton proaspat, created_at vechi)'; end if;
  raise notice 'R2 confirmarea in curs: ramane';

  if not exists (select 1 from public.blog_subscribers where email='zz-ret-recent@x.ro') then
    raise exception 'R3: o abonare recenta a fost stearsa'; end if;
  raise notice 'R3 abonarea recenta: ramane';

  if not exists (select 1 from public.blog_subscribers where email='zz-ret-confirmat@x.ro') then
    raise exception 'R4: un ABONAT CONFIRMAT a fost sters'; end if;
  raise notice 'R4 abonatul confirmat: ramane';

  if not exists (select 1 from public.blog_subscribers where email='zz-ret-dezabonat@x.ro') then
    raise exception 'R5: un DEZABONAT a fost sters — s-ar putea reabona din greseala la primul import'; end if;
  raise notice 'R5 dezabonatul: ramane';

  begin
    perform public.blog_curata_abonari_neconfirmate(0);
    raise exception 'R6: a primit 0 zile, deci ar fi sters tot ce nu e confirmat';
  exception when sqlstate 'P0400' then raise notice 'R6 zero zile: refuzat'; end;

  delete from public.blog_subscribers where email like 'zz-ret-%';
  raise notice '════ R: toate au trecut ════';
end $do$;

-- ═══════════════════════════════════════════════════════════════════════════
-- J. NIMIC NU A RAMAS IN URMA
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare n int := 0;
begin
  select
    (select count(*) from public.blog_subscribers where email like 'zz-ret-%')
  + (select count(*) from public.blog_categories  where slug like 'zz-t-%')
  + (select count(*) from public.blog_authors     where slug like 'zz-t-%')
  + (select count(*) from public.blog_posts       where slug like 'zz-g-%')
  + (select count(*) from public.blog_posts       where slug like 'zz-n-%' or slug like 'zz-r-%')
  + (select count(*) from public.blog_tags        where slug like 'zz-n-%')
  + (select count(*) from public.blog_authors     where slug like 'zz-n-%' or slug like 'zz-r-%')
  + (select count(*) from public.blog_categories  where slug like 'zz-n-%' or slug like 'zz-r-%')
  + (select count(*) from public.blog_redirects   where from_slug like 'zz-n-%' or from_slug like 'zz-r-%')
  + (select count(*) from public.blog_redirects   where from_slug like 'zz-m-%' or to_slug like 'zz-m-%')
  + (select count(*) from public.blog_posts       where slug like 'zz-m-%')
  + (select count(*) from public.blog_authors     where slug like 'zz-m-%')
  + (select count(*) from public.blog_categories  where slug like 'zz-m-%')
  + (select count(*) from public.blog_tags        where slug like 'zz-m-%')
  + (select count(*) from public.blog_posts       where slug like 'zz-k-%')
  + (select count(*) from public.blog_tags        where slug like 'zz-k-%')
  + (select count(*) from public.blog_posts       where slug like 'zz-l-%')
  + (select count(*) from public.blog_posts       where slug like 'zz-adm-%')
  + (select count(*) from public.blog_tags        where slug like 'zz-adm-%')
  + (select count(*) from public.blog_posts       where slug like 'zz-proba-%')
  + (select count(*) from public.blog_categories  where slug like 'zz-proba-%')
  + (select count(*) from public.blog_authors     where slug like 'zz-proba-%')
  + (select count(*) from public.blog_tags        where slug like 'zz-proba-%')
  + (select count(*) from public.blog_redirects   where from_slug like 'zz-proba-%' or to_slug like 'zz-proba-%')
  + (select count(*) from public.blog_subscribers where email like 'zz-proba-%')
  into n;
  if n <> 0 then raise exception 'J: au ramas % randuri de proba in baza', n; end if;

  if exists (select 1 from public.users_profile where role = 'editor') then
    raise notice 'J ATENTIE: exista conturi cu rolul `editor`. Daca nu le-ai facut tu, blocul H n-a dat rollback.';
  end if;

  raise notice '════════ I: baza e curata ════════';
end $$;

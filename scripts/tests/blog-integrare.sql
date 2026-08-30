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
  v := public.blog_salveaza_articol(a, jsonb_build_object('slug','zz-proba-b'), null, null, 50, null, true);
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

  -- B3. `null` sare peste verificare — dinadins, pentru unelte si reparatii.
  v := public.blog_salveaza_articol(a, jsonb_build_object('title','fara verificare'), null, null, 50, null, true);
  raise notice 'B3 null sare peste verificare, cum e scris';

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
  raise notice '════════ A, B, C, D, E, F, G: toate au trecut ════════';
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
-- I. NIMIC NU A RAMAS IN URMA
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare n int := 0;
begin
  select
    (select count(*) from public.blog_posts       where slug like 'zz-proba-%')
  + (select count(*) from public.blog_categories  where slug like 'zz-proba-%')
  + (select count(*) from public.blog_authors     where slug like 'zz-proba-%')
  + (select count(*) from public.blog_tags        where slug like 'zz-proba-%')
  + (select count(*) from public.blog_redirects   where from_slug like 'zz-proba-%' or to_slug like 'zz-proba-%')
  + (select count(*) from public.blog_subscribers where email like 'zz-proba-%')
  into n;
  if n <> 0 then raise exception 'I: au ramas % randuri de proba in baza', n; end if;

  if exists (select 1 from public.users_profile where role = 'editor') then
    raise notice 'I ATENTIE: exista conturi cu rolul `editor`. Daca nu le-ai facut tu, blocul H n-a dat rollback.';
  end if;

  raise notice '════════ I: baza e curata ════════';
end $$;

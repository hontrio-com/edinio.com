-- ═══ O SALVARE, O TRANZACTIE ═══
--
-- Salvarea unui articol erau CINCI cereri pe rand: actualizarea randului,
-- stergerea redirectarii inverse, scrierea redirectarii noi, refacerea
-- etichetelor, scrierea versiunii. Fiecare izbutea sau cadea singura.
--
-- Ce lasa in urma o cadere la mijloc:
--   - slug schimbat, redirectare nescrisa → adresa veche da 404, si tot ce
--     stransese articolul in Google se pierde;
--   - articol salvat, etichete nescrise → dispare din rubricile lui de pe site;
--   - articol salvat, versiune nescrisa → istoricul minte despre ce a fost.
--
-- Nimic din toate astea nu dadea eroare vizibila: ecranul spunea „salvat",
-- fiindca PRIMA cerere chiar izbutise.
--
-- PostgREST ruleaza o functie intr-o singura tranzactie. Deci ori toate, ori
-- niciuna.
--
-- ⚠ NU E `security definer`, DINADINS. Se cheama oricum cu cheia de serviciu
-- (vezi `blogDb()` din `blog.actions.ts`), iar `definer` ar fi adaugat o cale
-- ocolitoare in plus fara sa castige nimic.
--
-- Inchide, din auditul din 30.08.2026: #6 (salvare neatomica), #7 (istoricul
-- crestea la nesfarsit) si jumatatea de lanturi din #8.

create or replace function public.blog_salveaza_articol(
  p_id              uuid,
  p_rand            jsonb,
  p_etichete        jsonb,      -- [{slug, name}, ...]  sau  null = „nu atinge"
  p_slug_vechi      text,
  p_lasa_redirect   boolean,
  p_salvat_de       uuid,
  p_titlu_vechi     text,
  p_html_vechi      text,
  p_versiuni        int
) returns void
language plpgsql
as $$
declare
  v_slug_nou text;
begin
  -- ═══ 1. Randul articolului ═══
  --
  -- ⚠ Se porneste de la randul EXISTENT, nu de la unul gol. Cu
  -- `jsonb_populate_record(null::blog_posts, ...)`, orice cheie lipsa din jsonb
  -- ar fi devenit NULL — iar `randDinIntrare` chiar omite dinadins
  -- `og_image_url` cand editorul nu-l trimite.
  --
  -- ⚠ Coloanele se enumera pe nume. Mai lung, dar inseamna ca un jsonb venit de
  -- oriunde nu poate scrie o coloana la care nu ne-am gandit.
  update public.blog_posts p set
    title            = n.title,
    slug             = n.slug,
    excerpt          = n.excerpt,
    answer_summary   = n.answer_summary,
    content_html     = n.content_html,
    cover_url        = n.cover_url,
    cover_alt        = n.cover_alt,
    og_image_url     = n.og_image_url,
    author_id        = n.author_id,
    category_id      = n.category_id,
    status           = n.status,
    published_at     = n.published_at,
    is_featured      = n.is_featured,
    is_pinned        = n.is_pinned,
    cta              = n.cta,
    faq              = n.faq,
    seo_title        = n.seo_title,
    seo_description  = n.seo_description,
    canonical_url    = n.canonical_url,
    noindex          = n.noindex,
    reading_minutes  = n.reading_minutes
  from jsonb_populate_record(
         (select q from public.blog_posts q where q.id = p_id), p_rand) n
  where p.id = p_id
  returning p.slug into v_slug_nou;

  if v_slug_nou is null then
    raise exception 'articolul % nu exista', p_id using errcode = 'no_data_found';
  end if;

  -- ═══ 2. Redirectarea ═══
  if p_lasa_redirect and p_slug_vechi is not null and p_slug_vechi <> v_slug_nou then
    -- Fara asta se face bucla: `a → b`, apoi te razgandesti si `b → a`.
    delete from public.blog_redirects where from_slug = v_slug_nou;

    -- ⚠ SI SE STRANG LANTURILE. Daca ceva trimitea deja catre slugul vechi
    -- (`x → a`), iar `a` devine `b`, atunci `x` trebuie sa arate direct catre `b`.
    -- Lasate in lant, doua sarituri inseamna o cerere in plus pentru fiecare
    -- vizitator si autoritate pierduta pe drum; de la trei incolo, Google se
    -- opreste si nu mai urmareste.
    update public.blog_redirects set to_slug = v_slug_nou
     where to_slug = p_slug_vechi and from_slug <> v_slug_nou;

    insert into public.blog_redirects (from_slug, to_slug)
    values (p_slug_vechi, v_slug_nou)
    on conflict (from_slug) do update set to_slug = excluded.to_slug;

    -- Si daca dupa toate astea a ramas ceva care arata catre el insusi, se scoate.
    delete from public.blog_redirects where from_slug = to_slug;
  end if;

  -- ═══ 3. Etichetele ═══
  --
  -- ⚠ SLUGUL VINE GATA FACUT DE SUS, NU SE SOCOTESTE AICI.
  --
  -- E facut de `slugDin` din TypeScript. Rescris in SQL, ar fi fost a doua
  -- implementare a aceleiasi reguli, iar cele doua s-ar fi despartit tacut la
  -- prima diacritica tratata altfel: aceeasi eticheta ar fi ajuns doua randuri,
  -- si nimic n-ar fi dat eroare. Aceeasi capcana ca la `pliaza` /
  -- `fara_diacritice` — vezi nota din `types.ts`.
  --
  -- `null` inseamna „editorul n-a trimis etichete", deci nu se atinge nimic.
  -- `[]` inseamna „le-a scos pe toate".
  if p_etichete is not null then
    insert into public.blog_tags (slug, name)
    select e->>'slug', e->>'name'
    from jsonb_array_elements(p_etichete) e
    where coalesce(e->>'slug', '') <> ''
    on conflict (slug) do nothing;

    delete from public.blog_post_tags where post_id = p_id;

    insert into public.blog_post_tags (post_id, tag_id)
    select p_id, t.id
    from public.blog_tags t
    where t.slug in (select e->>'slug' from jsonb_array_elements(p_etichete) e)
    on conflict do nothing;
  end if;

  -- ═══ 4. Versiunea de dinainte ═══
  insert into public.blog_post_revisions (post_id, title, content_html, saved_by)
  values (p_id, p_titlu_vechi, p_html_vechi, p_salvat_de);

  -- ═══ 5. Si taierea istoricului ═══
  --
  -- ⚠ AICI, NU DOAR LA REVENIREA LA O VERSIUNE. `taieIstoriculVechi` se chema
  -- numai din `revinoLaVersiune` — adica exact din locul in care nu se aduna
  -- nimic. Salvarea obisnuita, care scrie o versiune de FIECARE data (si o data
  -- la 30 de secunde, cu salvarea automata), nu taia niciodata nimic.
  delete from public.blog_post_revisions r
   where r.post_id = p_id
     and r.id not in (
       select id from public.blog_post_revisions
       where post_id = p_id
       order by created_at desc
       limit greatest(p_versiuni, 1)
     );
end;
$$;

revoke execute on function public.blog_salveaza_articol(uuid, jsonb, jsonb, text, boolean, uuid, text, text, int) from public, anon, authenticated;
grant  execute on function public.blog_salveaza_articol(uuid, jsonb, jsonb, text, boolean, uuid, text, text, int) to service_role;

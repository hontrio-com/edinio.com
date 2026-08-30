-- Hotarul redactorului tinea pe usa si nu tinea pe fereastra; si vitrina n-avea
-- nimic care sa o tina una singura.
--
-- Gasite pe 30.08.2026, la un audit din afara. Vezi si
-- `2026-08-30_blog_rol_redactor.sql`, unde s-a nascut rolul.

-- ═══ 1. Etichetele unui articol publicat erau la indemana redactorului ═══
--
-- `blog_posts_editor_update` il opreste pe un articol PUBLICAT. Dar legaturile de
-- eticheta aveau `for all` fara nicio conditie de stare, deci acelasi redactor
-- putea, printr-o cerere REST directa, sa schimbe etichetele unui articol
-- publicat — adica sa-l mute dintr-o rubrica in alta pe site — desi textul lui ii
-- era interzis.

drop policy if exists blog_post_tags_editor_all on public.blog_post_tags;

create policy blog_post_tags_editor_insert on public.blog_post_tags
  for insert to authenticated
  with check (
    public.is_blog_editor()
    and exists (
      select 1 from public.blog_posts p
      where p.id = post_id and p.status in ('draft', 'review')
    )
  );

create policy blog_post_tags_editor_delete on public.blog_post_tags
  for delete to authenticated
  using (
    public.is_blog_editor()
    and exists (
      select 1 from public.blog_posts p
      where p.id = post_id and p.status in ('draft', 'review')
    )
  );

-- Citirea ramane larga: altfel redactorul n-ar putea nici sa se uite la ce a
-- publicat altcineva.
create policy blog_post_tags_editor_read on public.blog_post_tags
  for select to authenticated
  using (public.is_blog_editor());

-- ═══ 2. Istoricul nu se rescrie ═══
--
-- Reviziile sunt tocmai proba a ce s-a schimbat si cine a schimbat. Cu `for all`,
-- redactorul putea sterge sau modifica exact randurile care l-ar fi aratat.
-- Poate adauga (asta se intampla la fiecare salvare) si poate citi. Atat.

drop policy if exists blog_post_revisions_editor on public.blog_post_revisions;

create policy blog_post_revisions_editor_read on public.blog_post_revisions
  for select to authenticated using (public.is_blog_editor());

create policy blog_post_revisions_editor_insert on public.blog_post_revisions
  for insert to authenticated with check (public.is_blog_editor());

-- ═══ 3. Granturile implicite pe tabela de citiri ═══
--
-- ⚠ Aici se POATE revoca fara sa stricam nimic, spre deosebire de `blog_posts`:
-- tabela n-are nicio coloana derivata, iar in ea scrie doar cheia de serviciu.
-- Pe `blog_posts` acelasi revoke ar fi rupt scrierile, fiindca `cauta` se
-- socoteste la scriere cu drepturile celui ce scrie.
revoke insert, update, delete, truncate on table public.blog_post_stats from anon, authenticated;

-- ═══ 4. O singura vitrina, tinuta de baza ═══
--
-- Comentariul din `types.ts` spunea deja „cel scos in fata e unul singur", dar
-- nimic nu-l tinea: doua articole puteau avea `is_featured`, iar pagina alegea
-- dupa noroc.

update public.blog_posts set is_featured = false
where is_featured
  and id <> (
    select id from public.blog_posts where is_featured
    order by published_at desc nulls last, created_at desc limit 1
  );

create unique index if not exists blog_posts_o_singura_vitrina
  on public.blog_posts ((true)) where is_featured;

-- Ca ecranul sa nu dea eroare cand omul muta vitrina de pe A pe B: cine se ridica
-- ii coboara pe ceilalti, in aceeasi tranzactie.
--
-- ⚠ Nu intra in bucla: `update`-ul dinauntru pune `is_featured = false`, deci la
-- reintrare ramura nici nu se deschide.
create or replace function public.blog_o_singura_vitrina()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.is_featured then
    update public.blog_posts set is_featured = false
    where is_featured and id <> new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists blog_posts_o_singura_vitrina on public.blog_posts;
create trigger blog_posts_o_singura_vitrina
  before insert or update of is_featured on public.blog_posts
  for each row when (new.is_featured)
  execute function public.blog_o_singura_vitrina();

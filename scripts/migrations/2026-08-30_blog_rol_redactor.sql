-- ═══ ROLUL DE REDACTOR ═══
-- Aplicata pe 30.08.2026 ca `blog_rol_de_redactor` + `blog_redactori_dupa_email`
-- + `blog_fara_diacritice_inapoi_la_authenticated`.
--
-- Pana acum platforma avea un singur rol cu puteri, `admin`, deci „La verificare"
-- era doar o eticheta colorata: nu exista cine sa verifice pe cine.

alter table public.users_profile drop constraint if exists users_profile_role_check;
alter table public.users_profile
  add constraint users_profile_role_check
  check (role = any (array['user'::text, 'admin'::text, 'moderator'::text, 'editor'::text]));

/*
 * ⚠ SEPARATA DE `is_admin()`, nu o inlocuieste. Un redactor N-ARE ce cauta la
 * utilizatori, la facturi sau la setarile platformei; largind `is_admin()`, i-as
 * fi dat toate acelea deodata.
 */
create or replace function public.is_blog_editor()
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.users_profile
    where id = auth.uid() and role in ('admin', 'editor')
  );
$$;
revoke execute on function public.is_blog_editor() from anon;

/*
 * ⚠ MARGINEA E PE STARE, NU PE PROPRIETATE. Un redactor poate lucra la orice
 * ciorna, si a lui si a altuia — asa lucreaza o redactie. Ce nu poate e sa
 * PUBLICE, si nici sa se atinga de ceva deja publicat.
 *
 * `using` spune la ce randuri ajunge, `with check` ce are voie sa lase in urma.
 * Amandoua sunt necesare: doar cu `using`, ar fi putut lua o ciorna si sa o
 * salveze cu `status = 'published'`.
 *
 * VERIFICAT pe 30.08.2026, ca `authenticated` cu un cont de redactor adevarat:
 *   trimite la verificare .......... merge
 *   publica o ciorna ............... OPRIT de regula
 *   schimba un articol publicat .... niciun rand atins
 *   sterge un articol publicat ..... niciun rand atins
 *   face o ciorna noua ............. merge
 *   face direct un articol publicat  OPRIT de regula
 */
drop policy if exists blog_posts_editor_read on public.blog_posts;
create policy blog_posts_editor_read on public.blog_posts
  for select to authenticated using (public.is_blog_editor());

drop policy if exists blog_posts_editor_insert on public.blog_posts;
create policy blog_posts_editor_insert on public.blog_posts
  for insert to authenticated
  with check (public.is_blog_editor() and status in ('draft', 'review'));

drop policy if exists blog_posts_editor_update on public.blog_posts;
create policy blog_posts_editor_update on public.blog_posts
  for update to authenticated
  using (public.is_blog_editor() and status in ('draft', 'review'))
  with check (public.is_blog_editor() and status in ('draft', 'review'));

drop policy if exists blog_posts_editor_delete on public.blog_posts;
create policy blog_posts_editor_delete on public.blog_posts
  for delete to authenticated
  using (public.is_blog_editor() and status = 'draft');

drop policy if exists blog_post_tags_editor_all on public.blog_post_tags;
create policy blog_post_tags_editor_all on public.blog_post_tags
  for all to authenticated
  using (public.is_blog_editor()) with check (public.is_blog_editor());

drop policy if exists blog_tags_editor_write on public.blog_tags;
create policy blog_tags_editor_write on public.blog_tags
  for insert to authenticated with check (public.is_blog_editor());

drop policy if exists blog_post_revisions_editor on public.blog_post_revisions;
create policy blog_post_revisions_editor on public.blog_post_revisions
  for all to authenticated
  using (public.is_blog_editor()) with check (public.is_blog_editor());

-- ═══ CAUTAREA DUPA EMAIL ═══
--
-- `users_profile` NU tine adresa de email; ea sta in `auth.users`, la care
-- PostgREST nu ajunge. Prima scriere a actiunii cerea `select("email")` de la
-- `users_profile` si ar fi picat la rulare — typecheck-ul n-avea ce sa vada,
-- fiindca clientul e fara tipuri. Gasit intreband schema, nu citind codul.
--
-- ⚠ EXECUTE DOAR PENTRU `service_role`. O functie care spune „exista cont cu
-- adresa asta?" e o unealta de enumerare.
create or replace function public.cont_dupa_email(p_email text)
returns table (id uuid, rol text)
language sql stable security definer
set search_path to 'public', 'auth', 'pg_temp'
as $$
  select u.id, coalesce(p.role, 'user')
  from auth.users u
  left join public.users_profile p on p.id = u.id
  where lower(u.email) = lower(p_email)
  limit 1;
$$;
revoke all on function public.cont_dupa_email(text) from public, anon, authenticated;
grant execute on function public.cont_dupa_email(text) to service_role;

create or replace function public.redactorii_blogului()
returns table (id uuid, full_name text, email text, role text)
language sql stable security definer
set search_path to 'public', 'auth', 'pg_temp'
as $$
  select p.id, p.full_name, u.email::text, p.role
  from public.users_profile p
  join auth.users u on u.id = p.id
  where p.role in ('admin', 'editor')
  order by p.role, p.full_name;
$$;
revoke all on function public.redactorii_blogului() from public, anon, authenticated;
grant execute on function public.redactorii_blogului() to service_role;

-- ═══ SI O REPARATIE A UNEI REPARATII ═══
--
-- ⚠ REVOCAREA DE LA `authenticated` PE `fara_diacritice` A MERS PREA DEPARTE.
--
-- `blog_posts.cauta` e o coloana DERIVATA, calculata la SCRIERE cu acea functie,
-- iar Postgres o evalueaza cu drepturile celui care scrie. Revocata si de la
-- `authenticated`, orice scriere prin drepturile pe rand pica — adica exact
-- drumul redactorului:
--     ERROR: 42501: permission denied for function fara_diacritice
--
-- Nu s-a vazut pe loc fiindca actiunile trec prin `service_role`. S-a vazut abia
-- la proba rolului. `anon` RAMANE revocat: un vizitator nu scrie articole.
grant execute on function public.fara_diacritice(text) to authenticated;

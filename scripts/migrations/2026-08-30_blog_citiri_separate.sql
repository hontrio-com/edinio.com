-- Citirile pleaca de pe randul editorial al articolului.
--
-- ═══ DE CE ═══
--
-- `views` statea ca o coloana pe `blog_posts`, iar fiecare vizita facea un
-- `update` pe rand. Pe acel tabel sta triggerul `blog_posts_touch`, care e
-- neconditionat: orice update muta `updated_at = now()`.
--
-- Urmarea, gasita pe 30.08.2026: un articol pe care nu-l atinsese NIMENI incepea
-- sa spuna „Actualizat azi" in pagina, iar `dateModified` din datele structurate
-- spunea acelasi lucru catre Google. Cu cat era citit mai mult, cu atat parea
-- mai proaspat editat. Pragul de 24h din pagina nu apara deloc — dupa prima zi,
-- ORICE citire ridica data la ziua de azi.
--
-- Nu am ingustat triggerul cu `when (new.views is not distinct from old.views)`,
-- desi ar fi fost o linie. Doua motive: (a) urmatorul care adauga o coloana de
-- socoteala reface defectul fara sa stie, fiindca clauza enumera coloane, nu
-- intelesuri; (b) tot ramanea o scriere pe randul articolului la fiecare vizita,
-- adica intrecere pe rand exact intre cititori si cel care salveaza din admin.
--
-- Asadar cifrele stau in tabelul lor. Randul editorial se schimba doar cand il
-- schimba un om.

create table if not exists public.blog_post_stats (
  post_id    uuid primary key references public.blog_posts(id) on delete cascade,
  views      bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.blog_post_stats enable row level security;

-- Cifrele se vad in admin. Publicul nu le citeste: nu le aratam nicaieri in
-- site, iar un numar de citiri e informatie de redactie, nu de vitrina.
drop policy if exists blog_post_stats_editor_read on public.blog_post_stats;
create policy blog_post_stats_editor_read on public.blog_post_stats
  for select to authenticated using (public.is_blog_editor());

-- ⚠ FARA POLITICA DE SCRIERE, DINADINS. In tabela asta scrie numai
-- `blog_creste_citirile`, care e `security definer`.

create or replace function public.blog_creste_citirile(p_slug text)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.blog_post_stats (post_id, views)
  select p.id, 1
  from public.blog_posts p
  where p.slug = p_slug
    and p.status = 'published'
    and p.published_at is not null
    and p.published_at <= now()
  on conflict (post_id)
  do update set views = public.blog_post_stats.views + 1, updated_at = now();
$$;

-- ⚠ NU SE DA LUI `anon`.
--
-- Inainte avea `grant execute ... to anon`, iar cheia anonima a Supabase e
-- PUBLICA: oricine putea chema `rpc/blog_creste_citirile` de cate ori voia, direct,
-- ocolind cu totul plafonul din actiunea de server. Acum drumul e unul singur —
-- prin actiune, care pune inaintea ei doua plafoane.
--
-- ⚠ `revoke ... from public` NU AJUNGE. Supabase da drepturile pe roluri anume,
-- deci se scot pe roluri anume. Vezi memoria „granturile-implicite-supabase".
revoke execute on function public.blog_creste_citirile(text) from public, anon, authenticated;
grant execute on function public.blog_creste_citirile(text) to service_role;

-- Mutam ce s-a strans pana acum, apoi scoatem coloana.
insert into public.blog_post_stats (post_id, views)
select id, views from public.blog_posts
where views > 0
on conflict (post_id) do update set views = excluded.views;

alter table public.blog_posts drop column if exists views;

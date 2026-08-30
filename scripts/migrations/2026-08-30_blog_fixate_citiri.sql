-- ═══ ARTICOLE FIXATE SI NUMARUL DE CITIRI ═══
-- Aplicata pe 30.08.2026 ca `blog_fixate_si_vizualizari`.

/*
 * `is_pinned` NU E ACELASI LUCRU CU `is_featured`.
 *
 * „Scos in fata" e unul singur si sta lat in capul listei, ca o vitrina.
 * „Fixat" tine articolul sus in ordine oricat de vechi ar fi, si pot fi mai
 * multe. Un ghid de pornire scris acum un an trebuie sa ramana primul, dar n-are
 * de ce sa ocupe vitrina.
 */
alter table public.blog_posts
  add column if not exists is_pinned boolean not null default false,
  add column if not exists views integer not null default 0;

create index if not exists blog_posts_ordine_publica_idx
  on public.blog_posts (is_pinned desc, published_at desc nulls last)
  where status = 'published';

/*
 * Creste numarul de citiri al unui articol PUBLICAT.
 *
 * ⚠ SECURITY DEFINER, CU TINTA INGUSTA. Vizitatorul n-are drept de scriere pe
 * `blog_posts` si nici n-ar trebui sa capete: cu un UPDATE ingaduit lui `anon`,
 * oricine ar fi putut schimba orice coloana a oricarui articol. Functia asta
 * atinge O SINGURA coloana, pe un articol care se vede oricum public.
 *
 * ⚠ NU INTOARCE NIMIC. Una care ar spune cate citiri are un articol ar fi dat
 * vizitatorului o cale de a numara ce nu e treaba lui.
 *
 * ⚠ Conditia de publicare e AICI, nu la apelant. Verificat: chemata ca `anon` pe
 * o ciorna si pe un articol programat in viitor, n-a schimbat nimic; pe cel viu,
 * a numarat de doua ori din doua apeluri.
 */
create or replace function public.blog_creste_citirile(p_slug text)
returns void
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  update public.blog_posts
  set views = views + 1
  where slug = p_slug
    and status = 'published'
    and published_at is not null
    and published_at <= now();
$$;

-- ⚠ GRANTURILE, SCRISE EXPLICIT. Supabase da EXECUTE fiecarui rol implicit, iar
-- `revoke ... from public` NU stinge acele granturi — invatat pe pielea noastra
-- in aceeasi zi, la `fara_diacritice`. Aici `anon` CHIAR trebuie sa poata:
-- cititorii nu sunt logati. Dar se scrie limpede, ca sa se vada ca e o alegere,
-- nu o scapare.
grant execute on function public.blog_creste_citirile(text) to anon, authenticated, service_role;

-- ═══ CAUTAREA IN BLOG ═══
-- Aplicata pe 30.08.2026 ca migrarea `blog_cautare_fara_diacritice`.
create extension if not exists unaccent;

/*
 * Pliaza diacriticele. Invelis peste `unaccent`, cu dictionarul NUMIT.
 *
 * ⚠ FORMA CU UN SINGUR ARGUMENT NU E IMUABILA, fiindca depinde de dictionarul
 * implicit al sesiunii, care se poate schimba. Postgres o respinge intr-o
 * coloana derivata si intr-un indice. Numind dictionarul, rezultatul depinde
 * doar de intrare, deci putem sa o declaram imuabila si sa o folosim in
 * amandoua.
 *
 * ⚠ `revoke ... from public` DINADINS. O functie noua primeste implicit EXECUTE
 * pentru toata lumea, inclusiv `anon`. Aici n-ar face rau — e o transformare de
 * text — dar obiceiul de a o lasa asa e cel care conteaza: aceeasi neatentie pe
 * o functie care citeste date ar fi o scurgere.
 */
create or replace function public.fara_diacritice(t text)
returns text
language sql
immutable
strict
parallel safe
set search_path to 'public', 'pg_temp'
as $$ select unaccent('public.unaccent', t) $$;

revoke all on function public.fara_diacritice(text) from public;
grant execute on function public.fara_diacritice(text) to postgres, service_role;

/*
 * Textul in care se cauta, pliat si scris cu litere mici.
 *
 * Coloana e DERIVATA (`generated always ... stored`), nu scrisa de cod. Asa nu
 * se poate desparti de continut: nu exista drum prin care titlul sa se schimbe
 * si aceasta sa ramana veche, fiindca n-o scrie nimeni.
 *
 * Etichetele HTML se scot cu `regexp_replace`, altfel o cautare dupa „div" ar
 * gasi orice articol.
 *
 * ⚠ ACEEASI PLIERE EXISTA SI IN COD, ca `pliaza` din `src/lib/blog/types.ts`,
 * fiindca acolo se pregateste ce a scris omul. Daca cele doua se despart,
 * cautarea NU crapa — pur si simplu nu mai gaseste. Verificat pe 30.08.2026 cu
 * 25 de cuvinte romanesti trecute prin amandoua: toate s-au potrivit. Proba din
 * `src/lib/blog/cautare.test.ts` tine perechile si da alarma la deriva.
 */
alter table public.blog_posts
  add column if not exists cauta text
  generated always as (
    lower(public.fara_diacritice(
      coalesce(title, '') || ' ' ||
      coalesce(excerpt, '') || ' ' ||
      coalesce(answer_summary, '') || ' ' ||
      regexp_replace(coalesce(content_html, ''), '<[^>]+>', ' ', 'g')
    ))
  ) stored;

-- Indice trigram: face rapid si `%ceva%`, adica potrivirea din mijlocul unui
-- cuvant, pe care un indice obisnuit n-o poate folosi.
create index if not exists blog_posts_cauta_idx
  on public.blog_posts using gin (cauta gin_trgm_ops);

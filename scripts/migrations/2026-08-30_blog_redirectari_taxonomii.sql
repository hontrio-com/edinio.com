-- Redenumirea unui ARTICOL lasa o redirectare in urma. Redenumirea unei RUBRICI
-- sau a unui AUTOR nu lasa nimic — desi paginile acelea sunt la fel de indexate,
-- si de obicei mai vechi decat articolele din ele.
--
-- Un redactor care redenumeste rubrica „Livrare" in „Livrare si curierat" muta,
-- dintr-o singura apasare, o pagina care putea sa fi strans legaturi ani de zile.
-- Fara redirectare: 404, si tot ce a strans se pierde.
--
-- Din auditul din 30.08.2026, punctul #32.

alter table public.blog_redirects
  add column if not exists fel text not null default 'articol';

alter table public.blog_redirects drop constraint if exists blog_redirects_fel_check;
alter table public.blog_redirects
  add constraint blog_redirects_fel_check check (fel in ('articol', 'categorie', 'autor'));

-- ⚠ CHEIA DEVINE (fel, from_slug), NU DOAR from_slug.
--
-- Altfel o rubrica si un articol n-ar putea niciodata sa plece de la acelasi slug
-- vechi — iar ele stau pe cai DIFERITE (`/blog/x` fata de `/blog/categorie/x`),
-- deci n-au de ce sa se incurce. Cu cheia veche, redenumirea unei rubrici ar fi
-- sters tacut redirectarea unui articol cu acelasi nume.
--
-- ⚠ SI `blog_salveaza_articol` TREBUIE SA STIE. Are `on conflict (from_slug)`;
-- cu cheia schimbata n-ar mai avea pe ce cadea si salvarea ar crapa la prima
-- redenumire. Vezi `2026-08-30_blog_salvare_tranzactionala.sql`, care e aplicata
-- din nou dupa asta.
alter table public.blog_redirects drop constraint if exists blog_redirects_from_slug_key;
drop index if exists blog_redirects_from_slug_key;
create unique index if not exists blog_redirects_fel_from
  on public.blog_redirects (fel, from_slug);

-- O singura functie pentru rubrici si autori, ca sa nu se scrie de doua ori
-- aceeasi grija de lanturi si de bucle.
create or replace function public.blog_muta_taxonomia(
  p_fel text, p_slug_vechi text, p_slug_nou text
) returns void
language plpgsql
as $$
begin
  if p_slug_vechi is null or p_slug_nou is null or p_slug_vechi = p_slug_nou then
    return;
  end if;
  if p_fel not in ('categorie', 'autor') then
    raise exception 'fel necunoscut: %', p_fel;
  end if;

  -- Fara asta se face bucla la dus-intors.
  delete from public.blog_redirects where fel = p_fel and from_slug = p_slug_nou;

  -- Lanturile se strang: ce arata catre numele vechi arata acum direct catre cel nou.
  update public.blog_redirects set to_slug = p_slug_nou
   where fel = p_fel and to_slug = p_slug_vechi and from_slug <> p_slug_nou;

  insert into public.blog_redirects (fel, from_slug, to_slug)
  values (p_fel, p_slug_vechi, p_slug_nou)
  on conflict (fel, from_slug) do update set to_slug = excluded.to_slug;

  delete from public.blog_redirects where fel = p_fel and from_slug = to_slug;
end;
$$;

revoke execute on function public.blog_muta_taxonomia(text, text, text) from public, anon, authenticated;
grant  execute on function public.blog_muta_taxonomia(text, text, text) to service_role;

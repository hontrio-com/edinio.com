-- Barcodul asta a ajuns deja in catalogul Trendyol?
--
-- ⚠ Rutele de ACTUALIZARE nu pot crea barcoduri noi. Dupa prima listare
-- reusita, o marime adaugata mai tarziu (S, M -> si L) pleca prin
-- `unapproved-bulk-update`, care actualizeaza doar ce exista — deci varianta
-- noua nu ajungea NICIODATA la ei, tacut, iar clientii nu o puteau cumpara.
alter table public.trendyol_variants
  add column if not exists exista_la_ei boolean not null default false;

comment on column public.trendyol_variants.exista_la_ei is
  'Barcodul a fost acceptat de Trendyol (lot de creare sau actualizare reusit). Rutele de actualizare nu pot crea barcoduri noi, deci variantele adaugate ulterior trebuie trimise prin creare.';

update public.trendyol_variants v
   set exista_la_ei = true
  from public.trendyol_listings l
 where l.id = v.listing_id
   and v.exista_la_ei = false
   and (l.creat_de_edinio = true or l.auto_inventory = false);

notify pgrst, 'reload schema';

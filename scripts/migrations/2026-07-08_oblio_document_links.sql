-- Oblio: stocheaza link-ul public al documentului (returnat la emitere). Pentru
-- Oblio, acest link semnat ESTE singurul acces la PDF (nu exista endpoint PDF
-- autentificat), deci il pastram ca sa poata fi deschis din detaliul comenzii.
-- Nullable, fara backfill — documentele deja emise raman fara link pana la reemitere.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS oblio_invoice_link text,
  ADD COLUMN IF NOT EXISTS oblio_proforma_link text,
  ADD COLUMN IF NOT EXISTS oblio_storno_link text;

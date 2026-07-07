-- SmartBill: stocheaza URL-ul privat al documentului (returnat la emitere) pentru
-- butonul "Vezi in SmartBill" din detaliul comenzii. Nullable, fara backfill —
-- documentele deja emise raman fara link pana la reemitere (comportament acceptat).

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS smartbill_invoice_url text,
  ADD COLUMN IF NOT EXISTS smartbill_estimate_url text;

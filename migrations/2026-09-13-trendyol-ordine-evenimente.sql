-- Ordinea evenimentelor Trendyol.
--
-- Pana acum nu exista niciun mecanism de ordine: `pollPackages` si webhook-ul
-- scriu amandoua in `trendyol_orders`, iar un pachet citit de cron putea ajunge
-- DUPA webhook-ul care il anuntase deja livrat. Evenimentul vechi rescria
-- statusul nou si, mai rau, retrecea comanda prin tranzitie — adica reconsuma
-- stoc pentru ceva deja expediat.
--
-- Trendyol trimite pe fiecare pachet `lastModifiedDate` (milisecunde epoch).
-- Il pastram si sarim peste orice pachet care nu e mai nou decat ce avem.

alter table public.trendyol_orders
  add column if not exists last_modified_date bigint;

comment on column public.trendyol_orders.last_modified_date is
  'lastModifiedDate al pachetului (ms epoch). Un pachet cu valoare mai mica sau egala se ignora: e un eveniment vechi sosit dupa unul nou.';

notify pgrst, 'reload schema';

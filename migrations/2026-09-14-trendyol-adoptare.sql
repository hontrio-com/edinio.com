-- Adoptarea produselor care exista deja in contul Trendyol al comerciantului.
--
-- ⚠ DE UNDE VINE.
--
-- Comerciantii isi listeaza produse pe Trendyol si altfel decat prin Edinio:
-- manual din panoul lor, sau cu un tool anterior. Trendyol refuza corect sa
-- CREEZE un produs cu un cod de bare pe care contul il are deja
-- („Nu se poate crea un produs nou. Codul de bare X exista deja"), iar noi n-am
-- avut niciodata alta cale in afara de creare — deci listarea ramanea blocata pe
-- `error` la nesfarsit, oricate reincercari. Masurat live: 2 din 4 produse.
--
-- Acum, cand crearea pica, verificam la ei daca produsul exista (404 cu
-- `product.not.found` = nu; 200 = da) si il ADOPTAM: listarea se leaga de el si
-- comenzile incep sa curga.
--
-- `auto_inventory` = false pe cele adoptate: NU-i suprascriem pretul si stocul
-- puse pe alta cale. Comerciantul porneste impingerea cand vrea, per produs.

alter table public.trendyol_listings
  add column if not exists auto_inventory boolean not null default true;

comment on column public.trendyol_listings.auto_inventory is
  'Edinio impinge automat stocul si pretul la Trendyol pentru listarea asta? Se pune pe false la ADOPTAREA unui produs care exista deja in contul lor, ca sa nu suprascriem ce a pus comerciantul pe alta cale. Impingerea manuala functioneaza oricum.';

-- `contentId` e singura cheie acceptata de `content-bulk-update` (acela NU
-- lucreaza pe barcode). Se afla dintr-o singura cerere, la adoptare — pastrat
-- aici, nu mai trebuie recautat.
alter table public.trendyol_listings
  add column if not exists ty_content_id bigint;

comment on column public.trendyol_listings.ty_content_id is
  'contentId-ul produsului la Trendyol, din serviciul de stare pe barcode. Necesar pentru content-bulk-update, care nu accepta barcode.';

notify pgrst, 'reload schema';

-- Dezarhivarea produce si ea un lot, deci `kind` trebuie sa-l accepte. Fara
-- asta, insertul cade pe constrangere si urma lotului se pierde TACIT: produsul
-- ramane arhivat la ei, iar noi credem ca l-am scos.
alter table public.trendyol_batches
  drop constraint if exists trendyol_batches_kind_check;

alter table public.trendyol_batches
  add constraint trendyol_batches_kind_check
  check (kind = any (array['product'::text, 'inventory'::text, 'archive'::text]));

notify pgrst, 'reload schema';

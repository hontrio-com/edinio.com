-- Urmarirea coletului Colete Online: ce spun EI ajunge pe comanda - 15.09.2026
--
-- ═══ CE LIPSEA ═══
--
-- Clientul se oprea la cotare, emitere, eticheta si dezlegare. Comerciantul nu afla niciodata
-- din Edinio ce s-a intamplat cu coletul dupa ce a plecat, desi ei au `GET /order/status/{id}`.
--
-- ═══ ⚠ AICI CODURILE EXISTA, SPRE DEOSEBIRE DE WOOT SI CARGUS ═══
--
-- Raspunsul lor poarta, pe fiecare eveniment, un `code` NUMERIC plus numele in romana
-- (`statusTextParts.ro.name`). Deci comanda CHIAR se poate misca, fiindca avem eticheta LOR
-- langa numar: `20800` se cheama „Colet livrat".
--
-- ⚠ DAR TABELUL NU E PUBLICAT. In toata specificatia lor OpenAPI exista UN SINGUR exemplu de
-- istoric, pe un drum fericit, cu zece coduri. Cele din `statusuri-colete.ts` sunt exact
-- acelea. Un cod nevazut NU misca nimic: se strange pe nume in jurnal, iar harta creste din
-- trafic adevarat, ca la Woot. Codurile de refuz, retur sau livrare esuata nu apar in exemplul
-- lor, deci nu se ghicesc: un „Livrat" pus pe un retur ar emite si factura.
--
-- ═══ ⚠ DE CE `checked_at` SI NU MAI MULT ═══
--
-- Documentatia lor spune ca `GET /order/status/{uniqueId}` e limitat la O CERERE PE ORA pentru
-- fiecare colet, si ca pentru timp real trebuie folosita optiunea de notificare prin webhook.
-- Cronul merge la doua ore, deci nu atinge niciodata plafonul; rotatia dupa `checked_at` face
-- restul. Webhookul lor ramane de facut, si e scris in `docs/curieri/COLETE-ONLINE.md`.
--
-- ═══ CE NU FACE ═══
--
-- Nimic retroactiv, si n-are ce: masurat pe 15.09.2026, NICIUN magazin al platformei n-are
-- macar credentiale Colete Online, si zero AWB-uri s-au emis vreodata.
--
-- ⚠ In special `colete_awb_at` NU se umple din `created_at`: ar fi o data INVENTATA a
-- expedierii, care intra apoi in fereastra de urmarire ca si cum ar fi masurata.
--
-- Coloanele sunt aditive si anulabile; nicio citire existenta nu se schimba.

alter table public.orders
  add column if not exists colete_awb_at timestamptz,
  add column if not exists colete_status_code integer,
  add column if not exists colete_status_label text,
  add column if not exists colete_status_at timestamptz,
  add column if not exists colete_status_checked_at timestamptz;

comment on column public.orders.colete_awb_at is
  'Cand a fost emisa expedierea Colete Online. Fereastra de urmarire a cronului se masoara de aici, nu din `created_at`.';
comment on column public.orders.colete_status_code is
  'Ultimul cod de stare de la ei (ex. 20800 = Colet livrat). ⚠ Tabelul lor NU e publicat: harta din `statusuri-colete.ts` are doar codurile vazute in exemplul din specificatia lor.';
comment on column public.orders.colete_status_label is
  'Numele lor pentru ultima stare, in romana, asa cum il scriu ei. Numarul e pentru cod, textul e pentru om.';
comment on column public.orders.colete_status_at is
  'Data ultimului eveniment pe care ni l-au spus EI, nu cand am citit noi.';
comment on column public.orders.colete_status_checked_at is
  'Cand a fost intrebat ultima oara Colete Online despre acest colet. ⚠ Ei limiteaza la o cerere pe ORA per colet; cronul merge la doua ore. Rotatia ia mereu cele mai vechi, NULLS FIRST.';

create index if not exists orders_colete_urmarire_idx
  on public.orders using btree (colete_status_checked_at nulls first)
  where colete_awb_number is not null
    and status = any (array['pending', 'confirmed', 'processing', 'shipped']);

-- ══════════════════════════════════════════════════════════════════════════
-- DOUA VALORI CARE NU INCAPEAU, SI O CHEIE CARE STRANGEA BUCATILE (26.08.2026)
-- ══════════════════════════════════════════════════════════════════════════
--
-- Amandoua gasite de o revizuire adversa pe munca de azi, nu de un audit din afara. Amandoua
-- erau defecte pe care chiar eu le adusesem in aceeasi zi.
--
-- ─── 1) `delete` si `dezarhivare` nu incapeau in check ───
--
-- Am adaugat doua feluri noi de lot in cod, fara sa ma uit la constrangere. Ea accepta doar
-- `product`, `inventory`, `archive`, `update`.
--
-- ⚠ O VALOARE PE CARE `check`-UL O RESPINGE NU STRICA RANDUL, IL OPRESTE SA EXISTE. Deci:
--
--   - lantul NOU de stergere nu se inregistra niciodata. `recordBatch` intorcea `false`, randul
--     ramanea pe `removing` cu „lotul n-a putut fi tinut minte", si reincerca la nesfarsit —
--     produsul nu se stergea de la ei NICIODATA.
--   - dezarhivarea de la adoptare, care mergea pana ieri sub `archive`, s-a STRICAT chiar de
--     mana mea, cand i-am dat un fel propriu ca sa n-o confund cu arhivarea.
--
-- Am memoria asta scrisa („valoarea scrisa trebuie sa incapa") si tot am facut-o. De-aia proba
-- din `audit-integritate.test.ts` compara acum lista din cod cu lista din constrangere.
--
-- ─── 2) La About You, o linie de comanda INSEAMNA o bucata ───
--
-- `AboutYouOrderItem` n-are camp de cantitate: o comanda cu doua bucati din acelasi SKU vine ca
-- DOUA elemente, cu `id`-uri diferite. Cheia unica pe `(magazin, comanda, sku)` le stringea
-- intr-un singur rand de retur, cu `quantity: 1`.
--
-- ⚠ CE INSEMNA: comerciantul apasa „Am primit marfa si e buna", intra o bucata in stoc, randul
-- se marca rezolvat — iar a doua bucata nu se mai putea repune NICIODATA. `ignoreDuplicates` o
-- taia pe conflict cu randul deja rezolvat, deci nici macar nu aparea pe ecran. Stoc real 2,
-- stoc in Edinio 1, tacut.
--
-- ⚠ SI E CU ATAT MAI GRAV CU CAT chiar azi s-a oprit repunerea automata: ecranul ala e SINGURA
-- cale prin care marfa intoarsa mai ajunge inapoi pe raft.

alter table public.trendyol_batches drop constraint if exists trendyol_batches_kind_check;

alter table public.trendyol_batches add constraint trendyol_batches_kind_check
  check (kind = any (array[
    'product'::text, 'inventory'::text, 'archive'::text, 'update'::text,
    'delete'::text, 'dezarhivare'::text
  ]));

comment on constraint trendyol_batches_kind_check on public.trendyol_batches is
  'Felurile de lot. `delete` si `dezarhivare` au fost adaugate pe 26.08.2026: codul le scria deja, iar check-ul le refuza — deci lantul de stergere nu se inregistra niciodata.';

alter table public.aboutyou_retururi
  add column if not exists linie_cheie text;

update public.aboutyou_retururi
   set linie_cheie = coalesce(linie_cheie, 'sku:' || sku)
 where linie_cheie is null;

alter table public.aboutyou_retururi
  alter column linie_cheie set not null;

alter table public.aboutyou_retururi
  drop constraint if exists aboutyou_retururi_business_id_aboutyou_order_number_sku_key;

alter table public.aboutyou_retururi
  add constraint aboutyou_retururi_linie_key
    unique (business_id, aboutyou_order_number, linie_cheie);

comment on column public.aboutyou_retururi.linie_cheie is
  'Identitatea BUCATII intoarse: `id`-ul liniei de comanda de la ei, sau `sku:<sku>:<indice>` cand nu-l dau. La About You o linie de comanda INSEAMNA o bucata — nu are camp de cantitate — deci doua bucati din acelasi SKU sunt doua linii.';

notify pgrst, 'reload schema';

-- notice.ro: raspunsurile cumparatorilor se citesc prin TRAGERE, deci trebuie sa stim ce am citit deja.
--
-- ⚠⚠ DE CE E NEVOIE. Specificatia API a lui notice.ro nu descrie niciun webhook pentru SMS (nici raport
-- de livrare, nici raspuns). Singurul drum documentat catre ce a scris cumparatorul e
-- `GET /api/v1/sms-in`, adica o lista pe care o ceri tu. Un cron care o cere din ora in ora ar reciti
-- de fiecare data aceleasi randuri, deci fiecare raspuns ar intra de zeci de ori in `notice_inbox` si
-- fiecare „STOP” s-ar renumara.
--
-- (Prima forma a acestui comentariu spunea ca notice.ro „NU impinge nimic”. Nedovedit: pagina lor promite
-- callback-uri HTTP, doar ca nu sunt in API. Vezi `src/lib/notice-raspunsuri.ts`.)
--
-- `provider_id` e id-ul LOR pentru mesajul primit. Indexul unic pe (magazin, id) face recitirea
-- inofensiva: `on conflict do nothing` si gata.
--
-- ⚠⚠ INDEXUL DE MAI JOS E GRESIT SI A FOST INLOCUIT A DOUA ZI, in
-- `2027-01-24-notice-indexul-unic-fara-predicat.sql`. Fiind PARTIAL, PostgREST nu-l putea folosi pentru
-- `ON CONFLICT` (eroarea 42P10, masurata pe productie), deci cronul n-ar fi scris niciun raspuns. Iar
-- motivul dat aici pentru predicat era fals: intr-un index unic, NULL-urile sunt oricum distincte.
-- Fisierul ramane cum a fost aplicat, ca istoria sa se poata reface pas cu pas.

alter table public.notice_inbox
  add column if not exists provider_id text;

create unique index if not exists notice_inbox_furnizor_unic_idx
  on public.notice_inbox (business_id, provider_id)
  where provider_id is not null;

-- ═══════════════════════════════════════════════════════════════════════════
-- RASPUNSUL LOR SE PASTREAZA INTREG
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ DE CE (27.08.2026)
--
-- `toAyItems` pastreaza sapte campuri din fiecare linie, iar din comanda se retin cinci. Restul
-- se arunca la ingest. Cand a venit intrebarea „About You atribuie un transportator comenzii?",
-- raspunsul n-a putut fi dat din baza: campul, daca exista, fusese aruncat de fiecare data.
--
-- ⚠ E O LECTIE DEJA PLATITA. Cand raspunsul unui furnizor nu incape in schema pe care i-o
-- presupunem, singurul lucru care ne scoate din presupuneri e raspunsul BRUT. Fara el, orice
-- intrebare noua despre datele lor cere sa asteptam urmatoarea comanda.
--
-- ⚠ SE PASTREAZA LA FIECARE INGEST, si la creare si la actualizare: campurile lor se pot schimba
-- intre timp, iar un instantaneu vechi de trei luni raspunde la intrebarea gresita.
--
-- ⚠ NU CONTINE DATE DE CARD. Schema lor de comanda are adresa si telefonul clientului — care sunt
-- deja in `orders.shipping_address` — dar niciun instrument de plata: About You incaseaza si nu
-- ne trimite nimic despre cum. Deci `raw` nu adauga o categorie noua de date sensibile.

alter table public.aboutyou_orders
  add column if not exists raw jsonb;

comment on column public.aboutyou_orders.raw is
  'Comanda asa cum a venit de la About You, intreaga. Se rescrie la fiecare ingest. Aici se citesc campurile pe care schema noastra nu le cunoaste inca.';

notify pgrst, 'reload schema';

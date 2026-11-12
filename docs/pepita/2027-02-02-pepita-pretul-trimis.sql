-- ═══════════════════════════════════════════════════════════════════════════
-- PEPITA: PRETUL TRIMIS SE TINE MINTE, CA SA SE POATA INGHETA (12.11.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Cererea proprietarului: „Trimite prețul la Pepita”, ca la Trendyol (04.11) si eMAG (12.11).
-- Hotararea lui, la intrebare: oprit = Pepita ramane cu ULTIMUL pret trimis, iar schimbarile de
-- pret din magazin nu mai ajung acolo. Stocul se trimite mereu.
--
-- ⚠ DE CE E NEVOIE DE COLOANE NOI. Pepita n-are API: citeste doua feeduri XML de la noi, iar
-- pretul e OBLIGATORIU in amandoua (in cel de stoc din 24.09.2026, la cererea lor). Deci „nu
-- trimite pretul” nu exista; exista doar „trimite acelasi pret ca data trecuta”. Iar „data
-- trecuta” nu se poate recalcula: pretul din magazin s-a schimbat intre timp, tocmai asta e
-- situatia in care comutatorul e oprit.
--
-- ⚠ SE TINE PRETUL DE VITRINA, NU CEL DIN XML: inainte de strategie, de TVA si de curs. O valoare
-- pe articol, aceeasi pentru toate pietele. Strategia de pret si cursul raman reglaje vii ale
-- integrarii, aplicate peste pretul inghetat.
--
-- ⚠ SE SCRIU DE FEED, la fiecare trecere care trimite preturi (produse: tot; stoc: doar ce s-a
-- schimbat). Nule inseamna „nu stim”, si atunci feedul foloseste pretul de acum: e cazul
-- articolului nou, care n-a plecat niciodata.
--
-- ⚠ FARA `check`. O valoare respinsa de o constrangere ar fi facut sa cada TOATA scrierea paginii
-- de evidenta, adica si legarea comenzilor intarziate de produsele lor.
--
-- ⚠ Granturile sunt pe tabel, deci acopera si coloanele noi; RLS-ul (citirea proprietarului)
-- ramane neschimbat. Codul care le citeste si le scrie pleaca IMPREUNA cu migratia: fara ele,
-- `select` pe `pepita_articole` cu coloanele noi ar rupe toata citirea feedului.

alter table public.pepita_articole
  add column if not exists pret_vitrina_trimis numeric,
  add column if not exists pret_taiat_trimis numeric;

comment on column public.pepita_articole.pret_vitrina_trimis is
  'Pretul de vitrina (inainte de strategie, TVA si curs) din ultima trimitere catre Pepita. Cu „Trimite prețul la Pepita” oprit, feedul il trimite pe acesta in locul celui de acum.';
comment on column public.pepita_articole.pret_taiat_trimis is
  'Pretul taiat de vitrina din ultima trimitere. Null langa un `pret_vitrina_trimis` scris = fara reducere.';

notify pgrst, 'reload schema';

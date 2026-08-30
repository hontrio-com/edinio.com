-- Numele ofertei asa cum il stie eMAG.
--
-- ═══ ⚠ DE CE E NEVOIE DE EL (24.08.2026) ═══
--
-- Pana la importul din contul comerciantului, fiecare rand `emag_offers` avea un
-- produs de-al nostru in spate, iar ecranul arata numele DE ACOLO. Importul a
-- schimbat asta dintr-odata: din 3.754 de oferte preluate, 3.334 n-au pereche in
-- magazin — sunt lucruri pe care omul le vinde pe eMAG si nu le tine la noi.
--
-- Ecranul le-a aratat pe toate ca „Produs sters din magazin", fara niciun nume.
-- Comerciantul a raportat-o intocmai: randuri fara nume, iar sageata catre eMAG
-- ducea la „un produs random care nici nu cred ca e de la mine" — era chiar al lui,
-- dar n-avea cum sa recunoasca dupa ce.
--
-- ⚠ Numele NU se poate deduce. `part_number` e un cod, `brand` e o marca, iar
-- produsul nostru lipseste tocmai in cazul care are nevoie de nume.
--
-- Se scrie la import si la fiecare reconciliere, deci se tine la zi singur.

alter table public.emag_offers
  add column if not exists nume_emag text;

comment on column public.emag_offers.nume_emag is
  'Numele ofertei la eMAG. Singurul nume pe care il avem pentru ofertele fara produs la noi.';

notify pgrst, 'reload schema';

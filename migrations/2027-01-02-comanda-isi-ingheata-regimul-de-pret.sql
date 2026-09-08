-- Regimul de pret al comenzii, inghetat la nastere — 09.09.2026
--
-- ═══ CE REPARA ═══
--
-- `orders.vat_rate` era inghetat de mult: cota cu care s-a vandut ramane pe comanda, ca o
-- schimbare de cota a magazinului sa nu rescrie retroactiv o factura veche. REGIMUL nu era:
-- facturarea intreba `store_settings.prices_include_vat` de fiecare data, adica setarea de AZI.
--
-- Doua pagube, amandoua tacute:
--
--   1. TOATE cele patru marketplace-uri (Pepita, eMAG, Trendyol, About You) scriu in comanda
--      sume BRUTE — `items[].price`, `subtotal`, `total` — si `vat_amount` = TVA-ul CONTINUT in
--      ele. Asa lucreaza ei, si asa trebuie. Pe un magazin Edinio cu `prices_include_vat = false`
--      facturarea citea aceleasi sume ca NETE si ar fi adaugat TVA deasupra. Garda de
--      reconciliere prinde asta si REFUZA documentul (deci nu a plecat nicio factura gresita),
--      dar comanda de marketplace nu se putea factura deloc, iar mesajul de refuz il trimitea pe
--      comerciant sa „editeze si sa salveze" — ceea ce i-ar fi umflat totalul cu cota TVA.
--   2. Si fara niciun marketplace: comanda plasata cand magazinul tinea preturi FARA TVA,
--      facturata dupa ce comerciantul a trecut pe preturi CU TVA, isi schimba intelesul sub
--      picioare. Sumele incasate raman aceleasi, dar factura le citeste altfel.
--
-- ═══ DE CE `NULL` E O A TREIA VALOARE, SI NU `DEFAULT FALSE` ═══
--
-- `null` inseamna „nu se stie", si e chiar adevarul pentru comenzile de dinainte de azi: nimeni
-- n-a scris atunci regimul, si nu se poate deduce. Ele cad mai departe pe setarea magazinului,
-- adica pe purtarea de pana acum, bit cu bit. Un `default` ar fi pretins ca stim.
--
-- ⚠ CINE SCRIE COLOANA: numai serverul, cu `service_role` — cele patru ingesturi de marketplace
-- si cele doua cai de checkout. Nu vine niciodata din corpul unei cereri. Vezi lectia lui
-- `order_source`, care a ajuns sa hotarasca bani in timp ce se scria din browser.

alter table public.orders
  add column if not exists prices_include_vat boolean;

comment on column public.orders.prices_include_vat is
  'Sumele comenzii (items[].price, subtotal, total) contin deja TVA? Inghetat cand se naste comanda, ca si vat_rate. NULL = necunoscut (comenzi de dinainte de 09.09.2026): facturarea cade pe setarea de azi a magazinului.';

-- ⚠ COMENZILE DE MARKETPLACE SUNT BRUTE PRIN CONSTRUCTIE, deci aici nu se ghiceste nimic: se
-- scrie ce se stie sigur. Comenzile din magazin raman `null`, fiindca regimul de atunci chiar nu
-- se mai poate afla.
update public.orders
   set prices_include_vat = true
 where prices_include_vat is null
   and order_source ->> 'marketplace' is not null;

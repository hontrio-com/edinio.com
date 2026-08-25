-- ══════════════════════════════════════════════════════════════════════════
-- `origin` LA NIVEL DE PRODUS, INAINTE DE 23 OCTOMBRIE 2026
-- ══════════════════════════════════════════════════════════════════════════
--
-- Pe 17 august 2026 Trendyol a adaugat in incarcatura de produs un camp nou, de nivel intai:
--
--   { "origin": "RO" }
--
-- Azi, 26 august, e OPTIONAL. Pe 23 octombrie devine OBLIGATORIU. In perioada dintre ele, o
-- categorie care cerea deja „origine" ca ATRIBUT trebuie sa primeasca in continuare si
-- atributul, pe langa noul camp.
--
-- ⚠ SI NU E `config.origine`, PE CARE IL AVEM DEJA. Acela e originea VANZATORULUI, folosita
-- la cotele de TVA sub Cross Country — un vanzator cu originea in Romania care listeaza pe GR.
-- Campul nou e cu totul altceva: tara in care s-a FABRICAT produsul. Un magazin din Romania
-- vinde hrana facuta in Germania si jucarii facute in China; o valoare implicita „RO" pusa
-- pentru toate ar fi o declaratie falsa, nu o comoditate.
--
-- ⚠ TIPARUL EXISTA DEJA IN CASA: `aboutyou_listings.country_of_origin` cu
-- `aboutyou_config.default_country_of_origin` peste el. Se face la fel, ca sa nu ajunga
-- comerciantul sa completeze aceeasi informatie in doua feluri.

alter table public.trendyol_listings add column if not exists country_of_origin text;

comment on column public.trendyol_listings.country_of_origin is
  'Tara in care s-a FABRICAT produsul, ISO 3166-1 alpha-2. NU e originea vanzatorului (`config.origine`). Trendyol o cere obligatoriu din 23.10.2026.';

-- ⚠ Doua litere mari, sau nimic. Fara paza, un „Romania" scris in graba ar fi plecat la ei si
-- ar fi fost refuzat abia in lot, cu un mesaj despre un camp pe care comerciantul nu-l vede.
alter table public.trendyol_listings drop constraint if exists trendyol_listings_origin_chk;
alter table public.trendyol_listings add constraint trendyol_listings_origin_chk
  check (country_of_origin is null or country_of_origin ~ '^[A-Z]{2}$');

notify pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- PAGINI PROPRII: plafonul de marime al blocurilor, pus in baza   (25.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Pana acum plafonul exista doar in actiunea `updatePage` (400.000 de
-- caractere). Politica RLS „Owners can manage own pages" e insa `ALL`, deci
-- proprietarul putea scrie direct prin PostgREST un JSON de mai multi MB,
-- citit apoi la FIECARE vizita a paginii publice.
--
-- Masurat pe productie (25.09.2026): cea mai mare pagina are 9.881 de octeti.
-- Plafonul e 1.000.000 de octeti, de o suta de ori peste, deci nu atinge nimic.
--
-- ⚠ In aceeasi zi migratia a purtat si o coloana `design` (tipografia paginii).
-- A fost scoasa inainte de orice productie: el a cerut fontul pe fiecare bloc,
-- nu pe pagina. Pe demo coloana a fost stearsa cu `drop column`.
--
-- Aditiva (o regula noua care nu prinde niciun rand existent): migratia INTAI.

alter table public.custom_pages
  drop constraint if exists custom_pages_blocks_marime;

alter table public.custom_pages
  add constraint custom_pages_blocks_marime check (octet_length(blocks::text) <= 1000000);

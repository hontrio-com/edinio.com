-- Amprenta etichetei Pepita, ca una noua sa o poata inlocui pe cea veche — 09.09.2026
--
-- ═══ CE REPARA ═══
--
-- La retrimitere, pastrarea etichetei se facea cu „daca exista una in depozit, n-o mai scrie".
-- Bun cat timp retrimiterea insemna „aceeasi comanda, inca o data".
--
-- ⚠ DAR IN ACEEASI ZI AM FACUT RETRIMITEREA SA REIMPROSPATEZE DESTINATARUL, si atunci cele doua
-- hotarari s-au ciocnit: comanda vine cu adresa B si cu eticheta B, noi scriem adresa B si
-- PASTRAM eticheta A. Panoul arata o adresa, PDF-ul tiparit alta — iar coletul pleaca dupa PDF.
--
-- Adica exact paguba pe care poarta din editor o inchisese cu o ora inainte, intrata pe alta usa.
--
-- ⚠ NU SE PASTREAZA PDF-UL, SE PASTREAZA AMPRENTA LUI. Base64-ul are date personale si e de
-- ordinul megaoctetilor; sha256 are 64 de semne si raspunde la singura intrebare care conteaza:
-- „e alta eticheta decat cea pe care o avem?".

alter table public.pepita_comenzi
  add column if not exists eticheta_sha256 text;

comment on column public.pepita_comenzi.eticheta_sha256 is
  'sha256 (hex) al PDF-ului DECODAT aflat in depozit. La retrimitere: amprenta egala inseamna aceeasi eticheta si nu se rescrie nimic; amprenta diferita inseamna eticheta NOUA, si atunci o inlocuieste. NULL = comanda de dinainte de 09.09.2026, sau fara eticheta.';

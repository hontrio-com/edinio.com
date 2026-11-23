-- Oferta „Reducere cantitate” are timp sa-si scrie pragurile pe produse - 23.11.2026. Aplicata in productie pe
-- 23.11.2026, cu acordul proprietarului; verificat dupa: functia poarta `statement_timeout=120s`.
--
-- Se poate aplica INAINTE sau DUPA deploy: niciun cod nu se schimba odata cu ea.
--
-- ═══ CE SE INTAMPLA ═══
--
-- Oferta de tip `volume` nu se rezolva la afisare: isi SCRIE pragurile pe fiecare produs
-- (`products.page_sections.quantity_tiers`), printr-o singura fraza, `aplica_praguri_oferta`, chemata din panou cu
-- clientul comerciantului. Rolul `authenticated` are `statement_timeout = 8s`, iar fraza atinge fiecare produs al
-- magazinului, cu declansatoarele lui (proiectia de catalog, About You, easySales): cam 4 ms pe rand. La un catalog
-- de peste doua mii de produse nu apuca.
--
-- Masurat in productie, din `error_logs` (`action = 'aplicaPraguriCantitate'`, „canceling statement due to
-- statement timeout”): eSAFE (3.941 de produse) pe 06.11 si 18.11.2026; VetDepo (2.110) de cinci ori pe 22.11.2026.
-- Caderea nu se vede in panou: oferta ramane scrisa, pragurile nu ajung pe produse.
--   - eSAFE: oferta spunea 3/5/10/50 bucati, produsele purtau inca 5 si 10 bucati, iar cele 589 adaugate pe 07.11
--     nu aveau nimic („nu mai apare tabelul de reduceri”);
--   - VetDepo: o oferta a apucat sa se scrie (cu 10 bucati = 70%), apoi a fost STEARSA, iar retragerea a cazut:
--     magazinul a afisat si ar fi incasat -70% la zece bucati o zi intreaga.
-- Amandoua au fost aduse la zi de mana pe 23.11.2026, cu acordul proprietarului.
--
-- ═══ DE CE ASA, SI NU CU CHEIA DE SERVICIU ═══
--
-- Masurat pe baza demo, prin PostgREST, pe 23.11.2026:
--   - `service_role` e taiat tot la 8 s (mosteneste limita rolului `authenticator`): o functie fara setare, cu 11 s de
--     somn, cade la 8,2 s. Deci mutarea apelului pe clientul de serviciu NU ar fi reparat nimic;
--   - o functie care isi poarta `statement_timeout` in definitie trece de limita rolului: PostgREST ridica setarea
--     functiei inaintea frazei (20 s setati, 11 s de somn, raspuns 200; la `anon`, 5 s de somn peste limita lui de 3 s).
-- E acelasi mecanism pe care il foloseste deja `genereaza_schema_baseline` („set statement_timeout to '120s'”).
--
-- 120 s e plafon, nu durata: scrierea eSAFE, facuta de mana pe loturi, a tinut cateva secunde pe lotul de 1.250 de
-- produse. Functia ramane `security invoker`, deci RLS margineste in continuare scrierea la magazinul comerciantului.
--
-- ⚠ CE NU REPARA: un produs creat DUPA salvarea ofertei tot nu primeste pragurile pana la urmatoarea salvare, iar o
-- cadere (de acum putin probabila) tot nu se vede in panou. Amandoua sunt de reparat in cod.
--
-- Intoarcerea: `alter function public.aplica_praguri_oferta(uuid, uuid, text, uuid[], text[], jsonb, boolean)
-- reset statement_timeout;`

alter function public.aplica_praguri_oferta(uuid, uuid, text, uuid[], text[], jsonb, boolean)
  set statement_timeout to '120s';

-- PostgREST isi tine setarile functiilor in memorie: fara reincarcare, limita noua ar intra abia la urmatoarea pornire.
notify pgrst, 'reload schema';

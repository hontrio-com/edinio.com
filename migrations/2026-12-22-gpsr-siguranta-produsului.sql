-- ═══════════════════════════════════════════════════════════════════════════
-- GPSR: CINE RASPUNDE PENTRU SIGURANTA PRODUSULUI
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE ADAUGA (30.08.2026)
--
-- Regulamentul european de siguranta generala a produselor cere ca fiecare produs vandut catre
-- consumatori din UE sa arate cine e producatorul si cine e persoana responsabila din Uniune. OLX
-- il cere prin `product_safety_regulation` la creare si la actualizare, si il refuza in categoriile
-- unde e obligatoriu. eMAG si About You cer acelasi lucru, cu alte nume.
--
-- ═══ DE CE STA IN DOUA LOCURI, SI NU INTR-UNUL ═══
--
-- ⚠ PRODUCATORUL SI REPREZENTANTUL SUNT, DE OBICEI, ACEIASI PENTRU TOT CATALOGUL. Un comerciant
-- care vinde marca lui ii scrie o data. Pusi pe fiecare produs, i-ar rescrie de trei mii de ori si
-- ar gresi la al doilea.
--
-- ⚠ DAR NU INTOTDEAUNA: un revanzator are alt producator la fiecare brand. De-aia produsul poate
-- SUPRASCRIE, iar ce nu suprascrie cade pe setarile magazinului.
--
-- Suprascrierea e la nivel de PERSOANA, nu de camp: altfel s-ar putea naste o adresa jumatate a
-- unui producator si jumatate a altuia — o informatie legala falsa, si mai rea decat una lipsa.
--
-- ⚠ CE E PE PRODUS STA IN `page_sections.gpsr`, ca `page_sections.google` si `page_sections.
-- dimensions`: acolo se aduna de mult ce tine de un produs si nu merita coloana lui.
--
-- ═══ SI CINE N-ARE MARKETPLACE NU E DERANJAT ═══
--
-- ⚠ Cerinta LEGALA il priveste pe orice comerciant care vinde in UE, deci campurile exista pentru
-- toata lumea. Cerinta TEHNICA — un API care refuza — e numai a marketplace-urilor. De-aia
-- sectiunea din editorul de produs se arata dupa acelasi tipar ca cea de Google Shopping: numai
-- cand e conectata o integrare care o cere.

alter table privat.store_settings
  add column if not exists gpsr_config jsonb default '{}'::jsonb not null;

comment on column privat.store_settings.gpsr_config is
  'Producatorul si persoana responsabila din UE, pentru tot catalogul. Produsul le poate suprascrie prin `page_sections.gpsr`, la nivel de persoana intreaga.';

/*
 * ⚠ SI VEDEREA TREBUIE REFACUTA, altfel coloana noua nu se vede prin ea si nimic nu o poate citi.
 * `store_settings` e o vedere peste `privat.store_settings`, cu decriptarea campurilor secrete;
 * `gpsr_config` n-are secrete, dar trebuie sa treaca prin ea ca sa ajunga la cod.
 */
select privat.reconstruieste_store_settings();
select privat.reconstruieste_store_settings_upd();

notify pgrst, 'reload schema';

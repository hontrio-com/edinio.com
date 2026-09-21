-- ═══════════════════════════════════════════════════════════════════════════
-- UN COD CARE MERGE DOAR PE ANUMITE PRODUSE                      (21.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Etapa G a redesignului sectiunii Discounturi.
--
-- ⚠ MIGRATIA ASTA E DOAR ADAUGARE: doua coloane, niciun corp de functie rescris.
-- De-aia nu conteaza unde se aseaza ea in dosar fata de celelalte doua de azi —
-- spre deosebire de `…-un-om-o-data.sql`, care rescrie `claim_discount_use` si
-- de-aia a trebuit numita anume ca sa se aseze ULTIMA (vezi proba
-- `revendicarea-e-o-singura-instructiune.test.ts`).

-- ── 1. Pe ce merge codul ──────────────────────────────────────────────────
--
-- ⚠⚠ ACEEASI FORMA CA LA OFERTE (`offers.trigger`), dinadins: `{fel, produse,
-- categorii}` langa `{scope, productIds, categories}`. Sistemul de oferte
-- raspunde DEJA, in acelasi checkout si pe aceeasi comanda, la intrebarea „e
-- produsul asta in categoria asta?" — si potrivirea se face chiar cu functia
-- lui (`extindeCategoriile`), nu cu o a doua scrisa aici.
--
-- ⚠⚠ CATEGORIILE SE TIN PE NUME, NU PE ID, si nu din lene: `products` poarta
-- `category text`, un singur NUME, si nu exista nicio tabela de legatura
-- produs-categorie. Un id ar fi trebuit oricum desfacut in nume ca sa se poata
-- potrivi cu produsul. Urmarile sunt scrise pe ecran, langa camp:
--   * o categorie REDENUMITA scoate produsele din campanie, in tacere;
--   * doua categorii ale aceluiasi magazin pot purta acelasi nume sub parinti
--     deosebiti (unicitatea e pe `business_id, parent_id, name`), deci codul le
--     prinde pe amandoua.

alter table public.discounts
  add column if not exists restrangere jsonb not null
  default '{"fel":"tot","produse":[],"categorii":[]}'::jsonb;

comment on column public.discounts.restrangere is
  'Pe ce merge codul: {fel: tot|produse|categorii, produse: [id], categorii: [NUME]}. Aceeasi forma ca offers.trigger; categoriile se potrivesc pe NUME cu products.category, cu tot subarborele.';

-- ── 2. Pe ce s-a socotit reducerea, pentru factura ────────────────────────
--
-- ⚠⚠ ASTA NU E INFRUMUSETARE, E O REPARATIE DE FACTURA.
--
-- Pe factura, o suma fara cota proprie se imparte PROPORTIONAL peste toate
-- cotele comenzii (`imparteProportional`, chemata de SmartBill, Oblio si fGO).
-- Presupunerea de acolo e scrisa pe fata: o reducere obisnuita micsoreaza baza
-- FIECAREI cote. Cu un cod restrans, ea NU MAI E ADEVARATA: o reducere legata de
-- liniile de 11% ar fi fost facturata ca si cum ar fi atins si liniile de 21%.
-- Totalul ar fi parut corect, defalcarea de TVA ar fi fost gresita, si nici
-- garda de reconciliere n-ar fi vazut-o, fiindca si ea foloseste aceeasi
-- impartire.
--
-- ⚠ MASURAT INAINTE (productie, 21.09.2026): ZERO comenzi din 541 au cote
-- amestecate pe linii — de fapt niciuna nu poarta cota pe linie, deci
-- `amestecate` e mereu fals si impartirea proportionala nu ruleaza niciodata.
-- Deci defectul e real, dar INCA NEEXPUS. Dupa regula casei, expunerea zero
-- ridica pragul de atentie, nu-l coboara: coloana se scrie de pe acum, ca
-- prima comanda cu cote amestecate sa gaseasca adevarul deja pastrat.
--
-- Forma: {"baza": 240.00, "peCote": [{"cota": 11, "valoare": 240.00}]}
-- `null` = cod nerestrans (reducerea chiar micsoreaza baza fiecarei cote).

alter table public.orders
  add column if not exists discount_base jsonb;

comment on column public.orders.discount_base is
  'Valoarea liniilor pe care s-a socotit cuponul, grupata pe cote de TVA: {baza, peCote:[{cota,valoare}]}. Null la codurile nerestranse si la comenzile de dinainte de 21.09.2026.';

notify pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- O HOTARARE DE RETUR SE REZERVA INAINTE SA PLECE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE REPARA (29.08.2026, dupa-amiaza)
--
-- `hotarasteRetur` trimite `approveClaimItems` / `rejectClaimItems` — apeluri IREVERSIBILE, cu
-- banii intorsi clientului la primul. Singura paza dinaintea lor era `claim_item_status ===
-- 'WaitingInAction'`, citit din COPIA NOASTRA. Iar copia se improspateaza din cron, la cinci sau
-- zece minute.
--
-- Autorul chiar scrie asta, in acelasi fisier:
--
--     ⚠ FEREASTRA DINTRE APASARE SI CONFIRMARE. `hotarasteRetur` scrie `decizie` de indata ce ei
--     raspund, dar `claim_item_status` vine abia la reconciliere — pana la cinci minute mai tarziu.
--
-- In fereastra aia, `claim_item_status` e INCA `WaitingInAction`, deci paza trece a doua oara. Iar
-- `decizie` — singurul martor ca noi am hotarat deja — nu era citit nicaieri:
--
--     10:00 omul apasa „Acceptă"  -> pleaca la ei, banii se intorc clientului
--     10:00 apasa din nou (sau alta fila, sau „Respinge")
--     paza vede tot `WaitingInAction` -> pleaca A DOUA hotarare pe aceleasi linii ❌
--
-- Nici ecranul nu acopera: butonul se dezactiveaza pe `sePoateHotari`, adica pe acelasi
-- `claim_item_status`, nu pe `decizie`.
--
-- ═══ DE CE NU AJUNGE SA CITIM `decizie` ═══
--
-- Ar inchide cazul obisnuit — a doua apasare, secunde mai tarziu. Dar `decizie` se scrie DUPA
-- raspunsul lor, si asta e o alegere buna, scrisa acolo: „o hotarare marcata la noi si netrimisa
-- la ei ar fi cea mai rea forma". Deci intre cele doua apasari exista o clipa in care nici
-- `claim_item_status`, nici `decizie` nu spun nimic.
--
-- ⚠ SE REZERVA INAINTE, SE HOTARASTE DUPA. `hotarare_ceruta_la` se scrie printr-un UPDATE
-- conditionat — deci doua apasari simultane nu pot rezerva amandoua aceeasi linie — si se sterge
-- daca cererea e REFUZATA de ei. Ce ramane rezervat fara hotarare inseamna „a plecat si nu stim
-- ce-a iesit": exact cazul in care nu se reincearca singur, ci se intreaba un om.

alter table public.trendyol_claim_items
  add column if not exists hotarare_ceruta_la timestamptz;

comment on column public.trendyol_claim_items.hotarare_ceruta_la is
  'Clipa in care s-a REZERVAT trimiterea unei hotarari pentru linia asta. Se scrie inaintea apelului ireversibil, se sterge daca ei refuza. Rezervata dar fara `decizie` = a plecat si nu stim ce-a iesit.';

notify pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- Coletul de inlocuire, la retururile de tip schimb
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CAMPUL EXISTA IN EXEMPLUL LOR, DAR NU E EXPLICAT NICAIERI (26.08.2026)
--
-- `replacementOutboundpackageinfo` apare in raspunsul-exemplu al lui `getClaims`, cu numar de
-- AWB, `packageid` si lista de `claimItem.Id`. Cautat in ghidul lor: nicio propozitie despre
-- schimburi („değişim"), nici despre ce are comerciantul de facut, nici vreun camp care sa
-- deosebeasca un schimb de o restituire.
--
-- ⚠ NU SE CONSTRUIESTE PE O GHICIRE. Nu i se arata comerciantului o instructiune, fiindca n-avem
-- ce instructiune sa dam: aratat ca „trimite un produs de schimb" cand de fapt inseamna altceva,
-- l-am pune sa expedieze marfa degeaba.
--
-- ⚠ DAR SE PASTREAZA, SI APARITIA LUI SE APRINDE O DATA. Cu coloana asta, „a aparut" e o
-- tranzitie curata (gol -> plin), ca la deriva eMAG — deci prima aparitie adevarata ajunge sub
-- ochii nostri in aceeasi zi, o singura data, nu la fiecare cinci minute si nu niciodata.
--
-- ⚠ Si datele stau intr-un loc dupa care se poate CAUTA. In `raw` erau oricum, dar acolo nu se
-- poate intreba „cate retururi de schimb am avut luna asta".

alter table public.trendyol_claims
  add column if not exists colet_inlocuire jsonb;

comment on column public.trendyol_claims.colet_inlocuire is
  'replacementOutboundpackageinfo de la ei: coletul de inlocuire la un retur de tip schimb. Camp nedocumentat in ghidul lor; se pastreaza intreg, nu se interpreteaza.';

notify pgrst, 'reload schema';

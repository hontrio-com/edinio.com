-- ══════════════════════════════════════════════════════════════════════════
-- STERGEREA ASTEAPTA CONFIRMAREA, SI ZIUA DE ARHIVA CERUTA DE EI (26.08.2026)
-- ══════════════════════════════════════════════════════════════════════════
--
-- Forma dinainte cerea arhivarea, cerea stergerea, si uita listarea pe loc. Amandoua sunt insa
-- LOTURI ASINCRONE la Trendyol: raspunsul HTTP spune ca au primit cererea, nu ca au facut-o.
--
-- ⚠ MASURAT PE REGISTRUL NOSTRU, pe traficul real al contului:
--
--     inventory   1322 reusite   632 ESUATE  (32%)
--     product       72 reusite    78 ESUATE  (52%)
--
-- Deci se putea intampla asta, si nu era o inlantuire nefireasca:
--
--     arhivare  primita  -> mai tarziu ESUATA
--     stoc zero primit   -> mai tarziu ESUAT
--     stergere  primita  -> mai tarziu ESUATA
--     la noi:            randul, sters deja
--
-- Produsul ramanea la vanzare la ei, iar la noi nu mai era nicio urma ca a existat.
--
-- ⚠ SI EI CER O ZI DE ARHIVA. Pentru un produs aprobat, `DELETE /products` e ingaduit abia
-- dupa ce a stat arhivat peste o zi. Ceruta imediat dupa arhivare — cum faceam — e refuzata pe
-- buna dreptate, iar noi o citeam „gata".
--
-- Lantul de acum:
--
--     scoateDeLaVanzare      stoc zero + arhivare + `removing`
--     pollOpenBatches        arhivarea CONFIRMATA -> `arhivat_la`
--     stergeCePoateFiSters   dupa 25 de ore -> DELETE
--     pollOpenBatches        stergerea CONFIRMATA -> abia acum se uita randul
--
-- ⚠ Douazeci si cinci de ore, nu douazeci si patru: ceasul lor si al nostru nu bat la fel, iar
-- o ora in plus nu costa nimic — marfa e deja scoasa din vanzare.

alter table public.trendyol_listings
  add column if not exists arhivat_la timestamptz,
  add column if not exists sters_cerut_la timestamptz,
  add column if not exists sters_eroare text;

comment on column public.trendyol_listings.arhivat_la is
  'Cand a CONFIRMAT lotul ca arhivarea s-a facut la ei. Nu cand am cerut-o: arhivarea e asincrona, iar HTTP 200 inseamna doar ca au primit cererea.';
comment on column public.trendyol_listings.sters_cerut_la is
  'Cand s-a trimis DELETE. Ei cer ca un produs aprobat sa fi stat arhivat peste o zi, deci stergerea vine mai tarziu decat arhivarea.';
comment on column public.trendyol_listings.sters_eroare is
  'De ce n-a mers stergerea. Randul RAMANE pe `removing`: marfa nu se mai vinde, dar nu ne prefacem ca produsul a disparut.';

create index if not exists trendyol_listings_de_sters_idx
  on public.trendyol_listings (business_id, arhivat_la)
  where status = 'removing';

notify pgrst, 'reload schema';

-- ══════════════════════════════════════════════════════════════════════════
-- „RESPINS" NU INSEAMNA „GATA" (26.08.2026)
-- ══════════════════════════════════════════════════════════════════════════
--
-- Regula lor, verbatim din documentatia International Marketplace:
--
--   „If `dontShipBack: true`: You do not need to ship the package back to the customer.
--    If `dontShipBack: false`: You must ship the package back to the customer only if your
--    rejection request has been accepted by Trendyol."
--
-- Deci comerciantul apasa „Respinge", primeste 200, si crede ca a terminat — cand de fapt mai
-- are de expediat un colet inapoi la client, pe cheltuiala lui. Nefacut, returul se intoarce
-- impotriva lui la arbitraj.
--
-- ⚠ RASPUNSUL LA RESPINGERE E DOAR `HTTP 200`, fara corp. Deci steagul nu se poate citi
-- de-acolo: se afla abia la urmatoarea citire a cererilor.
--
-- ⚠ TREI STARI, NU DOUA. Intreg `rejectedPackageInfo` LIPSESTE cand nu s-a creat un colet de
-- retur-respins — documentatia lor o spune pe fata: „If there is no return rejection package,
-- this field will not appear." Deci ABSENTA nu e „false".
--
-- Un `?.dontShipBack ?? false` ar fi turnat prima stare peste a treia, adica i-ar fi spus
-- comerciantului „ai de trimis un colet" la FIECARE retur respins, inclusiv unde nu exista
-- niciunul. Iar o alarma care suna si cand nu e nimic de facut inceteaza sa fie citita — chiar
-- lectia pe care am invatat-o azi cu `okai.ro`, care a tipat de 150 de ori in 16 zile.

alter table public.trendyol_claims
  add column if not exists dont_ship_back boolean,
  add column if not exists colet_respins jsonb;

comment on column public.trendyol_claims.dont_ship_back is
  'true = nu trimiti coletul inapoi clientului. false = TREBUIE sa-l trimiti, daca ei accepta respingerea. NULL = nu exista colet de retur-respins, si asta NU e acelasi lucru cu false.';
comment on column public.trendyol_claims.colet_respins is
  'rejectedPackageInfo intreg: cargoTrackingNumber, packageId, cargoProviderName, cargoTrackingLink, items[], shipmentAddress, sellerOtp. Se pastreaza brut — forma lui nu e in schema pe care o avem.';

notify pgrst, 'reload schema';

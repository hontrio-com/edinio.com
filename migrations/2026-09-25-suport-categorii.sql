-- ═══════════════════════════════════════════════════════════════════════════
-- SUPORT: cele opt categorii noi ale tichetelor                   (25.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Cerut de el la refacerea sectiunii Suport: in locul celor patru categorii
-- („Tehnic", „Facturare", „Cerere functionalitate", „Altele") vin opt, dupa
-- zona panoului despre care e intrebarea:
--
--   store_design   Magazin si design
--   products       Produse
--   orders         Comenzi
--   customers      Clienti
--   payments       Plati
--   integrations   Integrari
--   account        Cont si abonament
--   technical      Probleme tehnice   (cheia veche, pastrata: inseamna acelasi lucru)
--
-- ⚠⚠ CELE TREI CHEI VECHI RAMAN PERMISE (`billing`, `feature`, `other`).
-- Masurat pe 25.09.2026: productia are 7 tichete, toate inchise, cu `technical`,
-- `billing` si `other`. Scoase din regula, constrangerea n-ar mai fi putut fi
-- pusa peste ele, iar mutate pe o categorie noua ar fi primit o eticheta pe
-- care omul n-a ales-o. Tichetele NOI nu le mai pot primi: ruta de creare
-- accepta numai cele opt (`src/lib/support/tichete.ts`, `CATEGORII`).
--
-- ⚠ Lista de aici si cea din cod se tin la fel prin
-- `src/lib/support/tichete.test.ts`, care citeste CHIAR
-- fisierul asta.
--
-- Aditiva (largeste o regula), deci in ziua unirii: migratia INTAI, push dupa.
-- Pusa invers, un tichet cu o categorie noua ar cadea cu 23514 intre push si
-- migratie.

alter table public.support_tickets drop constraint if exists support_tickets_category_check;

alter table public.support_tickets add constraint support_tickets_category_check check (
  category = any (array[
    'store_design', 'products', 'orders', 'customers',
    'payments', 'integrations', 'account', 'technical',
    'billing', 'feature', 'other'
  ]::text[])
);

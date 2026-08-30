-- ═══════════════════════════════════════════════════════════════════════════
-- O MODIFICARE LA UN PRODUS APROBAT IL DADEA INAPOI LA „CIORNA"
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE SE INTAMPLA (27.08.2026)
--
-- `syncProductNow` trece listarea pe `pending` la fiecare trimitere, si la prima, si la a
-- suta. Cand lotul se incheie cu bine, `pollOpenBatches` scrie `draft` si pune publicarea la
-- coada — cu comentariul „Product accepted; it exists as a draft on About You until published".
--
-- Adevarat, dar NUMAI la prima trimitere. Documentatia lor spune „Newly created products start
-- in the `draft` state"; un produs deja aprobat nu se intoarce acolo. Deci, dupa orice
-- modificare a unui produs ACTIV:
--
--   • panoul ii arata comerciantului „Ciorna pe About You" pentru un produs care se vinde;
--   • se punea la coada o publicare pe care n-o ceruse nimeni;
--   • iar la retragere `tintaRetragere("draft")` cerea `draft`, pe care documentatia il refuza
--     dupa aprobare („Once a product has been approved, it can no longer be set back to
--     `draft`"). Cererea cadea, listarea trecea pe `error`, iar comerciantul primea o eroare
--     pentru o retragere care ar fi mers.
--
-- ⚠ SI CIORNELE LASATE DINADINS. Lantul de publicare se declanseaza „doar la trecerea
-- `pending -> draft`, adica imediat dupa o trimitere reusita — nu atinge ciornele vechi, lasate
-- dinadins nepublicate". O retrimitere trecea insa exact prin `pending -> draft`, deci o ciorna
-- pastrata intentionat nepublicata era publicata la prima modificare.
--
-- ⚠ DE CE O COLOANA SI NU O DEDUCTIE. La momentul lotului, `status` e deja `pending` si
-- `last_synced_at` a fost rescris de trimiterea in curs: cele doua fapte de care e nevoie —
-- „exista la ei dinainte?" si „in ce stare?" — sunt tocmai cele sterse de trimitere. Se tin
-- minte inainte de a le acoperi.
--
-- Valorile, si sunt doar trei feluri:
--   'prima'        — `last_synced_at` era null: produsul n-a plecat niciodata la ei.
--   'necunoscut'   — a plecat, dar starea lui la ei nu ne era cunoscuta (eram pe `error`,
--                    `pending` sau `local`). Se lasa pe `pending` si o spune reconcilierea.
--   <statusul lor> — 'draft', 'active', 'pending_approval', 'pending_active', 'rejected',
--                    'inactive', 'problem'. Se pune inapoi cel stiut.
--
-- ⚠ FARA `check`. Lista statusurilor lor se poate lungi fara sa ne intrebe, iar o valoare pe
-- care constrangerea o respinge nu strica randul: il opreste sa existe. Adica trimiterea ar
-- pica intreaga, pentru un status nou pe care nici nu-l foloseam.

alter table public.aboutyou_listings
  add column if not exists stare_dinainte text;

comment on column public.aboutyou_listings.stare_dinainte is
  'Ce stiam despre produs INAINTE de trimiterea in curs: ''prima'' (nu plecase niciodata), ''necunoscut'' (plecase, dar nu-i stiam starea la ei), sau statusul lor. Citit si sters de pollOpenBatches cand lotul se incheie.';

notify pgrst, 'reload schema';

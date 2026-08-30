-- ═══════════════════════════════════════════════════════════════════════════
-- CE A HOTARAT OMUL NU SE DESFACE SINGUR LA URMATOAREA SINCRONIZARE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE REPARA (29.08.2026, seara)
--
-- Modelul OLX e „produs vandabil -> creeaza sau actualizeaza anuntul", scris chiar in antetul lui
-- `sync.ts`. Bun cat timp singura intentie e a automatului. Dar ecranul are trei butoane manuale —
-- „Dezactivează", „Activează", „Șterge anunțul" — iar automatul le desfacea pe doua din trei.
--
-- ═══ 1. „ȘTERGE ANUNȚUL" SE DESFACEA LA PRIMA ATINGERE A PRODUSULUI ═══
--
-- `removeRemote` sterge anuntul la OLX SI randul local. Dar coada OLX n-are garda „numai produsele
-- deja listate" (About You si Trendyol o au), iar `upsert` se pune la coada dupa FIECARE editare de
-- pret sau stoc — inclusiv dupa fiecare comanda venita de pe alt marketplace, prin
-- `stoc-pe-canale`. La trecerea urmatoare `getRow` nu gaseste nimic, deci se intra pe ramura de
-- CREARE si anuntul reapare la OLX, cu alt id.
--
-- ⚠ Iar butonul spune, textual: „Sigur ștergi anunțul … de pe OLX? Acțiunea nu poate fi anulată."
-- Deci nu doar ca se desfacea — se desfacea impotriva a ceea ce ii promiteam omului.
--
-- ═══ 2. „DEZACTIVEAZĂ" SE DESFACEA LA FEL ═══
--
-- `deactivateRemote` scrie `status = 'removed_by_user'`. Iar `upsertRemote`, la trecerea urmatoare,
-- vede `removed_by_user` si cheama `activateRemote`. Butonul „Activează" exista separat in ecran —
-- deci reactivarea automata il face fara rost, si ii ia omului o hotarare din mana.
--
-- ⚠ `outdated` NU e la fel: acolo OLX a expirat anuntul singur, si reactivarea automata e chiar ce
-- trebuie. Deosebirea e cine a hotarat, nu cum arata starea.
--
-- ═══ LEACUL: RANDUL RAMANE, CU CLIPA HOTARARII ═══
--
-- ⚠ NU O TABELA NOUA DE PIETRE DE MORMANT: randul de anunt e chiar locul potrivit, fiindca poarta
-- deja `offer_id` si istoricul. Ce lipsea era o urma a hotararii omului.
--
-- Iesirea e scrisa si exista deja: „Postează pe OLX" pentru un anunt sters, „Activează" pentru unul
-- dezactivat. Amandoua sterg urma, deci hotararea se poate schimba oricand — dar de catre OM.

alter table public.olx_adverts
  add column if not exists sters_de_om_la timestamptz;

comment on column public.olx_adverts.sters_de_om_la is
  'Clipa in care comerciantul a cerut stergerea anuntului. Cat timp e scrisa, sincronizarea nu recreeaza anuntul. Se sterge la „Postează pe OLX".';

notify pgrst, 'reload schema';

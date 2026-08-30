-- ═══════════════════════════════════════════════════════════════════════════
-- PLASA DE PRELUNGIRE BATEA IN OLX DIN MINUT IN MINUT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE REPARA (30.08.2026)
--
-- Cronul cauta anunturile care expira in mai putin de 24 de ore si le cere prelungirea. Fereastra e
-- de 24 de ore, iar cronul porneste in FIECARE MINUT — deci acelasi anunt intra in ea de o mie
-- patru sute de ori pe zi.
--
-- Cat timp prelungirea reusea, `valid_to` se muta si randul iesea din fereastra. Dar:
--
--   * la REFUZ, eroarea nici nu se citea: randul ramanea acolo si se reincerca peste un minut,
--     si tot asa. Iar OLX spune limpede ca un anunt nu poate fi improspatat mai des decat
--     ingaduie tara — exemplul lor oficial e de paisprezece zile.
--   * la REUSITA, `valid_to` se muta abia dupa urmatoarea citire de stare (pana la doua ore),
--     deci pana atunci randul era tot in fereastra.
--
-- ⚠ CLIPA SE SCRIE SI LA REUSITA, SI LA REFUZ, si randul se ocoleste o zi de-atunci. Iar anuntul
-- are oricum `auto_extend_enabled` la ei: plasa asta e o a doua paza, nu singura.

alter table public.olx_adverts
  add column if not exists ultima_prelungire_la timestamptz;

comment on column public.olx_adverts.ultima_prelungire_la is
  'Cand am incercat ultima oara sa prelungim anuntul. Se scrie si la reusita, si la refuz: fara ea, un refuz lasa randul in aceeasi fereastra si il reincercam din minut in minut, pana la 24 de ore.';

notify pgrst, 'reload schema';

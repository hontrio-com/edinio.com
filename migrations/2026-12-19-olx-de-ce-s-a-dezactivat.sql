-- ═══════════════════════════════════════════════════════════════════════════
-- „DEZACTIVAT" NU SPUNE CINE A HOTARAT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE REPARA (30.08.2026)
--
-- Aceeasi stare, `removed_by_user`, se scria in doua situatii cu totul deosebite:
--
--   * omul apasa „Dezactivează" in ecran
--   * stocul ajunge la zero, sau produsul devine inactiv, si sincronizarea dezactiveaza singura
--
-- Iar ieri am pus regula „ce a hotarat omul nu se desface singur" — care, fara sa stie deosebirea,
-- a inghetat si dezactivarile AUTOMATE:
--
--     stoc 5 -> 0 -> Edinio dezactiveaza singur anuntul, si scrie `removed_by_user`
--     stoc 0 -> 10 -> produsul redevine vandabil
--     dar starea spune „omul a hotarat asa" -> anuntul RAMANE dezactivat ❌
--
-- Adica marfa se intoarce pe raft si anuntul ramane stins, pentru totdeauna, pana cand omul observa
-- si apasa de mana. Iar el n-are de unde sa stie ca trebuie.
--
-- ⚠ NUMELE STARII ERA DEJA O MINCIUNA: `removed_by_user` pentru ceva ce n-a facut niciun user. Nu-l
-- schimb — vine de la ei si se compara cu ce ne raspund — dar de-acum nu mai e singurul martor.
--
-- ⚠ Vechile randuri raman cu `null`: nu putem sti ce s-a intamplat cu ele. Si `null` se citeste ca
-- „nu stiu cine", adica se poarta ca o hotarare a omului — partea in care greseala e ieftina: un
-- anunt care ramane stins pana il porneste omul, nu unul care porneste singur cand n-ar trebui.

alter table public.olx_adverts
  add column if not exists dezactivat_de text;

alter table public.olx_adverts
  drop constraint if exists olx_adverts_dezactivat_de_check;
alter table public.olx_adverts
  add constraint olx_adverts_dezactivat_de_check
  check (dezactivat_de is null or dezactivat_de in ('om', 'stoc', 'produs-inactiv', 'inainte-de-stergere'));

comment on column public.olx_adverts.dezactivat_de is
  'Cine a cerut dezactivarea: `om` (apasare in ecran), `stoc` (a ajuns la zero), `produs-inactiv`, `inainte-de-stergere`. NULL la randurile de dinaintea migratiei, si se citeste prudent, ca o hotarare a omului.';

notify pgrst, 'reload schema';

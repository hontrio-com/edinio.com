-- ═══════════════════════════════════════════════════════════════════════════
-- Cand am reintrebat ultima oara cererea de retur
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ ROTATIA NU SE POATE FACE PE UN CAMP CARE NU SE MISCA (26.08.2026)
--
-- Reconcilierea cererilor inca vii lua cele mai vechi 60 dupa `last_modified`, ca sa nu ramana
-- niciuna in urma. Numai ca `last_modified` e valoarea LOR: se scrie din raspuns si se schimba
-- doar cand cererea chiar s-a schimbat.
--
-- Deci o cerere care sta in `WaitingInAction` cat timp comerciantul se hotaraste — pana la doua
-- zile lucratoare, in Romania — isi pastreaza `last_modified`-ul. Un magazin cu peste 60 de
-- cereri vii ar fi reintrebat ACELEASI 60 la fiecare cinci minute, pentru totdeauna, iar
-- restul niciodata. Exact infometarea pe care reconcilierea venea s-o inlature.
--
-- ⚠ DE-AIA UN CAMP AL NOSTRU. `reintrebat_la` se scrie la FIECARE citire, chiar si cand n-a
-- venit nimic nou. Ordonat pe el, cel mai demult atins e mereu primul, si roata se invarte
-- singura. `nulls first` pune cererile niciodata atinse inaintea tuturor.
--
-- ⚠ NU SE FOLOSESTE `updated_at`: acela se misca si la o aducere obisnuita, deci ar fi amestecat
-- doua intrebari diferite — „cand am scris randul" si „cand l-am reintrebat anume".

alter table public.trendyol_claims
  add column if not exists reintrebat_la timestamptz;

comment on column public.trendyol_claims.reintrebat_la is
  'Cand a fost reintrebata cererea pe claimIds, chiar daca n-a venit nimic nou. Tine roata reconcilierii.';

-- ⚠ Indexul acopera chiar interogarea reconcilierii: pe magazin, pe stare, cele mai demult
-- atinse intai. Fara el, un tabel de retururi mare l-ar fi facut sa scaneze tot la fiecare
-- cinci minute.
create index if not exists trendyol_claims_reintrebat_idx
  on public.trendyol_claims (business_id, claim_status, reintrebat_la nulls first);

notify pgrst, 'reload schema';

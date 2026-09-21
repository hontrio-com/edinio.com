-- ═══════════════════════════════════════════════════════════════════════════
-- B1: linkul de recuperare lasa urma
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE NU SE PUTEA SPUNE. Cardul „Recuperate" numara cosurile convertite care
-- primisera candva un mesaj. Masurat pe productie pe 21.09.2026: din 307
-- cosuri convertite, doar 2 primisera vreun mesaj - si nici despre acelea doua
-- nu se putea arata ca mesajul a facut conversia. Linkul era `?recover=<id>`
-- si nu lasa nicio urma ca a fost deschis. Cifra nu era „mica", ci
-- NEDEMONSTRABILA.
--
-- Doua coloane pe jurnalul de mesaje, si atat: cand a fost deschis linkul, si
-- ce comanda a iesit din el.
alter table public.recovery_sends
  add column if not exists deschis_la timestamptz,
  add column if not exists comanda_id uuid references public.orders(id) on delete set null;

-- Cautarea de la conversie: „mesajele deschise ale cosului asta".
create index if not exists recovery_sends_deschise_idx
  on public.recovery_sends (cart_id, deschis_la desc)
  where deschis_la is not null;

-- ⚠⚠ SI UN INDEX PE CHEIA STRAINA `comanda_id`, altfel STERGEREA UNEI COMENZI SCANEAZA
-- TOATA TABELA ASTA, o data pentru fiecare comanda stearsa.
--
-- Nu e o presupunere: acelasi defect a facut stergerea in masa a 340 de produse sa cada
-- de sapte ori la rand in august, cu `canceling statement due to statement timeout`.
-- Masurat atunci cu `explain (analyze)`: 3018 ms pentru UN produs, din care 2270 ms o
-- singura cheie straina neindexata. Dupa indexuri, 19,6 ms.
--
-- ⚠ Lipsa a fost prinsa de `chei-straine-indexate.test.ts` la aplicarea in productie, pe
-- 21.09.2026 — nu de mine recitind migratia. Indexul de mai sus NU acopera cazul:
-- `comanda_id` nu e prima lui coloana, si planificatorul se uita la prima.
--
-- ⚠ Index INTREG, nu partial. Unul `where comanda_id is not null` ar fi mai mic, dar
-- verificarea de cheie straina o face sistemul cu interogarea lui, si pe un drum de care
-- atarna o stergere nu se merita subtilitatea.
create index if not exists recovery_sends_comanda_idx
  on public.recovery_sends (comanda_id);

notify pgrst, 'reload schema';

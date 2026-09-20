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

notify pgrst, 'reload schema';

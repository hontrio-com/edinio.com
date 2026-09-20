-- ═══════════════════════════════════════════════════════════════════════════
-- A4: „Ignora" langa stergerea definitiva
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ DE CE E NEVOIE DE EA. Pana acum singurul buton era cosul de gunoi, care
-- sterge randul pe loc, fara sa intrebe nimic. Iar stergerea nu inseamna „nu-l
-- mai contacta": inseamna ca valoarea cosului dispare si din cifre, deci rata
-- de abandon si venitul potential se schimba retroactiv. Comerciantul care
-- voia doar sa scape de un cos de proba isi taia si din masuratori.
--
-- Un cos ignorat ramane in socoteli si nu mai primeste niciun mesaj.
alter table public.abandoned_carts
  add column if not exists ignorat_la timestamptz;

-- ⚠ Cronul citeste cosurile deschise ale fiecarui magazin; indexul partial tine
-- cautarea pe cele care chiar pot primi mesaje.
create index if not exists abandoned_carts_neignorate_idx
  on public.abandoned_carts (business_id, status, last_activity_at desc)
  where ignorat_la is null;

notify pgrst, 'reload schema';

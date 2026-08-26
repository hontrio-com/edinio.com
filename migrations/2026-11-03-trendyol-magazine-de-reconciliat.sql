-- ══════════════════════════════════════════════════════════════════════════
-- DOUA MAGAZINE NU-SI RECONCILIAU NICIODATA APROBARILE (26.08.2026)
-- ══════════════════════════════════════════════════════════════════════════
--
-- Pasul 3 din `trendyol-sync` isi lua magazinele asa:
--
--   .from("trendyol_listings").select("business_id")
--     .in("status", RECONCILE_STATUSES)
--     .order("business_id", { ascending: true }).limit(1000);
--   const reconcileSet = alegeInRotatie([...new Set(...)], RECONCILE_BIZ);
--
-- ⚠ TRUNCHIEREA E INAINTEA DEDUPLICARII, deci rotatia n-o repara. Masurat pe datele reale:
--
--     19c5146c    14 randuri   0..13     in pool
--     635bc524   986 randuri  14..999    in pool, umple restul
--     bdba3cc6    —                      NU AJUNGE NICIODATA
--     fa126de4    —                      NU AJUNGE NICIODATA
--
-- Un singur vanzator cu aproape o mie de listari umplea singur fereastra. Celelalte magazine
-- nu erau reconciliate mai rar — nu erau reconciliate DELOC.
--
-- ⚠ CE INSEMNA: 76 de listari ale lui Okxi stateau in `created` de pana la 24 de ore fara ca
-- cineva sa intrebe daca au fost aprobate. Comerciantul le vedea „in aprobare" la nesfarsit,
-- iar un produs respins la revizuirea de continut ar fi ramas asa pe veci.
--
-- ⚠ E EXACT DEFECTUL DESPRE CARE AVERTIZEAZA COMENTARIUL DE ZECE RANDURI MAI JOS, in pasul 4,
-- unde s-a reparat pentru comenzi („pool-ul vine din `store_settings`, NU din tabela de
-- listari"). Aici a ramas. Si e a doua oara cand un „1000" rotund ascunde o taietura tacuta.
--
-- ⚠ SE NUMARA IN POSTGRES. Un `group by` intoarce cate un rand pe magazin, nu cate unul pe
-- listare — deci nu mai exista nimic de trunchiat.

create or replace function public.trendyol_magazine_de_reconciliat()
returns table (business_id uuid, cate bigint)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select l.business_id, count(*) as cate
    from public.trendyol_listings l
   where l.status in ('pending', 'created', 'approved', 'active', 'rejected')
   group by l.business_id
   order by l.business_id;
$$;

comment on function public.trendyol_magazine_de_reconciliat() is
  'Magazinele care au listari de reconciliat. Se NUMARA in Postgres: citite ca randuri, PostgREST taie la 1000 si magazinele de dupa taietura nu se reconciliaza niciodata.';

-- ⚠ `security definer` peste listarile oricui: fara revoke, EXECUTE ramane la PUBLIC.
revoke execute on function public.trendyol_magazine_de_reconciliat() from public, anon, authenticated;
grant execute on function public.trendyol_magazine_de_reconciliat() to service_role;

-- ══════════════════════════════════════════════════════════════════════════
-- SI PASUL DE LOTURI AVEA ACELASI PLAFON
-- ══════════════════════════════════════════════════════════════════════════
--
-- Gasit de proba scrisa pentru pasul de mai sus, care cerea ca forma veche sa nu se mai
-- gaseasca NICAIERI in cron. Comentariul de-acolo se ingrijea deja de rotatie — dar rotatia nu
-- repara o taietura care se face INAINTEA deduplicarii.
--
-- ⚠ AZI NU DOARE: zero loturi deschise in clipa asta. Dar la o publicare in masa, un magazin cu
-- peste o mie de loturi deschise ar fi umplut singur fereastra, iar celelalte nu si-ar mai fi
-- sondat loturile deloc.
--
-- ⚠ SI DE AZI COSTA MAI MULT: stergerea unui produs asteapta confirmarea lotului inainte sa
-- uite listarea. Un magazin cazut dupa taietura si-ar fi lasat listarile in `removing` pe veci.

create or replace function public.trendyol_magazine_cu_loturi_deschise()
returns table (business_id uuid, cate bigint)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select b.business_id, count(*) as cate
    from public.trendyol_batches b
   where b.status in ('pending', 'processing', 'retry')
   group by b.business_id
   order by b.business_id;
$$;

comment on function public.trendyol_magazine_cu_loturi_deschise() is
  'Magazinele cu loturi nesondate. Se NUMARA in Postgres: citite ca randuri, PostgREST taie la 1000 si magazinele de dupa taietura nu-si sondeaza niciodata loturile.';

revoke execute on function public.trendyol_magazine_cu_loturi_deschise() from public, anon, authenticated;
grant execute on function public.trendyol_magazine_cu_loturi_deschise() to service_role;

notify pgrst, 'reload schema';

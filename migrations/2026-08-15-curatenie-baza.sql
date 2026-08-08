-- Doua curatenii masurate, zero cod de aplicatie.

-- ─── 1. Patru indexuri de prisos pe `site_analytics`: 21 MB -> 12 MB ─────────
--
-- Verificat pe DEFINITII, nu doar pe numarul de scanari:
--   * idx_analytics_business_created (business_id, created_at DESC) era DUPLICAT
--     EXACT al lui idx_site_analytics_business_created — acelasi lucru de doua
--     ori, cu 37 de scanari contra 470.
--   * idx_analytics_business_id (business_id) era PREFIXUL compozitului pastrat,
--     deci acoperit complet; cele 252 de scanari trec pe el fara sa observe.
--   * idx_analytics_business_event (business_id, event_type, created_at DESC):
--     7 scanari si 4,6 MB, cel mai scump si cel mai putin folosit.
--   * idx_analytics_event_type (event_type): coloana cu foarte putine valori
--     distincte („visit" acopera aproape tot tabelul), deci nu ingusteaza nimic.
--
-- Se PASTREAZA idx_site_analytics_business_created (470 scanari, il folosesc ambii
-- cititori) si idx_analytics_created_at (744, il va folosi si retentia cand apare).
drop index if exists public.idx_analytics_business_created;
drop index if exists public.idx_analytics_business_id;
drop index if exists public.idx_analytics_business_event;
drop index if exists public.idx_analytics_event_type;

-- ─── 2. Randurile de stagiere ale importurilor incheiate ────────────────────
--
-- 6.523 randuri sterse din 14.854. Trei conditii, si a treia nu e evidenta:
--   * jobul e INCHEIAT (cele 12 in curs nu se ating)
--   * randul nu e failed/skipped — alea alimenteaza /api/imports/[id]/error-report,
--     care citeste exact `status in ('failed','skipped')`
--   * imaginile sunt DEJA rehostate. Asta e conditia care lipsea din prima
--     variasnta: `rehostChunk` citeste chiar randurile astea (`images_done = false`
--     si `status in ('created','updated')`), deci sterse mai devreme, produsele ar
--     fi ramas legate PE VECI la imaginile furnizorului. Erau 4.522 in situatia
--     asta, adica 41% din ce paruse sters-abil.
delete from public.product_import_rows r
using public.product_imports j
where j.id = r.import_id
  and j.status in ('completed','completed_with_errors','failed','cancelled')
  and r.status not in ('failed','skipped')
  and r.images_done;

-- `raw` n-a fost scrisa NICIODATA (NULL pe toate cele 14.854 de randuri) si nu se
-- citeste nicaieri. Se scoate ca sa dispara capcana: e exact coloana in care
-- cineva incepe sa scrie randul CSV original „fiindca exista deja".
alter table public.product_import_rows drop column if exists raw;

-- Spatiul se recupereaza la autovacuum. `VACUUM` nu se poate rula din migratie
-- (nu merge in tranzactie).

-- ═══════════════════════════════════════════════════════════════════════════
-- Panoul eMAG: „Ciornă la eMAG” are cartonașul ei
-- 02.10.2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ `validation_status = 0` NU e o stare necunoscută. Răspunsul lor brut o numește
-- „Draft”, iar documentația (v4.4.4, §2.4.1) spune că o ciornă — fișă incompletă:
-- fără descriere, imagini, caracteristici sau categorie — „won't be sent to eMAG
-- Catalogue team for validation”. Stă pe loc până o completează cineva.
--
-- Măsurat azi: 100 de oferte așa (OKXI, Yvelle), niciuna cu `part_number_key`, deci
-- niciuna cu pagină de produs la eMAG. Le număram la „Oprită” (42) și „Stare
-- necunoscută” (restul). Comerciantul Yvelle a retrimis de trei ori nouă produse
-- fără să afle ce lipsea: toate plecaseră fără nicio caracteristică.
--
-- ⚠ Ordinea e cea din `deCeNuSeVinde` (`src/lib/emag/de-ce-nu-se-vinde.ts`): ciorna
-- vine imediat după „în validare” și ÎNAINTEA stării ofertei — o ofertă pornită pe un
-- produs ciornă tot nu se vinde. `panoul-emag.test.ts` compară etichetele de aici cu
-- cele din cod.
--
-- Doar corpul se schimbă; semnătura și tipul întors rămân, deci `create or replace`
-- ajunge, iar granturile se păstrează.

create or replace function public.numara_ofertele_emag(p_business_id uuid)
returns jsonb
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  with etichetate as (
    select case
      /* 1. Respinsă. Prima, fiindcă restul nu mai contează. */
      when o.validation_status in (5, 6, 8, 10, 12) then 'Respins de eMAG'
      /* 2. Încă în validare la ei. Nu e nimic de făcut. */
      when o.validation_status in (1, 2, 4) then 'În validare la eMAG'
      /* 2b. Ciornă la ei: fișa e incompletă și nu pleacă la validare. */
      when o.validation_status = 0 then 'Ciornă la eMAG'
      /* 3. Aprobată, dar oprită sau scoasă LA EI. Se repornește din panoul lor. */
      when o.status_la_ei = 2 then 'Scoasă din vânzare la eMAG'
      when o.status_la_ei = 0 then 'Oprită la eMAG'
      /* 4. Prețul iese din intervalul lor. */
      when o.offer_validation_status is not null and o.offer_validation_status <> 1
        then 'Preț neacceptat de eMAG'
      /* 5. Fără stoc la ei. Ultimul, fiindcă e cel mai ușor de reparat. */
      when o.stoc_la_ei is not null and o.stoc_la_ei <= 0 then 'Fără stoc la eMAG'
      /* ⚠ Necitit NU înseamnă „în regulă": un rând nevăzut n-are voie să arate verde. */
      when o.status_la_ei is null or o.stoc_la_ei is null then 'Încă necitit de la eMAG'
      /* ⚠ O stare pe care n-o știm NU e „în regulă". */
      when o.validation_status is not null and o.validation_status not in (3, 9, 11, 12)
        then 'Stare necunoscută la eMAG'
      else 'Se vinde pe eMAG'
    end as eticheta
    from public.emag_offers o
    where o.business_id = p_business_id
  )
  select coalesce(jsonb_object_agg(eticheta, cate), '{}'::jsonb)
  from (select eticheta, count(*) as cate from etichetate group by 1) t;
$$;

notify pgrst, 'reload schema';

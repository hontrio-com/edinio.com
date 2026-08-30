-- ═══════════════════════════════════════════════════════════════════════════
-- Panoul eMAG: cartonașe care nu se suprapun și care se adună la total
-- 24.08.2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE SE REPARĂ. Panoul de sus mințea în trei feluri deodată:
--
--   a) „În validare" număra starea NOASTRĂ (`status in ('queued','sent')`), nu verdictul
--      LOR. Din cele 3.693 numărate așa, 3.445 aveau `validation_status = 9` (aprobat) și
--      doar 4 erau chiar în validare.
--
--   b) Cartonașele se suprapuneau. „De revizuit" filtra pe `validation_status`, „În
--      validare" pe `status`, și nu se excludeau niciodată: intersecția lor era 154,
--      adică TOATE cele respinse erau numărate de două ori.
--
--   c) Nu exista niciun cartonaș pentru „oprite / End of Life la eMAG", deși 1.035 erau
--      End of Life și 348 oprite în contul comerciantului. Acelea se repornesc DOAR din
--      panoul eMAG, și nimic din ecran nu-i spunea că există.
--
-- Rezultatul pe ecran: „Oferte 3754" cu 61 + 3693 + 154 = **3908** dedesubt. Cifrele nu
-- se adunau. E primul ecran pe care îl vede oricine căruia i se anunță integrarea.
--
-- ⚠ DE CE ÎN SQL, ȘI NU CITIND RÂNDURILE
--
-- Ca numărătoarea să nu depindă de mărimea catalogului. Citite în aplicație, cele 3.754
-- de rânduri de azi merg; la cincizeci de mii, prima pagină a panoului ar aduce zeci de
-- megaocteți la fiecare încărcare.
--
-- ⚠ ORDINEA `case`-ului E CHIAR REGULA, ȘI E COPIATĂ DIN `deCeNuSeVinde`
--
-- Fiecare ofertă cade într-o SINGURĂ ramură, deci cartonașele se adună la total prin
-- construcție, nu din întâmplare. Ordinea contează: `validation_status = 12` e și în
-- mulțimea respinselor, și în cea a vandabilelor — respins câștigă, fiindcă e primul.
--
-- ⚠ `panoul-emag.test.ts` compară etichetele de aici cu cele din `de-ce-nu-se-vinde.ts`.
-- Cine adaugă o stare într-un loc și nu în celălalt află din teste, nu din panou.

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
      /* ⚠ LISTA INCHISA: 1 asteapta MKTP, 2 marca, 4 documentatia. „Orice nu e vandabil
         inseamna in validare" e o presupunere, iar ei trimit si `0`, care nu e in enumul
         lor — 61 de oferte asa, din care 42 chiar OPRITE. Prinse aici, ecranul le spunea
         „nu ai nimic de facut" cand aveau. Ce nu stim trece mai jos, unde se poate
         explica adevarat. */
      when o.validation_status in (1, 2, 4) then 'În validare la eMAG'
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
      /* ⚠ O stare pe care n-o stim NU e „in regula": ei trimit si `0`, care nu exista in
         enumul lor. Trecuta drept vanduta, ar fi aratat verde pe ceva necunoscut. */
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

grant execute on function public.numara_ofertele_emag(uuid) to service_role;

notify pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- REGISTRUL: incheierea decide din WHERE, nu dintr-o citire de dinainte
--
-- ⚠ A DOUA REGRESIE gasita la verificarea propriilor modificari, in aceeasi
-- trecere care a gasit-o si pe cea din 2026-08-21. Nici asta n-a fost prinsa de
-- tsc, de cele 1154 de teste sau de build.
--
-- CE ERA STRICAT — `incheie_operatie_externa` avea o cursa clasica citire/scriere:
--
--     select * into v_ex from public.operatii_externe where id = p_id;   -- FARA for update
--     ...
--     if v_ex.stare not in ('in_curs','necunoscut') then return ... end if;
--     update public.operatii_externe set stare = p_stare where id = p_id; -- FARA predicat pe stare
--
-- Intre `select` si `update` randul se putea muta. Doua cai care se incheie in
-- acelasi timp pe aceeasi operatie — retur de browser si webhook, sau reconciliere
-- peste o apasare — treceau AMANDOUA de garda, si a doua scria peste prima. Un
-- `esuat` intarziat putea acoperi un `reusit` care tocmai adusese numarul AWB.
--
-- Ironia: fix cursa pe care registrul o inchide pentru altii era deschisa in el.
--
-- REPARATIA e tiparul deja folosit in `finalizeazaPlataComenzii`
-- (src/lib/orders/finalizare-plata.ts:88-109): decizia intra in `WHERE`, deci
-- verificarea si scrierea sunt aceeasi instructiune si nu mai exista fereastra.
-- Citirea de dupa serveste DOAR la a spune apelantului DE CE n-a mers.
--
-- ⚠ De ce NU `for update`: ar merge, dar ar tine un lacat pe rand, iar functia e
-- chemata pe cai care se pot suprapune la nesfarsit (cron la 15 minute peste o
-- apasare). Decizia din `WHERE` e exacta si nu blocheaza pe nimeni.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.incheie_operatie_externa(
  p_id                uuid,
  p_business_id       uuid,
  p_stare             text,
  p_referinta_externa text  default null,
  p_detalii           jsonb default null,
  p_eroare            text  default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_ex public.operatii_externe%rowtype;
begin
  if p_stare not in ('reusit', 'esuat', 'necunoscut') then
    return jsonb_build_object('gasit', false, 'motiv', 'stare nevalida');
  end if;

  -- TOATE conditiile intra in `where`: id, magazin SI stare. Daca instructiunea
  -- prinde un rand, inseamna ca in clipa scrierii toate erau adevarate.
  update public.operatii_externe o
     set stare             = p_stare,
         -- `coalesce`: reconcilierea poate incheia fara sa aduca detalii noi, si
         -- n-are voie sa stearga ce stiam deja.
         referinta_externa = coalesce(p_referinta_externa, o.referinta_externa),
         detalii           = coalesce(p_detalii, o.detalii),
         ultima_eroare     = case when p_stare = 'reusit' then null
                                  else coalesce(p_eroare, o.ultima_eroare) end,
         actualizat_la     = now()
   where o.id          = p_id
     and o.business_id = p_business_id
     and o.stare in ('in_curs', 'necunoscut')
  returning o.* into v_ex;

  if found then
    return jsonb_build_object('gasit', true, 'stare', v_ex.stare,
                              'referinta_externa', v_ex.referinta_externa);
  end if;

  -- N-am scris nimic. Citim ACUM doar ca sa spunem de ce — nu ca sa decidem.
  select * into v_ex from public.operatii_externe where id = p_id;
  if not found then
    return jsonb_build_object('gasit', false);
  end if;
  if v_ex.business_id is distinct from p_business_id then
    return jsonb_build_object('gasit', false, 'motiv', 'alt magazin');
  end if;
  return jsonb_build_object('gasit', true, 'deja', true, 'stare', v_ex.stare,
                            'referinta_externa', v_ex.referinta_externa);
end;
$$;

revoke all on function public.incheie_operatie_externa(uuid, uuid, text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.incheie_operatie_externa(uuid, uuid, text, text, jsonb, text)
  to service_role;

commit;

notify pgrst, 'reload schema';


-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICARE DUPA APLICARE — trebuie sa se termine cu „INCHIS, cum trebuie".
-- ═══════════════════════════════════════════════════════════════════════════
--
-- DO $t$
-- DECLARE
--   v_biz uuid; v_ord uuid; v_cheie text := 'proba:' || gen_random_uuid()::text;
--   v_a jsonb; v_r jsonb; v_strain uuid;
-- BEGIN
--   select o.business_id, o.id into v_biz, v_ord from public.orders o limit 1;
--   v_a := public.rezerva_operatie_externa(v_biz, v_ord, 'proba', 'proba', v_cheie);
--
--   -- 1. prima incheiere scrie
--   v_r := public.incheie_operatie_externa((v_a->>'id')::uuid, v_biz, 'reusit', 'AWB-1', null, null);
--   if v_r->>'stare' <> 'reusit' then raise exception '>>> prima incheiere n-a scris: %', v_r; end if;
--
--   -- 2. a DOUA incheiere NU are voie sa acopere prima. Asta e cursa reparata:
--   --    o cale intarziata care raporteaza esec peste un succes deja inregistrat.
--   v_r := public.incheie_operatie_externa((v_a->>'id')::uuid, v_biz, 'esuat', null, null, 'intarziat');
--   if (v_r->>'deja')::boolean is not true or v_r->>'stare' <> 'reusit'
--      or v_r->>'referinta_externa' <> 'AWB-1' then
--     raise exception '>>> DESCHIS (GRAV): o incheiere intarziata a acoperit un rezultat stabil: %', v_r; end if;
--
--   -- 3. alt magazin nu poate incheia operatia altuia
--   select b.id into v_strain from public.businesses b where b.id <> v_biz limit 1;
--   if v_strain is not null then
--     v_r := public.incheie_operatie_externa((v_a->>'id')::uuid, v_strain, 'esuat', null, null, 'strain');
--     if v_r->>'motiv' <> 'alt magazin' then
--       raise exception '>>> DESCHIS (GRAV): un magazin strain a incheiat operatia altuia: %', v_r; end if;
--   end if;
--
--   -- 4. `necunoscut` -> `reusit` ramane permis: asa completeaza reconcilierea
--   v_a := public.rezerva_operatie_externa(v_biz, v_ord, 'proba', 'proba', v_cheie || ':b');
--   perform public.incheie_operatie_externa((v_a->>'id')::uuid, v_biz, 'necunoscut', null, null, 'timeout');
--   v_r := public.incheie_operatie_externa((v_a->>'id')::uuid, v_biz, 'reusit', 'AWB-2', null, null);
--   if v_r->>'stare' <> 'reusit' then
--     raise exception '>>> reconcilierea nu mai poate lamuri o operatie necunoscuta: %', v_r; end if;
--
--   RAISE EXCEPTION '>>> INCHIS, cum trebuie. Incheierea decide din WHERE. (tranzactie anulata)';
-- END $t$;

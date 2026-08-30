-- ═══════════════════════════════════════════════════════════════════════════
-- REGISTRUL: o operatie ANULATA elibereaza slotul
--
-- ⚠ REPARA O REGRESIE INTRODUSA DE 2026-08-20-registru-operatii-externe.sql,
-- gasita la verificarea propriilor modificari (nu de tsc, nu de cele 1154 de
-- teste, nu de build — toate trecusera).
--
-- CE SE STRICASE:
--
--   Cheia unui AWB e `awb:<furnizor>:<orderId>`, fara niciun discriminant. Dar
--   AWB-urile SE ANULEAZA, si dupa anulare comanda are voie sa primeasca altul —
--   `cancelWootAwb` (woot.actions.ts) si `cancelDpdShipmentAction` (dpd.actions.ts:313)
--   golesc chiar coloanele care erau garda veche, tocmai ca sa se poata reface.
--
--   Cu registrul, randul ramanea `reusit` dupa anulare. Deci la a doua emitere:
--
--     rezerva -> refuzata cu motiv 'reusit'
--       -> apelantul intra pe ramura „adopta rezultatul"
--         -> scrie pe comanda numarul AWB-ului ANULAT
--
--   Adica nu doar un blocaj, ci INVIEREA unui AWB mort: comanda ar fi aratat un
--   transport care nu mai exista la curier, iar marfa n-ar fi plecat niciodata.
--   Codul de dinainte nu avea problema — la Woot nu exista nicio garda, iar la DPD
--   garda era `dpd_shipment_id`, care se goleste la anulare.
--
-- CE ADAUGA:
--   1. starea `anulat` — exclusa din indexul partial, deci NU mai blocheaza;
--   2. `marcheaza_operatie_anulata()`, singura cale prin care se ajunge acolo.
--
-- Istoricul se pastreaza: randul ramane, cu referinta AWB-ului anulat. Alternativa
-- (stergerea randului) ar fi sters exact dovada ca s-a platit un transport.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- 1) Starea noua ------------------------------------------------------------
alter table public.operatii_externe
  drop constraint if exists operatii_externe_stare_check;

alter table public.operatii_externe
  add constraint operatii_externe_stare_check check (stare in (
    'in_curs', 'reusit', 'esuat', 'necunoscut', 'anulat'));

-- Indexul partial NU se atinge: enumera starile care BLOCHEAZA, iar `anulat` nu e
-- printre ele, deci eliberarea slotului vine de la sine. E si motivul pentru care
-- indexul a fost scris cu lista pozitiva, nu cu `where stare <> 'esuat'`.

-- 2) marcheaza_operatie_anulata(...) ----------------------------------------
--
-- Cautarea e dupa CHEIE, nu dupa id: cel care anuleaza stie ce operatie logica
-- desfiinteaza („AWB-ul Woot al comenzii asta"), dar nu are de unde sa stie
-- id-ul randului scris de altcineva, poate acum doua saptamani.
--
-- Tranzitii permise: `reusit` -> `anulat` (cazul obisnuit) si `necunoscut` ->
-- `anulat` (operatia era in ceata, dar daca omul a reusit s-o anuleze la furnizor
-- inseamna ca EXISTA acolo — anularea e deci si raspunsul la ce nu stiam).
-- Din `in_curs` NU se poate: acolo nu exista inca nicio referinta, deci n-avea ce
-- sa anuleze nimeni.
create or replace function public.marcheaza_operatie_anulata(
  p_business_id uuid,
  p_cheie       text
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_ex public.operatii_externe%rowtype;
begin
  if p_business_id is null or coalesce(btrim(p_cheie), '') = '' then
    return jsonb_build_object('gasit', false, 'motiv', 'argumente lipsa');
  end if;

  update public.operatii_externe o
     set stare         = 'anulat',
         actualizat_la = now()
   where o.business_id = p_business_id
     and o.cheie       = p_cheie
     and o.stare in ('reusit', 'necunoscut')
  returning o.* into v_ex;

  if not found then
    -- Nu e neaparat o eroare: o anulare pe o comanda dinaintea registrului nu are
    -- ce sa elibereze. Apelantul decide daca il intereseaza.
    return jsonb_build_object('gasit', false);
  end if;

  return jsonb_build_object('gasit', true, 'referinta_externa', v_ex.referinta_externa);
end;
$$;

revoke all on function public.marcheaza_operatie_anulata(uuid, text)
  from public, anon, authenticated;
grant execute on function public.marcheaza_operatie_anulata(uuid, text)
  to service_role;

commit;

notify pgrst, 'reload schema';


-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICARE DUPA APLICARE — trebuie sa se termine cu „INCHIS, cum trebuie".
--
-- Probeaza EXACT scenariul regresiei: emit, anulez, emit din nou. Fara migratia
-- asta, pasul 3 intoarce `reusit` (adica AWB-ul mort) si blocul striga.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- DO $t$
-- DECLARE
--   v_biz uuid; v_ord uuid; v_cheie text := 'awb:proba:' || gen_random_uuid()::text;
--   v_a jsonb; v_b jsonb; v_c jsonb;
-- BEGIN
--   select o.business_id, o.id into v_biz, v_ord from public.orders o limit 1;
--
--   -- 1. se emite AWB-ul
--   v_a := public.rezerva_operatie_externa(v_biz, v_ord, 'awb', 'proba', v_cheie);
--   perform public.incheie_operatie_externa((v_a->>'id')::uuid, v_biz, 'reusit', 'AWB-1', null, null);
--
--   -- 2. cat timp e `reusit`, a doua emitere e refuzata — asta ramane corect
--   v_b := public.rezerva_operatie_externa(v_biz, v_ord, 'awb', 'proba', v_cheie);
--   if v_b->>'motiv' <> 'reusit' then
--     raise exception '>>> AWB-ul activ nu mai blocheaza a doua emitere: %', v_b; end if;
--
--   -- 3. dupa ANULARE, slotul se elibereaza si se poate emite din nou
--   v_c := public.marcheaza_operatie_anulata(v_biz, v_cheie);
--   if (v_c->>'gasit')::boolean is not true then
--     raise exception '>>> anularea nu a gasit operatia: %', v_c; end if;
--
--   v_c := public.rezerva_operatie_externa(v_biz, v_ord, 'awb', 'proba', v_cheie);
--   if (v_c->>'rezervat')::boolean is not true then
--     raise exception '>>> REGRESIA E DESCHISA: dupa anulare, emiterea e tot blocata (%). Comanda ar primi inapoi AWB-ul mort.', v_c; end if;
--
--   -- 4. din `in_curs` NU se poate anula: acolo nu exista nicio referinta
--   v_c := public.marcheaza_operatie_anulata(v_biz, v_cheie);
--   if (v_c->>'gasit')::boolean is not false then
--     raise exception '>>> s-a anulat o operatie in curs, desi n-avea ce referinta sa aiba: %', v_c; end if;
--
--   RAISE EXCEPTION '>>> INCHIS, cum trebuie. Anularea elibereaza slotul, in_curs nu se anuleaza. (tranzactie anulata)';
-- END $t$;

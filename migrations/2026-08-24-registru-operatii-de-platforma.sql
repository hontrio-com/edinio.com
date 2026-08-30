-- ═══════════════════════════════════════════════════════════════════════════
-- REGISTRUL accepta si operatii de PLATFORMA (fara magazin)
--
-- DE CE
--
--   Facturarea de platforma — abonamentele Edinio si comenzile de domenii — emite
--   documente fiscale REALE prin `createSmartbillInvoice`, dar nu apartine niciunui
--   magazin: `public.invoices` are doar `user_id`. Iar butonul de reincercare din
--   `/api/admin/invoices/[id]` e construit CHIAR pe starea ambigua —
--   `createSmartbillInvoice` (src/lib/smartbill.ts:121-125) prinde orice excepție
--   de retea si intoarce `{error}`, deci un POST REUSIT arata identic cu un esec.
--   Apasa administratorul, si pleaca al doilea document fiscal.
--
--   `business_id` era `not null`, deci operatiile astea nu incapeau in registru.
--
-- ⚠ CAPCANA OCOLITA: `NULL != NULL` INTR-UN INDEX UNIC
--
--   Varianta evidenta — `business_id` nullable, index unic pe `(business_id, cheie)`
--   — ar fi fost o gaura tacuta: doua randuri cu `business_id IS NULL` si ACEEASI
--   cheie sunt amandoua permise, fiindca NULL nu se compara cu NULL. Adica exact
--   pentru operatiile de platforma, unde miza e cea mai mare (documente fiscale),
--   registrul ar fi incetat sa dedupa — si fara nicio eroare.
--
--   A doua varianta — un al doilea index partial `where business_id is null` — pare
--   sa repare, dar strica altceva: `on conflict (...)` infera UN SINGUR index. Pe
--   calea de platforma insertul ar fi trecut de inferenta si s-ar fi lovit de al
--   doilea index cu 23505 NEPRINS de `do nothing`, deci ar fi aruncat.
--
--   Solutia: un singur index unic, pe EXPRESIE, cu `coalesce`. Un UUID de santinela
--   ia locul lui NULL doar in index; coloana ramane curata, si `on conflict` infera
--   exact aceeasi expresie. Tiparul dovedit ramane neatins.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- 1) `business_id` devine optional. FK-ul RAMANE: cheile straine accepta NULL, deci
--    integritatea pentru randurile care CHIAR au magazin nu se pierde.
alter table public.operatii_externe
  alter column business_id drop not null;

comment on column public.operatii_externe.business_id is
  'Magazinul, sau NULL pentru operatiile PLATFORMEI (abonamente, comenzi de domenii) — acelea nu apartin niciunui magazin.';

-- 2) Indexul unic devine NULL-safe, pe expresie.
drop index if exists public.operatii_externe_cheie_activa_idx;

create unique index if not exists operatii_externe_cheie_activa_idx
  on public.operatii_externe (
    coalesce(business_id, '00000000-0000-0000-0000-000000000000'::uuid),
    cheie
  )
  where stare in ('in_curs', 'reusit', 'necunoscut');

-- 3) rezerva: primeste NULL, si compara NULL-safe peste tot ------------------
create or replace function public.rezerva_operatie_externa(
  p_business_id uuid,
  p_order_id    uuid,
  p_fel         text,
  p_furnizor    text,
  p_cheie       text
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_biz    uuid;
  v_numar  text;
  v_id     uuid;
  v_ex     public.operatii_externe%rowtype;
  -- Aceeasi santinela ca in index. Nu ajunge niciodata intr-o coloana.
  v_nul constant uuid := '00000000-0000-0000-0000-000000000000';
begin
  if coalesce(btrim(p_cheie), '') = '' then
    return jsonb_build_object('rezervat', false, 'motiv', 'fara cheie');
  end if;

  /*
   * `p_business_id` NULL = operatie de PLATFORMA (abonament, domeniu). Nu are
   * magazin de verificat, si nici comanda — de aceea verificarea de mai jos era si
   * ramane conditionata de `p_order_id`.
   *
   * O operatie CU `p_order_id` dar FARA magazin ar fi o combinatie fara sens: ar
   * ocoli tocmai verificarea de apartenenta. Se refuza explicit.
   */
  if p_business_id is null and p_order_id is not null then
    return jsonb_build_object('rezervat', false, 'motiv', 'comanda fara magazin');
  end if;

  if p_order_id is not null then
    select o.business_id, o.order_number into v_biz, v_numar
      from public.orders o
     where o.id = p_order_id;

    if not found then
      return jsonb_build_object('rezervat', false, 'motiv', 'comanda negasita');
    end if;
    if v_biz is distinct from p_business_id then
      return jsonb_build_object('rezervat', false, 'motiv', 'alt magazin');
    end if;
  end if;

  insert into public.operatii_externe
    (business_id, order_id, order_number, fel, furnizor, cheie, incercari)
  values
    (p_business_id, p_order_id, v_numar, p_fel, p_furnizor, p_cheie, 1)
  on conflict (coalesce(business_id, '00000000-0000-0000-0000-000000000000'::uuid), cheie)
    where stare in ('in_curs', 'reusit', 'necunoscut')
  do nothing
  returning id into v_id;

  if v_id is not null then
    return jsonb_build_object('rezervat', true, 'id', v_id);
  end if;

  update public.operatii_externe o
     set incercari     = o.incercari + 1,
         actualizat_la = now()
   where coalesce(o.business_id, v_nul) = coalesce(p_business_id, v_nul)
     and o.cheie = p_cheie
     and o.stare in ('in_curs', 'reusit', 'necunoscut')
  returning o.* into v_ex;

  if not found then
    return jsonb_build_object('rezervat', false, 'motiv', 'cursa');
  end if;

  return jsonb_build_object(
    'rezervat',          false,
    'motiv',             v_ex.stare,
    'id',                v_ex.id,
    'referinta_externa', v_ex.referinta_externa,
    'detalii',           v_ex.detalii,
    'incercari',         v_ex.incercari,
    'ultima_eroare',     v_ex.ultima_eroare,
    'creat_la',          v_ex.creat_la
  );
end;
$$;

revoke all on function public.rezerva_operatie_externa(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.rezerva_operatie_externa(uuid, uuid, text, text, text)
  to service_role;

-- 4) incheie: comparatie NULL-safe pe magazin -------------------------------
--    `= p_business_id` nu s-ar potrivi NICIODATA cand amandoua sunt NULL, deci
--    operatiile de platforma n-ar mai fi putut fi incheiate niciodata.
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

  update public.operatii_externe o
     set stare             = p_stare,
         referinta_externa = coalesce(p_referinta_externa, o.referinta_externa),
         detalii           = coalesce(p_detalii, o.detalii),
         ultima_eroare     = case when p_stare = 'reusit' then null
                                  else coalesce(p_eroare, o.ultima_eroare) end,
         actualizat_la     = now()
   where o.id = p_id
     and o.business_id is not distinct from p_business_id
     and o.stare in ('in_curs', 'necunoscut')
  returning o.* into v_ex;

  if found then
    return jsonb_build_object('gasit', true, 'stare', v_ex.stare,
                              'referinta_externa', v_ex.referinta_externa);
  end if;

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

-- 5) anularea: aceeasi comparatie NULL-safe ---------------------------------
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
  if coalesce(btrim(p_cheie), '') = '' then
    return jsonb_build_object('gasit', false, 'motiv', 'argumente lipsa');
  end if;

  update public.operatii_externe o
     set stare         = 'anulat',
         actualizat_la = now()
   where o.business_id is not distinct from p_business_id
     and o.cheie       = p_cheie
     and o.stare in ('reusit', 'necunoscut')
  returning o.* into v_ex;

  if not found then
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
-- VERIFICARE — trebuie sa se termine cu „INCHIS, cum trebuie".
--
-- Pasul 2 e cel care conteaza: fara indexul pe expresie, A DOUA rezervare de
-- platforma ar fi TRECUT, si registrul ar fi incetat sa dedupa exact acolo unde
-- se emit documentele fiscale ale platformei.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- DO $t$
-- DECLARE
--   v_cheie text := 'factura:smartbill:proba-' || gen_random_uuid()::text;
--   v_a jsonb; v_b jsonb; v_c jsonb; v_biz uuid; v_ord uuid;
-- BEGIN
--   -- 1. o operatie de PLATFORMA (fara magazin, fara comanda) se poate rezerva
--   v_a := public.rezerva_operatie_externa(null, null, 'factura', 'smartbill', v_cheie);
--   if (v_a->>'rezervat')::boolean is not true then
--     raise exception '>>> operatia de platforma nu s-a putut rezerva: %', v_a; end if;
--
--   -- 2. A DOUA e REFUZATA. Fara indexul pe expresie, NULL != NULL si ar fi trecut.
--   v_b := public.rezerva_operatie_externa(null, null, 'factura', 'smartbill', v_cheie);
--   if (v_b->>'rezervat')::boolean is not false or v_b->>'motiv' <> 'in_curs' then
--     raise exception '>>> DESCHIS (GRAV): a doua operatie de platforma a trecut: %', v_b; end if;
--
--   -- 3. se poate si INCHEIA (cu `= p_business_id` n-ar fi mers niciodata)
--   v_c := public.incheie_operatie_externa((v_a->>'id')::uuid, null, 'reusit', 'EDI-123', null, null);
--   if v_c->>'stare' <> 'reusit' then
--     raise exception '>>> operatia de platforma nu s-a putut incheia: %', v_c; end if;
--
--   -- 4. si ADOPTATA
--   v_c := public.rezerva_operatie_externa(null, null, 'factura', 'smartbill', v_cheie);
--   if v_c->>'referinta_externa' <> 'EDI-123' then
--     raise exception '>>> adoptarea nu merge pe platforma: %', v_c; end if;
--
--   -- 5. o comanda FARA magazin e o combinatie fara sens si se refuza
--   select o.business_id, o.id into v_biz, v_ord from public.orders o limit 1;
--   v_c := public.rezerva_operatie_externa(null, v_ord, 'factura', 'smartbill', v_cheie || ':x');
--   if v_c->>'motiv' <> 'comanda fara magazin' then
--     raise exception '>>> DESCHIS: o comanda a fost rezervata fara magazin, ocolind verificarea de apartenenta: %', v_c; end if;
--
--   -- 6. calea cu magazin merge mai departe neschimbata
--   v_c := public.rezerva_operatie_externa(v_biz, v_ord, 'proba', 'proba', v_cheie || ':y');
--   if (v_c->>'rezervat')::boolean is not true then
--     raise exception '>>> calea cu magazin s-a stricat: %', v_c; end if;
--
--   RAISE EXCEPTION '>>> INCHIS, cum trebuie. Toate 6 probele au trecut. (tranzactie anulata)';
-- END $t$;

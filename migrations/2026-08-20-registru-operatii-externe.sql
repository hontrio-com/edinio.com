-- ═══════════════════════════════════════════════════════════════════════════
-- REGISTRUL DE OPERATII EXTERNE: intentia se scrie INAINTE, rezultatul DUPA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- CLASA DE DEFECT:
--
--     furnizorul extern face ceva REAL si ireversibil (AWB, factura fiscala)
--               ↓
--     scrierea locala care leaga rezultatul de comanda PICA
--               ↓
--     Edinio nu stie ca s-a intamplat
--               ↓
--     omul apasa din nou -> AL DOILEA transport platit / A DOUA factura
--
-- Verificat in cod, tiparul e identic in toate cele ~30 de situri. Exemplu,
-- src/lib/actions/cargus.actions.ts:154-164:
--
--     const barCode = await createCargusAwb(config, enriched);   // efect REAL
--     await supabase.from("orders").update({ cargus_awb_number: barCode, ... })
--                                  .eq("id", orderId);
--     // `error` nu e destructurat. Un UPDATE care nu prinde niciun rand nu da
--     // eroare. Zero exceptii pe tot domeniul facturarii si al curieratului.
--
-- ⚠ DE CE REPARATIA EVIDENTA E GRESITA
--
-- „Verifica scrierea si intoarce eroare" nu rezolva nimic: AWB-ul CHIAR a fost
-- creat, iar comerciantul care vede eroare apasa din nou si creeaza exact
-- duplicatul de care ne temem. Si nu acopera deloc cele doua cazuri care conteaza:
--   * procesul moare intre POST si UPDATE (`void maybeAutoInvoice`, serverless);
--   * furnizorul a creat documentul dar raspunsul s-a pierdut — src/lib/smartbill.ts:320
--     prinde orice excepție de retea si intoarce `{ error: "Eroare de retea" }`,
--     deci un POST REUSIT arata identic cu un esec. Chiar pe starea asta e construit
--     butonul de reincercare din src/app/api/admin/invoices/[id]/route.ts:70.
--
-- CE FACE REGISTRUL: se REZERVA inainte de apel, se INCHEIE dupa. Daca incheierea
-- pica, randul ramane `in_curs` — si atunci a doua apasare e REFUZATA, nu servita.
-- Adica exact garantia care lipseste azi: pierderea scrierii nu mai produce duplicat.
--
-- ⚠ CELE PATRU STARI, SI DE CE `esuat` NU E ACELASI LUCRU CU `necunoscut`
--
--   in_curs     rezervat, apelul e in zbor SAU procesul a murit. BLOCHEAZA.
--   reusit      gata, avem referinta. BLOCHEAZA, si a doua apasare o ADOPTA.
--   esuat       furnizorul a REFUZAT explicit (validare, 4xx cu mesaj). NU blocheaza:
--               reincercarea e sigura, fiindca nu s-a intamplat nimic la el.
--   necunoscut  timeout, cadere de retea, raspuns neinteligibil. Furnizorul POATE
--               sa fi facut operatia. BLOCHEAZA, si iese la om cu cheia.
--
-- Distinctia `esuat` / `necunoscut` e inima lucrarii. Fara ea registrul ar fi
-- decor: un timeout clasificat drept „esec" ar debloca exact reincercarea care
-- emite al doilea document fiscal. De aceea IMPLICITUL IN COD E `necunoscut`, si
-- `esuat` se scrie DOAR cu dovada ca furnizorul a refuzat. A bloca din greseala e
-- recuperabil (omul primeste cheia si verifica in panoul furnizorului); a nu
-- bloca din greseala e o factura in plus la ANAF.
--
-- ⚠ CE NU FACE, DELIBERAT
--
--   * `in_curs` NU expira singur. Un lease ar fi exact greseala: daca procesul a
--     murit intre POST si UPDATE, furnizorul cel mai probabil A FACUT operatia, iar
--     expirarea automata ar reface-o. Randurile blocate se rezolva prin
--     reconciliere sau de mana, niciodata prin trecerea timpului.
--   * NU intra in tranzactia lui `aplica_tranzitia_comenzii`. Comentariul de la
--     src/lib/actions/bulk-orders.actions.ts:427-429 scrie deja regula: un apel de
--     opt secunde la SmartBill sub `for update` ar tine lacatul pe comanda si ar
--     bloca webhook-ul de plata, lotul si panoul. Registrul e tranzactie proprie.
--   * FARA `on delete cascade` catre orders — vezi mai jos.
--
-- Migratia e ADITIVA: creeaza un tabel si doua functii pe care azi nu le cheama
-- nimeni. Aplicata inainte de deploy nu schimba nicio purtare.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ---------------------------------------------------------------------------
-- 1) Tabelul
-- ---------------------------------------------------------------------------
create table if not exists public.operatii_externe (
  id                uuid primary key default gen_random_uuid(),

  business_id       uuid not null references public.businesses(id) on delete cascade,

  -- ⚠ `on delete SET NULL`, NU cascade. `sterge_comanda` (migrations/2026-08-18-
  -- tranzitia-comenzii.sql:197) face `delete from public.orders` fara sa se uite
  -- la AWB-uri sau facturi. Cu cascade, registrul ar disparea exact in cazul in
  -- care e singura dovada ca s-a platit un transport sau ca exista un document
  -- fiscal. De aceea si copiile denormalizate de mai jos: raportul trebuie sa
  -- ramana citibil dupa ce comanda nu mai exista.
  order_id          uuid references public.orders(id) on delete set null,
  order_number      text,

  fel               text not null,
  furnizor          text not null,

  -- Deterministă si stabila intre incercari: aceeasi operatie logica da mereu
  -- aceeasi cheie. Pentru facturi include SLOTUL (vezi cheieDocument din
  -- src/lib/billing/refacturare.ts:94), ca o reemitere legitima dupa storno sa NU
  -- fie blocata pe vecie de documentul desfiintat.
  cheie             text not null,

  stare             text not null default 'in_curs',

  -- Ce ne-a dat furnizorul: numarul AWB, numarul facturii, order_id-ul lui.
  referinta_externa text,
  -- Restul: serie, url, nume de serviciu. Ce nu incape intr-un singur text.
  detalii           jsonb,

  incercari         integer not null default 0,
  ultima_eroare     text,

  creat_la          timestamptz not null default now(),
  actualizat_la     timestamptz not null default now(),

  constraint operatii_externe_fel_check check (fel in (
    'awb', 'anulare_awb', 'ridicare',
    'factura', 'proforma', 'storno', 'anulare_document',
    'plata', 'incasare', 'rambursare',
    'proba')),

  constraint operatii_externe_furnizor_check check (furnizor in (
    'cargus', 'sameday', 'fancourier', 'dpd', 'woot', 'colete',
    'smartbill', 'oblio', 'fgo',
    'stripe', 'netopia', 'ipay', 'klarna', 'revolut',
    'proba')),

  constraint operatii_externe_stare_check check (stare in (
    'in_curs', 'reusit', 'esuat', 'necunoscut'))
);

comment on table public.operatii_externe is
  'Registrul operatiilor externe ireversibile (AWB, facturi, plati). Intentia se scrie INAINTE de apel, rezultatul DUPA. Scris DOAR prin rezerva_operatie_externa() si incheie_operatie_externa().';

-- ⚠ CHECK pe `furnizor` desi lista creste, si nu din exces de zel: cheia contine
-- numele furnizorului, deci „smartbill" scris intr-un loc si „SmartBill" in altul
-- ar produce doua spatii de nume separate si AMANDOUA ar emite. Adica exact
-- defectul pe care il inchidem. `proba` e o valoare REZERVATA, ca verificarea de
-- la coada fisierului si santinela sa poata rula pe productie fara sa atinga
-- spatiul de nume al vreunui furnizor real.

-- ---------------------------------------------------------------------------
-- 2) Unicitatea — PARTIALA, si aici sta toata semantica
-- ---------------------------------------------------------------------------
-- Blocheaza doar starile in care operatia ori e in zbor, ori s-a intamplat, ori
-- nu stim. O operatie REFUZATA de furnizor (`esuat`) nu blocheaza nimic: acolo
-- reincercarea e purtarea corecta, si e chiar ce apasa omul.
--
-- Un index partial pastreaza si ISTORICUL: randul esuat ramane pe loc, cu eroarea
-- lui, langa cel care a reusit dupa. Solutia alternativa — stergerea randului la
-- esec — ar fi sters exact dovada de care are nevoie diagnosticul.
create unique index if not exists operatii_externe_cheie_activa_idx
  on public.operatii_externe (business_id, cheie)
  where stare in ('in_curs', 'reusit', 'necunoscut');

-- Pentru pagina comenzii.
create index if not exists operatii_externe_order_idx
  on public.operatii_externe (order_id, creat_la desc);

-- Pentru reconciliere si pentru santinela: „ce a ramas atarnat?". Partial, ca sa
-- ramana mic indiferent cat creste tabelul.
create index if not exists operatii_externe_atarnate_idx
  on public.operatii_externe (creat_la)
  where stare in ('in_curs', 'necunoscut');

-- ---------------------------------------------------------------------------
-- 3) RLS — tiparul TARE, ca la public.rate_limits
-- ---------------------------------------------------------------------------
-- RLS pornit FARA nicio politica = refuz pentru anon si authenticated. Dar RLS
-- singur nu e de ajuns: `ALTER DEFAULT PRIVILEGES` al platformei da automat
-- granturi complete pe orice tabel nou din `public` (se vede in baseline la
-- stripe_events, 7 granturi catre anon si 7 catre authenticated). Fara `revoke`,
-- singurul zid ar fi RLS, iar o politica adaugata cindva „din reflex" ar deschide
-- tabelul instant.
alter table public.operatii_externe enable row level security;
revoke all on table public.operatii_externe from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) rezerva_operatie_externa(...) — pasul de DINAINTE de apelul extern
-- ---------------------------------------------------------------------------
-- Intoarce:
--   {'rezervat': true,  'id': <uuid>}
--   {'rezervat': false, 'motiv': 'reusit',     'id':…, 'referinta_externa':…, 'detalii':…}
--   {'rezervat': false, 'motiv': 'in_curs',    'id':…, 'creat_la':…, 'incercari':…}
--   {'rezervat': false, 'motiv': 'necunoscut', 'id':…, 'ultima_eroare':…}
--   {'rezervat': false, 'motiv': 'alt magazin' | 'comanda negasita' | 'fara cheie' | 'fara magazin'}
--
-- Apelantul NU cheama furnizorul decat pe `rezervat: true`. Pe `motiv: 'reusit'`
-- adopta referinta si raporteaza succes — asa o re-livrare de webhook sau o a doua
-- apasare devin inofensive, fara sa mai atinga furnizorul.
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
begin
  if p_business_id is null then
    return jsonb_build_object('rezervat', false, 'motiv', 'fara magazin');
  end if;
  if coalesce(btrim(p_cheie), '') = '' then
    return jsonb_build_object('rezervat', false, 'motiv', 'fara cheie');
  end if;

  /*
   * Apartenenta se verifica AICI, in functie, nu la apelant.
   *
   * Motivul e cel scris in aplica_tranzitia_comenzii: actiunile de server se pot
   * chema cu ORICE argumente, printr-un POST direct catre orice cale (vezi
   * manifestul global de actiuni). Un apelant care si-a verificat magazinul dar
   * primeste `orderId` din corpul cererii nu e o garantie.
   *
   * Concret azi: `createWootAwb` (src/lib/actions/woot.actions.ts:215) nu citeste
   * deloc comanda inainte de a chema Woot — deci un orderId strain ar consuma
   * credit real din contul altcuiva.
   *
   * Fara `for update`: aici doar CITIM ca sa validam. Un lacat pe comanda tinut
   * peste apelul extern e chiar ce evitam (vezi antetul).
   */
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

  -- Rezervarea propriu-zisa. `on conflict … where` tinteste indexul PARTIAL, deci
  -- se ciocneste doar de starile care blocheaza.
  insert into public.operatii_externe
    (business_id, order_id, order_number, fel, furnizor, cheie, incercari)
  values
    (p_business_id, p_order_id, v_numar, p_fel, p_furnizor, p_cheie, 1)
  on conflict (business_id, cheie) where stare in ('in_curs', 'reusit', 'necunoscut')
  do nothing
  returning id into v_id;

  if v_id is not null then
    return jsonb_build_object('rezervat', true, 'id', v_id);
  end if;

  /*
   * Am fost refuzati. Numaram incercarea PE RANDUL CARE BLOCHEAZA si il intoarcem
   * intreg.
   *
   * Numaratoarea nu e statistica: „aceeasi operatie ceruta de unsprezece ori" e
   * chiar semnalul ca un om se lupta cu un buton care nu-i raspunde, si e lucrul
   * pe care il vrem in /admin/logs.
   */
  update public.operatii_externe o
     set incercari     = o.incercari + 1,
         actualizat_la = now()
   where o.business_id = p_business_id
     and o.cheie       = p_cheie
     and o.stare in ('in_curs', 'reusit', 'necunoscut')
  returning o.* into v_ex;

  if not found then
    -- Randul care bloca a fost incheiat de altcineva intre `insert` si `update`.
    -- Nu reincercam aici: apelantul reia, si a doua oara ori rezerva, ori vede
    -- starea stabila. O bucla la nivelul asta ar putea sa nu se termine.
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

-- ---------------------------------------------------------------------------
-- 5) incheie_operatie_externa(...) — pasul de DUPA raspunsul furnizorului
-- ---------------------------------------------------------------------------
-- Tranzitii permise: `in_curs` -> orice; `necunoscut` -> orice (asa completeaza
-- reconcilierea o operatie ramasa in ceata). Din `reusit` si `esuat` NU se mai
-- iese: sunt stari stabile, iar o rescriere ar sterge dovada.
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

  select * into v_ex from public.operatii_externe where id = p_id;
  if not found then
    return jsonb_build_object('gasit', false);
  end if;
  if v_ex.business_id is distinct from p_business_id then
    return jsonb_build_object('gasit', false, 'motiv', 'alt magazin');
  end if;
  if v_ex.stare not in ('in_curs', 'necunoscut') then
    return jsonb_build_object('gasit', true, 'deja', true, 'stare', v_ex.stare,
                              'referinta_externa', v_ex.referinta_externa);
  end if;

  update public.operatii_externe o
     set stare             = p_stare,
         -- `coalesce`: reconcilierea poate incheia fara sa aduca detalii noi, si
         -- n-are voie sa stearga ce stiam deja.
         referinta_externa = coalesce(p_referinta_externa, o.referinta_externa),
         detalii           = coalesce(p_detalii, o.detalii),
         ultima_eroare     = case when p_stare = 'reusit' then null
                                  else coalesce(p_eroare, o.ultima_eroare) end,
         actualizat_la     = now()
   where o.id = p_id
  returning o.* into v_ex;

  return jsonb_build_object('gasit', true, 'stare', v_ex.stare,
                            'referinta_externa', v_ex.referinta_externa);
end;
$$;

revoke all on function public.incheie_operatie_externa(uuid, uuid, text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.incheie_operatie_externa(uuid, uuid, text, text, jsonb, text)
  to service_role;

commit;

-- OBLIGATORIU: fara reincarcare, PostgREST respinge apelurile catre functiile
-- proaspat create desi dreptul EXISTA in baza, iar supabase-js intoarce
-- `data: null`. Asa s-a rupt autentificarea cu MFA pe 04.08.2026.
notify pgrst, 'reload schema';


-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICARE DUPA APLICARE
--
-- Ruleaza blocul de mai jos. Trebuie sa se termine cu „INCHIS, cum trebuie".
-- Orice alt mesaj inseamna ca gaura e deschisa. Tranzactia se anuleaza singura,
-- deci NU ramane nimic in baza — nici randurile de proba.
--
-- ⚠ CE S-A AFLAT INCERCAND SA FAC PROBA SA PICE (20.08.2026)
--
-- Prima incercare de proba negativa a fost sa sterg indexul partial si sa vad
-- daca pasul 2 chiar striga. Nu a apucat: `rezerva_operatie_externa` a cazut cu
--
--     42P10: there is no unique or exclusion constraint matching the
--            ON CONFLICT specification
--
-- Doua lucruri, amandoua bune:
--   1. Inferenta din `on conflict … where` tinteste CHIAR indexul partial de mai
--      sus, nu vreo alta constrangere care s-ar fi nimerit. Deci probele nu trec
--      din alt motiv.
--   2. Fara index, registrul NU degradeaza tacut intr-un no-op — cade zgomotos.
--      E opusul deciziei din stripe_events („registrul indisponibil -> proceseaza
--      fara dedupe"), si aici asa trebuie: acolo un eveniment pierdut nu mai vine
--      niciodata, aici operatia e pornita de om, cu buton de reincercare, iar raul
--      de evitat e chiar duplicatul.
--
-- Proba negativa REALA e deci alta: purtarea de azi, transcrisa literal. Rulata pe
-- productie, pe comanda #0005, in tranzactie anulata:
--
--     VECHI: ambii operatori trec de garda (au citit NULL amandoi) -> DOUA AWB-uri
--     NOU:   primul rezerva, al doilea REFUZAT (motiv=in_curs, incercari=2)
--
-- Blocul e la coada fisierului, sub cel pozitiv.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- DO $t$
-- DECLARE
--   v_biz uuid; v_ord uuid; v_cheie text := 'proba:' || gen_random_uuid()::text;
--   v_a jsonb; v_b jsonb; v_c jsonb; v_d jsonb; v_e jsonb; v_strain uuid;
-- BEGIN
--   select o.business_id, o.id into v_biz, v_ord from public.orders o limit 1;
--   if v_biz is null then raise exception '>>> nu exista nicio comanda pe care sa probez'; end if;
--
--   -- 1. prima rezervare trece
--   v_a := public.rezerva_operatie_externa(v_biz, v_ord, 'proba', 'proba', v_cheie);
--   if (v_a->>'rezervat')::boolean is not true then
--     raise exception '>>> PRIMA rezervare a fost refuzata: %', v_a; end if;
--
--   -- 2. a doua, cat timp prima e `in_curs`, e REFUZATA. Asta e toata lucrarea.
--   v_b := public.rezerva_operatie_externa(v_biz, v_ord, 'proba', 'proba', v_cheie);
--   if (v_b->>'rezervat')::boolean is not false or v_b->>'motiv' <> 'in_curs' then
--     raise exception '>>> DESCHIS (GRAV): a doua rezervare a trecut peste una in curs: %', v_b; end if;
--   if (v_b->>'incercari')::int <> 2 then
--     raise exception '>>> incercarile nu se numara: %', v_b; end if;
--
--   -- 3. dupa `reusit`, a treia ADOPTA referinta in loc sa recheme furnizorul
--   perform public.incheie_operatie_externa((v_a->>'id')::uuid, v_biz, 'reusit', 'AWB-PROBA-1', null, null);
--   v_c := public.rezerva_operatie_externa(v_biz, v_ord, 'proba', 'proba', v_cheie);
--   if (v_c->>'rezervat')::boolean is not false or v_c->>'motiv' <> 'reusit'
--      or v_c->>'referinta_externa' <> 'AWB-PROBA-1' then
--     raise exception '>>> adoptarea rezultatului nu merge: %', v_c; end if;
--
--   -- 4. `esuat` NU blocheaza: un refuz dovedit al furnizorului lasa reincercarea sa treaca
--   v_d := public.rezerva_operatie_externa(v_biz, v_ord, 'proba', 'proba', v_cheie || ':b');
--   perform public.incheie_operatie_externa((v_d->>'id')::uuid, v_biz, 'esuat', null, null, 'refuzat de furnizor');
--   v_d := public.rezerva_operatie_externa(v_biz, v_ord, 'proba', 'proba', v_cheie || ':b');
--   if (v_d->>'rezervat')::boolean is not true then
--     raise exception '>>> un esec DOVEDIT blocheaza reincercarea, desi n-ar trebui: %', v_d; end if;
--
--   -- 5. `necunoscut` BLOCHEAZA: un timeout nu e un esec
--   v_e := public.rezerva_operatie_externa(v_biz, v_ord, 'proba', 'proba', v_cheie || ':c');
--   perform public.incheie_operatie_externa((v_e->>'id')::uuid, v_biz, 'necunoscut', null, null, 'timeout');
--   v_e := public.rezerva_operatie_externa(v_biz, v_ord, 'proba', 'proba', v_cheie || ':c');
--   if (v_e->>'rezervat')::boolean is not false or v_e->>'motiv' <> 'necunoscut' then
--     raise exception '>>> DESCHIS (GRAV): un timeout a fost tratat ca esec si a deblocat reincercarea: %', v_e; end if;
--
--   -- 6. limita de magazin: alt business_id nu ajunge la comanda
--   select b.id into v_strain from public.businesses b where b.id <> v_biz limit 1;
--   if v_strain is not null then
--     v_a := public.rezerva_operatie_externa(v_strain, v_ord, 'proba', 'proba', v_cheie || ':d');
--     if v_a->>'motiv' <> 'alt magazin' then
--       raise exception '>>> DESCHIS (GRAV): un magazin strain a rezervat pe comanda altuia: %', v_a; end if;
--   end if;
--
--   RAISE EXCEPTION '>>> INCHIS, cum trebuie. Toate 6 probele au trecut. (tranzactie anulata, nu ramane nimic)';
-- END $t$;
--
--
-- ── PROBA NEGATIVA: purtarea VECHE, pe aceeasi comanda ──────────────────────
-- Fara ea, cea de sus n-ar dovedi ca a rezolvat ceva.
--
-- DO $t$
-- DECLARE
--   v_ord uuid; v_biz uuid; v_numar text; v_vazut_a text; v_vazut_b text;
--   v_cheie text := 'proba-veche:' || gen_random_uuid()::text;
--   v_a jsonb; v_b jsonb; v_raport text := '';
-- BEGIN
--   select o.id, o.business_id, o.order_number into v_ord, v_biz, v_numar
--     from public.orders o where o.cargus_awb_number is null limit 1;
--
--   -- Garda de azi, transcrisa din cargus.actions.ts:113 + :136 — o CITIRE,
--   -- despartita de scrierea de la :160 prin 1 dus-intors la baza si 2-4 apeluri
--   -- externe. Doi operatori care apasa in fereastra aia:
--   select o.cargus_awb_number into v_vazut_a from public.orders o where o.id = v_ord;
--   select o.cargus_awb_number into v_vazut_b from public.orders o where o.id = v_ord;
--   if v_vazut_a is null and v_vazut_b is null then
--     v_raport := v_raport || format('VECHI: pe comanda %s ambii trec de garda -> DOUA AWB-uri platite. ', v_numar);
--   else
--     v_raport := v_raport || 'VECHI: garda a oprit al doilea (neasteptat). ';
--   end if;
--
--   v_a := public.rezerva_operatie_externa(v_biz, v_ord, 'awb', 'cargus', v_cheie);
--   v_b := public.rezerva_operatie_externa(v_biz, v_ord, 'awb', 'cargus', v_cheie);
--   if (v_a->>'rezervat')::boolean and not (v_b->>'rezervat')::boolean then
--     v_raport := v_raport || format('NOU: al doilea REFUZAT (motiv=%s, incercari=%s) -> UN singur AWB.',
--                                    v_b->>'motiv', v_b->>'incercari');
--   else
--     v_raport := v_raport || format('NOU: DESCHIS (GRAV) — a=%s b=%s', v_a, v_b);
--   end if;
--   RAISE EXCEPTION '%  (tranzactie anulata)', v_raport;
-- END $t$;
--
-- Rezultatul obtinut pe 20.08.2026, pe productie:
--   VECHI: pe comanda #0005 ambii operatori trec de garda (au citit NULL amandoi)
--          -> DOUA AWB-uri platite.
--   NOU:   primul rezerva, al doilea REFUZAT (motiv=in_curs, incercari=2)
--          -> UN singur AWB.


-- APLICATA in productie pe 20.08.2026, INAINTE de deploy: migratia e aditiva
-- (tabel + doua functii pe care nu le cheama nimeni inca) si nu revoca nimic din
-- ce atinge codul care ruleaza, deci nu se aplica regula „migratie DUPA deploy"
-- din incidentul de pe 04.08. Ambele blocuri de verificare de mai sus au fost
-- rulate si au dat rezultatele scrise.

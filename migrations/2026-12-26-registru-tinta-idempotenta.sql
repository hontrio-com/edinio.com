-- ═══════════════════════════════════════════════════════════════════════════
-- CHEIA APARA INTENTIA. TINTA CERE O A DOUA INCUIETOARE.        (03.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Runda trecuta cheia unei plati a trecut de la ziua UTC la un ID DE INTENTIE,
-- si a fost bine: doua cumparari legitime in aceeasi zi nu se mai confunda, iar
-- o reluare peste hotarul zilei nu mai plateste a doua oara.
--
-- ⚠ DAR INTENTIA TRAIESTE IN BROWSER. `localStorage`, cheiat pe ce se cumpara.
-- Iar registrul e atomic pentru ACEEASI cheie — nu si pentru acelasi LUCRU
-- cumparat sub doua intentii diferite. Trei drumuri catre plata dubla, toate
-- reale:
--
--   1. ALT CALCULATOR. Prima cumparare ramane `necunoscut`. Omul deschide
--      Edinio pe alt laptop: `localStorage` gol -> intentie noua -> alta cheie
--      -> registrul nu se opune -> `POST` a doua oara.
--
--   2. INTENTIA EXPIRA. O tinem sase ore, ca o intentie veche sa nu blocheze o
--      cumparare noua. Dar randul din registru poate fi INCA `necunoscut` la
--      sapte ore. Acelasi rezultat.
--
--   3. DOUA FILE DESCHISE. Amandoua citesc `localStorage` gol in aceeasi clipa,
--      amandoua isi scriu intentia, amandoua o trimit. Doua chei valide.
--
-- ⚠ SI E MAI PERICULOS LA PACHETE DECAT LA PROMOVARI. La promovari mai exista o
-- plasa: se intreaba OLX daca promovarea e deja activa. La pachete nu exista
-- nicio dovada pe care sa ne sprijinim — chiar reconcilierul nostru o spune —
-- fiindca raspunsul lor spune cate pachete ai, nu cand le-ai luat. Acolo singura
-- aparare posibila e a noastra.
--
-- ═══ DOUA INCUIETORI, CU ROSTURI DIFERITE ═══
--
--   `cheie`               = intentia EXACTA. Cuprinde si `reusit`, ca o reluare
--                           a aceleiasi apasari sa primeasca `deja` in loc sa
--                           mai plateasca o data.
--
--   `tinta_idempotenta`   = LUCRUL cumparat, fara intentie. Cuprinde NUMAI
--                           `in_curs` si `necunoscut`.
--
-- ⚠ `reusit` NU INTRA IN A DOUA INCUIETOARE, si asta e toata deosebirea. Daca ar
-- intra, un pachet cumparat cu succes ar face imposibila a doua cumparare a
-- aceluiasi pachet — pentru totdeauna. Incuietoarea semantica exista doar cat
-- timp o cumparare anterioara e DESCHISA sau NELAMURITA.
--
-- ⚠ SI HOTARAREA STA IN `INSERT`, NU INTR-UN `SELECT` DE DINAINTE. Un
-- „mai exista una deschisa?" urmat de un `insert` e chiar cursa pe care o
-- inchidem: doua cereri simultane citesc amandoua „nu exista" si scriu amandoua.
-- Indexul unic partial e arbitrul; din doua inserari concurente trece exact una.

begin;

-- ── 1) Coloana ─────────────────────────────────────────────────────────────
--
-- `null` peste tot: nicio operatie de pana acum nu are tinta, si nici nu trebuie.
-- A doua incuietoare se aplica numai acolo unde apelantul o cere anume.
alter table public.operatii_externe
  add column if not exists tinta_idempotenta text;

comment on column public.operatii_externe.tinta_idempotenta is
  'LUCRUL cumparat, fara id-ul de intentie (`promovare:123:top_ad`). A doua incuietoare, activa numai cat timp randul e `in_curs` sau `necunoscut`. NULL = operatia nu cere blocare semantica.';

-- ── 2) Incuietoarea semantica ──────────────────────────────────────────────
--
-- ⚠ `furnizor` si `fel` intra in CHEIE, nu in predicat: doua case de plata pe
-- aceeasi tinta sunt operatii diferite si amandoua au voie sa se intample. La
-- fel ca la `cheieOperatie`, unde furnizorul intra in cheie tocmai de-aia.
--
-- ⚠ `coalesce` pe `business_id`, ca la indexul de chei: operatiile PLATFORMEI au
-- `business_id` null, iar `NULL != NULL` ar deschide o gaura tacuta exact acolo.
create unique index if not exists operatii_externe_tinta_deschisa_idx
  on public.operatii_externe (
    coalesce(business_id, '00000000-0000-0000-0000-000000000000'::uuid),
    furnizor,
    fel,
    tinta_idempotenta
  )
  where tinta_idempotenta is not null
    and stare in ('in_curs', 'necunoscut');

-- ── 3) Rezervarea, cu amandoua incuietorile ────────────────────────────────
--
-- ⚠ `p_tinta` ARE IMPLICIT, SI DE-AIA E SIGURA FEREASTRA DINTRE MIGRATIE SI
-- DESFASURARE. Migratia intra in productie inaintea codului; pana la desfasurare,
-- Vercel cheama inca RPC-ul cu CINCI parametri. Cu implicitul, forma aceea rezolva in
-- continuare si `tinta_idempotenta` ramane NULL, adica purtarea de pana acum.
--
-- Fara implicit, fiecare AWB, factura si plata s-ar fi oprit intre cele doua clipe.
-- Probat pe productie la 03.09.2026, si pozitional, si pe nume (cum cheama PostgREST).
--
-- ⚠ SE ARUNCA SI SE RECREEAZA. Un parametru nou cu implicit ar fi facut o A DOUA
-- functie, iar apelurile cu cinci argumente ar fi devenit ambigue („function
-- name is not unique"). Toti apelantii sunt in depozitul asta si trec prin
-- `cuRegistru`, deci schimbarea e acoperita de `tsc`.
drop function if exists public.rezerva_operatie_externa(uuid, uuid, text, text, text);

create or replace function public.rezerva_operatie_externa(
  p_business_id uuid,
  p_order_id    uuid,
  p_fel         text,
  p_furnizor    text,
  p_cheie       text,
  /**
   * Lucrul cumparat, fara intentie. `null` = fara a doua incuietoare, adica
   * purtarea de pana acum pentru toti ceilalti furnizori.
   */
  p_tinta       text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_biz    uuid;
  v_numar  text;
  v_id     uuid;
  v_ex     public.operatii_externe%rowtype;
  v_tinta  text := nullif(btrim(coalesce(p_tinta, '')), '');
  v_nul constant uuid := '00000000-0000-0000-0000-000000000000';
begin
  if coalesce(btrim(p_cheie), '') = '' then
    return jsonb_build_object('rezervat', false, 'motiv', 'fara cheie');
  end if;

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

  /*
   * ⚠ `on conflict do nothing` FARA TINTA DE INDEX, dinadins.
   *
   * Cu doua incuietori, un `on conflict (index_a) do nothing` prinde numai
   * ciocnirile cu `index_a`; una cu `index_b` ar ARUNCA, si atunci apelantul ar
   * primi „registrul nu a raspuns" in loc de „mai e una deschisa pentru acelasi
   * lucru" — un mesaj care nu spune ce are omul de facut.
   *
   * Forma fara tinta le prinde pe amandoua. Care dintre ele a fost se afla mai
   * jos, citind, DUPA ce inserarea a hotarat cine trece.
   */
  insert into public.operatii_externe
    (business_id, order_id, order_number, fel, furnizor, cheie, incercari, tinta_idempotenta)
  values
    (p_business_id, p_order_id, v_numar, p_fel, p_furnizor, p_cheie, 1, v_tinta)
  on conflict do nothing
  returning id into v_id;

  if v_id is not null then
    return jsonb_build_object('rezervat', true, 'id', v_id);
  end if;

  /*
   * ⚠ INTAI SE CAUTA ACEEASI CHEIE. E aceeasi INTENTIE, deci raspunsul potrivit e
   * cel dinainte: `deja` daca a reusit, altfel „e in lucru". Cautata a doua,
   * o reluare a aceleiasi apasari ar fi primit mesajul de tinta, care spune
   * altceva si trimite omul in alta parte.
   */
  update public.operatii_externe o
     set incercari     = o.incercari + 1,
         actualizat_la = now()
   where coalesce(o.business_id, v_nul) = coalesce(p_business_id, v_nul)
     and o.cheie = p_cheie
     and o.stare in ('in_curs', 'reusit', 'necunoscut')
  returning o.* into v_ex;

  if found then
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
  end if;

  /*
   * ⚠ ALTA INTENTIE, ACELASI LUCRU. Aici NU se creste `incercari`: randul acela
   * apartine altei apasari, si numarul incercarilor lui ar deveni mincinos.
   */
  if v_tinta is not null then
    select * into v_ex
      from public.operatii_externe o
     where coalesce(o.business_id, v_nul) = coalesce(p_business_id, v_nul)
       and o.furnizor = p_furnizor
       and o.fel = p_fel
       and o.tinta_idempotenta = v_tinta
       and o.stare in ('in_curs', 'necunoscut')
     limit 1;

    if found then
      return jsonb_build_object(
        'rezervat',      false,
        'motiv',         'alta_intentie',
        'id',            v_ex.id,
        'stare',         v_ex.stare,
        'creat_la',      v_ex.creat_la,
        'ultima_eroare', v_ex.ultima_eroare
      );
    end if;
  end if;

  return jsonb_build_object('rezervat', false, 'motiv', 'cursa');
end;
$function$;

comment on function public.rezerva_operatie_externa(uuid, uuid, text, text, text, text) is
  'Rezerva o operatie externa sub DOUA incuietori: `cheie` (intentia exacta, inclusiv `reusit`) si `tinta_idempotenta` (lucrul cumparat, numai cat timp e `in_curs`/`necunoscut`). Hotararea sta in INSERT, ca doua cereri simultane sa nu treaca amandoua.';

-- ── 4) Randurile DESCHISE de dinainte primesc si ele o tinta ──────────────
--
-- ⚠ FARA ASTA, INCUIETOAREA NU VEDE TOCMAI CAZUL PENTRU CARE S-A FACUT.
--
-- O plata ramasa `necunoscut` INAINTE de migratie are `tinta_idempotenta` NULL, iar
-- indexul are `tinta_idempotenta is not null` in predicat — deci randul acela nu e
-- nici in index, si nici gasit de cautarea din functie. A doua zi, de pe alt
-- calculator, aceeasi cumparare ar fi trecut nestingherita.
--
-- ⚠ Si la pachete nu mai exista nicio alta plasa: la promovari se intreaba OLX daca
-- e deja activa, la pachete nu se poate dovedi nimic.
--
-- Tinta se scoate din cheie, taind sufixul de intentie. Amandoua formele de sufix,
-- fiindca in registru pot sta chei din amandoua epocile:
--
--     …:0f8b9c1d-2e3a-4b5c-8d7e-9f0a1b2c3d4e   intentie (UUID)
--     …:a1b2c3d4e5f60718293a4b5c6d7e8f90       intentie (context nesigur, fara cratime)
--     …:2026-09-01                             CHEIA VECHE, cu ziua UTC
--     …                                        cea mai veche, fara niciun sufix
--
-- ⚠ SI `row_number()`, NU un `update` simplu. Daca doua randuri deschise ar ajunge pe
-- aceeasi tinta — adica plata dubla S-A intamplat deja — indexul unic ar face sa pice
-- INTREG `update`-ul cu 23505, si n-ar ramane nimic scris. Asa se scrie tinta pe cel
-- mai VECHI, iar perechea lui ramane cu NULL si se lamureste cu mana. Un esec partial
-- si vizibil bate unul total si tacut.
--
-- Rulat pe productie la 03.09.2026: 0 randuri (registrul n-avea nicio plata OLX).
-- Extragerea a fost probata separat pe cele patru forme de cheie de mai sus.
with candidat as (
  select
    id, business_id, furnizor, fel, creat_la,
    nullif(
      regexp_replace(
        substring(cheie from '^plata:olx:(.*)$'),
        ':([A-Za-z0-9_-]{16,64}|[0-9]{4}-[0-9]{2}-[0-9]{2})$', ''
      ), ''
    ) as tinta
  from public.operatii_externe
  where furnizor = 'olx'
    and fel = 'plata'
    and stare in ('in_curs', 'necunoscut')
    and tinta_idempotenta is null
    and cheie like 'plata:olx:%'
),
unice as (
  select id, tinta from (
    select
      c.*,
      row_number() over (
        partition by coalesce(c.business_id, '00000000-0000-0000-0000-000000000000'::uuid),
                     c.furnizor, c.fel, c.tinta
        order by c.creat_la
      ) as n
    from candidat c
    where c.tinta is not null
  ) t
  where n = 1
)
update public.operatii_externe o
   set tinta_idempotenta = u.tinta
  from unice u
 where o.id = u.id;

-- ── 5) Drepturi ────────────────────────────────────────────────────────────────────
--
-- ⚠ `revoke … from public` NU AJUNGE, si asta era sa treaca (03.09.2026).
--
-- Postgres da EXECUTE lui PUBLIC din oficiu la orice functie noua — dar Supabase are pe deasupra
-- si privilegii implicite care dau EXECUTE lui `anon` si `authenticated` PE NUME. Granturile date
-- pe nume nu se sting cu o revocare de la `public`.
--
-- ⚠ Functia asta e `security definer` si SCRIE in registrul operatiilor cu bani. Lasata deschisa,
-- ar fi putut fi chemata cu o cheie `anon` de oriunde. Recrearea unei functii vechi si sigure o
-- redeschide in tacere: nimic nu da eroare, si nimeni nu vede.
--
-- Proba care a prins-o: `src/lib/emag/granturi-rpc.test.ts`.
revoke all on function public.rezerva_operatie_externa(uuid, uuid, text, text, text, text) from public;
revoke all on function public.rezerva_operatie_externa(uuid, uuid, text, text, text, text) from anon, authenticated;
grant execute on function public.rezerva_operatie_externa(uuid, uuid, text, text, text, text) to service_role;

commit;

notify pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- PROBELE CERUTE DE AUDIT (rulate cu mana; scriu randuri adevarate)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- do $$
-- declare
--   v_biz uuid; v_a jsonb; v_b jsonb; v_id uuid;
--   v_t text := 'proba-tinta:' || gen_random_uuid()::text;
-- begin
--   select id into v_biz from public.businesses limit 1;
--
--   -- 1) tinta X + intentia A ramasa `necunoscut` -> intentia B NU poate rezerva
--   v_a := public.rezerva_operatie_externa(v_biz, null, 'plata', 'olx', v_t || ':A', v_t);
--   assert (v_a->>'rezervat')::boolean, '1: A trebuia sa rezerve';
--   v_id := (v_a->>'id')::uuid;
--   perform public.incheie_operatie_externa(v_id, v_biz, 'necunoscut', null, null, 'proba');
--   v_b := public.rezerva_operatie_externa(v_biz, null, 'plata', 'olx', v_t || ':B', v_t);
--   assert not (v_b->>'rezervat')::boolean, '1: B NU trebuia sa rezerve';
--   assert v_b->>'motiv' = 'alta_intentie', '1: motivul trebuie sa fie `alta_intentie`';
--
--   -- 3) A `reusit` -> B ARE VOIE (omul chiar vrea inca un pachet)
--   perform public.incheie_operatie_externa(v_id, v_biz, 'reusit', 'ref', null, null);
--   v_b := public.rezerva_operatie_externa(v_biz, null, 'plata', 'olx', v_t || ':B', v_t);
--   assert (v_b->>'rezervat')::boolean, '3: dupa `reusit`, B trebuie sa poata rezerva';
--   perform public.incheie_operatie_externa((v_b->>'id')::uuid, v_biz, 'esuat', null, null, 'proba');
--
--   -- 4) A `esuat` -> B ARE VOIE
--   v_a := public.rezerva_operatie_externa(v_biz, null, 'plata', 'olx', v_t || ':C', v_t);
--   perform public.incheie_operatie_externa((v_a->>'id')::uuid, v_biz, 'esuat', null, null, 'proba');
--   v_b := public.rezerva_operatie_externa(v_biz, null, 'plata', 'olx', v_t || ':D', v_t);
--   assert (v_b->>'rezervat')::boolean, '4: dupa `esuat`, B trebuie sa poata rezerva';
--
--   -- 4b) calea `deja`, de care depind TOTI furnizorii, e neatinsa
--   v_a := public.rezerva_operatie_externa(v_biz, null, 'plata', 'olx', v_t || ':H', v_t || ':deja');
--   perform public.incheie_operatie_externa((v_a->>'id')::uuid, v_biz, 'reusit', 'REF-123', '{"x":1}'::jsonb, null);
--   v_b := public.rezerva_operatie_externa(v_biz, null, 'plata', 'olx', v_t || ':H', v_t || ':deja');
--   assert v_b->>'motiv' = 'reusit' and v_b->>'referinta_externa' = 'REF-123'
--      and v_b->'detalii'->>'x' = '1' and (v_b->>'incercari')::int = 2, '4b: `deja` duce totul inapoi';
--
--   -- 4c) ANULAREA elibereaza tinta (lucreaza pe `reusit`/`necunoscut`)
--   v_a := public.rezerva_operatie_externa(v_biz, null, 'plata', 'olx', v_t || ':I', v_t || ':anul');
--   perform public.incheie_operatie_externa((v_a->>'id')::uuid, v_biz, 'necunoscut', null, null, 'proba');
--   v_b := public.rezerva_operatie_externa(v_biz, null, 'plata', 'olx', v_t || ':J', v_t || ':anul');
--   assert not (v_b->>'rezervat')::boolean, '4c: inainte de anulare, tinta blocheaza';
--   perform public.marcheaza_operatie_anulata(v_biz, v_t || ':I');
--   v_b := public.rezerva_operatie_externa(v_biz, null, 'plata', 'olx', v_t || ':J', v_t || ':anul');
--   assert (v_b->>'rezervat')::boolean, '4c: dupa anulare, tinta se elibereaza';
--
--   -- 4d) iesirea comerciantului: `esuat` pe un rand `in_curs` elibereaza tinta
--   -- ⚠ Conteaza ca merge si pe `in_curs`: `marcheaza_operatie_anulata` NU atinge starea
--   --   aceea, deci daca deblocarea n-ar face-o, un proces mort intre rezervare si incheiere
--   --   ar incuia tinta pentru totdeauna.
--   v_a := public.rezerva_operatie_externa(v_biz, null, 'plata', 'olx', v_t || ':K', v_t || ':deblo');
--   v_b := public.rezerva_operatie_externa(v_biz, null, 'plata', 'olx', v_t || ':L', v_t || ':deblo');
--   assert not (v_b->>'rezervat')::boolean, '4d: pregatire';
--   perform public.incheie_operatie_externa((v_a->>'id')::uuid, v_biz, 'esuat', null, null, 'deblocat');
--   v_b := public.rezerva_operatie_externa(v_biz, null, 'plata', 'olx', v_t || ':L', v_t || ':deblo');
--   assert (v_b->>'rezervat')::boolean, '4d: dupa deblocare, tinta se elibereaza';
--
--   -- 4e) codul VECHI, cu cinci parametri, merge peste schema noua
--   v_a := public.rezerva_operatie_externa(v_biz, null, 'awb', 'cargus', v_t || ':M');
--   assert (v_a->>'rezervat')::boolean, '4e: cinci argumente pozitionale';
--   v_b := public.rezerva_operatie_externa(
--     p_business_id := v_biz, p_order_id := null, p_fel := 'awb',
--     p_furnizor := 'cargus', p_cheie := v_t || ':N');
--   assert (v_b->>'rezervat')::boolean, '4e: cinci argumente pe nume (cum cheama PostgREST)';
--   perform 1 from public.operatii_externe where cheie = v_t || ':N' and tinta_idempotenta is null;
--   assert found, '4e: fara p_tinta, coloana ramane NULL';
--
--   -- 5) fara tinta, purtarea ramane cea de pana acum
--   v_a := public.rezerva_operatie_externa(v_biz, null, 'awb', 'proba', v_t || ':X', null);
--   v_b := public.rezerva_operatie_externa(v_biz, null, 'awb', 'proba', v_t || ':Y', null);
--   assert (v_a->>'rezervat')::boolean and (v_b->>'rezervat')::boolean,
--     '5: fara tinta, doua chei diferite trec amandoua';
--
--   delete from public.operatii_externe where cheie like v_t || ':%';
--   raise notice 'TOATE PROBELE AU TRECUT';
-- end $$;
--
-- Proba 2 (concurenta) nu se poate scrie intr-un singur `do $$`: cere DOUA
-- sesiuni. Se ruleaza din TypeScript, cu `Promise.all` peste doua chemari ale
-- RPC-ului si aceeasi tinta — vezi `src/lib/olx/tinta-platii.test.ts`.

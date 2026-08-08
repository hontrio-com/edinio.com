-- Cautarea pe server, legata la filtrele catalogului.
--
-- Prima versiune (`2026-08-14`) intorcea candidatii NEFILTRATI si taia la 600
-- randuri ordonate dupa `product_id`. Doua probleme, amandoua de corectitudine:
--
--   1. FILTRELE. Pe palierul server, o cerere cu `?q=manusi&pmax=50&brand=ARDON`
--      trebuie sa insemne acelasi lucru ca in browser: cautarea SI filtrele. Cu
--      candidatii nefiltrati, pagina ar fi aratat produse peste 50 de lei — sau,
--      daca filtram in TS dupa scorare, ar fi trebuit sa reexprimam acolo toata
--      semantica din `catalog_pagina` (pretul comparat cu `price_min` la ambele
--      capete, fatetele SAU-in-cheie/SI-intre-chei, comutatoarele). A doua
--      formulare a acelorasi reguli = divergenta tacuta, garantat.
--
--   2. TAIEREA. `order by product_id limit 600` e ARBITRARA fata de relevanta:
--      un rezultat de top-1 poate cadea in afara ferestrei. Masurat pe eSAFE,
--      `protectie` da 2.211 candidati din 3.351 — deci 1.611 aruncati la
--      intamplare, si nimeni n-ar fi vazut nimic in afara de rezultate mai
--      slabe. De acum nu se taie nimic: peste plafon functia raporteaza
--      `prea_larg` si apelantul CADE PE CALEA VECHE (tot catalogul in browser,
--      cautare locala). O optimizare n-are voie sa fie singurul drum catre
--      produse, si cu atat mai putin sa dea rezultate gresite in liniste.
--
-- Ce NU se schimba: scorul si ordinea raman in `product-search.ts`, rulate pe
-- candidati. Postgres face RECALL, Node face RANKING. Asa ranking-ul e identic
-- prin CONSTRUCTIE, nu prin test.
--
-- PLATOUL, numit ca sa nu fie o surpriza: la un catalog mult mai mare decat
-- eSAFE, un cuvant foarte comun va depasi plafonul si cautarea aceea va cadea pe
-- calea grea. Cand se intampla, reparatia NU e un plafon mai mare — e un index de
-- cuvinte care stie in ce CAMP a aparut cuvantul, ca taierea sa se poata face
-- „numele intai" (numele cantareste 1,0 in scorer, descrierea 0,45), adica
-- ordonata dupa relevanta si nu dupa `product_id`.

-- Vechea forma iese din uz: e `security definer`, e acordata lui `anon`, si
-- intoarce randuri de catalog nefiltrate. Fara apelanti, n-are ce sa stea.
drop function if exists public.catalog_cauta(uuid, text[], int);

/*
 * Candidatii unei cautari: produsele care conțin TOATE cuvintele cerute, deja
 * trecute prin filtrele paginii.
 *
 * Sta separat de `catalog_cauta` ca sa fie chemata de DOUA ori — o data ca sa se
 * numere, o data ca sa se citeasca randurile — fara sa existe doua copii ale
 * regulilor. Numaratul intai inseamna ca un set uriaș nu se materializeaza
 * niciodata ca randuri: se afla ca e prea mare si se renunta.
 *
 * `returns table` chemata din SQL nu trece prin PostgREST, deci plafonul
 * `db-max-rows` de 1000 nu se aplica aici (vezi [[postgrest-1000-row-cap]]).
 * Plafonul de care ne pazim e cel de MEMORIE, si acela e `p_plafon` mai jos.
 */
create or replace function public.catalog_candidati(
  p_business uuid,
  p_cuvinte  text[],
  p_filtre   jsonb
) returns table (product_id uuid)
language sql
stable
security definer
set search_path to 'public', 'pg_temp', 'extensions'
as $$
  with cerute as (
    /*
     * `length(w) >= 1`, nu `>= 2`.
     *
     * Motorul din browser potriveste si un singur caracter: „a" prinde orice
     * cuvant care incepe cu „a", prin ramura de prefix din `tokenScore`. Cu
     * pragul la 2, o cautare de o litera ar fi intors ZERO pe server si ~tot
     * catalogul in browser — adica exact felul de divergenta pe care faza asta
     * are ca scop sa nu-l produca. In practica un cuvant de o litera depaseste
     * plafonul si cererea cade pe calea veche, care e chiar comportamentul de azi.
     */
    select w, public.semnatura_cuvant(w) as semn
      from unnest(coalesce(p_cuvinte, '{}'::text[])) w
     where length(w) >= 1
  ),
  /*
   * Cuvintele din vocabular care se potrivesc, pe TREI cai, toate prin index:
   * prefix (`like 'cuv%'`) si trigrame (`%`) pe GIN-ul de trigrame, semnatura pe
   * btree. Semnatura prinde TRANSPOZITIILE, unde trigramele cad complet: masurat,
   * „csaca" nu gasea „casca" la niciun prag, iar motorul TS le trateaza explicit.
   *
   * `%` si nu `similarity(...) >= 0.45`: al doilea e un apel de functie, deci
   * evaluat pe fiecare rand din vocabular — 316 ms contra 36 ms, cu acelasi recall.
   */
  potrivite as (
    select distinct c.w as cerut, v.cuvant
      from cerute c
      join public.catalog_cuvant v
        on v.business_id = p_business
       and (v.cuvant % c.w or v.cuvant like c.w || '%' or v.semnatura = c.semn)
  ),
  -- Intersectia listelor de aparitii, cu SI intre cuvintele cerute. Cu SAU,
  -- „manusa protectie" dadea toti candidatii pe care „protectie" ii are in
  -- aproape tot catalogul unui magazin de protectia muncii, fara rezultatele de
  -- top. `queryProductSearchIndex` cere ca FIECARE cuvant sa potriveasca, deci si
  -- candidatii se aleg asa.
  pe_cerut as (
    select distinct p.cerut, i.product_id
      from potrivite p
      join public.catalog_index_cuvant i
        on i.business_id = p_business and i.cuvant = p.cuvant
  ),
  gasite as (
    select g.product_id
      from pe_cerut g
     group by g.product_id
    having count(*) = (select count(*) from cerute)
  ),
  /*
   * Filtrele, citite O DATA, cu ACELEASI formule ca in `catalog_pagina`.
   *
   * Testul pe tip e POZITIV (`= 'array'`), nu negativ, si asta nu e stil.
   * `jsonb_typeof` pe o cheie ABSENTA da SQL NULL, iar `NULL <> 'array'` e NULL,
   * nu `true` — deci un lant de `or`-uri construit pe negatie se evalueaza NULL si
   * arunca fiecare rand. Prima versiune a functiei asteia facea exact asta si
   * intorcea ZERO candidati la orice interogare, fara nicio eroare.
   *
   * Si `coalesce` NU e o alternativa aici: `{"categorii": null}` da un jsonb
   * `null`, care nu e SQL NULL, deci trece nevatamat prin `coalesce` si apoi
   * `jsonb_array_elements` arunca `22023 cannot extract elements from a scalar` —
   * chiar defectul care a randat odata „0 din 1049 produse".
   */
  filtru as (
    select coalesce((p_filtre->>'faraImagini')::boolean, false)     as fara_img,
           coalesce((p_filtre->>'faraStocAscuns')::boolean, false)  as fara_stoc_ascuns,
           case when jsonb_typeof(p_filtre->'categorii') = 'array'
                then (select array_agg(x #>> '{}') from jsonb_array_elements(p_filtre->'categorii') x)
                else null end                                      as categorii,
           nullif(p_filtre->>'pretMin', '')::numeric               as pmin,
           nullif(p_filtre->>'pretMax', '')::numeric               as pmax,
           coalesce((p_filtre->>'reduceri')::boolean, false)        as reduceri,
           coalesce((p_filtre->>'stoc')::boolean, false)            as stoc,
           case when jsonb_typeof(p_filtre->'fatete') = 'array'
                then p_filtre->'fatete' else '[]'::jsonb end        as grupuri
  )
  /*
   * Filtrele, copiate LITERA CU LITERA din `catalog_pagina`.
   *
   * Aceleasi lucruri care conteaza si acolo: comutatoarele de vizibilitate ale
   * magazinului, pretul comparat cu `price_min` la AMANDOUA capetele (filtrul
   * judeca pretul AFISAT — cu `price_max` la capatul de sus, „sub 200 lei"
   * cuprindea un produs al carui card scrie 203), reducerile pe acelasi
   * `price_min`, si fatetele cu SAU in interiorul unei chei si SI intre chei.
   *
   * Ordinea NU se pune aici. Ea vine din scor, si scorul se calculeaza in Node.
   */
  select c.product_id
    from public.catalog_produs c
    join gasite g on g.product_id = c.product_id
   cross join filtru f
   where c.business_id = p_business
     and (not f.fara_img or c.are_imagine)
     and (not f.fara_stoc_ascuns or not c.fara_stoc)
     and (f.categorii is null or c.category = any (f.categorii))
     and (f.pmin is null or c.price_min >= f.pmin)
     and (f.pmax is null or c.price_min <= f.pmax)
     and (not f.reduceri or (c.compare_at_price is not null and c.compare_at_price > c.price_min))
     and (not f.stoc or not c.fara_stoc)
     and (
       jsonb_array_length(f.grupuri) = 0
       or not exists (
         select 1
           from jsonb_array_elements(f.grupuri) g2
          -- Un grup care nu e tablou se IGNORA, nu arunca. Aceeasi paza ca in
          -- `catalog_pagina`: forma vine din adresa, iar `jsonb_array_elements`
          -- peste un scalar da `22023`.
          where jsonb_typeof(g2) = 'array'
            and not (c.fatete && (select array_agg(x #>> '{}') from jsonb_array_elements(g2) x))
       )
     )
$$;

revoke all on function public.catalog_candidati(uuid, text[], jsonb) from public, anon, authenticated;

/*
 * Randurile candidate ale unei cautari, sau motivul pentru care nu se poate.
 *
 * Intoarce `{randuri, vocabular, prea_larg}`. Apelantul cade pe calea veche cand
 * `vocabular = 0` (magazinul n-are inca index de cautare — un magazin nou,
 * inaintea primei treceri a cronului) sau cand `prea_larg` e adevarat. Cele doua
 * cazuri trebuie sa fie DEOSEBITE de „n-am gasit nimic": un raspuns gol arata a
 * magazin fara marfa, nu a defect, deci nu-l raporteaza nimeni.
 *
 * `returns jsonb`, UN SINGUR RAND, ca la `catalog_pagina`: `db-max-rows` se
 * aplica si la proceduri, deci un `setof` ar reintroduce trunchierea silentioasa.
 */
create or replace function public.catalog_cauta(
  p_business uuid,
  p_cuvinte  text[],
  p_filtre   jsonb,
  p_plafon   int default 3000
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp', 'extensions'
as $$
declare
  v_plafon    int := least(greatest(coalesce(p_plafon, 3000), 1), 6000);
  v_vocabular int;
  v_nr        int;
  v_out       jsonb;
begin
  /*
   * Poarta de vizibilitate, evaluata O DATA. Oglindeste politica RLS de pe
   * `products` plus cazul de previzualizare al proprietarului. Proprietarul se
   * citeste din `auth.uid()`, NU dintr-un argument: un argument ar fi forjabil de
   * oricine are cheia anon, adica „cauta-mi in catalogul oricarui magazin
   * nepublicat".
   */
  if not exists (
    select 1 from public.businesses b
     where b.id = p_business and (b.is_published or b.user_id = auth.uid())
  ) then
    return jsonb_build_object('randuri', '[]'::jsonb, 'vocabular', 0, 'prea_larg', false);
  end if;

  -- Vocabular gol = magazinul n-a fost inca indexat. Nu e „zero rezultate", e
  -- „nu pot raspunde"; se semnaleaza cu `vocabular = 0` si se cade pe calea veche.
  select count(*) into v_vocabular from public.catalog_cuvant where business_id = p_business;
  if v_vocabular = 0 then
    return jsonb_build_object('randuri', '[]'::jsonb, 'vocabular', 0, 'prea_larg', false);
  end if;

  -- Numaratul INAINTE de citit: un set uriaș nu se materializeaza niciodata.
  select count(*) into v_nr from public.catalog_candidati(p_business, p_cuvinte, p_filtre);
  if v_nr > v_plafon then
    return jsonb_build_object('randuri', '[]'::jsonb, 'vocabular', v_vocabular, 'prea_larg', true);
  end if;

  -- Aceleasi coloane, in aceeasi forma, ca `catalog_pagina`: apelantul trece
  -- randul prin acelasi `dinProiectie`. `cauta_norm` iese — e concatenarea
  -- celorlalte campuri, deci ar fi dublat payload-ul degeaba (masurat pe eSAFE:
  -- 3.632 kB cu ea, 2.959 kB fara).
  select coalesce(
           jsonb_agg(to_jsonb(c) - 'business_id' - 'cauta_norm' - 'proiectat_la'),
           '[]'::jsonb)
    into v_out
    from public.catalog_produs c
    join public.catalog_candidati(p_business, p_cuvinte, p_filtre) k
      on k.product_id = c.product_id;

  return jsonb_build_object(
    'randuri', coalesce(v_out, '[]'::jsonb),
    'vocabular', v_vocabular,
    'prea_larg', false);
end;
$$;

revoke all on function public.catalog_cauta(uuid, text[], jsonb, int) from public;
grant execute on function public.catalog_cauta(uuid, text[], jsonb, int) to anon, authenticated, service_role;

-- Fara asta PostgREST nu vede semnatura noua si raspunde 404 pana la urmatorul
-- reload de schema, care poate intarzia oricat.
notify pgrst, 'reload schema';

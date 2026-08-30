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
     * Cuvintele CERUTE. Cele sub `MIN_CUVANT` nu ajung niciodata aici — vezi
     * `catalog_cauta`, care refuza intreaga cautare in cazul ala.
     */
    select w, public.semnatura_cuvant(w) as semn,
           /*
            * Bugetul de greseli, copiat din `typoBudget` (product-search.ts):
            * doua editari de la 7 litere, una de la 4, niciuna sub. Scris altfel
            * aici, candidatii ar fi fost fie mai putini decat potrivirile (deci
            * rezultate lipsa), fie mult mai multi (deci munca degeaba).
            */
           case when length(w) >= 7 then 2 when length(w) >= 4 then 1 else 0 end as buget
      from unnest(coalesce(p_cuvinte, '{}'::text[])) w
     where length(w) >= 1
  ),
  /*
   * Cuvintele din vocabular care se potrivesc.
   *
   * ARMELE DE AICI OGLINDESC `tokenScore` DIN product-search.ts, una cate una.
   * Nu sunt o aproximare a lui — sunt aceleasi intrebari, puse in SQL. Asta e
   * singurul mod in care „SQL da recall, Node da ranking" poate fi corect:
   * candidatii trebuie sa fie un SUPERSET al a ce potriveste motorul, iar un
   * superset se dovedeste doar daca stii exact ce potriveste motorul.
   *
   * Versiunea de dinainte folosea trigrame (`%`) ca sa APROXIMEZE potrivirea
   * aproximativa, si pierdea tacut doua arme intregi. Testul diferential le-a
   * gasit pe amandoua:
   *   * SUBSTRING — `set` nu gasea „mansete", „musetel", „frumusetea". Motorul le
   *     gaseste: `d.includes(q)` pentru cuvinte de cel putin 3 litere.
   *   * PREFIX TOLERANT LA GRESELI (ramura „in curs de tastare") — `casca` nu
   *     gasea „calcar" si „calcat", desi motorul le gaseste: prefixul lor de 5
   *     litere, „calca", e la o singura editare de „casca". Pe bricosmart asta
   *     insemna 19 rezultate in loc de 56, adica DOUA pagini disparute.
   * Si niciuna nu se vedea din numarul de produse — pagina 1 arata plauzibil.
   *
   * Costul: masurat pe vocabularul eSAFE (7.827 de cuvinte), 5-9 ms per cuvant
   * cerut — adica mai IEFTIN decat cei 36 ms ai armei cu trigrame pe care o
   * inlocuieste. Lectia veche („`similarity()` e apel de functie, deci 316 ms")
   * ramane adevarata despre `similarity`, nu despre orice apel: `levenshtein` cu
   * plafon se opreste dupa cateva litere, iar vocabularul e mic prin constructie.
   *
   * Trigramele NU mai apar deloc. Motorul n-are arma de trigrame, deci tot ce
   * aducea in plus era munca pentru randuri pe care TS le arunca oricum.
   */
  potrivite as (
    select distinct c.w as cerut, v.cuvant
      from cerute c
      join public.catalog_cuvant v
        on v.business_id = p_business
       and (
         -- 1. exact si prefix: `d === q`, `d.startsWith(q)`
         v.cuvant like c.w || '%'
         -- 2. subsir, doar de la 3 litere: `ql >= 3 && d.includes(q)`
         or (length(c.w) >= 3 and v.cuvant like '%' || c.w || '%')
         -- 3. greseli de tastare pe cuvantul intreg: `editDistanceWithin(q, d, budget)`
         or (c.buget > 0
             and extensions.levenshtein_less_equal(v.cuvant, c.w, c.buget) <= c.buget)
         /*
          * 4. prefix tolerant la greseli — ramura „ultimul cuvant se tasteaza inca".
          *
          * Motorul incearca fiecare prefix de lungime `ql-1 .. ql+buget` si
          * pastreaza cel mai bun. Se incearca toate aici, nu doar cel mai lung:
          * pentru „casca" contra unui cuvant ca „cascXY", numai prefixul de 4
          * („casc") e la o editare, iar cel de 6 e la trei.
          *
          * Se aplica la TOATE cuvintele cerute, nu doar la ultimul: candidatii au
          * voie sa fie mai multi decat potrivirile, iar cine e „ultimul" depinde
          * de spatiul de la sfarsitul interogarii, pe care baza nu-l vede.
          */
         or (c.buget > 0 and length(v.cuvant) > length(c.w) and exists (
              select 1 from generate_series(greatest(1, length(c.w) - 1), length(c.w) + c.buget) k
               where extensions.levenshtein_less_equal(left(v.cuvant, k), c.w, c.buget) <= c.buget
                  -- Si semnatura pe PREFIX, nu doar pe cuvantul intreg (vezi arma 5).
                  -- „csaca" nu gasea „cascai": prefixul lui de 5, „casca", e o
                  -- transpozitie a interogarii — o editare pentru motor, doua
                  -- pentru `levenshtein`. Iar semnatura cuvantului INTREG nu ajuta,
                  -- fiindca „cascai" are un „i" in plus.
                  or public.semnatura_cuvant(left(v.cuvant, k)) = c.semn))
         /*
          * 5. semnatura — literele SORTATE.
          *
          * Motorul foloseste distanta Damerau-Levenshtein, care numara o
          * TRANSPOZITIE adiacenta ca o singura editare; `levenshtein` din
          * Postgres o numara ca doua. Deci „csaca" contra „casca" e 1 pentru
          * motor si 2 pentru arma 3, si fara asta ar fi cazut. Orice transpozitie
          * pastreaza multimea de litere, deci semnatura le prinde pe toate.
          */
         or v.semnatura = c.semn
       )
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
    return jsonb_build_object('randuri', '[]'::jsonb, 'vocabular', 0, 'prea_larg', false, 'cuvant_scurt', false);
  end if;

  -- Vocabular gol = magazinul n-a fost inca indexat. Nu e „zero rezultate", e
  -- „nu pot raspunde"; se semnaleaza cu `vocabular = 0` si se cade pe calea veche.
  select count(*) into v_vocabular from public.catalog_cuvant where business_id = p_business;
  if v_vocabular = 0 then
    return jsonb_build_object('randuri', '[]'::jsonb, 'vocabular', 0, 'prea_larg', false, 'cuvant_scurt', false);
  end if;

  /*
   * UN CUVANT SUB TREI LITERE NU SE POATE CAUTA DE AICI.
   *
   * Vocabularul se construieste cu `length(w) >= 3` (`catalog_reface_cuvinte`),
   * deci cuvintele de una-doua litere din produse pur si simplu NU EXISTA in
   * index. Motorul din browser le vede: cu `?q=a`, `tokenScore` potriveste orice
   * cuvant care incepe cu „a", inclusiv un „a" singur dintr-o descriere.
   *
   * Testul diferential a prins exact asta: pe eSAFE, `?q=a&sort=name_asc` scotea
   * un produs al carui singur cuvant cu „a" era litera „a". Un produs, pe o
   * pagina — adica genul de nepotrivire pe care n-o vede nimeni si care spune ca
   * cele doua paliere nu mai raspund la aceeasi intrebare.
   *
   * Se refuza toata cautarea, nu doar cuvantul: semantica e SI intre cuvinte,
   * deci un cuvant nerezolvabil face tot rezultatul nesigur. Apelantul cade pe
   * calea veche, unde raspunsul e intreg. Alternativa — indexarea cuvintelor de
   * una-doua litere — ar umfla indexul inversat cu „de", „si", „cu", cate un rand
   * pentru fiecare produs, pentru interogari care oricum potrivesc tot.
   */
  if exists (select 1 from unnest(coalesce(p_cuvinte, '{}'::text[])) w where length(w) < 3) then
    return jsonb_build_object('randuri', '[]'::jsonb, 'vocabular', v_vocabular,
                              'prea_larg', false, 'cuvant_scurt', true);
  end if;

  -- Numaratul INAINTE de citit: un set uriaș nu se materializeaza niciodata.
  select count(*) into v_nr from public.catalog_candidati(p_business, p_cuvinte, p_filtre);
  if v_nr > v_plafon then
    return jsonb_build_object('randuri', '[]'::jsonb, 'vocabular', v_vocabular, 'prea_larg', true, 'cuvant_scurt', false);
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
    'prea_larg', false,
    'cuvant_scurt', false);
end;
$$;

revoke all on function public.catalog_cauta(uuid, text[], jsonb, int) from public;
grant execute on function public.catalog_cauta(uuid, text[], jsonb, int) to anon, authenticated, service_role;

-- Fara asta PostgREST nu vede semnatura noua si raspunde 404 pana la urmatorul
-- reload de schema, care poate intarzia oricat.
notify pgrst, 'reload schema';

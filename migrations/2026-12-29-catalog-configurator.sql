-- ══════════════════════════════════════════════════════════════════════════
-- CARDUL DE PRODUS AFLA DE CONFIGURATOR (F2)
-- ══════════════════════════════════════════════════════════════════════════
--
-- Grila are sute de carduri, iar cardul are nevoie de foarte putin: DACA produsul cere
-- configurare, si DE LA CE PRET porneste. Intrebat pe rand, la fiecare randare de pagina, asta
-- ar fi insemnat patru citiri pe produs — adica exact tiparul N+1 pe care modelul de citire
-- `catalog_produs` exista ca sa-l stearga. Deci raspunsul se precalculeaza, ca tot restul.
--
-- ⚠ MIGRATIA ASTA TREBUIE SA AJUNGA INAINTEA CODULUI
--
-- `COLOANE_PROIECTIE` din `src/lib/storefront/catalog/din-proiectie.ts` enumera coloanele pe
-- fata, iar PostgREST raspunde cu EROARE la INTREAGA interogare cand una lipseste, nu doar
-- pentru coloana aia. Codul pusat inaintea migratiei nu ar strica „doar cardul”: ar goli grila
-- si pagina de magazin pe TOATE magazinele platformei, tacut, ca in 03.09.2026 cu
-- `store_settings`. Se ruleaza `npm run verifica:coloane` inainte de push.
--
-- Invers e inofensiv: migratia aplicata cu codul vechi lasa doua coloane pe care nu le scrie si
-- nu le citeste nimeni.
--
-- ⚠ DE CE STEAGUL E `not null default false`
--
-- Fiindca proiectorul VECHI nu-l trimite. Intre aplicarea migratiei si desfasurarea codului
-- nou, si pentru fiecare produs reintrat in catalog inainte sa-l prinda cronul, randul se scrie
-- fara cheia asta. Cu o coloana nullable, `null` ar fi insemnat „nu stiu” — iar cardul ar fi
-- avut de ales intre a-l citi ca „nu cere” (si atunci de ce mai e nullable) si a nu arata nimic.
-- `false` cu implicit spune limpede „pana la proba contrarie, produsul se vinde simplu”, adica
-- exact purtarea de azi. Degradarea corecta e magazinul de ieri, nu un magazin gol.
--
-- ⚠ DE CE PRETUL E NULLABLE
--
-- `null` inseamna „nu se poate socoti”, si NU e acelasi lucru cu zero.
--
-- Un configurator care cere o gravura fara valoare implicita nu are niciun pret la care se poate
-- cumpara ceva: pretul de baza nu e platibil (pagina cere intai completat campul), iar zero ar fi
-- marfa data pe gratis — chiar defectul pe care `pret.ts` il refuza in opt locuri. Cardul citeste
-- `null` ca „arata pretul simplu, dar tot cu De la”.
--
-- ⚠ SI DE CE NU SE SCRIU CAND CITIREA CADE
--
-- `configuratoarePentruProduse` intoarce harta GOALA la ORICE eroare de citire, dinadins: pe
-- pagina de produs degradarea corecta e „produsul se vinde simplu”. Pe PROIECTIE aceeasi harta
-- goala ar scrie „n-are configurator” peste un produs care are — si ar RAMANE asa pana la
-- urmatoarea atingere a produsului, adica poate luni. De aceea proiectorul omite cu totul cele
-- doua chei cand citirea a cazut, iar functia de mai jos pastreaza atunci valorile vechi.
--
-- Prezenta cheii `cere_configurare` in randul de jsonb e semnalul „am aflat”; amandoua coloanele
-- se scriu impreuna sau deloc, fiindca sunt un singur raspuns.

begin;

alter table public.catalog_produs
  add column if not exists cere_configurare boolean not null default false,
  add column if not exists pret_pornire numeric;

comment on column public.catalog_produs.cere_configurare is
  'Produsul are un configurator ACTIV aplicat. Cardul deschide pagina in loc sa adauge in cos.';
comment on column public.catalog_produs.pret_pornire is
  'Pretul configuratiei IMPLICITE. NULL = nu se poate socoti (nu zero, si nu pretul de baza).';

-- ══════════════════════════════════════════════════════════════════════════
-- Proiectorul le scrie
-- ══════════════════════════════════════════════════════════════════════════
--
-- Restul functiei ramane NEATINS fata de `migrations/000-schema-baseline.sql`: e un
-- `create or replace`, deci ce nu e recopiat aici ar fi disparut. Singura schimbare sunt cele
-- doua randuri noi din `set`.

CREATE OR REPLACE FUNCTION public.catalog_aplica_proiectii(p_randuri jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_afectate int;
begin
  update public.catalog_produs cp set
    price_min        = (r->>'price_min')::numeric,
    price_max        = (r->>'price_max')::numeric,
    has_range        = (r->>'has_range')::boolean,
    fara_oferta      = (r->>'fara_oferta')::boolean,
    optiuni          = case when jsonb_typeof(r->'optiuni') = 'null' then null else r->'optiuni' end,
    descriere_scurta = coalesce(r->>'descriere_scurta', ''),
    cauta_norm       = coalesce(r->>'cauta_norm', ''),
    -- `text[]` dintr-un array jsonb de siruri. `coalesce` pe array gol, nu pe
    -- null: coloana e `not null`.
    fatete           = coalesce(
                         (select array_agg(x #>> '{}') from jsonb_array_elements(r->'fatete') x),
                         '{}'::text[]),
    -- ⚠ CHEIA LIPSA INSEAMNA „N-AM AFLAT”, SI ATUNCI SE PASTREAZA CE ERA.
    --
    -- Scrise neconditionat, un lot venit de la un proiector caruia i-a picat citirea
    -- configuratoarelor ar fi stins steagul pe toate produsele lui — si nimic nu l-ar mai fi
    -- reaprins pana cand cineva atingea produsul. Amandoua coloanele se uita la ACEEASI cheie:
    -- sunt un singur raspuns, iar `pret_pornire` fara `cere_configurare` n-ar insemna nimic.
    -- ⚠ `jsonb_exists(...)`, nu operatorul `?`. Sunt acelasi lucru pentru Postgres, dar `?` e si
    -- semnul de parametru pentru mai multe drivere (JDBC si altele): trecuta printr-unul dintre
    -- ele, migratia ar fi picat cu „insufficient parameters” pe o instructiune perfect valida.
    cere_configurare = case when jsonb_exists(r, 'cere_configurare')
                            then coalesce((r->>'cere_configurare')::boolean, false)
                            else cp.cere_configurare end,
    pret_pornire     = case when jsonb_exists(r, 'cere_configurare')
                            then (r->>'pret_pornire')::numeric
                            else cp.pret_pornire end,
    proiectat_la     = (r->>'proiectat_la')::timestamptz
  from jsonb_array_elements(p_randuri) r
  where cp.product_id = (r->>'product_id')::uuid;

  get diagnostics v_afectate = row_count;
  return v_afectate;
end;
$function$
;

-- ══════════════════════════════════════════════════════════════════════════
-- Toate produsele magazinelor cu configuratoare intra o data la coada
-- ══════════════════════════════════════════════════════════════════════════
--
-- Coloanele se nasc pe `false` / `null`, iar declansatorul de pe `products` nu le atinge: fara
-- randurile de mai jos, un produs deja configurat ar fi ramas cu cardul mincinos pana la prima
-- lui salvare. Se marcheaza DOAR magazinele care chiar au un configurator — pe restul platformei
-- raspunsul e oricum `false`, si o coada de 200.000 de randuri ar fi tinut cronul ore intregi
-- fara sa schimbe nimic.

insert into public.catalog_murdar (product_id, business_id)
select cp.product_id, cp.business_id
  from public.catalog_produs cp
 where exists (
   select 1 from public.configuratoare c
    where c.business_id = cp.business_id and c.stare = 'activ')
on conflict (product_id) do update set marcat_la = now();

-- ══════════════════════════════════════════════════════════════════════════
-- Cine repune produsele la coada cand se schimba configuratorul
-- ══════════════════════════════════════════════════════════════════════════
--
-- ⚠ FARA ASTA, TOT RESTUL E DEGEABA.
--
-- Nicio actiune din `configurator.actions.ts` nu atinge `products`, deci declansatorul
-- `products_catalog_proiectie` nu se aprinde niciodata pentru ele. Legarea unui configurator de
-- o categorie schimba raspunsul pentru mii de produse si NU marcheaza nimic: cardul ar fi mintit
-- la nesfarsit, nu pana la urmatorul cron. Se repara abia cand cineva salveaza produsul de mana.
--
-- ⚠ DE CE O FUNCTIE, SI NU CITIT IN NODE
--
-- Legarea de o categorie poate atinge mii de produse. Citite in Node, ar fi insemnat:
--   * plafonul de 1000 de randuri al lui PostgREST, care TAIE TACUT (vezi `fetch-all.ts`) —
--     adica exact produsele de peste prag ar fi ramas cu cardul vechi, si nimic n-ar fi spus-o;
--   * un `.in()` cu mii de id-uri, care pleaca in ADRESA si cade peste ~700.
-- Aici e o singura instructiune, oricat de mare ar fi categoria.
--
-- ⚠ SUBARBORELE VINE DIN TypeScript, si nu se rescrie aici.
--
-- `extindeCategoriile` din `offer-pricing.ts` e chiar functia pe care o foloseste si rezolvarea
-- configuratorului. Rescrisa in SQL, ar fi devenit a doua sursa de adevar: prima divergenta s-ar
-- fi vazut ca „produsele din subcategorie nu s-au actualizat”, fara nicio eroare nicaieri.
-- Deci apelantul trimite numele DEJA desfacute.
--
-- `p_configurator` poate fi `null`: atunci se marcheaza numai produsele categoriilor date.

create or replace function public.catalog_murdareste_configurator(
  p_business uuid,
  p_configurator uuid,
  p_categorii text[]
) returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_nr int;
begin
  insert into public.catalog_murdar (product_id, business_id)
  select p.id, p.business_id
    from public.products p
   where p.business_id = p_business
     and (
       -- ⚠ `btrim`, fiindca ASA potriveste si rezolvarea.
       --
       -- `rezolvare.ts` compara cu `(produs.category ?? "").trim()`. Fara `btrim` aici, un produs
       -- cu `category = 'Rame '` MOSTENESTE configuratorul pe vitrina, dar nu e marcat niciodata:
       -- in Postgres `'Rame ' = 'Rame'` e fals. Cardul lui ar fi ramas mincinos la nesfarsit,
       -- fiindca nimic nu-l mai pune la coada. Proiectul are lectia scrisa: `btrim()` nu e `.trim()`,
       -- dar aici tocmai potrivirea trebuie sa fie ACEEASI in amandoua limbile.
       (p_categorii is not null and btrim(p.category) = any(p_categorii))
       or (p_configurator is not null and exists (
             select 1 from public.configurator_produse cp
              where cp.business_id = p_business
                and cp.configurator_id = p_configurator
                and cp.product_id = p.id))
     )
  -- ⚠ `marcat_la = now()` la conflict, nu `do nothing`: un rand deja in coada, dar cu marcaj
  -- vechi, ar fi fost sters de lucratorul care tocmai il proiecta cu datele DE DINAINTE de
  -- schimbarea asta. Vezi `pragCoada` din `proiector.ts`.
  on conflict (product_id) do update set marcat_la = now();

  get diagnostics v_nr = row_count;
  return v_nr;
end;
$function$;

-- Postgres da EXECUTE lui PUBLIC din oficiu la orice functie noua, iar Supabase adauga peste
-- privilegii implicite care il dau lui `anon` si `authenticated` PE NUME. Granturile pe nume nu
-- se sting cu o revocare de la `public`.
--
-- ⚠ Functia e `security definer` si scrie intr-o tabela cu RLS pornit si NICIO politica. Lasata
-- deschisa, oricine cu o cheie `anon` ar fi putut umple coada de proiectie a oricarui magazin —
-- adica un mod ieftin de a tine cronul ocupat la nesfarsit.
revoke all on function public.catalog_murdareste_configurator(uuid, uuid, text[]) from public;
revoke all on function public.catalog_murdareste_configurator(uuid, uuid, text[]) from anon, authenticated;
grant execute on function public.catalog_murdareste_configurator(uuid, uuid, text[]) to service_role;

commit;

notify pgrst, 'reload schema';

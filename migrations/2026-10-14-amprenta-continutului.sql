/* ══════════════════════════════════════════════════════════════════════════
   O MISCARE DE STOC NU ARE VOIE SA ASCUNDA O SCHIMBARE DE CONTINUT (25.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ CE E GRESIT IN PLASA DE ACUM.

   `produse_nesincronizate_emag` intreaba:

     p.updated_at > o.last_synced_at

   Dar `last_synced_at` NU inseamna „ultima sincronizare de CONTINUT". Se scrie din
   `scrieRezultatul` la ORICE reusita — inclusiv dupa o simpla miscare de stoc, fiindca
   `duStocul` cheama aceeasi functie.

   Scenariul, si e obisnuit intr-un magazin viu:

     10:00  comerciantul schimba titlul si poza · punerea in coada se pierde
     10:04  se vinde ceva · stocul pleaca pe `offer/save` · REUSESTE
            → `last_synced_at = 10:04`
     10:10  plasa intreaba: 10:00 > 10:04 ?  NU.

   Concluzie: „n-a ramas nimic neplecat". Iar la eMAG raman titlul si poza vechi, pe veci
   — pana cand cineva mai atinge o data produsul, din alt motiv.

   ⚠ Cu cat magazinul vinde mai bine, cu atat plasa e mai oarba: fiecare vanzare improspata
   marcajul si sterge urma schimbarii pierdute.

   ══════════════════════════════════════════════════════════════════════════
   DE CE NU INCA UN MARCAJ DE TIMP
   ══════════════════════════════════════════════════════════════════════════

   Raspunsul evident ar fi `last_content_synced_at`, scris numai de ruta grea. Ar rezolva
   jumatate si ar strica cealalta: `products.updated_at` se misca la ORICE scriere pe
   produs, inclusiv la scaderea stocului dupa o vanzare (are declansator). Deci
   `updated_at > last_content_synced_at` s-ar aprinde la fiecare vanzare, si am fi retrimis
   toata documentatia — nume, descriere, imagini, caracteristici — dupa fiecare comanda.

   ⚠ Marcajele de timp raspund la „cand", iar intrebarea noastra e „ce". Se pastreaza deci
   o AMPRENTA a continutului: se schimba numai cand se schimba chiar campurile care pleaca
   pe ruta grea. Stocul si pretul nu o pot atinge, deci nu o pot falsifica.

   Tiparul exista deja in casa, si e probat: `deriva.ts` foloseste o amprenta cu VALORI
   pentru acelasi motiv — vezi nota din `deriva.test.ts` despre ce s-ar fi pierdut cu o
   amprenta pe camp.
*/

begin;

/**
 * Amprenta continutului care a plecat ultima oara pe ruta grea.
 *
 * ⚠ `null` inseamna „nu stim ce i-am trimis" — la ofertele preluate din contul lor, si la
 * cele publicate inainte de coloana asta. Pe „nu stim" plasa NU se aprinde: altfel, in
 * clipa in care intra migratia, tot catalogul ar fi parut neplecat si s-ar fi retrimis.
 */
alter table public.emag_offers
  add column if not exists amprenta_continut text;

comment on column public.emag_offers.amprenta_continut is
  'Amprenta campurilor de continut trimise ultima oara pe product_offer/save. Se schimba '
  'numai la schimbari de CONTINUT; stocul si pretul n-o ating. Vezi produse_nesincronizate_emag.';

/**
 * Produse a caror schimbare de continut nu a ajuns nicaieri.
 *
 * ⚠ Se compara AMPRENTE, nu timpi. Un `p_amprenta` dat de apelant, socotit din fisa
 * produsului cu aceeasi functie care construieste incarcatura.
 */
create or replace function public.produse_nesincronizate_emag(
  p_business_id uuid,
  p_rabdare     interval default '10 minutes',
  p_limita      int      default 50,
  /**
   * Amprentele de acum, ca `{ "<product_id>": "<amprenta>" }`.
   *
   * ⚠ Se dau din afara fiindca se socotesc din `page_sections`, `images` si variante — o
   * socoteala care traieste in TypeScript, langa cea care construieste incarcatura. Facuta
   * a doua oara in SQL, cele doua s-ar departa, si tocmai despartirea a produs defectul
   * pe care il reparam aici.
   */
  p_amprente    jsonb    default null
)
returns setof uuid
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select distinct p.id
    from public.products p
    join public.emag_offers o
      on o.product_id = p.id
     and o.business_id = p.business_id
   where p.business_id = p_business_id
     and o.auto_sync = true
     /* ⚠ Numai ofertele trimise candva: publicarea se CERE, nu se deduce. Vezi
        `2026-10-13-plasa-nu-publica.sql`. */
     and o.last_synced_at is not null
     /* ⚠ Rabdarea: ce s-a atins chiar acum poate fi inca pe drum. */
     and p.updated_at < now() - p_rabdare
     and (
       case
         /*
          * Fara amprente date (apelant vechi), se cade pe intrebarea de dinainte. Se
          * pastreaza ca sa nu ramana magazinul descoperit intre migratie si deploy.
          */
         when p_amprente is null then p.updated_at > o.last_synced_at
         /*
          * ⚠ NUMAI produsele pentru care apelantul CHIAR a socotit o amprenta.
          *
          * Cronul socoteste amprentele pentru o felie rotativa, nu pentru tot catalogul —
          * altfel ar citi `page_sections` si imaginile a mii de produse la fiecare zece
          * minute. Fara verificarea asta, un produs din afara feliei ar fi avut
          * `p_amprente ->> id` = NULL, iar `amprenta is distinct from null` e ADEVARAT:
          * plasa ar fi repus in coada tot ce n-a apucat sa masoare. Exact inversul a ceea
          * ce trebuie sa faca.
          */
         when not (p_amprente ? p.id::text) then false
         /*
          * ⚠ „Nu stim ce i-am trimis" NU inseamna „s-a schimbat". Altfel, in clipa in care
          * intra coloana, tot catalogul ar fi parut neplecat si s-ar fi retrimis intreg.
          */
         when o.amprenta_continut is null then false
         else o.amprenta_continut is distinct from (p_amprente ->> p.id::text)
       end
     )
     /* ⚠ Si nimic in coada — nici macar abandonat: acela are un motiv pe care il vede
        comerciantul, iar reaprins de aici ar intra intr-o bucla si i-ar ascunde motivul. */
     and not exists (
       select 1 from public.emag_sync_queue q
        where q.business_id = p_business_id and q.product_id = p.id)
   order by p.id
   limit greatest(1, least(coalesce(p_limita, 50), 500));
$function$;

/* ⚠ `create or replace` REFACE granturile implicite, iar Postgres da EXECUTE lui PUBLIC
   din oficiu. Functia e `security definer` si citeste produsele ORICUI. */
revoke all on function public.produse_nesincronizate_emag(uuid, interval, int, jsonb) from public, anon, authenticated;
grant execute on function public.produse_nesincronizate_emag(uuid, interval, int, jsonb) to service_role;

/* ══════════════════════════════════════════════════════════════════════════
   ⚠ FORMA VECHE SE STERGE. PĂSTRATĂ, RUPE TOT.
   ══════════════════════════════════════════════════════════════════════════

   Prima incercare a lasat DINADINS varianta cu trei argumente, ca deploy-ul si migratia sa
   nu trebuiasca sa fie in aceeasi clipa. Suna prudent si a fost gresit: PostgREST alege
   functia dupa NUMELE argumentelor primite, iar un apel cu trei argumente se potriveste la
   fel de bine cu amandoua. Raspunsul, in productie, la un minut dupa aplicare:

     „Could not choose the best candidate function between:
      produse_nesincronizate_emag(p_business_id, p_rabdare, p_limita),
      produse_nesincronizate_emag(p_business_id, p_rabdare, p_limita, p_amprente)"

   Plasa a inceput sa cada la fiecare trecere. Prins de veghe in zece minute.

   ⚠ Iar prudenta nici nu era necesara: `p_amprente` are `default null`, deci un apel VECHI,
   cu trei argumente, nimereste singur functia noua si cade pe ramura de dinainte. Suprapunerea
   pe care voiam s-o acopar era deja acoperita de valoarea implicita.
*/
drop function if exists public.produse_nesincronizate_emag(uuid, interval, int);

commit;

notify pgrst, 'reload schema';

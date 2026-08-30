/* ═══════════════════════════════════════════════════════════════════════════
   Cozile de marketplace: așteptare crescătoare, priorități, și abandon vizibil
   ═══════════════════════════════════════════════════════════════════════════

   ⚠ ATINGE `public.revendica_din_coada`, CARE E COMUNĂ CELOR CINCI MARKETPLACE-URI.
   Se citește tot fișierul înainte de a-l aplica.

   ═══ CE LIPSEA ═══

   1. Un element refuzat se reîncerca la fiecare minut, la fel de des ca unul nou.
      Cinci reîncercări identice, la un minut distanță, pe un produs căruia îi lipsește
      un câmp — adică cinci cereri arse din cele 3 pe secundă ale magazinului, pentru
      ceva ce nu se repară singur.

   2. După a cincea, elementul se ȘTERGEA. Cu un rând în jurnal, dar șters: nimeni nu-l
      mai putea vedea, număra sau relua. Un catalog întreg putea dispărea din coadă
      fără ca panoul să arate altceva decât „0 în așteptare".

   3. O mișcare de stoc după o vânzare stătea la rând în urma unui catalog de 20.000
      de produse puse la publicat cu un minut înainte. Prima e urgentă — eMAG vinde
      marfă pe care magazinul n-o mai are — a doua poate aștepta o oră.

   ═══ ⚠ DE CE SE SCHIMBĂ FUNCȚIA COMUNĂ, ȘI NU SE FACE UNA PENTRU eMAG ═══

   Cele trei clauze noi trăiesc în CTE-ul `alese`, construit prin `format()` din numele
   tabelei. Nu există cale să fie adăugate doar pentru eMAG fără a bifurca funcția.

   Iar o a doua funcție înseamnă că următoarea reparație a lacătului — cum a fost
   `as materialized` — se aplică pe o copie și se uită pe cealaltă. Asta se plătește o
   dată, târziu, și în cozi duplicate.

   ═══ ⚠ COMPATIBILITATEA E EXACTĂ, NU APROXIMATIVĂ ═══

   `next_retry_at` și `abandonat_la` sunt nullabile FĂRĂ implicit: pentru gmc, olx,
   trendyol și aboutyou rămân `null` pe veci, deci `is null or <= now()` și `is null`
   sunt mereu adevărate.

   `prioritate` e `not null default 5`: peste o coloană constantă,
   `order by prioritate, created_at` dă EXACT aceeași ordine ca `order by created_at`.

   Cele patru cozi vechi nu observă nimic.

   ═══ ⚠ ORDINEA DIN FIȘIER E OBLIGATORIE ═══

   `alter table` × 5 ÎNAINTE de `create or replace function`, în aceeași tranzacție.
   Invers — sau aplicat pe jumătate — funcția nouă cere o coloană inexistentă și TOATE
   CELE CINCI cronuri răspund 503 la fiecare minut, cu cozile înghețate. Inclusiv
   mișcările de stoc ale magazinelor care n-au nicio treabă cu eMAG.
   ═══════════════════════════════════════════════════════════════════════════ */

begin;

/* ─── 1. Coloanele, pe toate cele cinci cozi ──────────────────────────────── */

alter table public.gmc_sync_queue      add column if not exists next_retry_at timestamptz;
alter table public.olx_sync_queue      add column if not exists next_retry_at timestamptz;
alter table public.trendyol_sync_queue add column if not exists next_retry_at timestamptz;
alter table public.aboutyou_sync_queue add column if not exists next_retry_at timestamptz;
alter table public.emag_sync_queue     add column if not exists next_retry_at timestamptz;

alter table public.gmc_sync_queue      add column if not exists abandonat_la timestamptz;
alter table public.olx_sync_queue      add column if not exists abandonat_la timestamptz;
alter table public.trendyol_sync_queue add column if not exists abandonat_la timestamptz;
alter table public.aboutyou_sync_queue add column if not exists abandonat_la timestamptz;
alter table public.emag_sync_queue     add column if not exists abandonat_la timestamptz;

alter table public.gmc_sync_queue      add column if not exists prioritate smallint not null default 5;
alter table public.olx_sync_queue      add column if not exists prioritate smallint not null default 5;
alter table public.trendyol_sync_queue add column if not exists prioritate smallint not null default 5;
alter table public.aboutyou_sync_queue add column if not exists prioritate smallint not null default 5;
alter table public.emag_sync_queue     add column if not exists prioritate smallint not null default 5;

comment on column public.emag_sync_queue.next_retry_at is
  'Când are voie elementul să fie luat din nou. ⚠ NU e același lucru cu `revendicat_pana`: '
  'acela înseamnă „e cineva pe el acum", ăsta înseamnă „așteaptă dinadins". Confundate, o '
  'unealtă care eliberează revendicările blocate ar șterge și așteptările.';

comment on column public.emag_sync_queue.abandonat_la is
  'Când s-a renunțat, după ce s-au ars toate încercările. ⚠ Rândul NU se mai șterge: șters, '
  'nimeni nu-l mai putea vedea, număra sau relua, iar panoul arăta „0 în așteptare" pentru '
  'un catalog întreg care nu plecase.';

comment on column public.emag_sync_queue.prioritate is
  'Mai mic = pleacă mai devreme. ⚠ Numai coada eMAG are o scară adevărată; celelalte patru '
  'rămân pe 5, deci ordinea lor rămâne EXACT `created_at`.';

/* ─── 2. Indexuri pentru ordinea nouă ─────────────────────────────────────── */

create index if not exists gmc_sync_queue_ordine_idx      on public.gmc_sync_queue (prioritate, created_at);
create index if not exists olx_sync_queue_ordine_idx      on public.olx_sync_queue (prioritate, created_at);
create index if not exists trendyol_sync_queue_ordine_idx on public.trendyol_sync_queue (prioritate, created_at);
create index if not exists aboutyou_sync_queue_ordine_idx on public.aboutyou_sync_queue (prioritate, created_at);
create index if not exists emag_sync_queue_ordine_idx     on public.emag_sync_queue (prioritate, created_at);

/* ─── 3. Graba elementelor care sunt DEJA în coada eMAG ───────────────────── */

/*
 * Fără asta, o mișcare de stoc pusă la coadă înainte de migrație ar fi rămas în urma
 * unui catalog pus la coadă după ea — exact pe dos față de ce face migrația.
 */
update public.emag_sync_queue
   set prioritate = case op
     when 'stoc' then 1 when 'retragere' then 2 when 'pret' then 3
     when 'masuratori' then 6 else 5 end
 where prioritate = 5;

/* ─── 4. Funcția comună. Trei clauze noi, atât. ───────────────────────────── */

create or replace function public.revendica_din_coada(
  p_coada  text,
  p_limita int default 50,
  p_lease  interval default interval '5 minutes'
) returns setof jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_permise constant text[] := array[
    'gmc_sync_queue', 'olx_sync_queue', 'trendyol_sync_queue', 'aboutyou_sync_queue',
    'emag_sync_queue'];
begin
  /*
   * Ia randuri din coada SI LE INCUIE, ca doua rulari sa nu apuce aceleasi.
   *
   * `for update skip locked` face ca al doilea lucrator sa treaca peste ce e
   * incuiat, in loc sa astepte. `revendicat_pana` e a doua plasa: daca un
   * lucrator moare la mijloc, lacatul dispare odata cu tranzactia, dar marcajul
   * tine randul deoparte cinci minute.
   *
   * Numele tabelei se compune dinamic, deci trece printr-o lista PERMISA.
   *
   * ATENTIE: `as materialized` nu e decor. Cu subinterogarea inline in
   * `where id in (...)`, planificatorul o poate re-evalua in semi-join si LIMIT
   * isi pierde intelesul — masurat candva la 6 randuri cu limit 3, revendica
   * toate sase. Pe PostgreSQL 17.6 nu s-a mai reprodus (probat la 6 si la 500 de
   * randuri), dar forma materializata nu depinde de alegerea planificatorului,
   * deci ea ramane.
   *
   * ═══ TREI CLAUZE NOI (2026-09-25), TOATE NEUTRE PENTRU CELELALTE PATRU COZI ═══
   *
   * `next_retry_at` — asteptarea crescatoare dupa un refuz. Nullabil fara implicit,
   *   deci pentru gmc/olx/trendyol/aboutyou filtrul e mereu adevarat.
   * `abandonat_la`  — elementul s-a oprit definitiv, dar NU s-a sters. Idem, mereu
   *   null la celelalte patru.
   * `prioritate`    — `not null default 5`. Peste o coloana constanta,
   *   `order by prioritate, created_at` da EXACT aceeasi ordine ca inainte.
   *
   * ⚠ PARANTEZELE DIN JURUL PRIMEI CONDITII SUNT OBLIGATORII. Fara ele, `and` leaga
   * mai strans decat `or` si conditia devine
   * `revendicat_pana is null OR (revendicat_pana < now() AND ...)` — adica orice rand
   * nerevendicat ar fi trecut peste asteptare si peste abandon.
   */
  if not (p_coada = any(v_permise)) then
    raise exception 'coada necunoscuta: %', p_coada;
  end if;

  return query execute format($f$
    with alese as materialized (
      select c.id from public.%I c
       where (c.revendicat_pana is null or c.revendicat_pana < now())
         and (c.next_retry_at is null or c.next_retry_at <= now())
         and c.abandonat_la is null
       order by c.prioritate, c.created_at
       limit $2
       for update skip locked)
    update public.%I q
       set revendicat_pana = now() + $1
      from alese a
     where q.id = a.id
    returning to_jsonb(q.*)
  $f$, p_coada, p_coada) using p_lease, p_limita;
end;
$$;

commit;

notify pgrst, 'reload schema';

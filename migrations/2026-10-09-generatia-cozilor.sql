/* ══════════════════════════════════════════════════════════════════════════
   O EDITARE NOUA NU ARE VOIE SA FIE STEARSA DE LUCRATORUL VECHI (25.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ CE SE INTAMPLA ACUM, IN PRODUCTIE, LA TOATE CELE CINCI COZI.

   Unicul cozii e pe `(business_id, offer_id, op)`, iar punerea la coada e un `upsert`
   peste acelasi rand. Deci o a doua editare a aceluiasi produs NU face un rand nou:
   il rescrie pe cel care exista, cu `attempts = 0` si fara asteptare.

   Lucratorul, insa:

     1. revendica randul                       (id = X)
     2. citeste produsul                       (Titlu A)
     3. face cererea catre marketplace          ← ⚠ ferestra
     4. la reusita: `delete where id = X`

   Daca intre 2 si 4 comerciantul schimba produsul in Titlu B, punerea la coada
   rescrie chiar randul X. Iar pasul 4 il sterge — cu cererea NOUA cu tot.

     Edinio = Titlu B
     eMAG   = Titlu A
     coada  = goala
     eroare = niciuna

   ⚠ Pe pret si pe stoc, reconcilierea repara. Pe titlu, descriere, imagini,
   caracteristici, GPSR si categorie NU repara nimeni: nu exista o a doua sursa de
   adevar care sa observe deosebirea. Ramane asa pana cand cineva atinge produsul din
   nou, din alt motiv.

   ⚠ SI PE CALEA DE ESEC E LA FEL DE RAU: lucratorul vechi scrie
   `attempts = attempts + 1` si `next_retry_at = acum + asteptare` peste cererea NOUA.
   Cererea B mosteneste incercarile lui A si poate fi ABANDONATA fara sa fi fost
   incercata niciodata.

   ══════════════════════════════════════════════════════════════════════════
   LEACUL: UN NUMARATOR DE SCRIERI, SI COMPARATIE LA STERGERE
   ══════════════════════════════════════════════════════════════════════════

   `generation` creste la FIECARE scriere pe rand, printr-un declansator. Lucratorul
   retine valoarea cu care a revendicat randul si scrie mai tarziu numai daca ea n-a
   crescut intre timp:

     delete from ... where id = X and generation = 17

   Zero randuri atinse inseamna „a venit o cerere mai noua": nu se sterge nimic, iar
   cererea noua ramane in coada si pleaca la trecerea urmatoare.

   ⚠ DECLANSATOR, NU `generation + 1` SCRIS DE MANA IN FIECARE APELANT. Sunt patru cai
   care pun in coada (una singura, in masa, retragere inainte de stergere, si `upsert`-ul
   din cronurile surori) si trei care actualizeaza. Una uitata ar fi facut plasa gaurita
   exact acolo unde nimeni nu se uita. Prin declansator, nici nu se poate uita.

   ⚠ SI `revendica_din_coada` CRESTE GENERATIA — face un `update` pe `revendicat_pana`.
   E chiar ce trebuie: lucratorul primeste valoarea de DUPA revendicare, prin
   `returning to_jsonb(q.*)`, deci n-are nevoie de nicio schimbare in functia comuna.

   ⚠ Toate cele cinci cozi il primesc. Nu fiindca eMAG ar fi special, ci fiindca sunt
   scrise dupa acelasi tipar: aceeasi cheie unica, acelasi `upsert`, acelasi `delete`
   dupa reusita. Un leac pus doar pe una ar fi lasat celelalte patru cu acelasi defect
   si cu impresia ca s-a rezolvat.
*/

begin;

/* ── Coloana ────────────────────────────────────────────────────────────────
 *
 * ⚠ `default 1`, nu `default 0`: randurile care exista deja in coada primesc 1, iar
 * prima lor revendicare le duce la 2. Orice valoare merge, atat timp cat e `not null`
 * — comparatia e pe egalitate, nu pe marime.
 */
alter table public.emag_sync_queue      add column if not exists generation bigint not null default 1;
alter table public.trendyol_sync_queue  add column if not exists generation bigint not null default 1;
alter table public.olx_sync_queue       add column if not exists generation bigint not null default 1;
alter table public.gmc_sync_queue       add column if not exists generation bigint not null default 1;
alter table public.aboutyou_sync_queue  add column if not exists generation bigint not null default 1;

/* ── Declansatorul ─────────────────────────────────────────────────────────
 *
 * ⚠ NU e `security definer`, si nici n-are ce cauta. Ruleaza sub rolul celui care
 * scrie, nu-i trebuie niciun drept in plus, si nu citeste nimic din afara randului.
 *
 * ⚠ Numele incepe cu `trg_` fiindca `granturi-rpc.test.ts` sare peste ele: o functie
 * de declansator intoarce `trigger` si nu se poate chema prin PostgREST, deci nu e
 * o usa.
 */
create or replace function public.trg_generatia_cozii()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  /*
   * ⚠ Se ia din OLD, nu din NEW. Apelantul poate trimite in `upsert` un obiect care
   * NU pomeneste `generation` (asa fac toate patru caile de punere in coada) si atunci
   * `new.generation` vine cu implicitul coloanei, adica 1 — ar fi scazut generatia
   * inapoi si comparatia lucratorului vechi ar fi nimerit din nou.
   */
  new.generation := old.generation + 1;
  return new;
end $$;

drop trigger if exists trg_generatie on public.emag_sync_queue;
create trigger trg_generatie before update on public.emag_sync_queue
  for each row execute function public.trg_generatia_cozii();

drop trigger if exists trg_generatie on public.trendyol_sync_queue;
create trigger trg_generatie before update on public.trendyol_sync_queue
  for each row execute function public.trg_generatia_cozii();

drop trigger if exists trg_generatie on public.olx_sync_queue;
create trigger trg_generatie before update on public.olx_sync_queue
  for each row execute function public.trg_generatia_cozii();

drop trigger if exists trg_generatie on public.gmc_sync_queue;
create trigger trg_generatie before update on public.gmc_sync_queue
  for each row execute function public.trg_generatia_cozii();

drop trigger if exists trg_generatie on public.aboutyou_sync_queue;
create trigger trg_generatie before update on public.aboutyou_sync_queue
  for each row execute function public.trg_generatia_cozii();

/* ⚠ Postgres da EXECUTE lui PUBLIC din oficiu la orice functie noua, iar
   `create or replace` reface granturile. Vezi `granturi-rpc.test.ts`. O functie de
   declansator nu se poate chema prin PostgREST, dar regula casei e sa nu ramana
   nimic deschis din neatentie. */
revoke all on function public.trg_generatia_cozii() from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';

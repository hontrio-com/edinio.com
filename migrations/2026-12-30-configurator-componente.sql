-- ══════════════════════════════════════════════════════════════════════════
-- PIESELE CONSUMATE DE O CONFIGURATIE (F5)
-- ══════════════════════════════════════════════════════════════════════════
--
-- `Optiune.componenta: { id, bucati }` exista de la F1 doar ca forma: se parsa, se compila, si
-- nu o citea nimeni. O optiune care consuma patru balamale nu costa nimic si nu scadea nimic —
-- comerciantul completa campul, il vedea salvat, si dadea piesele pe gratis pana le termina din
-- depozit, fara nicio eroare nicaieri. Tabelul de mai jos e capatul care lipsea.
--
-- ══════════════════════════════════════════════════════════════════════════
-- ⚠ CE E O COMPONENTA: UN RAND NOU CARE ARATA CATRE UN PRODUS OBISNUIT
-- ══════════════════════════════════════════════════════════════════════════
--
-- Adica AMANDOUA, si fiecare pentru partea pe care o duce cel mai bine:
--
--   - IDENTITATEA, PRETUL SI COSTUL stau aici;
--   - STOCUL nu e al ei. E stocul unui produs obisnuit, prin `product_id`.
--
-- ⚠ DE CE NU UN STOC PROPRIU. Trei lucruri masurate in proiectul asta, nu presupuse:
--
--   1. `orders.stoc_rezervat` are EXACT DOUA CHEI — `produse` si `variante` — si TREI functii
--      din baza o REscriu intreaga cu `jsonb_build_object('produse', …, 'variante', …)`:
--      `adauga_stoc_rezervat`, `ajusteaza_stoc_comanda_marketplace` si actualizarea comenzii.
--      O a treia cheie `componente` ar fi fost stearsa TACUT la prima editare de comanda sau la
--      prima potrivire de marketplace. Piesele ar fi ramas scazute din depozit, iar la anulare
--      nu s-ar mai fi intors niciodata pe raft — fiindca nimeni n-ar mai fi stiut ca au plecat.
--
--   2. Rezervarea e o SINGURA instructiune atomica, `revendica_stoc_complet`, si isi ia lacatele
--      `for update` pe `products` intr-o ordine scrisa. Un al doilea fel de stoc ar fi cerut a
--      doua instructiune, cu a doua ordine de lacate: fie interblocare, fie o fereastra intre
--      ele in care doi cumparatori iau aceeasi ultima piesa.
--
--   3. Proiectul a raspuns deja o data la aceeasi intrebare, si tot asa: PACHETELE.
--      `expandBundleStock` desface un pachet in PRODUSELE lui si le adauga la `decrements`.
--      Componentele intra pe chiar drumul acela, deci migratia asta nu adauga NICIO functie de
--      stoc si nicio cheie noua pe comanda.
--
-- ⚠ CE S-AR FI PIERDUT PE CEALALTA CALE — `Optiune.componenta.id` = de-a dreptul un `products.id`,
-- fara tabelul asta:
--
--   - COSTUL INTERN n-ar fi avut unde sta. `products` n-are coloana de cost, iar `price` e
--     pretul PUBLIC de raft. `compileaza.ts` scrie de la F1 ca „costul intern e date de afacere
--     ale comerciantului” si ca nu pleaca la vitrina — o promisiune fara loc unde sa fie tinuta
--     e mai rea decat una nescrisa.
--   - PRETUL PIESEI ar fi fost silit sa fie pretul de raft. O balama vanduta la bucata cu 9 lei
--     nu costa 9 lei consumata intr-o usa, si comerciantul n-ar fi avut cum sa spuna asta decat
--     inventand un al doilea produs, cu alt SKU, care intra in import, in feeduri si in cautare.
--   - O piesa care NU se tine pe stoc (o manopera, un consumabil socotit la litru) ar fi cerut
--     un produs fantoma in catalog. Aici e de ajuns `product_id is null`.
--
-- ══════════════════════════════════════════════════════════════════════════
-- ⚠ MIGRATIA ASTA TREBUIE SA AJUNGA INAINTEA CODULUI
-- ══════════════════════════════════════════════════════════════════════════
--
-- `publicaConfigurator` citeste tabelul ca sa rezolve piesele inainte de compilare. Codul pusat
-- fara migratie face PostgREST sa raspunda cu eroare la interogare, iar publicarea sa cada — pe
-- ecranul comerciantului, zgomotos, nu tacut. Plasarea comenzilor NU citeste tabelul asta
-- (raspunsul e deja inghetat in versiunea publicata), deci checkout-ul nu e atins nici in cea
-- mai rea ordine. Se ruleaza `npm run verifica:coloane` inainte de push.
--
-- Invers e inofensiv: migratia aplicata cu codul vechi lasa un tabel gol pe care nu-l scrie
-- nimeni.
--
-- ══════════════════════════════════════════════════════════════════════════
-- ⚠ FARA NICIO POLITICA PUBLICA, SI FARA NICIO FUNCTIE
-- ══════════════════════════════════════════════════════════════════════════
--
-- `cost_bucata` sta in acelasi rand cu `pret_bucata`. Vitrina nu citeste tabelul: ea primeste o
-- versiune COMPILATA, in care publicarea a inghetat numai `produsId`, `pretBucata` si `nume`.
-- Deci o singura politica, a proprietarului — acelasi tipar ca la cele patru tabele din F1.
--
-- ⚠ Tabelele noi din `public` sunt DESCHISE din oficiu: proiectul are `alter default privileges`
-- care da lui `anon` si `authenticated` toate drepturile pe orice tabel nou. Singura aparare e
-- RLS, si de aceea e pornit mai jos. Iar `revoke ... from anon` de unul singur N-AR FI AJUNS
-- pentru o FUNCTIE: acolo `EXECUTE` e al lui `PUBLIC` din oficiu, si o revocare pe nume nu-l
-- stinge. Migratia asta nu creeaza nicio functie — tocmai fiindca stocul nu are drum nou.

begin;

create table if not exists public.configurator_componente (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  nume text not null,

  /*
   * ⚠ STOCUL PIESEI E STOCUL ACESTUI PRODUS. Vezi antetul.
   *
   * `on delete set null`, nu `restrict`: un `restrict` ar fi facut stergerea unui produs
   * obisnuit sa cada cu o eroare de cheie straina pe care comerciantul n-are cum s-o lege de
   * configurator. Ramane deci componenta fara produs, adica „nu se tine pe stoc” — exact
   * purtarea pe care o are azi un pachet caruia i s-a sters o componenta.
   *
   * ⚠ Iar versiunile DEJA PUBLICATE poarta `produsId` inghetat: ele cer mai departe produsul
   * sters, iar `revendica_stoc_complet` sare peste un id care nu mai are rand — la fel ca pentru
   * orice produs sters dintr-un pachet. Nu se pierde nimic in plus fata de ce se pierde azi.
   */
  product_id uuid references public.products(id) on delete set null,

  /*
   * ⚠ DOUA NUMERE, SI NUMAI UNUL PLEACA DIN BAZA.
   *
   * `pret_bucata` e cat plateste CUMPARATORUL pe bucata consumata: se inghiata la publicare in
   * `configurator_versiuni.compilat` si de acolo il socotesc si browserul, si serverul — de-aia
   * pretul aratat si cel incasat sunt acelasi numar.
   *
   * `cost_bucata` e cat platim NOI pe piesa la furnizor. Nu se compileaza, nu se serveste, nu
   * pleaca nicaieri. Pus in aceeasi coloana cu celalalt „ca sa fie mai simplu”, ar fi ajuns in
   * sursa fiecarei pagini de produs care are configuratorul — vezi `compileaza.ts`.
   */
  pret_bucata numeric(10,2) not null default 0,
  cost_bucata numeric(10,2),

  -- Stinsa: ramane pentru versiunile publicate care o poarta, dar nu se mai poate alege in panou.
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint configurator_componente_nume_check check (btrim(nume) <> ''),
  -- ⚠ Un pret negativ pe piesa ar fi insemnat ca cine consuma din depozit primeste bani inapoi:
  -- cumparatorul si-ar fi ieftinit comanda alegand ce ne costa pe noi mai mult, si cu cat mai
  -- multe bucati, cu atat mai ieftin. Costul are voie sa lipseasca; negativ, nu.
  constraint configurator_componente_pret_check check (pret_bucata >= 0),
  constraint configurator_componente_cost_check check (cost_bucata is null or cost_bucata >= 0)
);

create index if not exists configurator_componente_magazin_idx
  on public.configurator_componente (business_id, nume);

-- ⚠ Partial, fiindca o piesa fara produs e cazul obisnuit pentru manopera si consumabile: un
-- index intreg ar fi tinut in el randuri pe care nimeni nu le cauta dupa produs.
create index if not exists configurator_componente_produs_idx
  on public.configurator_componente (product_id) where product_id is not null;

drop trigger if exists set_configurator_componente_updated_at on public.configurator_componente;
create trigger set_configurator_componente_updated_at
  before update on public.configurator_componente
  for each row execute function public.set_updated_at();

-- ── Granturi si RLS ───────────────────────────────────────────────────────
--
-- Scrise pe fata, desi `alter default privileges` le-ar fi dat oricum: baseline-ul se
-- regenereaza din baza, iar `src/lib/rls-tabele.test.ts` cauta in el perechea grant + RLS. Un
-- tabel care primeste granturile implicite si nu apare in baseline cu `enable row level
-- security` e chiar defectul pe care proba aia exista sa-l prinda.

revoke all on table public.configurator_componente from anon;
grant select, insert, update, delete on table public.configurator_componente to authenticated;
grant all on table public.configurator_componente to service_role;

alter table public.configurator_componente enable row level security;

create policy owner_all_configurator_componente on public.configurator_componente
  for all using (business_id in (
    select id from public.businesses where user_id = (select auth.uid())));

comment on table public.configurator_componente is
  'Piesele pe care le consuma optiunile unui configurator. Stocul NU e al lor: e stocul produsului din product_id, ca sa nu existe a doua cale de scadere.';
comment on column public.configurator_componente.product_id is
  'Produsul al carui stoc E stocul piesei. NULL = piesa costa, dar nu se tine pe stoc (manopera, consumabil).';
comment on column public.configurator_componente.pret_bucata is
  'Cat plateste CUMPARATORUL pe bucata. Se inghiata la publicare in versiunea compilata; de acolo il socotesc la fel browserul si serverul.';
comment on column public.configurator_componente.cost_bucata is
  'Cat platim NOI pe piesa. NU se compileaza si NU pleaca la vitrina: e date de afacere ale comerciantului.';

commit;

notify pgrst, 'reload schema';

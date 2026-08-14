-- ═══════════════════════════════════════════════════════════════════════════
-- Poșta Română: al noualea transportator — si primul care NU e curier
--
-- CE ADAUGA
--
--   1. Sase coloane pe `orders`.
--   2. `store_settings.posta_config` — user, parola, datele din contract.
--   3. `privat.campuri_secrete` — parola se cripteaza in repaus.
--   4. `'posta'` in constrangerea de furnizor a registrului de operatii externe.
--   5. `public.posta_plaja` + `public.posta_aloca_cod()` — rezervorul de coduri
--      AWB, pentru comerciantii care au plaja alocata prin contract.
--   6. Un index partial pentru cronul de urmarire.
--
-- ═══ ⚠ NU E UN CURIER, E POSTA ═══
--
--   Nu vine nimeni sa ridice: comerciantul DUCE coletele la oficiu. Se vede si in
--   API, unde nu exista nicio metoda de ridicare — spre deosebire de toti ceilalti
--   opt. De aceea:
--
--     - nu exista coloana de „ridicare programata";
--     - `dataPrezentarePresetata` (ziua in care duce coletele) e un reglaj de
--       configurare, nu o coloana pe comanda;
--     - borderoul e optional: documentatia arata explicit `"idBorderou": null` ca
--       valoare valida, deci pornim fara el si gruparea vine ca mod separat.
--
-- ═══ ⚠ CE STIM SI CE NU: SASE ENDPOINTURI DIN SAPTE N-AU RASPUNSUL DOCUMENTAT ═══
--
--   Documentatia (`Documentatie Awb API 30.10.2025`) descrie corpul CERERII camp
--   cu camp si tace despre ce se intoarce — cu o singura exceptie,
--   `GET /awb/{cod}/trace/last`. Nu exista mediu de test, deci nimic din ce e mai
--   jos n-a fost vazut pe fir la data scrierii.
--
--   Consecinta pentru schema: **nicio coloana nu presupune ca stim AWB-ul imediat
--   dupa emitere**. Vezi `posta_awb_number`, si comentariul lui.
--
-- Aditiva: coloane noi nullable, o constrangere largita, un tabel nou. Codul vechi
-- nu le atinge, deci se poate aplica INAINTE de deploy. Invers NU: `posta_config`
-- e cerut in acelasi SELECT cu tot restul setarilor de livrare, deci codul fara
-- migratie lasa checkout-ul INTREGII platforme fara nicio optiune.
-- ═══════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- 1. AWB-ul
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists posta_awb_number text;

comment on column public.orders.posta_awb_number is
  'Codul AWB Posta Romana. Format masurat din documentatie: 13 caractere '
  '(`awbRetur` e declarat `char 13`, iar toate cele trei exemple au 13). '
  '⚠ Poate veni pe DOUA cai: compus de noi din plaja alocata (atunci il stim '
  'INAINTE de apel), ori generat de ei si citit din raspunsul lui POST /api/awb — '
  'raspuns al carui format documentatia NU il descrie. Vezi `citesteCodAwb` din '
  'src/lib/posta/client.ts.';

alter table public.orders
  add column if not exists posta_awb_at timestamptz;

comment on column public.orders.posta_awb_at is
  'Cand s-a emis AWB-ul. Fereastra cronului se ancoreaza pe EL, nu pe created_at '
  '(o comanda veche careia i se emite AWB tarziu ar ramane in afara ferestrei) si '
  'nu pe updated_at (pe care declansatorul il improspateaza la fiecare trecere a '
  'cronului, tinand coletul in fereastra la nesfarsit).';

-- ---------------------------------------------------------------------------
-- 2. Borderoul si oficiul
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists posta_borderou_id bigint;

comment on column public.orders.posta_borderou_id is
  'Borderoul in care a intrat AWB-ul (`idBorderou`), sau NULL. ⚠ Documentatia '
  'spune ca AWB-uri se pot adauga intr-un borderou doar cat timp acesta NU a fost '
  '„prezentat", si doar de userul care l-a creat — dar NU exista niciun endpoint '
  'de prezentare, deci noi nu putem sti cand s-a inchis. De aia implicitul e NULL '
  '(valoare pe care chiar exemplul lor o arata) si gruparea e optionala.';

alter table public.orders
  add column if not exists posta_oficiu_id text;

comment on column public.orders.posta_oficiu_id is
  'Oficiul de livrare pentru trimiterile post-restante (`idOficiuPR`, din '
  'GET /api/unitati-livrare). Sta pe comanda, nu doar in `shipping_address`, ca o '
  'reemitere dupa corectarea adresei sa nu scormone in jsonb. '
  '⚠ `text`, desi proza il declara `(int)`: exemplul lor il trimite ca SIR '
  '("31793"). Se pastreaza exact cum a ales clientul, si se trimite la fel.';

-- ---------------------------------------------------------------------------
-- 3. Memoria urmaririi
--
-- ⚠ `text`, nu `integer`, desi `idStatus` vine numeric in exemplul lor.
-- Acelasi motiv ca la `gls_status_code`: un cod nou sau neasteptat se scrie asa
-- cum a venit, in loc sa cada la scriere sau sa devina tacut `null`.
-- Interpretarea o face src/lib/posta/statusuri.ts, care nu se increde in el.
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists posta_status_code text;

comment on column public.orders.posta_status_code is
  'Ultimul `idStatus` prelucrat de cron, exact cum a venit. Serveste la a NU '
  'semnala de doua ori acelasi eveniment, si la a scoate din urmarire coletele '
  'ajunse intr-o stare finala. ⚠ „Final" se hotaraste din tabelul NOSTRU '
  '(statusuri.ts), nu din steagul `statusFinal` al lor: statusul 56 „Anulat" are '
  'la ei `statusFinal` FALS, deci o comanda anulata ar fi interogata la nesfarsit.';

alter table public.orders
  add column if not exists posta_status_checked_at timestamptz;

comment on column public.orders.posta_status_checked_at is
  'Cand a intrebat cronul ultima oara — NU data evenimentului. Da rotatia: se iau '
  'intotdeauna comenzile neintrebate de cel mai mult timp, deci plafonul pe rulare '
  'nu lasa mereu aceleasi comenzi pe dinafara.';

-- ---------------------------------------------------------------------------
-- 4. Configurarea, pe tabelul PRIVAT
--
-- ⚠ Se adauga pe `privat.store_settings`, nu pe vederea publica: vederea e
-- generata din tabel de `reconstruieste_store_settings()`, deci o coloana pusa
-- direct pe ea ar disparea la prima regenerare.
-- ---------------------------------------------------------------------------
alter table privat.store_settings
  add column if not exists posta_config jsonb;

comment on column privat.store_settings.posta_config is
  'Posta Romana: {enabled, username, password, cod_trimitere, servicii{...}, '
  'post_restant, retur, valoare_declarata, zile_pana_la_prezentare, expeditor{...}}. '
  '`password` se cripteaza — vezi privat.campuri_secrete. '
  '⚠ `cod_trimitere` si bifele de servicii sunt date de CONTRACT, diferite de la '
  'un comerciant la altul: documentatia spune ca optiunile sunt „valide doar daca '
  'in contract vor fi permise". De aia toate bifele pornesc STINSE.';

-- ---------------------------------------------------------------------------
-- 5. Parola intra sub criptare
--
-- ⚠ Trebuie sa ramana in pas cu `CAMPURI_SECRETE` din src/lib/integrari/secrete.ts.
-- Omisiunea din partea de TypeScript nu lasa parola in clar (vederea nu
-- decripteaza pentru `authenticated`), dar strica `secretulEsteSalvat`:
-- formularul nu mai stie ca exista o parola, iar prima salvare o STERGE.
--
-- `username` NU e secret: e contul cu care intra comerciantul la Posta si trebuie
-- sa se vada in formular, ca sa stie ce cont a legat. Acelasi rationament ca la
-- Pall-Ex.
-- ---------------------------------------------------------------------------
insert into privat.campuri_secrete (coloana, cale) values
  ('posta_config', 'password')
on conflict do nothing;

-- ⚠ OBLIGATORIU dupa orice modificare de coloane sau de campuri secrete.
select privat.reconstruieste_store_settings();
select privat.reconstruieste_store_settings_upd();

-- ---------------------------------------------------------------------------
-- 6. Registrul de operatii externe cunoaste furnizorul nou
--
-- ⚠ Fara asta, PRIMA emitere Posta cade pe constrangere DUPA ce trimiterea a fost
-- deja creata la ei — adica exact cazul in care nu stim daca s-a intamplat.
--
-- Trebuie sa ramana in pas cu `FurnizorOperatie` din src/lib/operatii/registru.ts.
-- ---------------------------------------------------------------------------
alter table public.operatii_externe
  drop constraint if exists operatii_externe_furnizor_check;

alter table public.operatii_externe
  add constraint operatii_externe_furnizor_check check (furnizor = any (array[
    'cargus'::text, 'sameday'::text, 'fancourier'::text, 'dpd'::text,
    'woot'::text, 'colete'::text, 'gls'::text, 'pallex'::text, 'ecolet'::text,
    'posta'::text,
    'smartbill'::text, 'oblio'::text, 'fgo'::text,
    'stripe'::text, 'netopia'::text, 'ipay'::text, 'klarna'::text, 'revolut'::text,
    'trendyol'::text, 'aboutyou'::text, 'olx'::text, 'gmc'::text,
    'proba'::text
  ]));

-- ---------------------------------------------------------------------------
-- 7. Rezervorul de coduri AWB (plaja)
--
-- ═══ DE CE EXISTA ═══
--
--   Documentatia: „`codAwb` trebuie sa fie un cod de awb din plaja alocata
--   clientului daca se lucreaza cu plaja, altfel acest camp nu va fi trecut si se
--   va genera in mod automat."
--
--   Deci sunt DOUA moduri, si primul e mult mai sigur pentru noi: cu codul stiut
--   INAINTE de apel, garda de idempotenta din registru e chiar codul, iar
--   confirmarea „chiar s-a creat?" se ia din `GET /api/awb/{cod}` — o citire,
--   gratuita si repetabila. In modul automat depindem de un raspuns al carui
--   format documentatia nu-l descrie.
--
-- ═══ ⚠ DE CE TABEL SI NU UN CAMP IN `posta_config` ═══
--
--   Alocarea e o SCRIERE CONCURENTA: doua comenzi expediate in aceeasi secunda nu
--   au voie sa primeasca acelasi cod. Un contor tinut in jsonb-ul de configurare
--   s-ar fi citit si rescris din doua procese, si al doilea l-ar fi suprascris pe
--   primul — doua trimiteri cu acelasi AWB, adica exact defectul pe care restul
--   integrarii il apara cu registrul.
--
--   Aici alocarea e un singur `update … returning`, deci randul se incuie si
--   ordinea e garantata de Postgres.
--
-- ⚠ NICIO POLITICA RLS. Tabelul se atinge exclusiv cu `service_role`, din
-- actiunile care au dovedit deja proprietatea magazinului. Un comerciant care si-ar
-- putea muta singur cursorul ar reemite coduri deja folosite.
-- ---------------------------------------------------------------------------
create table if not exists public.posta_plaja (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  /* Partea nenumerica din fata („LN"). Poate fi si goala. */
  prefix text not null default '',
  /* Capetele intervalului, INCLUSIVE, ca numere. */
  de_la bigint not null,
  pana_la bigint not null,
  /* Urmatorul numar liber. Porneste de la `de_la`. */
  urmator bigint not null,
  /* Cate cifre are partea numerica; codul se completeaza cu zerouri in fata. */
  cifre smallint not null default 11,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint posta_plaja_interval_check check (de_la <= pana_la),
  constraint posta_plaja_urmator_check check (urmator >= de_la),
  constraint posta_plaja_cifre_check check (cifre between 1 and 28)
);

comment on table public.posta_plaja is
  'Plaja de coduri AWB alocata unui magazin prin contractul lui cu Posta Romana. '
  'Se consuma cu `posta_aloca_cod()`, atomic. Fara rand aici, integrarea lucreaza '
  'in modul automat (codul il genereaza Posta).';

alter table public.posta_plaja enable row level security;

/*
 * Alocarea unui cod, atomic.
 *
 * ⚠ INTOARCE NULL CAND PLAJA S-A EPUIZAT, in loc sa arunce. Apelantul trebuie sa
 * poata spune comerciantului „ti s-au terminat codurile, cere altele" — un mesaj
 * pe care il repara el — in loc sa primeasca o exceptie de baza de date.
 *
 * ⚠ `security definer` cu `search_path` fixat: functia scrie intr-un tabel fara
 * politici, deci nu are voie sa poata fi deturnata printr-o schema pusa in fata.
 */
create or replace function public.posta_aloca_cod(p_business_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_numar bigint;
  v_prefix text;
  v_cifre smallint;
begin
  update public.posta_plaja
     set urmator = urmator + 1,
         updated_at = now()
   where business_id = p_business_id
     and urmator <= pana_la
  returning urmator - 1, prefix, cifre
    into v_numar, v_prefix, v_cifre;

  if v_numar is null then
    return null;
  end if;

  return v_prefix || lpad(v_numar::text, v_cifre, '0');
end;
$$;

comment on function public.posta_aloca_cod(uuid) is
  'Scoate urmatorul cod AWB din plaja magazinului si avanseaza cursorul, atomic. '
  'NULL daca magazinul n-are plaja sau daca s-a epuizat.';

/* ⚠ Numai `service_role`. Vezi nota de la tabel: un comerciant care si-ar putea
   chema singur functia ar putea consuma sau sari coduri. */
revoke all on function public.posta_aloca_cod(uuid) from public;
revoke all on function public.posta_aloca_cod(uuid) from anon, authenticated;
grant execute on function public.posta_aloca_cod(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 8. Indexul cronului
--
-- ⚠ PARTIAL, si cu STATUSUL in predicat, exact ca la GLS.
--
-- Comenzile incheiate isi pastreaza numarul AWB, deci ar ramane in index cu
-- marcajul inghetat la ultima verificare — adica in CAPUL lui, fiindca acolo
-- sorteaza cele mai vechi. Cu vremea, primele randuri citite ar fi numai comenzi
-- moarte, iar cele vii n-ar mai ajunge la rand.
--
-- `nulls first` nu e ornament: e chiar ordinea ceruta de cron, iar implicitul lui
-- Postgres la `asc` e `nulls last`. Scris invers, coletele NEINTREBATE VREODATA —
-- exact cele mai importante — ar fi iesit ultimele si, sub plafon, niciodata.
-- ---------------------------------------------------------------------------
create index if not exists orders_posta_urmarire_idx
  on public.orders (posta_status_checked_at asc nulls first)
  where posta_awb_number is not null
    and status = any (array['pending'::text, 'confirmed'::text, 'processing'::text, 'shipped'::text]);

-- ---------------------------------------------------------------------------
-- 9. PostgREST trebuie sa afle de coloanele noi
--
-- ⚠ Fara asta, aplicatia primeste „column does not exist" pe `posta_config` pana
-- la urmatoarea repornire a PostgREST. Si nu cade doar Posta: coloana e ceruta in
-- acelasi SELECT cu tot restul setarilor de livrare, deci ar cadea checkout-ul
-- tuturor magazinelor.
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';

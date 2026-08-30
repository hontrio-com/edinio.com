-- ═══════════════════════════════════════════════════════════════════════════
-- Pall-Ex: al saptelea curier
--
-- CE ADAUGA
--
--   1. Sase coloane pe `orders` — Pall-Ex are nevoie de mai multe decat ceilalti,
--      si fiecare din motive scrise mai jos.
--   2. `store_settings.pallex_config` — datele de acces ClientPlus.
--   3. `privat.campuri_secrete` — parola ClientPlus se cripteaza in repaus.
--   4. `'pallex'` in constrangerea de furnizor a registrului de operatii externe.
--   5. Indexul partial al cronului de urmarire.
--
-- ═══ ⚠ PALL-EX NU E UN CURIER DE COLETE ═══
--
--   E o retea de distributie de marfa PALETIZATA (hub & spoke). Diferentele care
--   se vad in schema:
--
--   - **Nu exista ramburs.** API-ul (`https://clientplus.pallex.ro/api/v1`,
--     OpenAPI 1.0.5) nu are NICIUN camp de incasare la livrare — nici pe partida,
--     nici pe palet. Nu e o scapare a documentatiei: sunt 32 de campuri pe
--     `Consignment`, inclusiv sapte servicii optionale, si niciunul nu e COD. De
--     aceea codul refuza sa emita pe o comanda cu bani neincasati fara o
--     confirmare explicita a comerciantului.
--   - **Data si fereastra orara sunt OBLIGATORII**, si la ridicare si la livrare
--     (`collection_date`, `collection_open_time`, `collection_close_time`, si
--     perechea de livrare). Ceilalti sase curieri nu cer nimic din astea.
--   - **Judetul se trimite ca ISO auto** („SB", „B"), nu ca nume.
--
-- ═══ ⚠ DE CE TREI IDENTIFICATORI, SI NU UNUL ═══
--
--   La ceilalti curieri numarul de pe eticheta e si cheia de lucru. La Pall-Ex
--   sunt lucruri diferite:
--
--   `pallex_consignment_id`  ID-ul ClientPlus. E SINGURUL pe care il primesc
--                            `GET /consignments/{id}`, `/label`, `/note` si
--                            `DELETE`. Fara el nu se poate nici descarca
--                            eticheta, nici anula partida, nici urmari.
--   `pallex_bordereau_id`    Borderoul in care sistemul a asezat partida.
--                            Expedierea NU pleaca pana cand borderoul nu e
--                            validat (pasul 3 din fluxul documentat), iar
--                            validarea se face pe ID de BORDEROU, nu de partida.
--   `pallex_awb_number`      Codul Pall-Ex vazut de client („C202012345678").
--                            Vine abia la o citire de dupa creare, deci pana
--                            atunci coloana poarta ID-ul ClientPlus ca text.
--
--   ⚠ Cele doua ID-uri stau in COLOANE, nu in `detalii` din registru — spre
--   deosebire de `ParcelId`-ul GLS. Motivul e chiar lectia platita acolo: pe
--   ramura „deja" a registrului, `detalii` poate lipsi, si atunci comanda ramane
--   cu un AWB pe care nimeni nu-l mai poate nici anula, nici descarca. Aici
--   ID-urile sunt necesare la FIECARE operatie, nu doar la anulare.
--
-- ═══ ⚠ PAROLA SE CRIPTEAZA, SI NU DIN OFICIU ═══
--
--   Adaugarea coloanei NU e de ajuns. Criptarea in repaus e condusa de tabelul
--   `privat.campuri_secrete`, iar vederea publica `store_settings` decripteaza
--   doar caile inscrise acolo. Fara randul de mai jos, parola ClientPlus ar sta
--   in clar in baza.
--
--   Si dupa inserare TREBUIE rulat `privat.reconstruieste_store_settings()`,
--   altfel vederea ramane cu lista veche de coloane: coloana ar exista in tabelul
--   privat si ar lipsi din ce vede aplicatia.
--
--   ⚠ `username` NU e secret: e adresa de mail cu care comerciantul intra in
--   ClientPlus, apare in interfata lui si trebuie sa se vada in formular ca sa
--   stie ce cont a legat.
--
-- Aditiva: coloane noi nullable si o constrangere largita. Codul vechi nu le
-- atinge, deci se poate aplica INAINTE de deploy. Invers nu: codul Pall-Ex fara
-- migratie scrie in coloane care nu exista.
-- ═══════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- 1. Identificatorii partidei, pe comanda
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists pallex_awb_number text;

comment on column public.orders.pallex_awb_number is
  'Codul de partida Pall-Ex (`pallex_id`, ex. C202012345678) — cel pe care il '
  'vede clientul. Pana cand Pall-Ex il atribuie, coloana poarta ID-ul ClientPlus '
  'ca text, ca panoul sa aiba ce arata si ca restul platformei sa vada comanda '
  'ca avand AWB. Cronul de urmarire il inlocuieste cu codul adevarat cand apare.';

alter table public.orders
  add column if not exists pallex_consignment_id bigint;

comment on column public.orders.pallex_consignment_id is
  'ID-ul ClientPlus al partidei. SINGURUL acceptat de GET /consignments/{id}, '
  '/label, /note si DELETE — codul Pall-Ex de pe eticheta nu e primit de niciuna '
  'dintre ele. Sta in coloana, nu in `detalii` din registru, fiindca e nevoie de '
  'el la fiecare operatie, nu doar la anulare.';

alter table public.orders
  add column if not exists pallex_bordereau_id bigint;

comment on column public.orders.pallex_bordereau_id is
  'Borderoul in care sistemul Pall-Ex a asezat partida. Expedierea nu pleaca '
  'pana cand borderoul nu e validat (POST /bordereaux/{id}/validated), iar '
  'validarea se face pe ID de BORDEROU. ⚠ Un borderou poate contine partidele mai '
  'multor comenzi: validarea le porneste pe TOATE si le scoate din anulare.';

alter table public.orders
  add column if not exists pallex_awb_at timestamptz;

comment on column public.orders.pallex_awb_at is
  'Cand s-a creat partida. Fereastra cronului se ancoreaza pe EA, nu pe '
  '`created_at`: o comanda veche careia i se emite AWB tarziu ar fi ramas altfel '
  'in afara ferestrei si nu s-ar fi urmarit niciodata. Si nu pe `updated_at`, pe '
  'care declansatorul l-ar improspata la fiecare trecere a cronului.';

-- ---------------------------------------------------------------------------
-- 2. Memoria urmaririi
--
-- ⚠ `pallex_status_id` e TEXT, desi Pall-Ex il trimite ca intreg.
--
-- Aceeasi hotarare ca la `gls_status_code`, si din acelasi motiv: un status nou
-- sau neasteptat se scrie asa cum a venit, in loc sa cada la scriere sau sa
-- devina tacut `null`. Interpretarea o face `src/lib/pallex/statusuri.ts`, care
-- stie sa nu se increada in continut.
--
-- ⚠ Si mai ales: la Pall-Ex numerele NU au inteles fix. `/consignment_status_types`
-- intoarce perechi (id, nume) pe care fiecare instalare le poate avea altfel;
-- documentatia nu publica nicio lista. Deci id-ul se pastreaza DOAR ca sa nu
-- semnalam de doua ori acelasi eveniment, iar hotararea se ia dupa NUME.
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists pallex_status_id text;

comment on column public.orders.pallex_status_id is
  'Ultimul `status_type_id` Pall-Ex prelucrat de cronul de urmarire, exact cum a '
  'venit. Serveste NUMAI la a nu semnala de doua ori acelasi eveniment: intelesul '
  'nu se deduce din numar, ci din numele adus de /consignment_status_types. '
  'Vezi src/lib/pallex/statusuri.ts.';

alter table public.orders
  add column if not exists pallex_status_checked_at timestamptz;

comment on column public.orders.pallex_status_checked_at is
  'Cand a intrebat cronul ultima oara de aceasta partida — NU data evenimentului '
  'de la Pall-Ex. Da rotatia: se iau intotdeauna partidele neintrebate de cel mai '
  'mult timp, deci plafonul pe rulare nu lasa mereu aceleasi comenzi pe dinafara.';

-- ---------------------------------------------------------------------------
-- 3. Configurarea, pe tabelul PRIVAT
--
-- ⚠ Se adauga pe `privat.store_settings`, nu pe vederea publica: vederea e
-- generata din tabel de `reconstruieste_store_settings()`, deci o coloana pusa
-- direct pe ea ar disparea la prima regenerare.
-- ---------------------------------------------------------------------------
alter table privat.store_settings
  add column if not exists pallex_config jsonb;

comment on column privat.store_settings.pallex_config is
  'Pall-Ex ClientPlus: {enabled, username, password, expeditor_cod_postal, '
  'expeditor_judet, tip_partida, ora_deschidere, ora_inchidere, zile_pana_la_ridicare, '
  'zile_pana_la_livrare, valideaza_automat, servicii...}. `password` se cripteaza — '
  'vezi privat.campuri_secrete.';

-- ---------------------------------------------------------------------------
-- 4. Parola intra sub criptare
--
-- ⚠ Trebuie sa ramana in pas cu `CAMPURI_SECRETE` din src/lib/integrari/secrete.ts.
-- Omisiunea din partea de TypeScript nu lasa parola in clar (vederea nu
-- decripteaza pentru `authenticated`), dar strica `secretulEsteSalvat`: formularul
-- nu mai stie ca exista o parola, iar prima salvare a comerciantului o STERGE.
-- ---------------------------------------------------------------------------
insert into privat.campuri_secrete (coloana, cale) values
  ('pallex_config', 'password')
on conflict do nothing;

-- ⚠ OBLIGATORIU dupa orice modificare de coloane sau de campuri secrete.
-- Reconstruieste vederea publica `store_settings` cu lista noua de coloane si cu
-- decriptarea pe caile din `campuri_secrete`.
select privat.reconstruieste_store_settings();
select privat.reconstruieste_store_settings_upd();

-- ---------------------------------------------------------------------------
-- 5. Registrul de operatii externe cunoaste furnizorul nou
--
-- ⚠ Fara asta, PRIMA creare de partida prin Pall-Ex cade pe constrangere — dupa
-- ce partida a fost deja creata la ei. Adica exact cazul in care nu stim daca s-a
-- intamplat: transport real si niciun rand in registru care sa-l tina minte.
--
-- Trebuie sa ramana in pas cu `FurnizorOperatie` din src/lib/operatii/registru.ts.
-- ---------------------------------------------------------------------------
alter table public.operatii_externe
  drop constraint if exists operatii_externe_furnizor_check;

alter table public.operatii_externe
  add constraint operatii_externe_furnizor_check check (furnizor = any (array[
    'cargus'::text, 'sameday'::text, 'fancourier'::text, 'dpd'::text,
    'woot'::text, 'colete'::text, 'gls'::text, 'pallex'::text,
    'smartbill'::text, 'oblio'::text, 'fgo'::text,
    'stripe'::text, 'netopia'::text, 'ipay'::text, 'klarna'::text, 'revolut'::text,
    'trendyol'::text, 'aboutyou'::text, 'olx'::text, 'gmc'::text,
    'proba'::text
  ]));

-- ---------------------------------------------------------------------------
-- 6. Indexul cronului
--
-- ⚠ PARTIAL, pe `pallex_consignment_id is not null` — nu pe numarul de AWB.
--
-- Cronul interogheaza `GET /consignments/{id}`, deci ce il face pe un rand
-- interesant e ID-ul ClientPlus, nu codul de pe eticheta. Sunt aproape mereu
-- amandoua, dar predicatul trebuie sa fie chiar coloana pe care se filtreaza:
-- altfel planificatorul nu poate dovedi implicatia si indexul nu se foloseste.
--
-- `nulls first` nu e ornament: e chiar ordinea ceruta de cron, iar implicitul lui
-- Postgres la `asc` e `nulls last`. Scris invers, partidele NEINTREBATE VREODATA —
-- exact cele mai importante — ar fi iesit ultimele si, sub plafon, niciodata.
--
-- ⚠ Si statusul intra in PREDICAT, nu doar in interogare. Comenzile incheiate isi
-- pastreaza ID-ul de partida, deci ar ramane in index cu marcajul inghetat la
-- ultima verificare — adica exact in CAPUL lui, fiindca acolo sorteaza cele mai
-- vechi. Cu vremea, primele randuri citite ar fi numai comenzi moarte.
-- ---------------------------------------------------------------------------
create index if not exists orders_pallex_urmarire_idx
  on public.orders (pallex_status_checked_at asc nulls first)
  where pallex_consignment_id is not null
    and status = any (array['pending'::text, 'confirmed'::text, 'processing'::text, 'shipped'::text]);

-- ---------------------------------------------------------------------------
-- 7. PostgREST trebuie sa afle de coloanele noi
--
-- ⚠ Fara asta, aplicatia primeste „column does not exist" pe `pallex_config` si pe
-- coloanele de comanda pana la urmatoarea repornire a PostgREST — care poate veni
-- peste ore. Si nu cade doar Pall-Ex: `settings/page.tsx` cere `pallex_config` in
-- acelasi SELECT cu tot restul setarilor, deci ar cadea INTREAGA pagina de setari.
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';

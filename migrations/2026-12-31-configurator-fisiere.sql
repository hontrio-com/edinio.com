-- ══════════════════════════════════════════════════════════════════════════
-- FISIERELE INCARCATE DE CUMPARATOR (F4)
-- ══════════════════════════════════════════════════════════════════════════
--
-- Nodul `fisiere` exista in model de la F0 si nu se putea publica: `validare.ts` il refuza cu
-- `fisiere_indisponibil`, iar `ConfiguratorSlot` intorcea `null` pentru el. Motivul scris atunci
-- era ca „depozitul privat vine in faza lui”. Asta e faza lui.
--
-- ══════════════════════════════════════════════════════════════════════════
-- ⚠ CINE INCARCA: UN STRAIN, FARA CONT
-- ══════════════════════════════════════════════════════════════════════════
--
-- Asta e deosebirea fata de TOT ce urca in platforma azi. Pozele de produs, etichetele AWB,
-- facturile — toate vin de la un comerciant autentificat, al carui `user_id` intra in cheia din
-- R2 si care raspunde de ce a urcat. Aici urca vizitatorul unui magazin: nu are cont, nu are
-- sesiune, si nu-l cunoaste nimeni pana cand (daca) plaseaza comanda.
--
-- Din asta ies trei lucruri, si fiecare e o coloana sau o regula de mai jos:
--
--   1. NU EXISTA PROPRIETAR LA INCARCARE. Randul se leaga de MAGAZIN (`business_id`), fiindca
--      atat se stie: cine deseneaza pagina. `comanda_id` se scrie mai tarziu, la plasare, si de
--      abia atunci fisierul are un om in spate.
--
--   2. CE NU AJUNGE PE O COMANDA E GUNOI, SI TREBUIE MATURAT. Altfel oricine poate umple
--      depozitul nostru la nesfarsit, gratis, incarcand si inchizand fila. `comanda_id is null`
--      plus `creat_la` mai vechi de o zi = se sterge (cronul orar de eliberare a cupoanelor, care
--      matura deja `rate_limits` din acelasi motiv).
--
--   3. FISIERUL NU SE SERVESTE PUBLIC. R2 e servit prin CDN cu `max-age` de un an, deci o cheie
--      ghicibila ar fi insemnat ca poza pe care un cumparator a incarcat-o (o dedicatie, un act,
--      chipul cuiva) se poate cere de oricine. Cheia poarta o semnatura HMAC din secretul
--      serverului, iar descarcarea trece printr-o ruta care pune `private, no-store`.
--
-- ══════════════════════════════════════════════════════════════════════════
-- ⚠ DE CE UN TABEL, SI NU DOAR CHEIA SCRISA IN CONFIGURATIE
-- ══════════════════════════════════════════════════════════════════════════
--
-- `orders.items[].configuratie` poarta deja `{ f: "fisiere", v: [{ id }] }`, deci s-ar fi putut
-- pune acolo chiar cheia din R2 si gata, fara migratie. Trei lucruri se pierdeau:
--
--   1. MATURATUL. Un fisier incarcat si neordonat n-ar mai fi avut niciun rand nicaieri: ca
--      sa-l gasesti, ar fi trebuit sa listezi depozitul si sa cauti prin `orders.items` al
--      fiecarei comenzi din platforma. Adica niciodata.
--   2. VERIFICAREA LA PLASARE. Serverul trebuie sa poata spune „id-ul asta chiar exista, chiar e
--      al magazinului asta, si chiar are 2400 px latime”. Fara rand, ar fi trebuit sa creada pe
--      cuvant ce trimite browserul — adica sa nu verifice nimic.
--   3. LIMITA. Fara un loc unde se numara, „cel mult 3 fisiere” era o promisiune a clientului.
--
-- ══════════════════════════════════════════════════════════════════════════
-- ⚠ MIGRATIA ASTA TREBUIE SA AJUNGA INAINTEA CODULUI
-- ══════════════════════════════════════════════════════════════════════════
--
-- Ruta de incarcare scrie in tabel, iar `repretuire.ts` il citeste la fiecare plasare de comanda
-- care are un nod de fisiere. Codul pusat fara migratie face PostgREST sa raspunda cu eroare pe
-- interogare, iar o coloana lipsa rupe INTREAGA interogare. Se ruleaza `npm run verifica:coloane`
-- inainte de push.
--
-- Invers e inofensiv: migratia aplicata cu codul vechi lasa un tabel gol pe care nu-l scrie
-- nimeni, si un nod `fisiere` pe care publicarea il refuza mai departe.

begin;

create table if not exists public.configurator_fisiere (
  /*
   * ⚠ ID-UL E CAPACITATEA. El sta in `{ f: "fisiere", v: [{ id }] }`, deci in cosul din
   * `localStorage` al cumparatorului, si tot el e singurul lucru pe care il are ca sa-si vada
   * inapoi propria poza inainte sa comande. Un `bigserial` ar fi facut fisierele tuturor
   * vizibile prin numaratoare; `gen_random_uuid()` da 122 de biti imprevizibili.
   */
  id uuid primary key default gen_random_uuid(),

  business_id uuid not null references public.businesses(id) on delete cascade,

  /*
   * Cheia din R2. Contine o semnatura HMAC (vezi `lib/configurators/fisiere.ts`), deci nu se
   * poate reconstitui din id — chiar daca id-ul scapa, obiectul nu se poate cere de pe CDN.
   *
   * ⚠ Se PASTREAZA, nu se recompune: secretul de semnare se poate schimba, iar atunci fisierele
   * vechi ar fi devenit de negasit. Aceeasi hotarare ca la etichete si la preturile inghetate —
   * ce s-a intamplat ramane citibil.
   */
  cheie text not null,

  /* Tipul REAL, hotarat din octeti pe server. Niciodata `file.type`, care e ales de client. */
  mime text not null,
  octeti bigint not null,

  /*
   * Masurate de `sharp` la incarcare, pentru imagini. NULL la documente.
   *
   * ⚠ Se pastreaza ca sa se poata verifica DIN NOU la plasarea comenzii, fara sa se mai
   * descarce fisierul. Verificarea de la incarcare singura n-ar fi ajuns: cine cheama ruta
   * poate sari peste ea si trimite de-a dreptul un id vechi, al altui camp, cu alta marime.
   */
  latime integer,
  inaltime integer,

  /* Numele dat de om, doar ca sa stie atelierul ce a primit. Nu intra in nicio cale. */
  nume text,

  /*
   * ⚠ SCRIS LA PLASAREA COMENZII, NU LA INCARCARE. Pana atunci randul e orfan si se matura.
   *
   * `on delete set null`, nu `cascade`: o comanda stearsa nu are voie sa ia cu ea fisierul in
   * aceeasi clipa — devine orfan si pleaca la urmatoarea maturare, cu aceeasi zi de rabdare ca
   * oricare altul. Un `cascade` ar fi sters obiectul din R2 fara sa treaca pe la nimeni.
   */
  comanda_id uuid references public.orders(id) on delete set null,

  creat_la timestamptz not null default now(),

  constraint configurator_fisiere_cheie_check check (btrim(cheie) <> ''),
  constraint configurator_fisiere_mime_check check (btrim(mime) <> ''),
  /*
   * ⚠ Plafonul e si in baza, nu doar in cod. Ruta il verifica, dar ea nu e singurul drum care
   * poate ajunge vreodata la tabel; iar un `octeti` gresit ar fi trecut mai departe in
   * verificarea de la plasare, care compara cu limita nodului.
   */
  constraint configurator_fisiere_octeti_check check (octeti > 0 and octeti <= 26214400)
);

/* Maturarea cauta exact asta: orfanii, in ordinea vechimii. Partial, ca sa nu tina in el si
   fisierele legate de comenzi — care sunt, in timp, aproape toate. */
create index if not exists configurator_fisiere_orfani_idx
  on public.configurator_fisiere (creat_la) where comanda_id is null;

create index if not exists configurator_fisiere_comanda_idx
  on public.configurator_fisiere (comanda_id) where comanda_id is not null;

create index if not exists configurator_fisiere_magazin_idx
  on public.configurator_fisiere (business_id, creat_la desc);

-- ── Granturi si RLS ───────────────────────────────────────────────────────
--
-- ⚠ Tabelele noi din `public` sunt DESCHISE din oficiu: proiectul are `alter default privileges`
-- care da lui `anon` si `authenticated` toate drepturile pe orice tabel nou. Aici asta ar fi
-- insemnat ca `anon` poate CITI randurile — adica lista cheilor din R2 ale tuturor fisierelor
-- incarcate de toti cumparatorii din platforma.
--
-- ⚠ `anon` nu primeste NIMIC, nici macar insert. Incarcarea vine de la un vizitator fara cont,
-- dar ea NU scrie cu cheia lui: trece printr-o ruta de server care verifica octetii, masoara
-- imaginea si scrie cu `service_role`. Un `grant insert to anon` ar fi lasat pe oricine sa scrie
-- randuri cu `cheie` catre orice obiect din depozit.
--
-- `authenticated` primeste doar SELECT, cu politica de proprietar: comerciantul isi vede
-- fisierele magazinului lui. Nu scrie si nu sterge — ce nu mai e cerut de nicio comanda pleaca
-- prin maturare, nu de mana.

revoke all on table public.configurator_fisiere from anon;
revoke all on table public.configurator_fisiere from authenticated;
grant select on table public.configurator_fisiere to authenticated;
grant all on table public.configurator_fisiere to service_role;

alter table public.configurator_fisiere enable row level security;

create policy owner_select_configurator_fisiere on public.configurator_fisiere
  for select using (business_id in (
    select id from public.businesses where user_id = (select auth.uid())));

comment on table public.configurator_fisiere is
  'Fisierele incarcate de CUMPARATORI intr-un configurator. Randul se naste orfan si se leaga de comanda la plasare; ce ramane orfan o zi se matura. Servite doar prin ruta autentificata, niciodata public de pe CDN.';
comment on column public.configurator_fisiere.cheie is
  'Cheia din R2, cu semnatura HMAC in nume. Se pastreaza, nu se recompune: secretul se poate schimba.';
comment on column public.configurator_fisiere.comanda_id is
  'Scris la PLASAREA comenzii. NULL = orfan, se matura dupa o zi.';

commit;

notify pgrst, 'reload schema';

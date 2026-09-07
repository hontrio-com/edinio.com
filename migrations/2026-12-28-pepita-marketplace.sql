-- ═══════════════════════════════════════════════════════════════════════════
-- PEPITA: FEEDURI DE CATALOG SI COMENZI IMPINSE DE EI
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Pepita nu se leaga ca celelalte marketplace-uri din Edinio. eMAG, Trendyol, About You si OLX
-- au API-uri in amandoua sensurile, deci au cozi, cursoare si loturi. Pepita are exact doua cai,
-- si documentatia lor publica (verificata 08.09.2026) nu descrie nicio alta:
--
--   Edinio -> Pepita : doua feeduri XML pe care le CITESC ei (produse, o data pe zi; stoc, o data
--                      pe ora). Nu trimitem noi nimic, deci nu exista coada si nu exista cron.
--   Pepita -> Edinio : comanda, IMPINSA pe o adresa a noastra. Un singur sens: „Direction of
--                      communication: Pepita -> Partner store (push)".
--
-- ⚠ NU EXISTA drum inapoi pentru comenzi: nici confirmare, nici anulare, nici status, nici AWB,
-- nici retur, nici decontari. Confirmarea se face in panoul lor, in cel mult o zi. De aceea
-- tabelele de aici nu au nicio coloana de „trimis la ei": n-ar avea ce sa poarte.
--
-- ⚠ SI DE ACEEA VARIANTELE PLEACA APLATIZATE. Feedul lor cunoaste variatii, dar nu da niciun
-- identificator pe variatie, iar comanda ne trimite inapoi un `sku` pe linie. Un produs trimis cu
-- variatii ar veni deci inapoi fara sa se stie CE combinatie s-a vandut, si am scadea stocul de pe
-- alta marime. Aplatizat, fiecare combinatie are `<Id>`-ul ei si drumul inapoi e exact.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. CONFIGURAREA
-- ═══════════════════════════════════════════════════════════════════════════

alter table privat.store_settings
  add column if not exists pepita_config jsonb default '{}'::jsonb not null;

comment on column privat.store_settings.pepita_config is
  'Integrarea Pepita: piata, strategia de pret, stocul de siguranta, termenul si costul de transport, si cele doua chei (criptate).';

/*
 * ⚠ CHEILE SE CRIPTEAZA IN REPAUS, ca orice credentiala.
 *
 * `store_settings` e o vedere care decripteaza, iar din 05.08.2026 NU decripteaza pentru
 * `anon`/`authenticated`. Deci pe clientul comerciantului cheile ies ca `enc.v1.…` si trebuie
 * citite cu clientul de sistem, dupa ce proprietatea a fost dovedita separat. Exact ca
 * `notice_config.webhook_secret`, singurul alt secret pe care omul TREBUIE sa-l si vada.
 */
insert into privat.campuri_secrete (coloana, cale) values
  ('pepita_config', 'feed_token'),
  ('pepita_config', 'order_key')
on conflict do nothing;

/*
 * ⚠ SI VEDEREA TREBUIE REFACUTA, altfel coloana noua nu se vede prin ea si nimic nu o poate citi
 * sau scrie. A doua functie reface declansatorul de UPDATE, care cripteaza la scriere.
 */
select privat.reconstruieste_store_settings();
select privat.reconstruieste_store_settings_upd();

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. CHEILE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ AICI STA NUMAI AMPRENTA, niciodata cheia. O scurgere a tabelei nu da nimanui acces la niciun
-- feed si la nicio adresa de comenzi. Valoarea in clar sta o singura data, criptata, in
-- `pepita_config`, fiindca omul trebuie sa si-o poata copia in mesajul catre Pepita.
--
-- ⚠ ROTIREA NU STERGE, pune `revocat_la`. Asa se poate raspunde la „de ce nu mai merge feedul", si
-- asa se vede ca s-a incercat o cheie veche. Cautarea cere `revocat_la is null`, deci cheia veche
-- moare in aceeasi clipa.

create table if not exists public.pepita_chei (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  -- 'feed' deschide cele doua feeduri, 'comenzi' deschide adresa care CREEAZA comenzi.
  -- ⚠ Separate dinadins: cheia de feed ajunge in mesaje si pe ecran, deci nu trebuie sa poata
  -- crea nimic.
  fel text not null check (fel in ('feed', 'comenzi')),
  amprenta text not null,
  creat_la timestamp with time zone default now() not null,
  revocat_la timestamp with time zone,
  /*
   * ⚠ SINGURUL LUCRU PE CARE IL STIM DESPRE EI: cand au citit ultima oara.
   *
   * Nu exista niciun API Pepita de stare, deci „integrarea merge" nu se poate afla intrebandu-i.
   * Se poate afla insa daca au trecut pe la noi. Fara marcajul asta, un comerciant care a trimis
   * adresele si asteapta nu are cum sa deosebeasca „Pepita inca nu a activat conexiunea" de
   * „citesc de doua saptamani si nu se vinde nimic".
   */
  ultima_folosire timestamp with time zone
);

comment on table public.pepita_chei is
  'Amprentele (SHA-256) cheilor Pepita. Valoarea in clar nu se afla aici niciodata.';

/*
 * ⚠ UNIC PE AMPRENTA, si asta e chiar paza impotriva coliziunilor intre magazine: doua magazine
 * n-au cum sa ajunga la aceeasi cheie, iar daca s-ar intampla, insertul cade in loc sa deschida
 * feedul unuia cu cheia celuilalt.
 */
create unique index if not exists pepita_chei_amprenta_idx on public.pepita_chei (amprenta);

-- Cautarea de la fiecare cerere: amprenta + fel + nerevocata.
create index if not exists pepita_chei_active_idx
  on public.pepita_chei (business_id, fel) where revocat_la is null;

alter table public.pepita_chei enable row level security;
/*
 * ⚠ NICIO POLITICA, dinadins. Nimeni in afara de cheia de serviciu n-are ce citi aici: nici macar
 * proprietarul, fiindca amprenta nu-i spune nimic si valoarea o are oricum in configurare. Cu RLS
 * pornit si fara politici, `anon` si `authenticated` primesc zero randuri.
 */

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. CE PRODUSE PLEACA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ RANDUL EXISTA DOAR CAND SE ABATE DE LA IMPLICIT. Modul din configurare („toate produsele
-- active" sau „doar cele alese") da regula, iar tabela tine exceptiile si suprascrierile. Un rand
-- pentru fiecare produs al fiecarui magazin ar fi milioane de randuri care nu spun nimic.

create table if not exists public.pepita_listari (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  inclus boolean not null default true,
  -- Stocul de siguranta al produsului asta. `null` = cel al integrarii.
  safety_stock integer check (safety_stock is null or safety_stock >= 0),
  -- Pretul impus pentru Pepita, inaintea strategiei. `null` = pretul din magazin.
  pret_override numeric(10,2) check (pret_override is null or pret_override > 0),
  creat_la timestamp with time zone default now() not null,
  actualizat_la timestamp with time zone default now() not null,
  unique (business_id, product_id)
);

comment on table public.pepita_listari is
  'Abaterile de la regula generala: ce produs se include sau se scoate din feedul Pepita, si suprascrierile lui.';

-- Interogarea feedului: produsele incluse ale unui magazin.
create index if not exists pepita_listari_incluse_idx
  on public.pepita_listari (business_id, product_id) where inclus;

alter table public.pepita_listari enable row level security;

drop policy if exists owner_select_pepita_listari on public.pepita_listari;
create policy owner_select_pepita_listari on public.pepita_listari
  for select using (
    business_id in (select businesses.id from public.businesses where businesses.user_id = (select auth.uid()))
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. COMENZILE PRIMITE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ RANDUL SE SCRIE INAINTE DE PRELUCRARE, si el este idempotenta.
--
-- Panoul lor are „Resend order", deci aceeasi comanda poate veni de doua, de cinci sau de zece
-- ori. Cheia unica de mai jos face ca a doua sosire sa nu poata crea un al doilea rand, oricat de
-- concurente ar fi cererile: doua cereri simultane nu se pot „verifica intai si insera apoi" fara
-- cursa, dar amandoua nu pot castiga acelasi index unic.
--
-- ⚠ SI TOCMAI ASTA OPRESTE SCADEREA STOCULUI DE DOUA ORI, care e paguba cea mai grea: comanda
-- ramane una, iar consumul de stoc atarna de `orders.stoc_marketplace_la`, marcaj pus de
-- `consuma_stoc_comanda_marketplace` in aceeasi instructiune cu scaderea.
--
-- ⚠ CE NU SE PASTREAZA AICI: sarcina utila BRUTA. Ea contine numele, telefonul, adresa si emailul
-- cumparatorului, adica exact ce nu trebuie sa stea la nesfarsit intr-o tabela de diagnostic. Se
-- pastreaza `rezumat`, din care lipsesc datele personale, si care ajunge pentru a raspunde la „de
-- ce n-a intrat comanda asta".

create table if not exists public.pepita_comenzi (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  -- ⚠ `on delete set null`: comanda stearsa din Edinio nu sterge dovada ca a fost primita, si nici
  -- nu deschide drumul unei a doua importari a aceleiasi comenzi Pepita.
  order_id uuid references public.orders(id) on delete set null,
  external_order_id text not null,
  -- „origin" din sarcina lor utila: pepita.hu, pepita.ro. Se pastreaza asa cum vine.
  origine text,
  -- 'importata' | 'carantina' | 'respinsa'
  stare text not null default 'carantina' check (stare in ('importata', 'carantina', 'respinsa')),
  motiv text,
  rezumat jsonb not null default '{}'::jsonb,
  primit_la timestamp with time zone default now() not null,
  prelucrat_la timestamp with time zone,
  incercari integer not null default 0,
  ultima_eroare text,
  unique (business_id, external_order_id)
);

comment on table public.pepita_comenzi is
  'Comenzile primite de la Pepita. Cheia unica pe (magazin, id extern) este chiar idempotenta: „Resend order" nu poate face a doua comanda.';

-- Panoul: ultimele comenzi ale magazinului, si cele ramase in carantina.
create index if not exists pepita_comenzi_recente_idx
  on public.pepita_comenzi (business_id, primit_la desc);
create index if not exists pepita_comenzi_carantina_idx
  on public.pepita_comenzi (business_id, primit_la desc) where stare <> 'importata';

alter table public.pepita_comenzi enable row level security;

drop policy if exists owner_select_pepita_comenzi on public.pepita_comenzi;
create policy owner_select_pepita_comenzi on public.pepita_comenzi
  for select using (
    business_id in (select businesses.id from public.businesses where businesses.user_id = (select auth.uid()))
  );

notify pgrst, 'reload schema';

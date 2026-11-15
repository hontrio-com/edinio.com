-- ═══════════════════════════════════════════════════════════════════════════
-- tbi bank: plata in rate (cererea de finantare la cumparare), 15.11.2026
--
-- Clientul alege „Plata in rate prin tbi bank", comanda se scrie neplatita, iar el e trimis pe
-- pagina tbi, unde completeaza cererea de credit. tbi ne trimite fiecare schimbare de stare
-- (aprobata, in analiza, respinsa, anulata) la `back_ref`. Aprobarea marcheaza comanda platita,
-- prin aceeasi regula ca la ceilalti procesatori. Fisa: `docs/plati/TBI.md`.
--
-- ⚠ SE APLICA INAINTE DE DEPLOY. `tbi_config` intra in ACELASI select cu ceilalti procesatori
-- (checkoutul, plasarea comenzii, Setari). PostgREST respinge INTREAGA interogare cand o coloana
-- lipseste: codul pusat inaintea migratiei ar rupe checkoutul pe toate magazinele (incidentul din
-- 03.09, cu Posta si Innoship).
--
-- Aditiva: o coloana nullable si un tabel nou. Codul vechi nu le atinge.
-- ═══════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- 1. Configurarea, pe TABELUL privat (vederea se regenereaza din el)
-- ---------------------------------------------------------------------------

alter table privat.store_settings
  add column if not exists tbi_config jsonb;

comment on column privat.store_settings.tbi_config is
  'tbi bank: {enabled, sandbox, store_id, username, password (secret), cheie_publica_tbi, '
  'cheie_privata (secret), suma_minima, suma_maxima, promo, categorie, banner_produs}. store_id = providerCode. '
  'cheie_publica_tbi = pub.pem din arhiva Chei_SFTL_ (cripteaza cererile); cheie_privata = priv_key.pem '
  'din arhiva Chei_Comerciant_ (descifreaza vestile). Vezi src/lib/tbi/config.ts.';

insert into privat.campuri_secrete (coloana, cale) values
  ('tbi_config', 'password'),
  ('tbi_config', 'cheie_privata')
on conflict do nothing;

-- ⚠ OBLIGATORIU dupa orice modificare de coloane sau de campuri secrete.
select privat.reconstruieste_store_settings();
select privat.reconstruieste_store_settings_upd();

-- ---------------------------------------------------------------------------
-- 2. Cererile de finantare, cate una pe INCERCARE
-- ---------------------------------------------------------------------------
--
-- ⚠ TABEL, NU COLOANE PE `orders`. O comanda poate avea mai multe cereri: clientul respins sau
-- razgandit poate incerca din nou, iar o veste de aprobare poate sosi pentru o cerere VECHE (omul
-- a terminat-o intr-un alt tab). Cu o singura coloana, cererea noua ar fi sters legatura cu cea
-- veche, si aprobarea ei s-ar fi pierdut.
--
-- `id` pleaca la tbi drept `order_id` („whole number"). Porneste de la 700000001: mediul lor de
-- test e COMUN tuturor celor care integreaza (magazinul `tbitestapi_ro`), iar exemplele lor folosesc
-- numere de noua cifre de la 1; asa nu ne lovim de ale altora. Ramane sub plafonul unui `int` pe
-- 32 de biti, in caz ca ei il tin asa. (Schema din Git nu poarta valoarea de pornire: refacuta pe o
-- baza goala, numaratoarea reincepe de la 1, ceea ce conteaza doar pentru mediul de test.)
--
-- `jeton_hash`: SHA-256 al jetonului secret din `back_ref` (`/api/tbi/notificare/<jeton>`). Jetonul
-- intra in cererea CRIPTATA, deci il stiu doar tbi si serverul nostru, iar in baza sta doar
-- amprenta lui. O veste se primeste numai pe un jeton cunoscut SI numai daca, descifrata cu cheia
-- magazinului, spune chiar `order_id`-ul cererii de pe acel jeton.
--
-- `order_id` cu `on delete set null`, plus copia lui `order_number`: stergerea comenzii nu sterge
-- dovada ca exista o cerere de credit (lectia registrului de operatii externe).

create table if not exists public.tbi_cereri (
  id bigint generated always as identity (start with 700000001) primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  order_number text not null,
  jeton_hash text not null,
  mediu text not null,
  suma numeric(12,2) not null,
  stare text not null default 'creata',
  motiv text,
  adresa_cerere text,
  ultima_veste_la timestamptz,
  anulare_ceruta_la timestamptz,
  istoric jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tbi_cereri_jeton_unic unique (jeton_hash),
  constraint tbi_cereri_mediu_check check (mediu = any (array['test', 'live']::text[])),
  constraint tbi_cereri_suma_check check (suma > 0),
  constraint tbi_cereri_stare_check check (stare = any (array[
    'creata', 'trimisa', 'in_analiza', 'aprobata', 'respinsa', 'anulata', 'eroare'
  ]::text[])),
  constraint tbi_cereri_istoric_check check (jsonb_typeof(istoric) = 'array')
);

comment on table public.tbi_cereri is
  'Cererile de finantare tbi bank, cate una pe incercare. id = order_id trimis la tbi. '
  'jeton_hash = SHA-256 al jetonului din back_ref. istoric = vestile primite (stare, motiv, clipa), '
  'fara date personale. Vezi src/lib/tbi/ si docs/plati/TBI.md.';
comment on column public.tbi_cereri.stare is
  'creata (scrisa inaintea apelului) | trimisa (tbi a dat adresa paginii de cerere) | in_analiza | '
  'aprobata | respinsa (refuz al bancii, cu motiv) | anulata | eroare (n-a plecat sau raspuns necunoscut).';
comment on column public.tbi_cereri.adresa_cerere is
  'Pagina tbi pe care completeaza clientul cererea (antetul Location de la Finalize).';

create index if not exists tbi_cereri_order_idx
  on public.tbi_cereri (order_id);
create index if not exists tbi_cereri_business_idx
  on public.tbi_cereri (business_id, created_at desc);
-- Cronul de anulare se uita numai la cererile in care banca mai poate hotari ceva.
create index if not exists tbi_cereri_deschise_idx
  on public.tbi_cereri (updated_at)
  where stare = any (array['creata', 'trimisa', 'in_analiza']::text[]);

create trigger set_tbi_cereri_updated_at
  before update on public.tbi_cereri
  for each row execute function public.set_updated_at();

-- Comerciantul isi vede cererile; scrie numai serverul (service role).
alter table public.tbi_cereri enable row level security;
create policy owner_select_tbi_cereri on public.tbi_cereri for select
  using (business_id in (select businesses.id from public.businesses where businesses.user_id = (select auth.uid())));
revoke insert, update, delete, truncate, references, trigger on table public.tbi_cereri from anon, authenticated;
grant select on table public.tbi_cereri to anon, authenticated;

notify pgrst, 'reload schema';

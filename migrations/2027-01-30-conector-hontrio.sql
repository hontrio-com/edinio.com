-- ═══════════════════════════════════════════════════════════════════════════
-- HONTRIO: LEGATURA UNUI MAGAZIN EDINIO CU PLATFORMA DE RECLAME
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Hontrio (hontrio.com) conduce campanii Google Ads pentru magazine online. Ca sa le poata conduce
-- pentru un magazin Edinio, CITESTE trei lucruri: datele magazinului, catalogul (cu ofertele exact
-- asa cum pleaca la Merchant Center) si comenzile cu sursa lor. Nu scrie nimic in Edinio.
--
-- Legatura e un OAuth 2.0 cu cod de autorizare si PKCE (RFC 6749 + RFC 7636). Edinio e serverul de
-- autorizare, iar Hontrio e singurul client:
--
--   1. Hontrio trimite omul la /api/hontrio/v1/autorizare. Cererea se tine minte intr-un cookie, ca
--      sa treaca si prin logare si prin codul din email;
--   2. comerciantul vede in panou ce cere Hontrio si apasa „Permite accesul";
--   3. Edinio scrie un COD de unica folosinta (10 minute) si il trimite inapoi la Hontrio;
--   4. Hontrio schimba codul, server la server si cu secretul lui, pe un JETON fara termen.
--
-- ⚠ NICIO TABELA DE AICI NU TINE VALOAREA IN CLAR, ca la `pepita_chei`. Codul si jetonul au 32 de
-- octeti aleatori, iar aici sta numai amprenta lor (SHA-256). O scurgere a tabelelor nu deschide
-- nimanui niciun magazin.
--
-- ⚠ SPRE DEOSEBIRE DE PEPITA, jetonul nu se mai arata nimanui, nici comerciantului: il primeste o
-- singura data Hontrio, la schimbul codului. Deci nu exista nici copie criptata in `store_settings`.
-- Pierdut, se face din nou conectarea.
--
-- Contractul intreg: docs/hontrio/CONECTOR.md.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. CONEXIUNILE
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.hontrio_conexiuni (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  -- SHA-256 al jetonului, in hex. Dupa ea se cauta la fiecare cerere a lui Hontrio.
  amprenta text not null,
  aprobat_de uuid references auth.users(id) on delete set null,
  creat_la timestamptz not null default now(),
  /*
   * ⚠ REVOCAREA NU STERGE RANDUL, ca la `pepita_chei`. Asa se poate raspunde la „de ce nu mai vede
   * Hontrio comenzile", si asa se vede ca s-a incercat un jeton vechi. Cautarea cere
   * `revocat_la is null`, deci jetonul revocat e mort din aceeasi clipa.
   */
  revocat_la timestamptz,
  motiv_revocare text check (motiv_revocare in ('comerciant', 'hontrio', 'inlocuita', 'cod_refolosit')),
  /*
   * Singurul semn ca legatura traieste: cand a citit Hontrio ultima oara. Se scrie cel mult o data
   * la cateva minute, nu la fiecare cerere: o sincronizare inseamna zeci de pagini citite la rand.
   */
  ultima_folosire timestamptz,
  constraint hontrio_conexiuni_revocare_cu_motiv check ((revocat_la is null) = (motiv_revocare is null))
);

comment on table public.hontrio_conexiuni is
  'Legaturile magazinelor cu Hontrio. Tine amprenta (SHA-256) jetonului, niciodata jetonul.';

/*
 * ⚠ UNIC PE AMPRENTA, si asta e paza impotriva coliziunilor: doua conexiuni n-au cum sa ajunga la
 * acelasi jeton, iar daca s-ar intampla, insertul cade in loc sa deschida un magazin cu jetonul
 * altuia.
 */
create unique index if not exists hontrio_conexiuni_amprenta_idx on public.hontrio_conexiuni (amprenta);

-- Conexiunea activa a unui magazin: panoul si inlocuirea la o conectare noua.
create index if not exists hontrio_conexiuni_active_idx
  on public.hontrio_conexiuni (business_id) where revocat_la is null;

alter table public.hontrio_conexiuni enable row level security;
/*
 * ⚠ NICIO POLITICA, dinadins, ca la `pepita_chei`. Doar cheia de serviciu are ce citi aici: panoul
 * citeste starea prin serverul lui, dupa ce a dovedit ca magazinul e al omului. Cu RLS pornit si fara
 * politici, `anon` si `authenticated` primesc zero randuri.
 */

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. CODURILE DE AUTORIZARE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Un cod traieste 10 minute si se schimba o singura data. Cu codul vin si cele doua lucruri pe care
-- schimbul trebuie sa le regaseasca neatinse: adresa de intoarcere (RFC 6749, 4.1.3) si provocarea
-- PKCE (RFC 7636, 4.6).
--
-- ⚠ CODUL FOLOSIT NU SE STERGE LA SCHIMB. Daca vine a doua oara, cineva l-a prins pe drum, iar
-- RFC 6749 (10.5) cere ca jetonul dat pe el sa fie revocat. Fara randul folosit, a doua venire ar
-- arata exact ca un cod inventat si n-am sti ce conexiune sa stingem. De-aia exista `conexiune_id`.

create table if not exists public.hontrio_coduri (
  amprenta text primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  aprobat_de uuid references auth.users(id) on delete set null,
  redirect_uri text not null,
  -- S256: base64url(SHA-256(code_verifier)), 43 de caractere.
  code_challenge text not null,
  creat_la timestamptz not null default now(),
  expira_la timestamptz not null,
  folosit_la timestamptz,
  conexiune_id uuid references public.hontrio_conexiuni(id) on delete set null
);

comment on table public.hontrio_coduri is
  'Codurile de autorizare Hontrio (10 minute, o singura folosire). Tine amprenta codului, niciodata codul.';

-- Curatenia codurilor vechi, facuta la fiecare cod nou (`creeazaCod`).
create index if not exists hontrio_coduri_expira_idx on public.hontrio_coduri (expira_la);

alter table public.hontrio_coduri enable row level security;
-- Fara politici, din acelasi motiv ca mai sus.

notify pgrst, 'reload schema';

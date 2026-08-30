-- ═══════════════════════════════════════════════════════════════════════════
-- CE PRESUPUNE EDINIO CA-I DA PLATFORMA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `000-schema-baseline.sql` contine schema aplicatiei. Dar ea nu sta in gol: se
-- sprijina pe lucruri pe care Supabase le pune la crearea proiectului si pe care
-- baseline-ul NU le cuprinde. Pana acum, ce anume — nu scria nicaieri.
--
-- Fisierul asta le enumera, si are doua rosturi:
--
--   1. E CONTRACTUL, scris. Cine citeste stie exact ce trebuie sa existe inainte.
--   2. E PRELUDIUL testului de restaurare: pe un Postgres gol se aplica intai
--      asta, apoi baseline-ul, si abia atunci se poate spune „stim ca putem
--      reface Edinio", nu doar „avem schema in Git".
--
-- ⚠ NU se aplica pe un proiect Supabase adevarat. Acolo toate exista deja, iar
-- `auth.uid()` de aici e o SCHEMA GOALA de functie, nu cea adevarata. Se foloseste
-- exclusiv pentru proba pe o baza goala.

-- ── Rolurile ────────────────────────────────────────────────────────────────
-- Baseline-ul acorda drepturi exact acestor trei. Fara ele, fiecare `grant` pica.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

-- ── Schemele si extensiile ──────────────────────────────────────────────────
create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists vault;

-- Astea sunt in `contrib`, deci exista si intr-un Postgres obisnuit.
create extension if not exists pgcrypto      with schema extensions;
create extension if not exists "uuid-ossp"   with schema extensions;
create extension if not exists pg_trgm       with schema extensions;
create extension if not exists fuzzystrmatch with schema extensions;

-- `pg_graphql` si `supabase_vault` NU sunt in contrib si NU se pot instala pe un
-- Postgres obisnuit. Nici nu e nevoie: `pg_graphql` nu e folosita de nimic din
-- `public`/`privat` (verificat: zero referinte), iar din `vault` se citeste o
-- singura data, mai jos.

-- ── `auth`: ce se atinge cu adevarat ────────────────────────────────────────
--
-- Masurat in baseline: `auth.uid()` de 80 de ori (in politici RLS) si
-- `auth.users(id)` de 14 ori (chei straine). Atat. Nimic altceva din `auth`.
create table if not exists auth.users (
  id uuid primary key default extensions.uuid_generate_v4(),
  email text
);

-- Pe Supabase citeste `sub` din JWT. Aici intoarce NULL, ceea ce e ce trebuie
-- pentru o proba de structura: politicile se CREEAZA corect, dar nu lasa pe nimeni
-- sa vada nimic. Proba verifica schema, nu autentificarea.
create or replace function auth.uid() returns uuid
language sql stable as $$ select null::uuid $$;

-- ── `vault`: o singura citire ───────────────────────────────────────────────
--
-- `privat.cheie_integrari()` face `select decrypted_secret from
-- vault.decrypted_secrets where name = 'integrari_enc_key'`. Pe o baza de proba nu
-- exista cheie, deci vederea e goala — si asta e corect: proba nu are voie sa
-- decripteze nimic.
create table if not exists vault.secrets (
  id uuid primary key default extensions.uuid_generate_v4(),
  name text unique,
  secret text
);
create or replace view vault.decrypted_secrets as
  select id, name, null::text as decrypted_secret from vault.secrets;

grant usage on schema extensions to anon, authenticated, service_role;
grant usage on schema auth       to anon, authenticated, service_role;

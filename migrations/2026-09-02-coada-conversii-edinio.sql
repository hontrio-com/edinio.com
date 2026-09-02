-- ═══════════════════════════════════════════════════════════════════════════
-- COADA DE CONVERSII EDINIO (Meta CAPI + TikTok Events API)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ FISIER SCRIS RETROACTIV, pe 02.09.2026, si de aceea merita citit.
--
-- Tabela si functia au fost create in productie prin unealta de migrare a
-- Supabase, care aplica in baza dar NU scrie nimic in repo. Codul care le
-- foloseste a intrat in Git in aceeasi zi; schema, nu. Deci pentru cateva ore o
-- baza goala plus tot repo-ul nu producea Edinio — chiar lucrul impotriva caruia
-- exista `scripts/schema-baseline.sh`.
--
-- Continutul de mai jos e citit din baza vie, nu scris din amintiri.
--
-- ⚠ E FACUT SA POATA FI RULAT PESTE O BAZA CARE LE ARE DEJA.

create table if not exists public.edinio_conversion_outbox (
  id uuid not null default gen_random_uuid(),
  destinatie text not null,
  nume_eveniment text not null,
  event_id text not null,
  sarcina jsonb not null,
  incercari integer not null default 0,
  next_retry_at timestamptz not null default now(),
  trimis_la timestamptz,
  ultima_eroare text,
  abandonat_la timestamptz,
  creat_la timestamptz not null default now(),
  constraint edinio_conversion_outbox_pkey primary key (id)
);

-- ⚠ AICI STA IDEMPOTENTA. O a doua punere la coada pentru acelasi
-- (destinatie, eveniment, event_id) nu creeaza un al doilea rand — deci nici o
-- actiune reluata, nici o pagina reincarcata nu produc doua conversii.
create unique index if not exists coada_conversii_unic
  on public.edinio_conversion_outbox (destinatie, nume_eveniment, event_id);

-- Indexul partial pe care se sprijina revendicarea: doar randurile inca vii.
create index if not exists coada_conversii_de_trimis
  on public.edinio_conversion_outbox (next_retry_at)
  where trimis_la is null and abandonat_la is null;

-- ⚠ RLS PORNIT SI ZERO POLITICI = numai cheia de serviciu trece. Tiparul
-- platformei. Granturile se sting explicit: recrearea unui obiect le poate reda.
alter table public.edinio_conversion_outbox enable row level security;
revoke all on public.edinio_conversion_outbox from anon;
revoke all on public.edinio_conversion_outbox from authenticated;
grant all on public.edinio_conversion_outbox to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- REVENDICAREA MARGINITA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ DE CE IN SQL SI NU PRIN PostgREST. Masurat pe 02.09.2026, impotriva bazei
-- adevarate: `.update(...).select(...).limit(2)` a intors TREI randuri — limita
-- e ignorata pe o scriere. Iar aceeasi cerere cu `.order("next_retry_at")` cade
-- cu 42703 „column does not exist", pe o coloana care exista si pe care aceeasi
-- cerere filtreaza cu succes doua randuri mai sus.
--
-- Deci prin PostgREST revendicarea NU poate fi marginita: o rulare ar lua toata
-- coada, ar cadea in timeout, si ar lasa tot revendicat si netrimis.
create or replace function public.edinio_revendica_conversii(limita integer)
returns setof public.edinio_conversion_outbox
language sql
volatile
security invoker
set search_path = public, pg_temp
as $$
  update public.edinio_conversion_outbox o
     -- ⚠ ARENDA DE UN MINUT, nu o incuietoare: daca rularea moare la jumatate,
     -- randul se elibereaza singur. O incuietoare ar trebui desfacuta de cineva,
     -- iar cine moare nu desface nimic.
     set next_retry_at = now() + interval '1 minute'
   where o.id in (
     select c.id
       from public.edinio_conversion_outbox c
      where c.trimis_la is null
        and c.abandonat_la is null
        and c.next_retry_at <= now()
      order by c.next_retry_at asc
      limit greatest(1, least(limita, 500))
      -- ⚠ `skip locked` e mai tare decat serializarea scrierilor: a doua rulare
      -- SARE peste randurile incuiate, in loc sa astepte dupa ele.
      for update skip locked
   )
  returning o.*;
$$;

-- ⚠ RECREAREA UNEI FUNCTII II REDA LUI `anon` DREPTUL DE EXECUTE.
-- Se stinge explicit, de fiecare data; `revoke ... from public` singur nu ajunge.
revoke all on function public.edinio_revendica_conversii(integer) from public;
revoke all on function public.edinio_revendica_conversii(integer) from anon;
revoke all on function public.edinio_revendica_conversii(integer) from authenticated;
grant execute on function public.edinio_revendica_conversii(integer) to service_role;

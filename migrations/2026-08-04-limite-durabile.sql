-- ============================================================================
-- Limitare de rata DURABILA, in Postgres
--
-- DE CE: singurul limitator existent (src/lib/utils/rate-limit.ts) e o harta in
-- memoria procesului. Pe Vercel fiecare instanta calda are propria harta, deci
-- limita reala e `limita x numarul de instante`, si se reseteaza la fiecare
-- deployment sau racire. Pentru login, inregistrare si resetare de parola —
-- unde chiar conteaza sa poti bloca — asta nu e suficient.
--
-- Limitatorul din memorie RAMANE, ca prima linie ieftina (opreste rafalele fara
-- sa atinga baza). Cel de aici e a doua linie, globala si persistenta.
-- ============================================================================

begin;

create table if not exists public.rate_limits (
  cheie            text primary key,
  fereastra_start  timestamptz not null default now(),
  lovituri         integer     not null default 0,
  blocat_pana      timestamptz,
  actualizat_la    timestamptz not null default now()
);

comment on table public.rate_limits is
  'Contoare de limitare de rata, partajate intre instantele serverless. Scrise DOAR prin public.consuma_limita().';

create index if not exists rate_limits_curatare_idx
  on public.rate_limits (actualizat_la);

alter table public.rate_limits enable row level security;
-- Fara nicio politica: nimeni in afara de service_role nu ajunge la tabel.
revoke all on table public.rate_limits from anon, authenticated;

-- ---------------------------------------------------------------------------
-- consuma_limita(cheie, limita, fereastra_sec, blocare_sec)
--
-- Inregistreaza o incercare si spune daca e permisa.
--   limita        cate incercari sunt permise intr-o fereastra
--   fereastra_sec lungimea ferestrei
--   blocare_sec   daca > 0, la depasire cheia se BLOCHEAZA atat timp (blocare
--                 progresiva pentru login); daca 0, se refuza doar pana la
--                 expirarea ferestrei
--
-- `for update` serializeaza apelurile concurente pe aceeasi cheie, deci
-- numararea e atomica si nu se poate ocoli prin cereri in paralel.
-- ---------------------------------------------------------------------------
create or replace function public.consuma_limita(
  p_cheie        text,
  p_limita       integer,
  p_fereastra_sec integer,
  p_blocare_sec  integer default 0
)
returns table (permis boolean, blocat_pana timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_acum    timestamptz := clock_timestamp();
  v_start   timestamptz;
  v_lovituri integer;
  v_blocat  timestamptz;
begin
  insert into public.rate_limits (cheie, fereastra_start, lovituri)
  values (p_cheie, v_acum, 0)
  on conflict (cheie) do nothing;

  select r.fereastra_start, r.lovituri, r.blocat_pana
    into v_start, v_lovituri, v_blocat
  from public.rate_limits r
  where r.cheie = p_cheie
  for update;

  -- Blocare activa: refuzam fara sa mai numaram (altfel incercarile in rafala
  -- ar prelungi blocarea la nesfarsit pentru un utilizator care doar reincarca).
  if v_blocat is not null and v_blocat > v_acum then
    return query select false, v_blocat;
    return;
  end if;

  -- Fereastra expirata -> o luam de la capat.
  if v_start < v_acum - make_interval(secs => p_fereastra_sec) then
    v_start := v_acum;
    v_lovituri := 0;
  end if;

  v_lovituri := v_lovituri + 1;
  v_blocat := null;

  if v_lovituri > p_limita and p_blocare_sec > 0 then
    v_blocat := v_acum + make_interval(secs => p_blocare_sec);
  end if;

  update public.rate_limits
     set fereastra_start = v_start,
         lovituri        = v_lovituri,
         blocat_pana     = v_blocat,
         actualizat_la   = v_acum
   where cheie = p_cheie;

  return query select (v_lovituri <= p_limita), v_blocat;
end;
$$;

-- Nu e apelabila din browser: doar codul de server (service role) o foloseste.
revoke execute on function public.consuma_limita(text, integer, integer, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- reseteaza_limita(cheie) — dupa o autentificare REUSITA, ca sa nu ramana
-- utilizatorul legitim pedepsit pentru incercarile de dinainte.
-- ---------------------------------------------------------------------------
create or replace function public.reseteaza_limita(p_cheie text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.rate_limits where cheie = p_cheie;
$$;

revoke execute on function public.reseteaza_limita(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- curata_limite() — chemata din cronul orar; tine tabelul mic.
-- ---------------------------------------------------------------------------
create or replace function public.curata_limite()
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
  with sterse as (
    delete from public.rate_limits
    where actualizat_la < now() - interval '24 hours'
      and (blocat_pana is null or blocat_pana < now())
    returning 1
  )
  select coalesce(count(*), 0)::integer from sterse;
$$;

revoke execute on function public.curata_limite() from public, anon, authenticated;

commit;

-- ----------------------------------------------------------------------------
-- OBLIGATORIU dupa orice GRANT/REVOKE pe coloane.
--
-- PostgREST tine in cache privilegiile pe coloane. Fara reincarcare, o cerere
-- care numeste o coloana proaspat re-acordata poate fi respinsa desi in baza
-- dreptul EXISTA — iar supabase-js intoarce `data: null` cu `error` setat, deci
-- codul care nu verifica `error` vede pur si simplu „nu exista nimic".
--
-- Asa s-a rupt autentificarea cu MFA pe 04.08.2026: codul era scris in baza si
-- valabil, dar citirea intorcea gol, iar utilizatorul primea „Codul a expirat".
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';


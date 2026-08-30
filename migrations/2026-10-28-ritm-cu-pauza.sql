-- ══════════════════════════════════════════════════════════════════════════
-- CAND FURNIZORUL SPUNE „PREA REPEDE", TAC TOATE INSTANTELE (26.08.2026)
-- ══════════════════════════════════════════════════════════════════════════
--
-- `ia_jeton_extern` numara cererile intr-un singur loc, deci toate instantele impart acelasi
-- buget. Bun. Dar nu stia sa faca un lucru: cand furnizorul raspunde 429, sa TACA toata lumea.
--
-- Fara asta, prima instanta ia 429, se opreste, si celelalte trei continua sa bata la aceeasi
-- usa — fiecare pana isi arde propriile jetoane. La Trendyol conteaza dublu: din 14 septembrie
-- 2026 limitele lor trec pe grupuri de servicii, per vanzator, iar cererile respinse se
-- numara si ele.
--
-- ⚠ PAUZA E PE CHEIE, deci pe acelasi lucru pe care se numara si jetoanele: contul si grupul
-- de servicii. O pauza pe „scrieri de produs" nu opreste citirea comenzilor.
--
-- ⚠ SE CADE DESCHIS MAI DEPARTE. Daca baza nu raspunde, cererea pleaca: regula scrisa in
-- `ritm.ts` ramane intreaga — un contor cazut e o problema de observat, nu una care are voie
-- sa taie legatura cu marketplace-ul.

alter table privat.ritm_extern add column if not exists pauza_pana timestamptz;

comment on column privat.ritm_extern.pauza_pana is
  'Furnizorul ne-a spus sa tacem pana atunci (429 / Retry-After). Toate instantele o vad.';

-- ── Jetonul stie acum si de pauza ─────────────────────────────────────────────
create or replace function public.ia_jeton_extern(
  p_cheie text, p_limita integer, p_fereastra_ms integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'privat', 'pg_temp'
as $function$
declare
  v_acum     bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_fer      bigint;
  v_folosite int;
  v_pauza    timestamptz;
begin
  if coalesce(btrim(p_cheie), '') = '' then
    raise exception 'cheie de ritm lipsa';
  end if;
  if p_limita is null or p_limita < 1 then
    raise exception 'limita de ritm invalida: %', p_limita;
  end if;
  if p_fereastra_ms is null or p_fereastra_ms < 1 then
    raise exception 'fereastra de ritm invalida: %', p_fereastra_ms;
  end if;

  -- ⚠ PAUZA SE VERIFICA INTAI, si NU consuma jeton: cat timp furnizorul ne-a spus sa tacem,
  -- o cerere in plus nu e doar inutila, ci se si numara la ei ca cerere respinsa.
  select pauza_pana into v_pauza from privat.ritm_extern where cheie = p_cheie;
  if v_pauza is not null and v_pauza > now() then
    return jsonb_build_object(
      'ok', false,
      'asteapta_ms', greatest(1, (extract(epoch from (v_pauza - now())) * 1000)::int),
      'folosite', 0, 'limita', p_limita, 'pauza', true);
  end if;

  insert into privat.ritm_extern (cheie, fereastra_ms, folosite, actualizat_la)
  values (p_cheie, v_acum, 1, now())
  on conflict (cheie) do update
    set fereastra_ms = case
          when v_acum - privat.ritm_extern.fereastra_ms >= p_fereastra_ms then v_acum
          else privat.ritm_extern.fereastra_ms end,
        folosite = case
          when v_acum - privat.ritm_extern.fereastra_ms >= p_fereastra_ms then 1
          else privat.ritm_extern.folosite + 1 end,
        actualizat_la = now()
  returning fereastra_ms, folosite into v_fer, v_folosite;

  if v_folosite <= p_limita then
    return jsonb_build_object(
      'ok', true, 'asteapta_ms', 0, 'folosite', v_folosite, 'limita', p_limita);
  end if;

  return jsonb_build_object(
    'ok', false,
    'asteapta_ms', greatest(1, (v_fer + p_fereastra_ms - v_acum))::int,
    'folosite', v_folosite,
    'limita', p_limita);
end;
$function$;

-- ── Cine a luat 429 o spune tuturor ──────────────────────────────────────────
--
-- ⚠ NU SE SCURTEAZA O PAUZA EXISTENTA: `greatest` pastreaza cea mai lunga. Doua instante care
-- iau 429 in aceeasi secunda, una cu `Retry-After: 60` si alta fara antet, n-au voie sa se
-- calce — cea care stie mai mult trebuie sa castige.
create or replace function public.pune_pauza_ritm_extern(p_cheie text, p_ms integer)
returns timestamptz
language plpgsql
security definer
set search_path to 'public', 'privat', 'pg_temp'
as $function$
declare
  v_pana timestamptz;
begin
  if coalesce(btrim(p_cheie), '') = '' then
    raise exception 'cheie de ritm lipsa';
  end if;
  -- ⚠ Plafon de cinci minute: un `Retry-After` urias sau stalcit n-are voie sa opreasca un
  -- magazin pe ore intregi. Daca ei chiar tin usa inchisa, urmatorul 429 pune alta pauza.
  v_pana := now() + make_interval(secs => least(greatest(coalesce(p_ms, 0), 1000), 300000) / 1000.0);

  insert into privat.ritm_extern (cheie, fereastra_ms, folosite, actualizat_la, pauza_pana)
  values (p_cheie, (extract(epoch from clock_timestamp()) * 1000)::bigint, 0, now(), v_pana)
  on conflict (cheie) do update
    set pauza_pana = greatest(coalesce(privat.ritm_extern.pauza_pana, v_pana), v_pana),
        actualizat_la = now()
  returning pauza_pana into v_pana;

  return v_pana;
end;
$function$;

-- ⚠ `security definer` peste o tabela din `privat`: fara revoke, EXECUTE ramane la PUBLIC
-- dupa fiecare `create or replace`.
revoke execute on function public.ia_jeton_extern(text, integer, integer) from public, anon, authenticated;
grant execute on function public.ia_jeton_extern(text, integer, integer) to service_role;
revoke execute on function public.pune_pauza_ritm_extern(text, integer) from public, anon, authenticated;
grant execute on function public.pune_pauza_ritm_extern(text, integer) to service_role;

notify pgrst, 'reload schema';

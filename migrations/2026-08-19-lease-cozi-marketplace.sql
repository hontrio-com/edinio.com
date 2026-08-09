-- ═══════════════════════════════════════════════════════════════════════════
-- COZILE DE MARKETPLACE: randurile se REVENDICA, nu doar se citesc
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Cele patru cronuri (GMC, OLX, Trendyol, About You) pornesc din MINUT IN MINUT
-- si fac apeluri externe care pot dura. Tiparul era:
--
--     SELECT primele N -> apel extern -> DELETE
--
-- Daca o rulare depaseste un minut, urmatoarea CITESTE ACELEASI randuri si trimite
-- a doua oara la marketplace. Cozile sunt goale azi, deci cursa e latenta — dar se
-- deschide exact atunci cand cozile se umplu, adica atunci cand conteaza.
alter table public.gmc_sync_queue      add column if not exists revendicat_pana timestamptz;
alter table public.olx_sync_queue      add column if not exists revendicat_pana timestamptz;
alter table public.trendyol_sync_queue add column if not exists revendicat_pana timestamptz;
alter table public.aboutyou_sync_queue add column if not exists revendicat_pana timestamptz;

create index if not exists idx_gmc_queue_revendicat      on public.gmc_sync_queue (revendicat_pana, created_at);
create index if not exists idx_olx_queue_revendicat      on public.olx_sync_queue (revendicat_pana, created_at);
create index if not exists idx_trendyol_queue_revendicat on public.trendyol_sync_queue (revendicat_pana, created_at);
create index if not exists idx_aboutyou_queue_revendicat on public.aboutyou_sync_queue (revendicat_pana, created_at);

create or replace function public.revendica_din_coada(
  p_coada  text,
  p_limita int default 50,
  p_lease  interval default interval '5 minutes'
) returns setof jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_permise constant text[] := array[
    'gmc_sync_queue', 'olx_sync_queue', 'trendyol_sync_queue', 'aboutyou_sync_queue'];
begin
  /*
   * `for update skip locked` face ca al doilea lucrator sa treaca peste ce e
   * incuiat, in loc sa astepte: ia randurile URMATOARE, deci munca merge in
   * paralel fara sa se calce.
   *
   * `revendicat_pana` e a doua plasa: daca un lucrator moare la mijloc (limita de
   * timp a functiei), lacatul dispare odata cu tranzactia, dar marcajul ramane si
   * tine randul deoparte cinci minute. Fara el, un rand mereu picat ar fi reluat
   * de fiecare rulare, la nesfarsit.
   *
   * ⚠ `AS MATERIALIZED` NU E DECOR — si asta a fost gasit prin proba, nu prin
   * citit.
   *
   * Prima forma avea subinterogarea direct in
   * `where id in (select ... limit N for update skip locked)`. Masurat pe o coada
   * de 6 randuri, cu `limit 3`: revendica TOATE SASE. Postgres re-evalueaza
   * subinterogarea in planul de semi-join, iar `LIMIT` isi pierde intelesul.
   * Rezultatul ar fi fost exact pe dos decat scopul: un singur lucrator ar fi
   * inhatat toata coada si ar fi tinut-o cinci minute.
   *
   * Dovedit izolat, pe aceleasi date: subinterogarea singura -> 3 randuri;
   * cu CTE materializat -> 3; inline -> 6.
   *
   * Numele tabelei se compune dinamic, deci trece printr-o lista PERMISA. Cu una
   * interzisa, o coada noua ar fi fost acceptata din prima zi fara sa se uite
   * nimeni la ea.
   */
  if not (p_coada = any(v_permise)) then
    raise exception 'coada necunoscuta: %', p_coada;
  end if;

  return query execute format($f$
    with alese as materialized (
      select c.id from public.%I c
       where c.revendicat_pana is null or c.revendicat_pana < now()
       order by c.created_at
       limit $2
       for update skip locked)
    update public.%I q
       set revendicat_pana = now() + $1
      from alese a
     where q.id = a.id
    returning to_jsonb(q.*)
  $f$, p_coada, p_coada) using p_lease, p_limita;
end;
$$;

revoke all on function public.revendica_din_coada(text, int, interval) from public, anon, authenticated;
grant execute on function public.revendica_din_coada(text, int, interval) to service_role;

notify pgrst, 'reload schema';

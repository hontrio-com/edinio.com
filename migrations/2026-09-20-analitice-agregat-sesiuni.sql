-- ═══════════════════════════════════════════════════════════════════════════
-- SESIUNILE SE STRANG ZILNIC, INAINTE SA SE STEARGA RANDURILE BRUTE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ DE CE NU AJUNGE AGREGATUL DE ACUM.
--
-- `business_daily_stats` numara EVENIMENTE pe (zi, fel, dispozitiv, sursa).
-- „Cate sesiuni" nu se aduna din „cate afisari": doua randuri de cate 3 afisari
-- pot fi 1 sesiune sau 6. Iar randurile brute din `site_analytics` se sterg
-- dupa 8 zile (`curata_analitice_brute`).
--
-- Fara tabelele de mai jos, pagina Statistici ar fi aratat vizitatori unici si
-- rata de conversie corect o saptamana, si le-ar fi vazut cazand la zero in a
-- noua zi - exact felul de defect care se descopera peste doua luni.
--
-- ⚠ SE UMPLU DIN ACEEASI FUNCTIE care strange zilele (`agregeaza_analitice`),
-- nu dintr-un cron nou. Cronul de acum garanteaza deja ordinea „intai aduni,
-- apoi stergi"; un al doilea cron ar fi trebuit sa se potriveasca cu el, si
-- prima nepotrivire ar fi sters o zi nestransa.

-- ── Pe magazin si zi ────────────────────────────────────────────────────────
create table if not exists public.analitice_zilnic (
  business_id uuid not null references public.businesses(id) on delete cascade,
  zi date not null,
  vizitatori integer not null default 0,
  sesiuni integer not null default 0,
  afisari integer not null default 0,
  sesiuni_cu_comanda integer not null default 0,
  primary key (business_id, zi)
);

comment on table public.analitice_zilnic is
  'Sesiuni si vizitatori unici pe zi. Se umple din agregeaza_analitice(), inainte de stergerea randurilor brute.';

-- ── Pe sursa si dispozitiv ──────────────────────────────────────────────────
-- ⚠ Sursa unei SESIUNI e cea a PRIMULUI ei eveniment. O sesiune poate avea mai
-- multe (cineva intra din Google si revine din Facebook); numarata la fiecare,
-- aceeasi sesiune ar fi aparut de doua ori si suma surselor ar fi depasit
-- totalul.
create table if not exists public.analitice_zilnic_sursa (
  business_id uuid not null references public.businesses(id) on delete cascade,
  zi date not null,
  source text not null default '',
  device text not null default '',
  sesiuni integer not null default 0,
  sesiuni_cu_comanda integer not null default 0,
  primary key (business_id, zi, source, device)
);

alter table public.analitice_zilnic       enable row level security;
alter table public.analitice_zilnic_sursa enable row level security;

-- Proprietarul isi vede zilele lui. Scrierea ramane doar a lui `service_role`
-- (cronul), deci nicio politica de INSERT sau UPDATE.
create policy "Proprietarii isi vad sesiunile stranse"
  on public.analitice_zilnic for select
  using (exists (select 1 from public.businesses b
                  where b.id = analitice_zilnic.business_id and b.user_id = auth.uid()));

create policy "Proprietarii isi vad sursele stranse"
  on public.analitice_zilnic_sursa for select
  using (exists (select 1 from public.businesses b
                  where b.id = analitice_zilnic_sursa.business_id and b.user_id = auth.uid()));

-- ── Agregarea, acum si pe sesiuni ───────────────────────────────────────────
/*
  ⚠ `p_zile` RAMANE MIC (cronul cheama cu 2).

  Functia STERGE si rescrie zilele atinse. Chemata in productie cu 30, ar sterge
  30 de zile de agregat si ar putea rescrie doar ultimele 8, fiindca randurile
  brute mai vechi de atat nu mai exista. Asta era adevarat si inainte pentru
  `business_daily_stats`; acum e adevarat si pentru sesiuni, deci merita scris.
*/
create or replace function public.agregeaza_analitice(p_zile int default 2)
returns int
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_de_la date := (now() at time zone 'Europe/Bucharest')::date - greatest(coalesce(p_zile, 2), 1) + 1;
  v_scrise int;
begin
  -- ── 1. Evenimente pe fel/dispozitiv/sursa (ca pana acum) ──
  delete from public.business_daily_stats where zi >= v_de_la;

  insert into public.business_daily_stats (business_id, zi, event_type, device, source, nr)
  select a.business_id,
         (a.created_at at time zone 'Europe/Bucharest')::date as zi,
         a.event_type,
         coalesce(a.device, ''),
         coalesce(a.source, ''),
         count(*)
    from public.site_analytics a
   where (a.created_at at time zone 'Europe/Bucharest')::date >= v_de_la
     and exists (select 1 from public.businesses b where b.id = a.business_id)
   group by 1, 2, 3, 4, 5;

  get diagnostics v_scrise = row_count;

  -- ── 2. Sesiuni si vizitatori pe zi ──
  delete from public.analitice_zilnic where zi >= v_de_la;

  insert into public.analitice_zilnic (business_id, zi, vizitatori, sesiuni, afisari, sesiuni_cu_comanda)
  select a.business_id,
         (a.created_at at time zone 'Europe/Bucharest')::date as zi,
         count(distinct a.visitor_id),
         count(distinct a.session_id),
         count(*) filter (where a.event_type = 'visit'),
         count(distinct a.session_id) filter (where a.event_type = 'purchase')
    from public.site_analytics a
   where (a.created_at at time zone 'Europe/Bucharest')::date >= v_de_la
     and a.session_id is not null
     and exists (select 1 from public.businesses b where b.id = a.business_id)
   group by 1, 2;

  -- ── 3. Sesiuni pe sursa si dispozitiv, dupa PRIMUL eveniment al sesiunii ──
  delete from public.analitice_zilnic_sursa where zi >= v_de_la;

  insert into public.analitice_zilnic_sursa (business_id, zi, source, device, sesiuni, sesiuni_cu_comanda)
  with prima as (
    select distinct on (a.business_id, a.session_id)
           a.business_id,
           a.session_id,
           (a.created_at at time zone 'Europe/Bucharest')::date as zi,
           coalesce(a.source, '') as source,
           coalesce(a.device, '') as device
      from public.site_analytics a
     where (a.created_at at time zone 'Europe/Bucharest')::date >= v_de_la
       and a.session_id is not null
       and exists (select 1 from public.businesses b where b.id = a.business_id)
     order by a.business_id, a.session_id, a.created_at
  ),
  cu_comanda as (
    select distinct business_id, session_id
      from public.site_analytics
     where event_type = 'purchase'
       and (created_at at time zone 'Europe/Bucharest')::date >= v_de_la
       and session_id is not null
  )
  select p.business_id, p.zi, p.source, p.device,
         count(*),
         count(*) filter (where c.session_id is not null)
    from prima p
    left join cu_comanda c on c.business_id = p.business_id and c.session_id = p.session_id
   group by 1, 2, 3, 4;

  return v_scrise;
end;
$$;

revoke all on function public.agregeaza_analitice(int) from public, anon, authenticated;
grant execute on function public.agregeaza_analitice(int) to service_role;

notify pgrst, 'reload schema';

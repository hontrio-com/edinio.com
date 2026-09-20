-- ═══════════════════════════════════════════════════════════════════════════
-- CELE PATRU CARDURI DIN CAPUL PANOULUI (20.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Comenzi azi, Vanzari luna aceasta, Valoare medie comanda, Rata de conversie.
-- Fiecare cu diferenta procentuala fata de perioada dinainte.
--
-- ⚠ DE CE O SINGURA FUNCTIE, si nu cele sase interogari de pana acum.
-- Cardurile se compara intre ele cu ochiul: media e vanzarile impartite la
-- comenzi, conversia e comenzile impartite la vizite. Daca fiecare numar vine
-- din alta interogare, cu alta margine de zi, cele patru cifre de pe ecran nu
-- mai sunt ale aceleiasi perioade, iar impartirile dintre ele ies gresite fara
-- ca nimic sa dea eroare.
--
-- ⚠ ZIUA E CEA ROMANEASCA. Pana acum marginile veneau din `toISOString()`, adica
-- ziua UTC: „Comenzi azi" se schimba la 03:00 noaptea vara, nu la miezul noptii.
--
-- ⚠ „IERI" INSEAMNA IERI PANA LA ACEEASI ORA, nu ziua intreaga.
-- Comparata cu ziua intreaga de ieri, dimineata ar fi aratat mereu scadere, iar
-- seara mereu crestere, doar din trecerea timpului. La 10 dimineata se compara
-- ce s-a vandut azi pana la 10 cu ce se vanduse ieri pana la 10.
--
-- ⚠ „LUNA TRECUTA" INSEAMNA ACELEASI ZILE DIN LUNA TRECUTA (1 - azi), nu luna
-- intreaga. Pe 3 ale lunii, trei zile fata de treizeci si una ar fi aratat -90%
-- la orice magazin sanatos.
--
-- ⚠ VIZITELE SE ADUNA DIN DOUA LOCURI, exact ca in `site_analytics_breakdown_zile`:
-- zilele incheiate stau stranse in `business_daily_stats`, iar ziua de azi in
-- `site_analytics` brut. Citita o singura tabela, cifra ar fi fost ori fara azi,
-- ori fara restul lunii. Si trebuie sa fie ACEEASI regula ca la pagina Statistici,
-- altfel doua ecrane ale aceluiasi magazin ar arata doua rate de conversie.
--
-- ⚠ SECURITY INVOKER (implicit): RLS de pe `orders`, `site_analytics` si
-- `business_daily_stats` ramane poarta. `p_business` e filtru, nu permisiune.

create or replace function public.panou_carduri(p_business uuid)
returns jsonb
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  with f as (
    select
      (now() at time zone 'Europe/Bucharest')                as acum_ro,
      (now() at time zone 'Europe/Bucharest')::date          as azi,
      ((now() at time zone 'Europe/Bucharest')::date - 1)    as ieri,
      date_trunc('month', (now() at time zone 'Europe/Bucharest'))::date as luna_de_la,
      (date_trunc('month', (now() at time zone 'Europe/Bucharest')) - interval '1 month')::date as luna_ant_de_la
  ),
  g as (
    select f.*,
           /* Aceeasi zi a lunii trecute, dar fara sa iasa din ea: pe 31 martie,
              „31 februarie" ar fi insemnat 3 martie, adica zile numarate de doua ori. */
           least(
             (f.luna_ant_de_la + (f.azi - f.luna_de_la))::date,
             (f.luna_de_la - 1)
           ) as luna_ant_pana_la
      from f
  ),
  -- ── Comenzi: o singura trecere prin tabela, pentru toate cele patru ferestre ──
  c as (
    select
      count(*) filter (where zi_ro = g.azi)                                          as comenzi_azi,
      count(*) filter (where zi_ro = g.ieri and ora_ro <= g.acum_ro::time)            as comenzi_ieri,
      count(*) filter (where zi_ro between g.luna_de_la and g.azi)                    as comenzi_luna,
      coalesce(sum(o.total) filter (where zi_ro between g.luna_de_la and g.azi), 0)   as vanzari_luna,
      count(*) filter (where zi_ro between g.luna_ant_de_la and g.luna_ant_pana_la)   as comenzi_luna_ant,
      coalesce(sum(o.total) filter (where zi_ro between g.luna_ant_de_la and g.luna_ant_pana_la), 0) as vanzari_luna_ant
      from g
      left join lateral (
        select o.total,
               (o.created_at at time zone 'Europe/Bucharest')::date as zi_ro,
               (o.created_at at time zone 'Europe/Bucharest')::time as ora_ro
          from public.orders o
         where o.business_id = p_business
           and o.status not in ('cancelled', 'refunded')
           and o.created_at >= ((g.luna_ant_de_la)::timestamp at time zone 'Europe/Bucharest')
      ) o on true
     group by g.azi, g.ieri, g.luna_de_la, g.luna_ant_de_la, g.luna_ant_pana_la, g.acum_ro
  ),
  -- ── Vizite: zilele incheiate din tabela stransa, ziua de azi din cea bruta ──
  v as (
    select
      (select coalesce(sum(s.nr), 0) from public.business_daily_stats s, g
        where s.business_id = p_business and s.event_type = 'visit'
          and s.zi >= g.luna_de_la and s.zi < g.azi)
      + (select count(*) from public.site_analytics a, g
          where a.business_id = p_business and a.event_type = 'visit'
            and (a.created_at at time zone 'Europe/Bucharest')::date = g.azi) as vizite_luna,
      (select coalesce(sum(s.nr), 0) from public.business_daily_stats s, g
        where s.business_id = p_business and s.event_type = 'visit'
          and s.zi >= g.luna_ant_de_la and s.zi <= g.luna_ant_pana_la)        as vizite_luna_ant
  )
  select jsonb_build_object(
    'azi', jsonb_build_object(
      'comenzi', (select comenzi_azi from c)),
    'ieri_pana_acum', jsonb_build_object(
      'comenzi', (select comenzi_ieri from c),
      'ora', to_char((select acum_ro from g), 'HH24:MI')),
    'luna', jsonb_build_object(
      'vanzari', round((select vanzari_luna from c), 2),
      'comenzi', (select comenzi_luna from c),
      'vizite',  (select vizite_luna from v),
      'de_la',   (select luna_de_la from g),
      'pana_la', (select azi from g)),
    'luna_trecuta', jsonb_build_object(
      'vanzari', round((select vanzari_luna_ant from c), 2),
      'comenzi', (select comenzi_luna_ant from c),
      'vizite',  (select vizite_luna_ant from v),
      'de_la',   (select luna_ant_de_la from g),
      'pana_la', (select luna_ant_pana_la from g))
  )
$$;

-- ── Drepturi ────────────────────────────────────────────────────────────────
-- ⚠ Si de la `anon`, PE NUME: privilegiile implicite ale proiectului dau grantul
-- pe nume fiecarei functii noi, iar `revoke ... from public` nu-l stinge.
revoke execute on function public.panou_carduri(uuid) from public, anon;
grant execute on function public.panou_carduri(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠⚠ REPARATIE GASITA AICI: VIZITELE STRANSE NU SE VEDEAU DELOC
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `business_daily_stats` are RLS PORNIT si ZERO politici. Adica: nimeni in afara
-- de `service_role` nu poate citi din ea. Cum toate functiile de statistici sunt
-- `security invoker`, comerciantul primea, din toata luna, doar vizitele de AZI
-- (cele brute din `site_analytics`, care are politica lui).
--
-- Cum s-a vazut: cardul de conversie a aratat 173,7%. Adica 66 de comenzi
-- impartite la 38 de vizite, cand luna avea 3.458. O rata de conversie peste
-- 100% e imposibila; cifra a dat de gol lipsa politicii.
--
-- ⚠ NU E DOAR CARDUL. Aceeasi tabela sta sub `site_analytics_breakdown_zile`,
-- deci pagina Statistici arata de mult aceeasi socoteala stricata: vizitele pe
-- 7 / 30 / 90 de zile erau, de fapt, vizitele de azi. Acolo nu s-a vazut,
-- fiindca nimic nu depasea vreo margine vizibila.
--
-- Politica e copia celei de pe `site_analytics`: proprietarul isi vede randurile
-- lui, nimeni altcineva. Scrierea ramane doar a lui `service_role` (cronul care
-- strange zilele): nu se adauga nicio politica de INSERT sau UPDATE.
create policy "Proprietarii isi vad statisticile stranse"
  on public.business_daily_stats
  for select
  using (
    exists (
      select 1 from public.businesses b
       where b.id = business_daily_stats.business_id
         and b.user_id = auth.uid()
    )
  );

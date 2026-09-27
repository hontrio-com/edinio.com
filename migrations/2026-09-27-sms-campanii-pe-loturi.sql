-- ═══════════════════════════════════════════════════════════════════════════
-- SMS MARKETING: campaniile pe loturi, publicul in baza               (27.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Cerut de el („faci absolut tot”), dupa auditul sectiunii. Ce repara:
--
--   * `oprita` nu era o stare permisa: campania oprita de SMSO (fara credit,
--     cheie gresita) nu-si putea scrie incheierea si ramanea `in_curs` cu 0.
--   * Campania trimitea TOT intr-o singura cerere (plafon 300 s): peste ~1000
--     de destinatari se taia la mijloc, iar a doua apasare o lua de la capat.
--     Acum publicul se fotografiaza la creare (`sms_campaign_destinatari`), iar
--     trimiterea merge pe loturi, reluabila, fara dubluri (`for update skip
--     locked`, `unique (campaign_id, telefon)`).
--   * Doua file sau un dublu-clic porneau doua campanii: `cheie` unica.
--   * Dublurile se scoteau pe sirul brut (`0722…`, `+40722…`, `0722 …` = trei
--     SMS-uri platite): publicul se face pe `normalize_phone`.
--   * Comenzile din marketplace (eMAG, Trendyol) intrau in public: telefonul a
--     fost dat DOAR pentru livrare. Ies mereu (pe ambele semne: `order_source`
--     si `shipping_address.source`), iar anulatele/rambursatele ies implicit.
--   * Consimtamant: varianta aleasa de el (b), publicul ramane clientii directi
--     ai magazinului, cu dezabonare garantata in fiecare mesaj (in cod).
--
-- Aditiva: migratia INTAI, codul dupa. Restrangerea drepturilor pe jurnal si pe
-- lista de dezabonati e in migratia urmatoare (`…-z-doar-citire`), DUPA cod.

-- 1. Starea „oprita” si campurile noi ale campaniei ─────────────────────────
alter table public.sms_campaigns drop constraint if exists sms_campaigns_status_check;
alter table public.sms_campaigns add constraint sms_campaigns_status_check
  check (status = any (array['in_curs', 'sent', 'partial', 'failed', 'oprita']::text[]));

alter table public.sms_campaigns
  add column if not exists cheie text,
  add column if not exists segmente integer,
  add column if not exists cost_estimat_eurocenti numeric(12, 2),
  add column if not exists motiv_oprire text,
  add column if not exists sariti integer not null default 0,
  add column if not exists actualizata_la timestamptz not null default now(),
  add column if not exists finalizata_la timestamptz;

create unique index if not exists sms_campaigns_cheie_unica
  on public.sms_campaigns (business_id, cheie) where cheie is not null;

-- 2. Publicul fotografiat al fiecarei campanii ──────────────────────────────
create table if not exists public.sms_campaign_destinatari (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.sms_campaigns (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- Normalizat (`normalize_phone`, 9 cifre, `7…`). Se trimite ca `0` + numar.
  telefon text not null,
  prenume text,
  -- `necunoscut`: luat in lucru si neincheiat (instanta taiata); NU se retrimite,
  -- fiindca SMS-ul poate sa fi plecat. `esuat` ≠ `necunoscut`.
  stare text not null default 'de_trimis'
    check (stare in ('de_trimis', 'in_lucru', 'trimis', 'esuat', 'sarit', 'necunoscut')),
  luat_la timestamptz,
  trimis_la timestamptz,
  eroare text,
  unique (campaign_id, telefon)
);
create index if not exists sms_campaign_destinatari_lot
  on public.sms_campaign_destinatari (campaign_id, stare, id);

alter table public.sms_campaign_destinatari enable row level security;
drop policy if exists "Owner reads sms_campaign_destinatari" on public.sms_campaign_destinatari;
create policy "Owner reads sms_campaign_destinatari" on public.sms_campaign_destinatari
  for select using (business_id in (select businesses.id from public.businesses where businesses.user_id = auth.uid()));
revoke all on table public.sms_campaign_destinatari from public, anon, authenticated;
grant select on table public.sms_campaign_destinatari to authenticated;

-- 3. Jurnalul stie de ce campanie tine un SMS, cat a costat, cand l-am verificat ─
alter table public.notice_sms_log
  add column if not exists campaign_id uuid references public.sms_campaigns (id) on delete set null,
  add column if not exists cost_eurocenti numeric(10, 2),
  add column if not exists verificat_la timestamptz;
create index if not exists notice_sms_log_campaign
  on public.notice_sms_log (campaign_id) where campaign_id is not null;
-- Cronul de livrari ia intai ce n-a mai intrebat de mult (nu mereu cele mai vechi 200).
create index if not exists notice_sms_log_smso_de_verificat
  on public.notice_sms_log (verificat_la nulls first, created_at)
  where provider = 'smso' and delivery_status = 'sent' and provider_id is not null;

-- 4. Publicul, calculat in baza ─────────────────────────────────────────────
-- Toti clientii directi care trec de filtre, cu steagurile care spun de ce ar
-- iesi (numar invalid, dezabonat). Filtre: date_from, date_to, min_amount,
-- order_statuses[], counties[], categorie, min_comenzi, inactivi_zile.
create or replace function public.sms_audienta_toti(p_business uuid, p_filtre jsonb)
returns table (telefon text, prenume text, comenzi integer, ultima timestamptz, valid boolean, dezabonat boolean)
language sql stable
set search_path to 'public', 'pg_temp'
as $function$
  with directe as (
    select o.*
    from orders o
    where o.business_id = p_business
      and not coalesce(o.order_source ? 'marketplace', false)
      and o.shipping_address->>'source' is null
      and coalesce(btrim(o.customer_phone), '') <> ''
  ),
  potrivite as (
    select normalize_phone(d.customer_phone) as tel, d.customer_name, d.created_at
    from directe d
    where (p_filtre->>'date_from' is null or d.created_at >= (p_filtre->>'date_from')::date)
      and (p_filtre->>'date_to' is null or d.created_at < (p_filtre->>'date_to')::date + 1)
      and (p_filtre->>'min_amount' is null or d.total >= (p_filtre->>'min_amount')::numeric)
      and (case
            when jsonb_array_length(coalesce(p_filtre->'order_statuses', '[]'::jsonb)) > 0
              then d.status in (select jsonb_array_elements_text(p_filtre->'order_statuses'))
            else d.status not in ('cancelled', 'refunded')
          end)
      and (jsonb_array_length(coalesce(p_filtre->'counties', '[]'::jsonb)) = 0
           or d.shipping_address->>'county' in (select jsonb_array_elements_text(p_filtre->'counties')))
      and (coalesce(p_filtre->>'categorie', '') = '' or exists (
            select 1
            from jsonb_array_elements(case when jsonb_typeof(d.items) = 'array' then d.items else '[]'::jsonb end) it
            join products p on p.id::text = it->>'product_id' and p.business_id = p_business
            where p.category = p_filtre->>'categorie'))
  ),
  -- „Inactiv” se judeca pe TOATE comenzile directe ale omului, nu doar pe cele filtrate.
  ultima_oricare as (
    select normalize_phone(d.customer_phone) as tel, max(d.created_at) as ultima
    from directe d
    where d.status not in ('cancelled', 'refunded')
    group by 1
  ),
  pe_om as (
    select p.tel, count(*)::integer as comenzi,
           (array_agg(p.customer_name order by p.created_at desc))[1] as nume
    from potrivite p
    group by p.tel
  )
  select po.tel,
         nullif(split_part(btrim(coalesce(po.nume, '')), ' ', 1), ''),
         po.comenzi,
         u.ultima,
         po.tel ~ '^7[0-9]{8}$',
         exists (select 1 from sms_optout x where x.business_id = p_business and normalize_phone(x.phone) = po.tel)
  from pe_om po
  left join ultima_oricare u on u.tel = po.tel
  where (p_filtre->>'min_comenzi' is null or po.comenzi >= (p_filtre->>'min_comenzi')::integer)
    and (p_filtre->>'inactivi_zile' is null
         or coalesce(u.ultima, 'epoch'::timestamptz) < now() - make_interval(days => (p_filtre->>'inactivi_zile')::integer))
$function$;

-- Rezumatul pentru previzualizare: cati primesc, cati ies si de ce, cinci exemple.
create or replace function public.sms_audienta_rezumat(p_business uuid, p_filtre jsonb)
returns jsonb
language sql stable
set search_path to 'public', 'pg_temp'
as $function$
  with a as (select * from sms_audienta_toti(p_business, p_filtre))
  select jsonb_build_object(
    'primesc', (select count(*) from a where valid and not dezabonat),
    'dezabonati', (select count(*) from a where valid and dezabonat),
    'invalide', (select count(*) from a where not valid),
    'exemple', coalesce((
      select jsonb_agg(jsonb_build_object('prenume', e.prenume, 'telefon', e.telefon, 'comenzi', e.comenzi))
      from (select * from a where valid and not dezabonat order by ultima desc nulls last limit 5) e
    ), '[]'::jsonb)
  )
$function$;

-- Fotografia publicului, la crearea campaniei. Intoarce cati destinatari are.
create or replace function public.sms_pregateste_campanie(p_campaign uuid)
returns integer
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_biz uuid;
  v_filtre jsonb;
  v_n integer;
  v_sariti integer;
begin
  select c.business_id, coalesce(c.filters, '{}'::jsonb) into v_biz, v_filtre
  from sms_campaigns c where c.id = p_campaign;
  if v_biz is null then raise exception 'campanie inexistenta: %', p_campaign; end if;

  insert into sms_campaign_destinatari (campaign_id, business_id, telefon, prenume)
  select p_campaign, v_biz, t.telefon, t.prenume
  from sms_audienta_toti(v_biz, v_filtre) t
  where t.valid and not t.dezabonat
  on conflict (campaign_id, telefon) do nothing;
  get diagnostics v_n = row_count;

  select count(*) into v_sariti from sms_audienta_toti(v_biz, v_filtre) t where t.valid and t.dezabonat;

  update sms_campaigns
  set recipient_count = v_n, sariti = v_sariti, actualizata_la = now()
  where id = p_campaign;
  return v_n;
end
$function$;

-- Un lot de trimis. `skip locked`: doua apeluri simultane (doua file) nu iau
-- niciodata acelasi numar. Ia DOAR `de_trimis`: un rand ramas `in_lucru` nu se
-- mai retrimite (vezi `sms_campanie_inchide_intrerupte`).
create or replace function public.sms_ia_lot(p_campaign uuid, p_n integer)
returns table (id bigint, telefon text, prenume text)
language sql
set search_path to 'public', 'pg_temp'
as $function$
  update sms_campaign_destinatari d
  set stare = 'in_lucru', luat_la = now()
  where d.id in (
    select x.id from sms_campaign_destinatari x
    where x.campaign_id = p_campaign and x.stare = 'de_trimis'
    order by x.id
    limit greatest(1, least(coalesce(p_n, 25), 200))
    for update skip locked
  )
  returning d.id, d.telefon, d.prenume
$function$;

-- Randurile luate in lucru si neincheiate de peste 10 minute (instanta taiata la
-- mijlocul lotului): NU se retrimit, fiindca SMS-ul poate sa fi plecat.
create or replace function public.sms_campanie_inchide_intrerupte(p_campaign uuid)
returns integer
language sql
set search_path to 'public', 'pg_temp'
as $function$
  with u as (
    update sms_campaign_destinatari
    set stare = 'necunoscut', eroare = 'Trimitere întreruptă: nu știm dacă mesajul a plecat, deci nu îl retrimitem.'
    where campaign_id = p_campaign and stare = 'in_lucru' and luat_la < now() - interval '10 minutes'
    returning 1
  )
  select count(*)::integer from u
$function$;

-- Starea unei campanii: destinatarii pe stari si livrarile raportate de SMSO.
create or replace function public.sms_campanie_stare(p_campaign uuid)
returns jsonb
language sql stable
set search_path to 'public', 'pg_temp'
as $function$
  select jsonb_build_object(
    'de_trimis', count(*) filter (where d.stare = 'de_trimis'),
    'in_lucru', count(*) filter (where d.stare = 'in_lucru'),
    'trimis', count(*) filter (where d.stare = 'trimis'),
    'esuat', count(*) filter (where d.stare = 'esuat'),
    'sarit', count(*) filter (where d.stare = 'sarit'),
    'necunoscut', count(*) filter (where d.stare = 'necunoscut'),
    'livrate', (select count(*) from notice_sms_log l where l.campaign_id = p_campaign and l.delivery_status = 'delivered'),
    'nelivrate', (select count(*) from notice_sms_log l where l.campaign_id = p_campaign and l.delivery_status = 'failed' and l.success),
    'cost_eurocenti', (select coalesce(sum(l.cost_eurocenti), 0) from notice_sms_log l where l.campaign_id = p_campaign)
  )
  from sms_campaign_destinatari d
  where d.campaign_id = p_campaign
$function$;

-- Cifrele din capul paginii.
create or replace function public.sms_statistici(p_business uuid)
returns jsonb
language sql stable
set search_path to 'public', 'pg_temp'
as $function$
  select jsonb_build_object(
    'luna_trimise', (select count(*) from notice_sms_log l where l.business_id = p_business and l.provider = 'smso' and l.success
                      and l.trigger_key = 'campanie' and l.created_at >= date_trunc('month', now() at time zone 'Europe/Bucharest') at time zone 'Europe/Bucharest'),
    'luna_cost_eurocenti', (select coalesce(sum(l.cost_eurocenti), 0) from notice_sms_log l where l.business_id = p_business and l.provider = 'smso'
                      and l.trigger_key = 'campanie' and l.created_at >= date_trunc('month', now() at time zone 'Europe/Bucharest') at time zone 'Europe/Bucharest'),
    'livrate_30', (select count(*) from notice_sms_log l where l.business_id = p_business and l.provider = 'smso' and l.trigger_key = 'campanie'
                      and l.delivery_status = 'delivered' and l.created_at >= now() - interval '30 days'),
    'nelivrate_30', (select count(*) from notice_sms_log l where l.business_id = p_business and l.provider = 'smso' and l.trigger_key = 'campanie'
                      and l.success and l.delivery_status = 'failed' and l.created_at >= now() - interval '30 days'),
    -- Pretul unei PARTI se socoteste in cod (`pretParteDinJurnal`): costul e pe mesaj, iar partile
    -- unui mesaj se numara cu regulile GSM, care nu stau in SQL.
    'dezabonati', (select count(*) from sms_optout x where x.business_id = p_business)
  )
$function$;

-- Toate functiile de mai sus: NUMAI serverul (service role), dupa verificarea
-- proprietarului in cod. `revoke from anon` singur nu face nimic: dreptul vine
-- prin PUBLIC.
revoke all on function public.sms_audienta_toti(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.sms_audienta_rezumat(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.sms_pregateste_campanie(uuid) from public, anon, authenticated;
revoke all on function public.sms_ia_lot(uuid, integer) from public, anon, authenticated;
revoke all on function public.sms_campanie_inchide_intrerupte(uuid) from public, anon, authenticated;
revoke all on function public.sms_campanie_stare(uuid) from public, anon, authenticated;
revoke all on function public.sms_statistici(uuid) from public, anon, authenticated;
grant execute on function public.sms_audienta_toti(uuid, jsonb) to service_role;
grant execute on function public.sms_audienta_rezumat(uuid, jsonb) to service_role;
grant execute on function public.sms_pregateste_campanie(uuid) to service_role;
grant execute on function public.sms_ia_lot(uuid, integer) to service_role;
grant execute on function public.sms_campanie_inchide_intrerupte(uuid) to service_role;
grant execute on function public.sms_campanie_stare(uuid) to service_role;
grant execute on function public.sms_statistici(uuid) to service_role;

notify pgrst, 'reload schema';

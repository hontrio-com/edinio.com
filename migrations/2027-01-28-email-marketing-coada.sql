-- ═══════════════════════════════════════════════════════════════════════════
-- Coada evenimentelor de comanda catre Mailchimp, Brevo si Klaviyo
--
-- ═══ CE REZOLVA (18.09.2026) ═══
--
--   1. EXPEDIEREA SI LIVRAREA nu ajungeau la niciunul. Statusul `shipped` / `delivered` il pun
--      urmaririle de curier (17 cai, fiecare in cronul ei) si panoul; cablarea lor una cate una in cod
--      ar fi ramas in urma la primul curier nou. Un trigger pe `orders` le prinde pe TOATE.
--
--   2. UN ESEC AL FURNIZORULUI PIERDEA EVENIMENTUL. Trimiterea se facea o singura data, dupa raspuns;
--      un 503 sau un termen depasit insemna o comanda care nu mai ajungea niciodata in Mailchimp,
--      Brevo sau Klaviyo. Acum randul ramane in coada si se reincearca (acelasi ritm ca la conversii).
--
--   3. UN SINGUR LOC pentru crearea comenzii, plata, expediere, livrare, anulare, rambursare, in loc de
--      apeluri presarate prin `placeOrder`, `updateOrder`, lot, procesatori si Netopia.
--
-- ═══ CUM ═══
--
--   Triggerul scrie cate un rand pe (comanda, furnizor, fel), NUMAI pentru furnizorii pe care magazinul
--   i-a conectat cu sincronizarea e-commerce pornita (`enabled` si `ecommerce_sync`, campuri necriptate
--   in `privat.store_settings`). Magazinele fara email marketing nu primesc niciun rand.
--
--   ⚠ TRIGGERUL NU ARE VOIE SA OPREASCA O COMANDA. Orice eroare a lui se inghite (`exception when
--   others`), cu un avertisment: o coada care cade nu poate strica o vanzare.
--
--   ⚠ Poarta de marketplace de aici e doar o economie (nu scrie randuri degeaba). Poarta autoritara
--   ramane in cod, in cititorul fiecarui furnizor (`clientDeMarketplace`).
--
--   `/api/cron/email-marketing` goleste coada din minut in minut, prin `email_marketing_revendica`.
--
-- Aditiva: un tabel nou, doua functii, doua triggere. Se aplica INAINTE de deploy.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.email_marketing_coada (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  furnizor text not null check (furnizor in ('mailchimp', 'brevo', 'klaviyo')),
  fel text not null check (fel in ('creata', 'platita', 'expediata', 'livrata', 'anulata', 'rambursata')),
  incercari integer not null default 0,
  next_retry_at timestamptz not null default now(),
  trimis_la timestamptz,
  abandonat_la timestamptz,
  ultima_eroare text,
  -- `trimis` sau `sarit: <motiv>` (nimic de trimis: plata inca neincasata, integrare oprita intre timp).
  rezultat text,
  creat_la timestamptz not null default now(),
  unique (order_id, furnizor, fel)
);

comment on table public.email_marketing_coada is
  'Evenimentele de comanda catre Mailchimp, Brevo si Klaviyo, scrise de triggerul de pe orders si golite '
  'de /api/cron/email-marketing. Vezi src/lib/email-marketing/coada.ts si docs/marketing/EMAIL-MARKETING.md.';

create index if not exists email_marketing_coada_scadente_idx
  on public.email_marketing_coada (next_retry_at)
  where trimis_la is null and abandonat_la is null;

create index if not exists email_marketing_coada_comanda_idx
  on public.email_marketing_coada (order_id, furnizor, id);

-- Doar serverul (service role) scrie si citeste. Fara politici: nimeni altcineva nu vede nimic.
alter table public.email_marketing_coada enable row level security;

-- ═══ TRIGGERUL ═══
create or replace function public.email_marketing_pune_la_coada()
returns trigger
language plpgsql
security definer
set search_path = public, privat, pg_temp
as $$
declare
  v_feluri text[] := '{}';
  v_furnizori text[] := '{}';
  v_mc jsonb;
  v_br jsonb;
  v_kl jsonb;
  v_mp text;
begin
  -- Cumparatorul unui marketplace nu e clientul comerciantului (aceeasi regula ca `clientDeMarketplace`:
  -- un sir nevid in `marketplace`).
  if jsonb_typeof(new.order_source -> 'marketplace') = 'string' then
    v_mp := regexp_replace(new.order_source ->> 'marketplace', '^\s+|\s+$', '', 'g');
    if v_mp <> '' then
      return new;
    end if;
  end if;

  if tg_op = 'INSERT' then
    v_feluri := array['creata'];
  else
    if new.payment_status is distinct from old.payment_status and new.payment_status = 'paid' then
      v_feluri := v_feluri || 'platita'::text;
    end if;
    if new.status is distinct from old.status then
      if new.status = 'shipped' then v_feluri := v_feluri || 'expediata'::text;
      elsif new.status = 'delivered' then v_feluri := v_feluri || 'livrata'::text;
      elsif new.status = 'cancelled' then v_feluri := v_feluri || 'anulata'::text;
      elsif new.status = 'refunded' then v_feluri := v_feluri || 'rambursata'::text;
      end if;
    end if;
    -- Rambursarea banilor fara schimbarea statusului (procesatorul a intors banii). Anularea castiga
    -- cand vin amandoua: e starea finala a comenzii.
    if new.payment_status is distinct from old.payment_status and new.payment_status = 'refunded'
       and not ('rambursata' = any (v_feluri)) and not ('anulata' = any (v_feluri)) then
      v_feluri := v_feluri || 'rambursata'::text;
    end if;
  end if;

  if cardinality(v_feluri) = 0 then
    return new;
  end if;

  select s.mailchimp_config, s.brevo_config, s.klaviyo_config
    into v_mc, v_br, v_kl
    from privat.store_settings s
   where s.business_id = new.business_id;
  if not found then
    return new;
  end if;

  if coalesce(v_mc ->> 'enabled', '') = 'true' and coalesce(v_mc ->> 'ecommerce_sync', '') = 'true' then
    v_furnizori := v_furnizori || 'mailchimp'::text;
  end if;
  if coalesce(v_br ->> 'enabled', '') = 'true' and coalesce(v_br ->> 'ecommerce_sync', '') = 'true' then
    v_furnizori := v_furnizori || 'brevo'::text;
  end if;
  if coalesce(v_kl ->> 'enabled', '') = 'true' and coalesce(v_kl ->> 'ecommerce_sync', '') = 'true' then
    v_furnizori := v_furnizori || 'klaviyo'::text;
  end if;
  if cardinality(v_furnizori) = 0 then
    return new;
  end if;

  insert into public.email_marketing_coada (business_id, order_id, furnizor, fel)
  select new.business_id, new.id, f.furnizor, e.fel
    from unnest(v_furnizori) as f(furnizor)
   cross join unnest(v_feluri) as e(fel)
  on conflict (order_id, furnizor, fel) do nothing;

  return new;
exception when others then
  -- ⚠ O coada care cade nu are voie sa strice o comanda.
  raise warning 'email_marketing_pune_la_coada (comanda %): %', new.id, sqlerrm;
  return new;
end;
$$;

revoke all on function public.email_marketing_pune_la_coada() from public, anon, authenticated;

drop trigger if exists email_marketing_la_creare on public.orders;
create trigger email_marketing_la_creare
  after insert on public.orders
  for each row execute function public.email_marketing_pune_la_coada();

drop trigger if exists email_marketing_la_schimbare on public.orders;
create trigger email_marketing_la_schimbare
  after update of status, payment_status on public.orders
  for each row execute function public.email_marketing_pune_la_coada();

-- ═══ REVENDICAREA ═══
--
-- ⚠ ARENDA DE CINCI MINUTE, mai lunga decat `maxDuration` al cronului (120 s): o rulare taiata la
-- mijloc nu poate lasa randul sa fie luat de urmatoarea cat timp prima inca il trimite. Daca moare,
-- randul se elibereaza singur. `ARENDA_MS` din `coada.ts` e chiar intervalul asta.
--
-- ⚠ ORDINEA PE COMANDA SI FURNIZOR: un rand se ia numai cand toate randurile MAI VECHI ale aceleiasi
-- comenzi, la acelasi furnizor, sunt incheiate (trimise sau abandonate). Altfel „platita” putea ajunge
-- la Mailchimp inaintea comenzii insesi.
create or replace function public.email_marketing_revendica(limita integer)
returns table (id bigint, business_id uuid, order_id uuid, furnizor text, fel text, incercari integer)
language sql
set search_path = public, pg_temp
as $$
  update public.email_marketing_coada o
     set next_retry_at = now() + interval '5 minutes'
   where o.id in (
     select c.id
       from public.email_marketing_coada c
      where c.trimis_la is null
        and c.abandonat_la is null
        and c.next_retry_at <= now()
        and not exists (
          select 1
            from public.email_marketing_coada p
           where p.order_id = c.order_id
             and p.furnizor = c.furnizor
             and p.id < c.id
             and p.trimis_la is null
             and p.abandonat_la is null
        )
      order by c.id asc
      limit greatest(1, least(limita, 200))
      for update skip locked
   )
  returning o.id, o.business_id, o.order_id, o.furnizor, o.fel, o.incercari;
$$;

revoke all on function public.email_marketing_revendica(integer) from public, anon, authenticated;
grant execute on function public.email_marketing_revendica(integer) to service_role;

notify pgrst, 'reload schema';

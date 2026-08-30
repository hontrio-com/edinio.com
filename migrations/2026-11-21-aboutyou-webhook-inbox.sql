-- ═══════════════════════════════════════════════════════════════════════════
-- Evenimentele de webhook se scriu INAINTE sa fie prelucrate
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ RUTA RASPUNDEA 200 SI CAND N-A PRELUCRAT NIMIC (26.08.2026)
--
-- About You reincearca livrarea vreo doua zile daca nu primeste un raspuns bun. Ruta noastra
-- raspundea insa `200` pe toate caile, inclusiv cand ingestia pica — o pana de baza, o comanda pe
-- care n-o gasim, o exceptie. Pentru ei, evenimentul era livrat. Nu-l mai reincercau. Iar
-- sondarea nu-l poate recupera, fiindca filtreaza dupa data CREARII comenzii.
--
-- ⚠ CELE TREI `200` DE LA AUTENTIFICARE RAMAN, si sunt o hotarare buna: un eveniment fara secret
-- sau cu semnatura gresita n-are cum sa devina bun daca il mai trimit o data. Acolo reincercarea
-- e zgomot curat. Ce se schimba e numai calea de DUPA autentificare.
--
-- ⚠ CE FACE INBOX-UL: scrie evenimentul, apoi raspunde. Daca scrierea nu merge, raspunde 503 si
-- ei reincearca — singurul caz in care reincercarea chiar ajuta. Prelucrarea vine dupa, si poate
-- fi reluata de cron oricat de des, fiindca sarcina utila e pastrata intreaga.
--
-- ⚠ IDEMPOTENTA PE `event_id`. Ei reincearca acelasi eveniment de mai multe ori; fara cheia unica,
-- o comanda ar fi ingerata de doua ori. `id`-ul din plicul lor e cheia; cand lipseste, se face o
-- amprenta din corp, ca aceeasi livrare sa nimereasca acelasi rand.

create table if not exists public.aboutyou_webhook_inbox (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  event_id text not null,
  event_name text,
  payload jsonb not null,
  primit_la timestamp with time zone default now() not null,
  prelucrat_la timestamp with time zone,
  incercari integer default 0 not null,
  last_error text,
  -- ⚠ Acelasi eveniment livrat de doua ori nu face doua randuri.
  unique (business_id, event_id)
);

comment on table public.aboutyou_webhook_inbox is
  'Evenimentele de webhook About You, scrise INAINTE de prelucrare. Ruta raspunde 503 daca scrierea nu merge, ca ei sa reincerce.';

-- ⚠ Indexul urmeaza chiar interogarea cronului: ce n-a fost prelucrat, cele mai vechi intai.
create index if not exists aboutyou_webhook_inbox_neprelucrate_idx
  on public.aboutyou_webhook_inbox (business_id, primit_la)
  where prelucrat_la is null;

alter table public.aboutyou_webhook_inbox enable row level security;

-- Citire numai pentru proprietar, ca la celelalte tabele About You. Scrierile raman service-role.
-- ⚠ Coloana e `businesses.user_id`, nu `owner_id`, si `auth.uid()` se pune in sub-selectare —
-- amandoua copiate din politicile surori, nu ghicite.
drop policy if exists owner_select_aboutyou_webhook_inbox on public.aboutyou_webhook_inbox;
create policy owner_select_aboutyou_webhook_inbox on public.aboutyou_webhook_inbox
  for select using (
    business_id in (
      select businesses.id from public.businesses
       where businesses.user_id = (select auth.uid())
    )
  );

notify pgrst, 'reload schema';

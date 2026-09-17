-- ═══════════════════════════════════════════════════════════════════════════
-- TikTok Events API 2.0 pentru pixelul COMERCIANTULUI
--
-- ═══ CE REZOLVA (18.09.2026) ═══
--
--   Pixelul TikTok al comerciantilor trimitea evenimentele DOAR din browser, exact ca Meta inainte de
--   `2027-01-26`. Documentatia lor: „we recommend advertisers set up both TikTok Pixel SDK and Events API
--   to ensure maximum data coverage”, cu deduplicare pe `event_source_id` + `event` + `event_id`.
--
-- ═══ 1. `tiktok_capi_config`, PE TABELUL PRIVAT ═══
--
--   { access_token (SECRET), pixel_id, ultima_trimitere_la, ultima_eroare, ultima_eroare_la }
--
--   `pixel_id` e pixelul pentru care a fost pus tokenul: schimbarea Pixel ID-ului stinge trimiterea de pe
--   server pana la o verificare noua (acelasi tipar ca la Meta).
--
--   ⚠ Coloana SEPARATA, nu o cheie in `marketing_config`: acela coboara in browser pe fiecare pagina de
--   magazin si se citeste intreg in panou. Tokenul n-are ce cauta pe niciunul din drumuri.
--
-- ═══ 2. `tiktok_comenzi_raportate` ═══
--
--   Achizitia pleaca de pe server din trei locuri (ramburs la creare, incasarea online, „platit” bifat de
--   mana). Un rand aici face ca aceeasi comanda sa nu plece de doua ori. Se scrie abia dupa ce TikTok
--   raspunde cu `code: 0`.
--
-- Aditiva: coloana nullable si un tabel nou. Codul vechi nu le atinge. Se aplica INAINTE de deploy.
-- ═══════════════════════════════════════════════════════════════════════════

alter table privat.store_settings
  add column if not exists tiktok_capi_config jsonb;

comment on column privat.store_settings.tiktok_capi_config is
  'TikTok Events API 2.0 al comerciantului: {access_token (secret, criptat), pixel_id, ultima_trimitere_la, '
  'ultima_eroare, ultima_eroare_la}. Vezi src/lib/tiktok/capi.ts.';

insert into privat.campuri_secrete (coloana, cale) values ('tiktok_capi_config', 'access_token')
on conflict do nothing;

-- ⚠ OBLIGATORIU dupa orice modificare de coloane sau de campuri secrete.
select privat.reconstruieste_store_settings();
select privat.reconstruieste_store_settings_upd();

create table if not exists public.tiktok_comenzi_raportate (
  order_id uuid primary key references public.orders(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  trimisa_la timestamptz not null default now()
);

create index if not exists tiktok_comenzi_raportate_business_idx
  on public.tiktok_comenzi_raportate (business_id);

-- Doar serverul (service role) scrie si citeste. Fara politici: nimeni altcineva nu vede nimic.
alter table public.tiktok_comenzi_raportate enable row level security;

notify pgrst, 'reload schema';

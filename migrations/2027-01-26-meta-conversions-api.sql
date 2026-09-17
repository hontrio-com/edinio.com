-- ═══════════════════════════════════════════════════════════════════════════
-- Meta Conversions API pentru pixelul COMERCIANTULUI
--
-- ═══ CE REZOLVA (17.09.2026) ═══
--
--   Pixelul comerciantilor trimitea evenimentele DOAR din browser. Tot ce pierde browserul (iOS,
--   blocante de reclame, browserul din aplicatia Facebook, o pagina inchisa prea repede) nu ajungea
--   la Meta. Documentatia Meta recomanda pentru orice pixel „redundant setup”: aceleasi evenimente si
--   de pe server, prin Conversions API, deduplicate pe `event_name` + `event_id`. Shopify si
--   WooCommerce o fac. Masurat: `suporti-numar` are 162 de comenzi din reclame Facebook in 90 de zile.
--
-- ═══ 1. `meta_capi_config`, PE TABELUL PRIVAT ═══
--
--   { access_token (SECRET), pixel_id, test_event_code, ultima_trimitere_la, ultima_eroare, ultima_eroare_la }
--
--   `pixel_id` e pixelul pe care a fost verificat tokenul: schimbarea Pixel ID-ului stinge trimiterea de pe
--   server pana la o verificare noua.
--
--   ⚠ Coloana SEPARATA, nu o cheie in `marketing_config`: acela se citeste in panou cu totul si
--   coboara in browser (`FacebookPixelConfigClient`), iar layout-ul magazinului il citeste la fiecare
--   pagina. Tokenul n-are ce cauta pe niciunul din drumuri.
--
--   ⚠ Pe tabelul privat si in `privat.campuri_secrete`: `public.store_settings` e o vedere regenerata,
--   iar tokenul se cripteaza in repaus ca toate celelalte credentiale.
--
-- ═══ 2. `meta_comenzi_raportate` ═══
--
--   Achizitia pleaca de pe server din trei locuri (ramburs la creare, incasarea online, „platit” bifat
--   de mana), ca la GA4. Meta deduplica pe `event_id` doar 48 de ore; un rand aici face ca aceeasi
--   comanda sa nu plece de doua ori niciodata. Se scrie abia dupa ce Meta raspunde cu
--   `events_received`. Tabel separat, nu coloana pe `orders`, din acelasi motiv ca
--   `ga4_comenzi_raportate`: `orders.updated_at` misca alte sincronizari.
--
-- Aditiva: coloana nullable si un tabel nou. Codul vechi nu le atinge. Se aplica INAINTE de deploy.
-- ═══════════════════════════════════════════════════════════════════════════

alter table privat.store_settings
  add column if not exists meta_capi_config jsonb;

comment on column privat.store_settings.meta_capi_config is
  'Meta Conversions API al comerciantului: {access_token (secret, criptat), pixel_id, test_event_code, '
  'ultima_trimitere_la, ultima_eroare, ultima_eroare_la}. Vezi src/lib/facebook/capi.ts.';

insert into privat.campuri_secrete (coloana, cale) values ('meta_capi_config', 'access_token')
on conflict do nothing;

-- ⚠ OBLIGATORIU dupa orice modificare de coloane sau de campuri secrete.
select privat.reconstruieste_store_settings();
select privat.reconstruieste_store_settings_upd();

create table if not exists public.meta_comenzi_raportate (
  order_id uuid primary key references public.orders(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  trimisa_la timestamptz not null default now()
);

create index if not exists meta_comenzi_raportate_business_idx
  on public.meta_comenzi_raportate (business_id);

-- Doar serverul (service role) scrie si citeste. Fara politici: nimeni altcineva nu vede nimic.
alter table public.meta_comenzi_raportate enable row level security;

notify pgrst, 'reload schema';

-- GA4: ce comenzi au plecat CHIAR in Google Analytics prin Measurement Protocol.
--
-- ⚠⚠ DE CE E NEVOIE. `updateOrder` trimitea `refund` la orice trecere pe `cancelled`/`refunded`,
-- fara sa stie daca achizitia plecase vreodata. Dar achizitia NU pleaca pentru:
--   - o plata online neincasata (pleaca doar la confirmarea incasarii, din 03.09.2026);
--   - o comanda de marketplace (ingestul nu raporteaza nimic in GA);
--   - o comanda facuta de mana in panou;
--   - un cumparator care a refuzat cookie-urile de analiza.
-- Pentru toate, rambursarea scadea din venitul GA bani care nu intrasera niciodata acolo. Masurat
-- la singurul magazin cu trimitere de pe server, dupa legarea GA (14.08.2026): 60 de comenzi de
-- marketplace si 4 comenzi cu cardul neplatite trecute pe anulat/rambursat.
--
-- ⚠ O URMA A FAPTULUI, NU O DEDUCTIE. Regula „a plecat achizitia?” se poate ghici din metoda de plata,
-- dar ghicitul a gresit deja o data aici. Randul se scrie abia dupa ce Google a raspuns 2xx.
--
-- ⚠ TABEL SEPARAT, NU O COLOANA PE `orders`: `orders` are `set_orders_updated_at`, iar o scriere din
-- drumul de analiza ar fi mutat `updated_at`, pe care se sprijina alte sincronizari.
--
-- ⚠ Comenzile raportate INAINTE de migratia asta n-au rand, deci anularea lor nu mai trimite rambursare.
-- Directia aleasa: o rambursare lipsa se vede in GA ca venit prea mare; una falsa strica venitul fara urma.

create table if not exists public.ga4_comenzi_raportate (
  order_id uuid primary key references public.orders(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  cumparare_la timestamptz,
  rambursare_la timestamptz,
  creat_la timestamptz not null default now()
);

create index if not exists ga4_comenzi_raportate_business_idx
  on public.ga4_comenzi_raportate (business_id);

-- Doar serverul (service role) scrie si citeste. Fara politici: nimeni altcineva nu vede nimic.
alter table public.ga4_comenzi_raportate enable row level security;

notify pgrst, 'reload schema';

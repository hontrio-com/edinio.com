-- Netopia: ultima stare a fiecarei plati, asa cum au spus-o ei - 18.11.2026. Aplicata in productie pe
-- 18.11.2026, inainte de deploy; verificat dupa: RLS pornit, nimic pentru anon si authenticated.
--
-- Se aplica INAINTE de deploy. Fara tabela, cronul `netopia-reconciliere` s-ar purta ca pana acum
-- (scrie fiecare raspuns in jurnal), iar tinerea minte a starii ar cadea doar in consola. Nimic din
-- drumul banilor (IPN, confirmarea platii, rambursarea) nu depinde de ea.
--
-- ═══ DE CE ═══
--
-- Cronul intreaba din ora in ora despre fiecare plata nedecisa din ultimele 14 zile si scria in
-- `error_logs` raspunsul lor de FIECARE data, chiar daca era acelasi ca acum o ora. Masurat in
-- productie pe 18.11.2026, toate la `caian-textile`:
--
--   * 335 de avertismente „Plata cu cardul a fost REFUZATA” pentru O SINGURA comanda (25.09-09.10)
--     si 234 pentru alta (04.11-14.11), desi refuzul fusese spus o data, de IPN;
--   * 57 de „stare intermediara Netopia (1)”, pentru doua comenzi;
--   * 380 de „status Netopia NERECUNOSCUT: 0” (14.11-18.11), pentru patru comenzi pornite cand
--     magazinul era pe modul de TEST si intrebate dupa ce a trecut pe plati reale. Raspunsul lor, la
--     toate: `status 0`, `99 Invalid ntpID`, adica „nu stiu de tranzactia asta”.
--
-- Tabela tine ce a spus Netopia ultima oara despre plata fiecarei comenzi, iar reconcilierea scrie in
-- jurnal doar cand raspunsul e altul.
--
-- ═══ ⚠ DE CE O TABELA SEPARATA, SI NU O COLOANA PE `orders` ═══
--
-- Orice scriere pe `orders` muta `updated_at` (declansatorul `set_orders_updated_at`), iar cronul
-- `plati-neconfirmate` tine minte cui a spus deja „Marfa expediata, plata neconfirmata” chiar prin
-- `updated_at`: o comanda atinsa in ultimele 26 de ore se semnaleaza DIN NOU, la clopotelul
-- comerciantului. Masurat: comanda `#0281` de la suporti-numar a primit acelasi clopotel patru zile la
-- rand (21-24.09). Iar `ORD-MW2HMPJR-18Y` de la caian-textile e chiar expediata si neplatita, deci
-- prima scriere a starii pe ea ar fi re-trimis clopotelul. Aici nu se atinge nimic din comanda.

create table if not exists public.netopia_stari (
  order_id uuid primary key references public.orders(id) on delete cascade,
  -- Codul lor, ca text: „3”, „12”, „1”, „0”.
  cod text not null,
  -- Tranzactia despre care au vorbit. Se schimba cand plata e pornita din nou pe celalalt mediu.
  ntp_id text,
  schimbata_la timestamptz not null default now()
);

comment on table public.netopia_stari is
  'Ultima stare a platii Netopia a fiecarei comenzi (IPN sau /operation/status). Reconcilierea scrie '
  'in jurnal doar cand se schimba. Separata de orders ca sa nu mute updated_at. Vezi src/lib/netopia-aplica-statusul.ts.';

-- Doar serverul (cronul si IPN-ul, cu rol de serviciu) scrie si citeste. Fara politici.
alter table public.netopia_stari enable row level security;
revoke all on table public.netopia_stari from anon, authenticated;
grant select, insert, update, delete on table public.netopia_stari to service_role;

notify pgrst, 'reload schema';

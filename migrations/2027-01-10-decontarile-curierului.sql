-- Decontarile curierului: banii pe care ii incaseaza el si ii vireaza comerciantului - 13.09.2026
--
-- ═══ CE LIPSEA ═══
--
-- Platforma calculeaza de mult cat ramburs sa incaseze curierul (`lib/orders/ramburs.ts`), dar
-- NU stia niciodata daca banii aceia au si fost virati inapoi. Niciun curier din cei
-- cincisprezece n-avea asa ceva: cele patru croane `*-reconcile` privesc platile ONLINE ale
-- cumparatorului, nu banii intorsi de curier.
--
-- Comerciantul ramanea cu un singur raspuns posibil la „mi-a virat FAN banii pe comanda asta?":
-- sa se uite in extrasul de banca si sa potriveasca de mana.
--
-- ═══ ⚠ DE CE TABEL GENERIC, NU UNUL AL LUI FAN ═══
--
-- Hotarat cu proprietarul pe 13.09.2026. FAN il inaugureaza, dar coloana `courier` il face
-- refolosibil de ceilalti paisprezece fara alta migratie. Un `fan_courier_decontari` ar fi
-- cerut, la al doilea curier, ori inca un tabel identic, ori o migratie de mutare.
--
-- ═══ ⚠ CHEIA DE DEDUPLICARE, SI DE CE ASTA ═══
--
-- Cronul reinterogheaza aceeasi zi ori de cate ori e nevoie (o rulare intrerupta, o zi reluata
-- dupa o pana), deci scrierea TREBUIE sa fie idempotenta. Cheia naturala e virarea: acelasi AWB,
-- in aceeasi zi de transfer, e acelasi eveniment.
--
-- ⚠ `amount_collected` NU intra in cheie, dinadins. Daca FAN ar corecta vreodata o suma pentru
-- acelasi AWB si aceeasi zi, cu suma in cheie am fi pastrat AMANDOUA randurile si comerciantul
-- ar fi vazut banii de doua ori. Asa, corectura suprascrie.
--
-- ═══ ⚠ DOUA FORMATE DE DATA IN ACELASI ENDPOINT ═══
--
-- `reports/bank-transfers` primeste `date=YYYY-MM-DD`, dar raspunde cu `"awbDate": "27.02.2023"`
-- si `"transferDate": "01.03.2023"`, adica ZI.LUNA.AN. Citite naiv ca ISO, „01.03.2023" devine
-- fie eroare, fie 3 ianuarie, dupa unealta. De aia coloanele sunt `date` adevarate si conversia
-- se face explicit in client, nu prin `new Date(sir)`.
--
-- ═══ CE NU FACE ═══
--
-- Nicio legatura automata cu `orders` la nivel de baza: `order_id` e anulabil si se completeaza
-- cand AWB-ul se potriveste cu o comanda. O cheie straina obligatorie ar fi respins virarile
-- pentru AWB-uri emise din afara platformei, care sunt tocmai cele despre care comerciantul are
-- cel mai mult nevoie sa afle.
--
-- `raw` pastreaza raspunsul intreg: campurile pe care nu le-am mapat azi (expeditor, persoana de
-- contact) raman citibile fara alta migratie.

create table if not exists public.courier_settlements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  /* ⚠ Care curier a virat. `fancourier` azi; ceilalti paisprezece intra fara migratie. */
  courier text not null,
  awb_number text not null,
  /* Cand a fost emis AWB-ul, asa cum il stie curierul. Poate lipsi. */
  awb_date date,
  /* ⚠ Ziua virarii: tot ea e si ziua ceruta in raport, si cheia de deduplicare. */
  transfer_date date not null,
  /* Ziua in care curierul a incasat de la cumparator. */
  transaction_date date,
  amount_collected numeric(10,2) not null,
  content text,
  return_awb_number text,
  reimbursement_awb_number text,
  recipient_name text,
  recipient_locality text,
  /* Anulabil dinadins: virarile pentru AWB-uri emise din afara platformei raman vizibile. */
  order_id uuid references public.orders(id) on delete set null,
  /* Raspunsul intreg, ca sa nu fie nevoie de migratie pentru un camp nemapat. */
  raw jsonb,
  creat_la timestamp with time zone default now() not null,
  unique (business_id, courier, awb_number, transfer_date)
);

/* Forma exacta a interogarii din pagina „Decontari": ale unui magazin, cele mai noi intai. */
create index if not exists courier_settlements_biz_idx
  on public.courier_settlements (business_id, transfer_date desc);

/* Cautarea dupa AWB, pentru potrivirea cu o comanda. */
create index if not exists courier_settlements_awb_idx
  on public.courier_settlements (business_id, awb_number);

/*
 * ⚠ CHEIA STRAINA SPRE `orders` ISI CERE INDEXUL EI, SI L-AM UITAT LA PRIMA SCRIERE.
 *
 * Ceilalti indecsi incep toti cu `business_id`, deci niciunul nu ajuta cautarea dupa `order_id`.
 * Fara el, STERGEREA unei comenzi scaneaza intreaga tabela: Postgres verifica fiecare cheie
 * straina care arata spre randul sters, iar aici n-ar fi avut pe ce merge.
 *
 * Prins de `chei-straine-indexate.test.ts`, care cere regula asta pentru toate cheile spre
 * `orders` si `products`. Nu s-a plans nimeni inca, si nici n-avea cum: defectul e tacut pana
 * in ziua in care tabela creste.
 */
create index if not exists courier_settlements_order_idx
  on public.courier_settlements (order_id);

alter table public.courier_settlements enable row level security;

/* O singura politica, de CITIRE. Scrierile raman pe service role, in cron. */
drop policy if exists owner_select_courier_settlements on public.courier_settlements;
create policy owner_select_courier_settlements on public.courier_settlements
  for select using (
    business_id in (
      select businesses.id from public.businesses
       where businesses.user_id = (select auth.uid())
    )
  );

grant select on table public.courier_settlements to authenticated;

comment on table public.courier_settlements is
  'Banii incasati de curier la livrare si virati comerciantului. Generic pe `courier`; FAN primul (reports/bank-transfers).';
comment on column public.courier_settlements.transfer_date is
  'Ziua virarii. E si ziua ceruta in raportul curierului, si parte din cheia de deduplicare.';
comment on column public.courier_settlements.raw is
  'Raspunsul intreg de la curier, pentru campurile nemapate.';

notify pgrst, 'reload schema';

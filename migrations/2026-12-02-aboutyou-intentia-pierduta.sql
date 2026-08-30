-- ═══════════════════════════════════════════════════════════════════════════
-- MODIFICAREA S-A SALVAT, PUNEREA LA COADA A PICAT, SI N-A RAMAS NIMIC
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE REPARA (27.08.2026, tarziu)
--
-- `enqueueAboutYouSync` e „pornit si uitat": nu are voie sa arunce in apelant, fiindca o pana la
-- marketplace n-are voie sa impiedice salvarea unui produs. Dar asta inseamna ca, atunci cand
-- CHIAR pica, tot ce ramane e un rand in jurnal:
--
--     UPDATE products            -> COMMIT ✅
--     after() -> enqueue…        -> UPSERT in coada ❌
--     logError                   -> ✅
--
-- Produsul e modificat la noi. La About You, nu. Si nu exista nimic care sa mai revina vreodata la
-- el: veghea urmareste produsele cu LOT extern orb, iar aici nu s-a nascut niciun lot.
--
-- ⚠ CEL MAI SCUMP CAZ E STOCUL: o comanda scade 5 la 4, punerea la coada pica, iar About You arata
-- mai departe 5 si vinde o bucata care nu mai exista.
--
-- ═══ DE CE UN DECLANSATOR, SI NU O SCRIERE MAI ATENTA IN COD ═══
--
-- Fiindca lucrul care a picat E o scriere in baza. Orice „cutie de iesire" scrisa din aplicatie
-- pica exact in aceleasi clipe ca punerea la coada — n-ar fi o plasa, ar fi acelasi fir. Singura
-- urma care supravietuieste garantat e cea scrisa IN ACEEASI TRANZACTIE cu modificarea, iar in
-- Postgres asta inseamna un declansator.
--
-- ⚠ SI NU SE PUNE DIRECT IN COADA. Declansatorul nu stie ce operatie trebuie: o schimbare de stoc
-- cere `stock` (o cerere), nu `upsert` (produsul intreg, prin validari si loturi). Scriind orbeste
-- `upsert`, fiecare comanda ar fi impins produsul intreg. Deci se scrie doar un SEMN, iar cronul il
-- preface in coada NUMAI daca se dovedeste ca punerea din aplicatie chiar s-a pierdut.
--
-- ⚠ SI NU POATE DOBORI O SALVARE DE PRODUS. Corpul e invelit in `exception when others then return
-- new`: o plasa care rupe chiar lucrul pe care il pazeste ar fi mai rea decat lipsa ei.

create table if not exists public.aboutyou_intentii (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  product_id uuid not null,
  creat_la timestamp with time zone default now() not null,
  -- Un produs, un semn. Doua modificari la rand inseamna aceeasi treaba, iar `do nothing` pastreaza
  -- clipa CEA MAI VECHE — adica cea mai stricta la intrebarea „s-a trimis dupa ea?".
  unique (business_id, product_id)
);

comment on table public.aboutyou_intentii is
  'Semn scris de declansator, in aceeasi tranzactie cu modificarea produsului: „asta trebuia trimis la About You". Cronul il preface in coada doar daca punerea din aplicatie s-a pierdut.';

create index if not exists aboutyou_intentii_scadente_idx
  on public.aboutyou_intentii (business_id, creat_la);

alter table public.aboutyou_intentii enable row level security;

drop policy if exists owner_select_aboutyou_intentii on public.aboutyou_intentii;
create policy owner_select_aboutyou_intentii on public.aboutyou_intentii
  for select using (
    business_id in (
      select businesses.id from public.businesses
       where businesses.user_id = (select auth.uid())
    )
  );

-- ⚠ `security definer`: modificarea vine de la clientul comerciantului, care n-are (si n-are de ce
-- sa aiba) drept de scriere pe tabelul asta. Fara el, fiecare salvare de produs ar cadea in ramura
-- de exceptie si semnul nu s-ar scrie niciodata — o plasa care arata ca exista si nu prinde nimic.
create or replace function public.aboutyou_marcheaza_modificarea()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Numai produsele care CHIAR au o listare About You. Indexul `idx_aboutyou_listings_product`
  -- face din asta o singura sondare, si pentru toate celelalte magazine iese pe loc.
  if not exists (
    select 1 from public.aboutyou_listings l
     where l.product_id = new.id and l.business_id = new.business_id
  ) then
    return new;
  end if;

  insert into public.aboutyou_intentii (business_id, product_id)
  values (new.business_id, new.id)
  on conflict (business_id, product_id) do nothing;
  return new;
exception when others then
  -- ⚠ O PLASA N-ARE VOIE SA RUPA CHIAR LUCRUL PE CARE IL PAZESTE. Aici se pierde semnul, adica se
  -- ajunge exact unde eram pana azi — nu mai rau.
  return new;
end;
$$;

-- ⚠ EXECUTE SE IA DE LA `PUBLIC`, si nu din exces de zel: Postgres il da din oficiu, iar o functie
-- `security definer` executabila de oricine e chiar tiparul de ridicare de privilegii. Aici n-are
-- argumente si cere context de declansator, deci exploatarea e improbabila — dar regula casei nu se
-- negociaza pe „improbabil", si o proba (`granturi-rpc.test.ts`) o si verifica dupa un restore.
-- Am aflat-o de la ea, nu singur.
revoke execute on function public.aboutyou_marcheaza_modificarea() from public;

drop trigger if exists aboutyou_marcheaza_modificarea on public.products;

-- ⚠ LISTA DE COLOANE E CHIAR `PRODUCT_FIELDS` din `sync.ts`, adica exact ce citeste payload-ul
-- trimis la About You. Pe toate coloanele, semnul s-ar scrie si la un contor de vizualizari; pe
-- mai putine, o modificare adevarata ar trece nemarcata. Legatura e pazita de o proba.
create trigger aboutyou_marcheaza_modificarea
  after update of name, description, price, compare_at_price, images, category, sku,
                  weight_grams, page_sections, is_active, track_inventory, stock_quantity
  on public.products
  for each row
  when (old.* is distinct from new.*)
  execute function public.aboutyou_marcheaza_modificarea();

-- ═══════════════════════════════════════════════════════════════════════════
-- SI CAND AM TRIMIS ULTIMA OARA CEVA PENTRU LISTAREA ASTA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ `last_synced_at` NU RASPUNDE LA INTREBAREA ASTA, si nu se poate imprumuta: el inseamna „a
-- plecat vreodata produsul intreg acolo" si e citit ca atare in sase locuri — „prima trimitere",
-- „exista pe About You", filtrul publicarii. Impingerile dedicate de stoc si de pret nu-l ating,
-- si n-au voie sa-l atinga.
--
-- Coloana noua raspunde chiar la ce trebuie cronului: A PLECAT CEVA dupa clipa semnului? Daca da,
-- punerea la coada a mers si semnul se sterge. Daca nu, s-a pierdut, si se reface.

alter table public.aboutyou_listings
  add column if not exists ultima_impingere_la timestamp with time zone;

comment on column public.aboutyou_listings.ultima_impingere_la is
  'Ultima trimitere REUSITA de orice fel (produs, stoc, pret, status). Se compara cu `aboutyou_intentii.creat_la` ca sa se afle daca punerea la coada s-a pierdut.';

-- ═══════════════════════════════════════════════════════════════════════════
-- SI VEGHEA: INCIDENT NOU, CONTOARE NOI
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE REPARA: cheia unica `(business_id, style_key)` face ca al doilea incident pe acelasi produs
-- sa MOSTENEASCA numaratorile primului. Un produs care ajunsese la `reasertari = 5` si primise
-- alarma nu mai primea NICIO retrimitere pentru incidentul urmator — pragul era deja atins — si
-- nici alarma noua, fiindca `alarma_scrisa_la` era deja scris. Veghea ramanea in picioare si nu mai
-- facea nimic.
--
-- Acum randul tine minte CARE incident il vegheaza. Cand se schimba, contoarele repornesc.

alter table public.aboutyou_veghe add column if not exists incident text;

-- ⚠ Si SKU-urile straine: nu se ating (nu stim ce sunt), dar nici nu se pot numi „curat". Cat timp
-- exista, veghea nu are voie sa se inchida ca si cum totul ar fi in regula.
alter table public.aboutyou_veghe
  add column if not exists necesita_om boolean default false not null;
alter table public.aboutyou_veghe
  add column if not exists straine jsonb default '[]'::jsonb not null;

notify pgrst, 'reload schema';

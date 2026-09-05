-- ══════════════════════════════════════════════════════════════════════════
-- CONFIGURATOARE DE PRODUSE — persistenta (F1)
-- ══════════════════════════════════════════════════════════════════════════
--
-- ⚠ DE CE NU IN `products.page_sections`, unde sta deja „Produs personalizat"
--
-- Trei motive masurate, nu presupuse:
--
--   1. COLOANA SE REscrie INTREAGA la fiecare salvare. `ProductForm` compune un obiect nou din
--      unsprezece chei cunoscute, iar importul CSV face la fel pe produsele EXISTENTE. Orice
--      cheie nelistata acolo dispare tacut. S-a intamplat deja: cheia `bundle` a fost mancata
--      exact asa, de aceea exista azi garda `.eq("is_bundle", false)` in `product.actions.ts`.
--
--   2. PATRU DECLANSATOARE stau pe `products`, si doua dintre ele se aprind chiar la
--      `update of page_sections`: `products_catalog_proiectie` reproiecteaza catalogul, iar
--      `aboutyou_marcheaza_modificarea` scrie o intentie de publicare la FIECARE salvare. Un
--      editor de configurator care salveaza des ar fi inundat doua cozi de marketplace.
--
--   3. RANDUL INTREG AJUNGE IN BROWSER. Pagina de produs e „use client" si primeste produsul
--      din `select("*")`, iar React serializeaza props-urile de client in HTML. Formulele de
--      pret si tabelele de costuri puse acolo ar fi fost PUBLICE.
--
-- Si un al patrulea, de folos: `slimPageSections` taie coloana pentru carduri, grila si
-- cautare, deci nimic din ea nu ajunge oricum acolo unde ar trebui un semn „cere configurare".
--
-- ⚠ VERSIUNILE PUBLICATE SUNT IMUTABILE, SI O TINE BAZA, NU CODUL
--
-- O comanda de acum trei luni trebuie sa se poata citi exact cum a fost cumparata. Daca
-- versiunea s-ar putea rescrie, instantaneul comenzii ar deveni o minciuna fara ca nimeni sa
-- observe. Declansatorul de mai jos refuza orice UPDATE si orice DELETE pe un rand publicat —
-- inclusiv dintr-o consola SQL, inclusiv cu cheia de serviciu.
--
-- Restaurarea unei versiuni vechi NU muta un pointer inapoi: se scrie o VERSIUNE NOUA, pornind
-- de la cea veche. Asa istoricul ramane liniar si nimic nu se pierde.
--
-- ⚠ FARA NICIO POLITICA PUBLICA
--
-- Vitrina nu citeste tabelele astea. Ea primeste o definitie COMPILATA la publicare, compusa pe
-- server, din care lipsesc ciornele, costurile interne si versiunile vechi. Acelasi tipar ca la
-- `getCartPricing` si la `catalog_produs`. Politica de mai jos e doar pentru proprietar.
--
-- ⚠ Tabelele noi din `public` sunt DESCHISE din oficiu: proiectul are `alter default privileges`
-- care da lui `anon` si `authenticated` toate drepturile pe orice tabel nou. Singura aparare e
-- RLS, si de aceea e pornit pe toate patru, cu o singura politica — a proprietarului.

-- ── Configuratorul, cu ciorna lui ─────────────────────────────────────────

create table if not exists public.configuratoare (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  nume text not null,
  -- `ciorna` se editeaza; `activ` se si serveste; `dezactivat` se pastreaza dar nu se mai
  -- serveste; `arhivat` a iesit din uz, dar comenzile vechi tot trimit la el.
  stare text not null default 'ciorna',
  -- Ce se editeaza acum: { definitie, reguli, pretuire }. Forma o valideaza `zod`, nu baza:
  -- o constrangere `check` pe jsonb ar fi trebuit rescrisa la fiecare camp nou.
  ciorna jsonb not null default '{}'::jsonb,
  -- Versiunea care se serveste ACUM. `null` inseamna „nimic publicat inca".
  versiune_activa_id uuid,
  -- ⚠ Concurenta optimista. Doi oameni pot deschide aceeasi ciorna; scrierea cere revizia de la
  -- care a pornit editorul, si o refuza daca s-a schimbat intre timp. Fara ea, ultimul care
  -- apasa Salveaza sterge tacut munca celuilalt.
  revizie integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint configuratoare_stare_check
    check (stare = any (array['ciorna'::text, 'activ'::text, 'dezactivat'::text, 'arhivat'::text])),
  constraint configuratoare_nume_check check (btrim(nume) <> '')
);

create index if not exists configuratoare_magazin_idx
  on public.configuratoare (business_id, updated_at desc);

-- ── Versiunile publicate, imutabile ───────────────────────────────────────

create table if not exists public.configurator_versiuni (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  configurator_id uuid not null references public.configuratoare(id) on delete cascade,
  -- Numarul pe care il vede comerciantul: V1, V2, V3.
  numar integer not null,
  -- Definitia inghetata, exact cum a fost publicata.
  definitie jsonb not null,
  reguli jsonb not null default '[]'::jsonb,
  pretuire jsonb not null default '{}'::jsonb,
  -- Ce a compilat publicarea pentru vitrina. Se pastreaza ca sa nu se recompileze la fiecare
  -- cerere, si ca sa fie SIGUR acelasi lucru pe toata durata vietii versiunii.
  compilat jsonb,
  publicat_de uuid references auth.users(id) on delete set null,
  publicat_la timestamptz not null default now(),
  unique (configurator_id, numar)
);

create index if not exists configurator_versiuni_ale_configuratorului_idx
  on public.configurator_versiuni (configurator_id, numar desc);

-- Legatura circulara se inchide dupa ce exista amandoua tabelele.
-- `set null`: o versiune stearsa (numai o ciorna nepublicata poate fi) nu are voie sa ia cu ea
-- configuratorul intreg.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'configuratoare_versiune_activa_fkey'
  ) then
    alter table public.configuratoare
      add constraint configuratoare_versiune_activa_fkey
      foreign key (versiune_activa_id)
      references public.configurator_versiuni(id) on delete set null;
  end if;
end $$;

/*
 * ⚠ IMUTABILITATEA E TINUTA DE BAZA.
 *
 * Codul se poate insela, o consola SQL nu trece prin cod, iar cheia de serviciu ocoleste RLS.
 * Singurul loc din care regula nu poate fi ocolita e chiar aici.
 *
 * `compilat` face EXCEPTIE, si numai el: publicarea scrie randul intai, apoi compileaza si
 * completeaza. O singura completare, si numai din `null` — a doua scriere se refuza. Asa
 * publicarea ramane atomica pentru vitrina (versiunea nu devine activa decat completa), fara ca
 * randul sa poata fi rescris mai tarziu.
 */
create or replace function public.configurator_versiuni_imutabile()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception 'Versiunile publicate nu se sterg. Arhiveaza configuratorul.';
  end if;
  if old.compilat is null and new.compilat is not null
     and new.id = old.id
     and new.business_id = old.business_id
     and new.configurator_id = old.configurator_id
     and new.numar = old.numar
     and new.definitie = old.definitie
     and new.reguli = old.reguli
     and new.pretuire = old.pretuire
     and new.publicat_la = old.publicat_la then
    return new;
  end if;
  raise exception 'Versiunile publicate nu se modifica. Publica o versiune noua.';
end;
$function$;

revoke all on function public.configurator_versiuni_imutabile() from public;
revoke all on function public.configurator_versiuni_imutabile() from anon, authenticated;

drop trigger if exists configurator_versiuni_imutabile on public.configurator_versiuni;
create trigger configurator_versiuni_imutabile
  before update or delete on public.configurator_versiuni
  for each row execute function public.configurator_versiuni_imutabile();

-- ── Legatura cu produsele ─────────────────────────────────────────────────

create table if not exists public.configurator_produse (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  configurator_id uuid not null references public.configuratoare(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  -- `direct` leaga; `exclus` scoate produsul de sub un configurator mostenit din categorie.
  fel text not null default 'direct',
  created_at timestamptz not null default now(),
  constraint configurator_produse_fel_check
    check (fel = any (array['direct'::text, 'exclus'::text])),
  unique (product_id, configurator_id)
);

/*
 * ⚠ UN PRODUS = CEL MULT UN CONFIGURATOR LEGAT DIRECT.
 *
 * Tinut numai in cod, s-ar fi rupt la primul import, la prima scriere din consola sau la a doua
 * fila deschisa. Indexul partial il tine chiar in baza, si nu atinge randurile `exclus`, care
 * pot fi mai multe pe acelasi produs.
 */
create unique index if not exists configurator_produse_un_singur_direct_idx
  on public.configurator_produse (product_id) where fel = 'direct';

create index if not exists configurator_produse_ale_configuratorului_idx
  on public.configurator_produse (configurator_id, fel);

-- ── Legatura cu categoriile ───────────────────────────────────────────────

/*
 * ⚠ SE PASTREAZA NUMELE CATEGORIEI, NU ID-UL EI.
 *
 * `products.category` e TEXT, nu cheie straina: legatura produs-categorie se face prin NUME
 * peste tot in proiect (`categories/vizibilitate.ts`). Ofertele fac deja exact asa —
 * `offers.trigger.categories` tine tot nume — si `extindeCategoriile` coboara in subarbore
 * plecand de la nume.
 *
 * ⚠ Pretul: redenumirea unei categorii trebuie sa treaca si pe aici. Acelasi loc care face azi
 * `update products set category = <nume nou>` (`category.actions.ts`) trebuie sa scrie si aceste
 * randuri. Fara asta, legatura ramane pe un nume care nu mai exista si configuratorul dispare
 * tacut de pe produsele lui.
 *
 * ⚠ Si acelasi nume poate apartine mai multor randuri din `categories`: unicitatea e pe frati,
 * nu pe magazin, iar in productie sunt 8 astfel de perechi. Numele e deci exact nivelul potrivit
 * de precizie — mai fin n-ar avea ce descrie, fiindca produsul nu stie decat numele.
 */
create table if not exists public.configurator_categorii (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  configurator_id uuid not null references public.configuratoare(id) on delete cascade,
  categorie text not null,
  -- Se aplica si produselor viitoare din categorie, nu doar celor de acum.
  si_viitoarele boolean not null default true,
  created_at timestamptz not null default now(),
  constraint configurator_categorii_categorie_check check (btrim(categorie) <> ''),
  unique (business_id, configurator_id, categorie)
);

create index if not exists configurator_categorii_pe_nume_idx
  on public.configurator_categorii (business_id, categorie);

-- ── `updated_at` se intretine singur ──────────────────────────────────────

drop trigger if exists set_configuratoare_updated_at on public.configuratoare;
create trigger set_configuratoare_updated_at
  before update on public.configuratoare
  for each row execute function public.set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────
--
-- Proprietarul face tot; nimeni altcineva nu face nimic. Nicio politica publica, dinadins:
-- vitrina primeste o definitie compilata, pe server, nu citeste tabelele astea.

alter table public.configuratoare enable row level security;
alter table public.configurator_versiuni enable row level security;
alter table public.configurator_produse enable row level security;
alter table public.configurator_categorii enable row level security;

create policy owner_all_configuratoare on public.configuratoare
  for all using (business_id in (
    select id from public.businesses where user_id = (select auth.uid())));

create policy owner_all_configurator_versiuni on public.configurator_versiuni
  for all using (business_id in (
    select id from public.businesses where user_id = (select auth.uid())));

create policy owner_all_configurator_produse on public.configurator_produse
  for all using (business_id in (
    select id from public.businesses where user_id = (select auth.uid())));

create policy owner_all_configurator_categorii on public.configurator_categorii
  for all using (business_id in (
    select id from public.businesses where user_id = (select auth.uid())));

comment on table public.configuratoare is
  'Configuratoarele de produse ale unui magazin: ciorna editabila plus pointerul catre versiunea publicata care se serveste acum.';
comment on table public.configurator_versiuni is
  'Versiuni publicate, IMUTABILE (declansator). O comanda veche trebuie sa se poata citi exact cum a fost cumparata.';
comment on table public.configurator_produse is
  'Legatura directa cu produse, si exceptiile de la cea mostenita din categorie. Un produs are cel mult un configurator direct (index partial).';
comment on table public.configurator_categorii is
  'Legatura cu categorii, tinuta pe NUME fiindca products.category e text. Redenumirea unei categorii trebuie sa treaca si pe aici.';

notify pgrst, 'reload schema';

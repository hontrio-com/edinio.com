-- ═══════════════════════════════════════════════════════════════════════════
-- CONTURI DE CLIENT, migratia 1: temelia                        (23.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Planul intreg: docs/redesign/CONTURI-CLIENTI.md
--
-- ⚠⚠ CUMPARATORUL NU INTRA IN `auth.users` SI NU DEVINE NICIODATA `authenticated`.
--
-- Nu e o preferinta, sunt doua lucruri masurate in codul de azi:
--   1. `handle_new_user` e un declansator pe `auth.users` care da FIECARUI cont
--      nou un rand in `users_profile` cu `plan='free'`, fara nicio conditie.
--      Fiecare cumparator ar fi fost numarat langa comercianti si ar fi putut
--      ajunge pe /onboarding/details sa isi faca magazin.
--   2. `src/lib/auth/mfa.ts:140` spune `if (!profil) return true;`, iar `true`
--      inseamna „opreste cererea". Poarta MFA din proxy ruleaza la FIECARE POST,
--      dinadins fara nicio scutire de cale, si INAINTEA rutarii pe gazda. Un
--      cumparator asezat in `auth.users` fara rand in `users_profile` ar fi
--      primit 403 la fiecare actiune de server, inclusiv pe domeniul propriu.
--
-- Cu identitate proprie, poarta iese pe prima linie fiindca nu gaseste niciun
-- cookie `sb-*-auth-token` (`areCookieDeSesiune`). Un cumparator logat costa
-- exact cat unul anonim: zero.
--
-- ⚠⚠ DE CE SCHEMA `privat`, SI DE CE GRANTURILE SE SCRIU NOMINAL.
--
-- `privat` nu e expusa prin PostgREST, deci niciuna din tabelele de mai jos nu
-- se poate atinge cu cheia anon din browser. DAR masurat pe 23.09.2026:
--
--     has_schema_privilege('anon','privat','USAGE')          -> true
--     has_schema_privilege('authenticated','privat','USAGE') -> true
--
-- Schema NU e un zid. Singurul zid sunt granturile pe TABELA. Si `privat` nu are
-- nicio intrare in `pg_default_acl`, deci o tabela ramasa fara bloc de drepturi
-- e de neatins si pentru `service_role`: prima functie care o atinge cade cu
-- `42501`. De aceea blocul de mai jos e scris NOMINAL, tabela cu tabela, si e
-- urmat de o verificare care OPRESTE migratia daca a scapat vreuna.

-- ── 1. Cumparatorul ────────────────────────────────────────────────────────

create table if not exists privat.cont_cumparator (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  /* Se umple la prima comanda legata. Pana atunci salutul spune „Salut" si atat. */
  nume text not null default '',
  /*
    Epoca invalideaza TOATE sesiunile deodata, fara sa stearga niciun rand:
    se ridica la „iesi de peste tot", la „nu am fost eu" si la anonimizare.
    O stergere de randuri ar fi lasat o cursa cu cererile aflate in zbor.
  */
  epoca_sesiunii integer not null default 1,
  sters_la timestamptz,
  creat_la timestamptz not null default now(),
  /*
    ⚠⚠ CHEIA ASTA EXISTA CA SA POATA FI TINTA UNEI CHEI STRAINE COMPUSE.
    Fara ea, `cont_id` si `business_id` ar fi fost doua chei straine independente
    pe fiecare tabela-copil, si NIMIC din baza n-ar fi oprit o sesiune a
    magazinului A legata de un cont al magazinului B. Consecventa de chirias se
    tine in baza, nu intr-o proba.
  */
  unique (id, business_id)
);

create index if not exists idx_cont_cumparator_magazin
  on privat.cont_cumparator (business_id, creat_la desc);

-- ── 2. Contactele lui ──────────────────────────────────────────────────────

create table if not exists privat.cont_contact (
  id uuid primary key default gen_random_uuid(),
  cont_id uuid not null,
  business_id uuid not null,
  fel text not null check (fel in ('email','telefon')),
  /* Cum l-a scris omul. Se arata inapoi lui, nu se potriveste niciodata pe el. */
  valoare_bruta text not null,
  /*
    ⚠⚠ FORMA NORMALIZATA, SI NUMAI BAZA O CALCULEAZA.
    In TypeScript exista TREI `normalizePhone` care raspund diferit: cea din
    `lib/customers.ts` taie UN zero din fata, cea din `lib/utils/phone.ts`
    pastreaza forma locala, iar adevarul e `public.normalize_phone`, care taie
    TOATE zerourile. Pentru „00722334455" ies trei raspunsuri deosebite.
    Nicio cheie de contact nu se calculeaza in afara bazei.
  */
  valoare text not null,
  verificat_la timestamptz,
  creat_la timestamptz not null default now(),
  foreign key (cont_id, business_id)
    references privat.cont_cumparator (id, business_id) on delete cascade,
  /*
    ⚠ PRAGUL STA IN BAZA, nu numai in functia care scrie. `public.normalize_phone`
    intoarce SIRUL GOL pentru o intrare fara cifre, iar pe productie sunt 64 de
    comenzi cu telefonul sir gol: fara `check`, ele s-ar fi lipit toate de acelasi
    „contact".
  */
  constraint cont_contact_telefon_are_cifre
    check (fel <> 'telefon' or length(valoare) >= 9),
  constraint cont_contact_email_are_arond
    check (fel <> 'email' or position('@' in valoare) > 1)
);

/*
  ⚠ Indexul e PLIN, nu partial. Prima scriere a planului cerea
  `where sters_la is null`, dar `sters_la` e coloana lui `cont_cumparator`, iar
  predicatul unui index partial nu poate iesi din tabela indexata: nu se putea
  crea. Nici nu e nevoie, fiindca `cont_sterge` chiar STERGE randurile de aici.
*/
create unique index if not exists uq_cont_contact
  on privat.cont_contact (business_id, fel, valoare);

create index if not exists idx_cont_contact_cont
  on privat.cont_contact (cont_id, business_id);

-- ── 3. Sesiunile ───────────────────────────────────────────────────────────

create table if not exists privat.cont_sesiune (
  id uuid primary key default gen_random_uuid(),
  cont_id uuid not null,
  business_id uuid not null,
  /*
    ⚠ SE PASTREAZA NUMAI AMPRENTA, niciodata jetonul. Jetonul e 32 de octeti de
    la `crypto.randomBytes`, deci entropia e a lui, nu a unei parole: sha256 e
    de ajuns, si e acelasi tipar cu codurile MFA (`flux-mfa.ts:27`).
  */
  jeton_hash text not null unique,
  /* Se compara cu `cont_cumparator.epoca_sesiunii` la fiecare verificare. */
  epoca integer not null,
  creata_la timestamptz not null default now(),
  /* Fereastra glisanta: se impinge la fiecare atingere. */
  inactiva_dupa timestamptz not null,
  /* Marginea absoluta, care nu se misca niciodata. */
  expira_la timestamptz not null,
  incheiata_la timestamptz,
  motiv_incheiere text check (motiv_incheiere in ('iesire','rotire','refolosire','epoca','stingere','stergere')),
  ip inet,
  foreign key (cont_id, business_id)
    references privat.cont_cumparator (id, business_id) on delete cascade
);

create index if not exists idx_cont_sesiune_cont
  on privat.cont_sesiune (cont_id, business_id);

/* Pentru cronul de curatenie: sesiuni incheiate de mult, sau expirate. */
create index if not exists idx_cont_sesiune_curatenie
  on privat.cont_sesiune (expira_la);

-- ── 4. Ce comenzi sunt ale lui ─────────────────────────────────────────────

create table if not exists privat.cont_comanda (
  /*
    ⚠ CHEIE PRIMARA PE `order_id`, dinadins: o comanda are cel mult UN proprietar,
    si asta o apara baza, nu un `if` dintr-o functie. Doi oameni nu o pot
    revendica amandoi nici macar in aceeasi clipa.
  */
  order_id uuid primary key references public.orders(id) on delete cascade,
  business_id uuid not null,
  cont_id uuid not null,
  /* Pe ce usa a intrat. Se scrie o data si nu se mai schimba. */
  temei text not null check (temei in ('jeton-email','contact-verificat','numar-plus-contact','legat-de-comerciant')),
  /*
    ⚠⚠ CE ARE VOIE SA VADA, SI E O COLOANA, NU O FRAZA DINTR-UN DOCUMENT.
    Usa „numar de comanda plus contact" e un oracol de enumerare: numerele sunt
    secventiale la 7 din 8 magazine. Comanda intrata pe ea capata vedere REDUSA
    (numar, data, linii, total, stare) si se ridica la `intreaga` abia cand un
    contact DE PE EA e verificat printr-un cod. Prima scriere promitea asta in
    proza si n-avea nicio stare pe care sa o schimbe.
  */
  vedere text not null default 'intreaga' check (vedere in ('redusa','intreaga')),
  revendicat_la timestamptz not null default now(),
  foreign key (cont_id, business_id)
    references privat.cont_cumparator (id, business_id) on delete cascade
);

create index if not exists idx_cont_comanda_cont
  on privat.cont_comanda (cont_id, business_id, revendicat_la desc);

create index if not exists idx_cont_comanda_magazin
  on privat.cont_comanda (business_id);

-- ── 5. Codurile de sase cifre ──────────────────────────────────────────────

create table if not exists privat.cont_cod (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  /*
    ⚠ NUL LA INTRARE, PLIN LA ADAUGAREA UNUI CONTACT NOU.
    Codul cerut de un om nelogat nu are inca niciun cont. Dar un cod cerut din
    `/cont/date` („Adauga un numar") TREBUIE legat de contul care l-a cerut:
    altfel cineva pacalit sa transmita codul lui si-ar vedea contactul lipit de
    contul altcuiva. De-aia exista si `scop`.
    Cheia straina e compusa, deci cand `cont_id` e nenul perechea e verificata;
    cu `cont_id` nul, `match simple` o lasa in pace, cum trebuie.
  */
  cont_id uuid,
  scop text not null check (scop in ('intrare','adaugare-contact')),
  fel text not null check (fel in ('email','telefon')),
  /* Forma NORMALIZATA a destinatiei, calculata tot in baza. */
  destinatie text not null,
  /* sha256 hex, ca la MFA. Codul in clar nu atinge niciodata baza. */
  cod_hash text not null,
  incercari integer not null default 0,
  expira_la timestamptz not null,
  folosit_la timestamptz,
  creat_la timestamptz not null default now(),
  foreign key (cont_id, business_id)
    references privat.cont_cumparator (id, business_id) on delete cascade
);

/* Cautarea de la verificare: ultimul cod viu pentru o destinatie. */
create index if not exists idx_cont_cod_cautare
  on privat.cont_cod (business_id, fel, destinatie, creat_la desc);

/*
  ⚠ Cheia straina `cont_id` are nevoie de indexul ei, altfel stergerea unui cont
  scaneaza toata tabela. Aceeasi lectie ca la `chei-straine-indexate.test.ts`,
  unde masuratoarea a fost 3018 ms fata de 19,6 ms.
*/
create index if not exists idx_cont_cod_cont
  on privat.cont_cod (cont_id, business_id);

create index if not exists idx_cont_cod_curatenie
  on privat.cont_cod (expira_la);

-- ── 6. Contactele blocate ──────────────────────────────────────────────────

create table if not exists privat.cont_contact_blocat (
  business_id uuid not null references public.businesses(id) on delete cascade,
  fel text not null check (fel in ('email','telefon')),
  valoare text not null,
  motiv text not null check (motiv in ('contestat')),
  /*
    ⚠⚠ UN TERMEN CARE NU SE SCURGE NU E O RETENTIE.
    `valoare` e chiar emailul sau telefonul omului, adica data personala.
    Tinut pe veci, ar fi contrazis chiar sablonul de confidentialitate pe care
    il publica fiecare magazin („Date tehnice: maxim 12 luni").
  */
  expira_la timestamptz not null default (now() + interval '12 months'),
  creat_la timestamptz not null default now(),
  primary key (business_id, fel, valoare)
);

/*
  ⚠⚠ AICI INTRA NUMAI CE A FOST CONTESTAT prin „nu am fost eu", niciodata
  contactul celui care isi sterge contul. Scris si la stergere, exercitarea
  dreptului de stergere ar fi CREAT inregistrarea permanenta a identificatorului
  sters, iar omul care isi deschide alt cont maine n-ar mai fi putut lega
  niciodata propriile comenzi, fara nicio eroare si fara niciun text pe ecran.
  De-aia `motiv` are o singura valoare ingaduita.
*/
create index if not exists idx_cont_contact_blocat_curatenie
  on privat.cont_contact_blocat (expira_la);

-- ── 7. Jurnalul ────────────────────────────────────────────────────────────

create table if not exists privat.cont_jurnal (
  id bigint generated always as identity primary key,
  business_id uuid not null,
  cont_id uuid,
  fapta text not null,
  /* ⚠ Niciodata codul, niciodata jetonul. Aparat de o proba. */
  detalii jsonb not null default '{}'::jsonb,
  ip inet,
  creat_la timestamptz not null default now(),
  foreign key (cont_id, business_id)
    references privat.cont_cumparator (id, business_id) on delete cascade
);

create index if not exists idx_cont_jurnal_cont
  on privat.cont_jurnal (cont_id, business_id, creat_la desc);

create index if not exists idx_cont_jurnal_magazin
  on privat.cont_jurnal (business_id, creat_la desc);

create index if not exists idx_cont_jurnal_curatenie
  on privat.cont_jurnal (creat_la);

-- ── 8. Coada de instiintari ────────────────────────────────────────────────
--
-- ⚠⚠ EXISTA CA SA POATA FI SCRISA IN ACEEASI TRANZACTIE CU LEGATURA.
--
-- Apararea revendicarii unei comenzi vechi nu e plafonul, e instiintarea celui
-- care o detinea. Dar „pusa la coada" nu inseamna nimic fara o coada:
-- `src/lib/email/deliver.ts:34` e un apel HTTP sincron care iese TACIT cand
-- lipseste cheia Resend, iar functiile SQL comit inainte ca vreun TypeScript sa
-- apuce sa trimita ceva. Scrisa ca RAND, in chiar instructiunea care scrie
-- `cont_comanda`, instiintarea devine o conditie: daca insertul nu reuseste,
-- tranzactia cade si legatura nu se comite.

create table if not exists privat.cont_instiintare (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  cont_id uuid,
  canal text not null check (canal in ('email','sms')),
  destinatie text not null,
  sablon text not null,
  date jsonb not null default '{}'::jsonb,
  incercari integer not null default 0,
  trimisa_la timestamptz,
  ultima_eroare text,
  creata_la timestamptz not null default now(),
  foreign key (cont_id, business_id)
    references privat.cont_cumparator (id, business_id) on delete cascade
);

/* Drenajul: ce n-a plecat inca, in ordinea in care a intrat. */
create index if not exists idx_cont_instiintare_de_trimis
  on privat.cont_instiintare (creata_la)
  where trimisa_la is null;

create index if not exists idx_cont_instiintare_cont
  on privat.cont_instiintare (cont_id, business_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- DREPTURILE. Nominal, tabela cu tabela, si verificate mai jos.
-- ═══════════════════════════════════════════════════════════════════════════

revoke all on privat.cont_cumparator     from anon, authenticated;
revoke all on privat.cont_contact        from anon, authenticated;
revoke all on privat.cont_sesiune        from anon, authenticated;
revoke all on privat.cont_comanda        from anon, authenticated;
revoke all on privat.cont_cod            from anon, authenticated;
revoke all on privat.cont_contact_blocat from anon, authenticated;
revoke all on privat.cont_jurnal         from anon, authenticated;
revoke all on privat.cont_instiintare    from anon, authenticated;

grant select, insert, update, delete on privat.cont_cumparator     to service_role;
grant select, insert, update, delete on privat.cont_contact        to service_role;
grant select, insert, update, delete on privat.cont_sesiune        to service_role;
grant select, insert, update, delete on privat.cont_comanda        to service_role;
grant select, insert, update, delete on privat.cont_cod            to service_role;
grant select, insert, update, delete on privat.cont_contact_blocat to service_role;
grant select, insert, update, delete on privat.cont_jurnal         to service_role;
grant select, insert, update, delete on privat.cont_instiintare    to service_role;

grant usage, select on sequence privat.cont_jurnal_id_seq to service_role;

/*
  ⚠⚠ MIGRATIA ISI DOVEDESTE SINGURA PREMISA.
  Prima scriere a planului spunea „blocul de drepturi, identic pe toate sase",
  pentru sapte tabele. O tabela sarita nu da nicio eroare la migrare: cade abia
  la prima rulare, cu `42501`, si arata ca un defect de cod. Aici se opreste.
*/
do $$
declare
  t text;
  r text;
begin
  foreach t in array array[
    'cont_cumparator','cont_contact','cont_sesiune','cont_comanda',
    'cont_cod','cont_contact_blocat','cont_jurnal','cont_instiintare'
  ] loop
    if not has_table_privilege('service_role', 'privat.' || t, 'SELECT') then
      raise exception 'service_role nu are SELECT pe privat.%', t;
    end if;
    if not has_table_privilege('service_role', 'privat.' || t, 'INSERT') then
      raise exception 'service_role nu are INSERT pe privat.%', t;
    end if;
    foreach r in array array['anon','authenticated'] loop
      if has_table_privilege(r, 'privat.' || t, 'SELECT')
         or has_table_privilege(r, 'privat.' || t, 'INSERT')
         or has_table_privilege(r, 'privat.' || t, 'UPDATE')
         or has_table_privilege(r, 'privat.' || t, 'DELETE') then
        raise exception '% inca are drepturi pe privat.%', r, t;
      end if;
    end loop;
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- O INCUIETOARE VECHE, INCHISA ACUM
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠⚠ `public.customer_orders` are `execute` pentru `anon`, spre deosebire de
-- toate functiile scrise pe 21.09. Azi e inofensiva fiindca e `security invoker`
-- si RLS-ul de pe `orders` o goleste. Dar e CHIAR functia spre care se intinde
-- mana cand cineva vrea „Comenzile mele", iar prima reparatie care pare evidenta
-- (sa fie `security definer`, ca sa vada si cumparatorul) ar transforma-o pe loc
-- intr-un capat public prin care oricine, nelogat, cu un `business_id` si un
-- numar de telefon, primeste istoricul acelui om.
--
-- Se inchide acum, cat timp nimeni nu o cheama de acolo.
--
-- ⚠ Si nu se foloseste nici de noi: ramura ei de email cere ca telefonul comenzii
-- sa LIPSEASCA, iar `orders.customer_phone` e `not null`. Masurat: din 359 de
-- emailuri distincte, 358 intorc zero comenzi.
--
-- ⚠⚠ SE REVOCA DE LA `public`, NU DOAR DE LA `anon`. ACL-ul citit pe 23.09.2026 e
--
--     {=X/postgres, postgres=X, anon=X, authenticated=X, service_role=X}
--
-- iar `=X` din fata e CHIAR `PUBLIC`. Un `revoke ... from anon` singur ar fi
-- sters intrarea lui `anon` si ar fi lasat-o pe a lui `PUBLIC`, din care `anon`
-- mosteneste oricum: o operatie care pare sa fi lucrat si nu inchide nimic.
--
-- ⚠ `authenticated` PASTREAZA dreptul: functia e chemata azi de panoul
-- comerciantului, cu clientul utilizatorului (`customer.actions.ts:23`), unde
-- autorizarea o face RLS-ul de pe `orders`. Revocata si de acolo, modalul de
-- istoric al clientului s-ar fi golit pentru toti cei 132 de comercianti.

revoke execute on function public.customer_orders(uuid, text, integer, integer) from public, anon;
grant  execute on function public.customer_orders(uuid, text, integer, integer) to authenticated, service_role;

do $$
begin
  if has_function_privilege('anon', 'public.customer_orders(uuid, text, integer, integer)', 'EXECUTE') then
    raise exception 'anon inca poate chema customer_orders';
  end if;
  if not has_function_privilege('authenticated', 'public.customer_orders(uuid, text, integer, integer)', 'EXECUTE') then
    raise exception 'authenticated a pierdut customer_orders, si panoul are nevoie de ea';
  end if;
end $$;

notify pgrst, 'reload schema';

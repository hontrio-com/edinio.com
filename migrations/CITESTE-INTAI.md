# Cum se reface baza. Si ce NU se reaplica

## Regula, intr-o propozitie

**Baseline-ul e schema INTREAGA a productiei, regenerata la fiecare schimbare.
Toate fisierele cu data din dosarul asta sunt ISTORIC si NU se reaplica.**

## Refacerea pe o baza goala

```
1. migrations/000-prelude-platforma.sql   # DOAR pe Postgres gol, nu pe Supabase
2. migrations/000-schema-baseline.sql
```

Atat. Asta e exact ce face si CI-ul (`.github/workflows/ci.yml`, jobul de
restaurare, pe un PostgreSQL 17 curat).

## De ce nu se aplica si celelalte fisiere

Pentru ca `000-schema-baseline.sql` **le contine deja**. E un dump al productiei,
nu un punct de plecare de la care istoricul merge inainte: pana azi a fost
regenerat de 13 ori.

Antetul scriptului spunea, pana la 09.08.2026, „restul migratiilor, in ordinea
datei — sunt istoricul de DUPA baseline". Era fals, si cele doua feluri de a-l
urma sunt amandoua rele:

- **Cine forteaza mai departe** peste erori reaplica, prin `create or replace`,
  corpuri VECHI de functii peste cele noi din snapshot.
  `blocheaza_escaladare_users_profile` apare in 4 migratii,
  `incheie_operatie_externa` in 3, `revendica_stoc_comanda` in 2. Iese corect doar
  daca forma finala din productie sta chiar in ultima migratie si nimeni n-a atins
  nimic din consola SQL — adica exact ipoteza pe care
  `catalog_cuvinte_murdar` a demontat-o si care a nascut baseline-ul.
- **Cine se opreste la prima eroare** (in `2026-08-05-format-slug-magazin.sql`, pe
  o constrangere care exista deja) ramane totusi cu o baza DEGRADATA: tot ce e
  inainte s-a aplicat cu succes, inclusiv `2026-08-04-blocare-escaladare-rol.sql`,
  care reda lui `authenticated` UPDATE pe `mfa_otp`, `mfa_otp_expires_at` si
  `mfa_email_enabled` — trei granturi pe care productia de azi le tine INCHISE.

Mai exista si capcane tacute: `2026-08-15-curatenie-baza.sql` e idempotenta
(`drop index if exists`), deci reaplicata nu da nicio eroare — dar sterge indexuri
pe care baseline-ul tocmai le-a creat. **Idempotenta unei migratii nu inseamna ca
reaplicarea ei e inofensiva.**

Iar `2026-08-04-DUPA-DEPLOY-buckets.sql` are nevoie de `storage.objects` /
`storage.buckets`, care nu exista nici in preludiu, nici in baseline.

## ⚠ La restaurarea pe un proiect Supabase NOU: granturile implicite

**Masurat pe 03.09.2026.** `pg_default_acl` al proiectului da, pentru schema `public`
si pentru obiectele de tip functie create de rolul `postgres`:

```
{postgres=X/postgres, anon=X/postgres, authenticated=X/postgres, service_role=X/postgres}
```

Adica **orice functie creata acolo primeste EXECUTE pentru `anon` si `authenticated`,
pe nume.** Iar baseline-ul emite, in sectiunea lui de revocari, numai
`revoke execute on function … from public` — o revocare de la `public` **nu** stinge
granturile date pe nume.

Urmarea: pe o **productie vie** totul e in regula (granturile de acolo sunt cele
corecte, si o proba le pazeste — `src/lib/emag/granturi-rpc.test.ts`). Dar
**restaurand baseline-ul pe un proiect Supabase nou**, fiecare functie `security
definer` din `public` ar ramane chemabila cu o cheie `anon`.

CI-ul nu prinde asta: restaureaza pe un PostgreSQL curat, unde nu exista nici
rolurile Supabase, nici privilegiile implicite.

**Deci, dupa o restaurare pe un proiect Supabase nou, INAINTE de a-l deschide:**

```sql
-- pentru fiecare functie din `public`, in ordinea asta:
--   1) revoke de la public, anon, authenticated
--   2) apoi se reaplica granturile din baseline (sectiunea de `grant`),
--      care redau exact ce are productia — inclusiv `anon` acolo unde CHIAR trebuie
--      (`semnatura_cuvant`, `site_analytics_breakdown`, si celelalte cateva).
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;
```

Apoi se ruleaza `npm test` (proba de granturi) pe noul proiect.

⚠ Nu s-a schimbat generatorul (`genereaza_schema_baseline()`) fiindca ar cere
reasezarea sectiunilor — revocarile trebuie sa vina INAINTEA granturilor, altfel ar
sterge chiar accesul legitim al lui `anon` la cele cateva functii publice — si
singura dovada adevarata ar fi o restaurare reala pe un proiect Supabase, pe care
n-o putem face din CI.

## Marcajul de taiere (cutover)

Nu e o variabila si nu e data din numele fisierelor — **datele din nume nu sunt
datele reale** (numele merg pana la `2026-08-26`, dar commit-ul care a adus
baseline-ul e din 09.08.2026), iar cele doua dosare au chiar conventii diferite
(`scripts/migrations/2026-06-15_x.sql` cu underscore, `migrations/2026-07-31-x.sql`
cu liniuta), deci o sortare pe nume nici macar nu le pune in aceeasi serie.

**Marcajul e commit-ul ultimei regenerari:**

```
git log -1 --format="%h %ad" --date=short -- migrations/000-schema-baseline.sql
```

O migratie se aplica peste baseline **daca si numai daca a fost adaugata dupa acel
commit**:

```
git log --diff-filter=A --format="%h %ad %n" --date=short --name-only \
  <commit-baseline>..HEAD -- migrations/ scripts/migrations/
```

Cand lista e goala — cazul obisnuit, fiindca baseline-ul se regenereaza odata cu
fiecare schimbare de schema — refacerea e chiar cei doi pasi de sus.

## Dupa orice schimbare de schema

```
bash scripts/schema-baseline.sh          # regenereaza
bash scripts/schema-baseline.sh --check  # confirma ca nu mai difera
```

Migratia si codul care depinde de ea se livreaza IMPREUNA: o migratie aplicata cu
codul nepusat a rupt deja, tacut, onboarding-ul, MFA si domeniile.

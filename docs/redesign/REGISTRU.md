# Registrul redesignului: tot ce se schimba, si ce cere fiecare lucru la final

**Regula proprietarului, 20.09.2026:** *„eu as vrea la final sa aplicam tot in productie, nu
acum, dar sa tii cont si sa stii mereu ce adaugam/modificam nou ca la final cand dam push sa
faci totul perfect."*

Deci: pana la sfarsitul redesignului, **productia nu se atinge cu nimic** (nici baza, nici
Vercel, nici push). Tot ce s-ar fi aplicat acum se scrie aici si se aplica atunci, in ordinea
de mai jos.

⚠ Fisierul asta se scrie **in aceeasi clipa** cu schimbarea, nu la final din memorie. O
schimbare care nu e aici e o schimbare pe care nimeni n-o mai gaseste in ziua unirii.

Dosarul demo si curatenia de dupa: [`demo-seed/LA-FINAL.md`](../../../demo-seed/LA-FINAL.md).

---

## A. Ce trebuie facut in ziua unirii, in ordine

**Ordinea nu e cosmetica.** Codul de pe ramura cheama functii care in productie nu exista
inca. Pus invers, panoul principal ar arata „Graficul de vanzari nu a putut fi incarcat" intre
push si aplicarea migratiei, la toti comerciantii.

1. **Intai migratiile** din tabelul B, in productie (`rtefdpioqmowkdiybwrr`), in ordinea din
   tabel.
2. **Verificarea drepturilor** dupa fiecare migratie: `anon` NU trebuie sa poata chema
   functiile noi (vezi nota din C).
3. **Regenerarea schemei de referinta**: `bash scripts/schema-baseline.sh`, apoi
   `bash scripts/schema-baseline.sh --check` pana scrie „schema din Git = schema din productie".
4. **Variabilele noi de mediu** din tabelul D, in Vercel (Production), inainte de push.
5. **Verificarile** pe ramura: `npx tsc --noEmit`, `npm test`, `npm run build`, `eslint`.
6. **Unirea si push-ul**, apoi verificat: productia raspunde, CI verde, Sentry fara erori noi.
7. **Curatenia** din `demo-seed/LA-FINAL.md` (baza demo, cele 8 chei de ramura, dupa id).

---

## B. Migratii de baza de date

| # | Fisier | Ce aduce | Aplicata in DEMO | Aplicata in PRODUCTIE |
|---|--------|----------|------------------|------------------------|
| 1 | `migrations/2026-09-20-produse-sub-prag.sql` | `stoc_combinatie`, `combinatie_aprinsa`, `produse_sub_prag`, `numar_produse_sub_prag` (stoc scazut vazut si pe variante) | DA | **DA, 20.09.2026** (aplicata inainte de regula de mai sus; schema de referinta a fost regenerata atunci) |
| 2 | `migrations/2026-09-20-vanzari-panou.sql` | `fereastra_vanzari`, `canale_vanzare`, `vanzari_panou` (graficul de vanzari: perioade, canale, comparatie) | DA | **NU. De aplicat la final.** |
| 3a | `migrations/2026-09-20-panou-carduri.sql`, partea de jos | politica RLS lipsa de pe `business_daily_stats` | DA | **DA, 20.09.2026**, cu acordul lui: repara un defect care lovea cei 71 de comercianti cu statistici. ⚠ La final NU se mai aplica a doua oara (ar da `42710: policy already exists`): se sare peste ultima parte a fisierului. |
| 3b | `migrations/2026-09-20-panou-carduri.sql`, functia | `panou_carduri` (cele patru carduri din cap) | DA | **NU. De aplicat la final.** |

⚠ Toate sunt **numai citire**: functii noi si o politica de SELECT, niciun `alter table`, niciun
rand atins. Nu strica nimic din ce ruleaza acum, dar pana nu sunt aplicate, codul care le cheama
nu are ce primi.

### ⚠⚠ Migratia 3 repara si un defect care e ACUM in productie

`business_daily_stats` are RLS pornit si **zero politici**: in afara de `service_role`, nimeni
nu poate citi din ea. Toate functiile de statistici sunt `security invoker`, deci comerciantul
primeste doar vizitele de AZI (cele brute din `site_analytics`), niciodata zilele stranse.

Masurat pe baza demo, prin panoul real: pagina **Statistici** arata „Rata de conversie 250.0%,
38 vizite" pentru 30 de zile, cand luna avea 5.701 de vizite. Dupa politica: 5.701, iar rata
intra la loc sub 100%. Cardul nou de conversie a dat defectul de gol (arata 173,7%).

**Rezolvat in productie pe 20.09.2026**, cu acordul lui („rezolva asta daca e rapid si fara sa
strici nimic"), fiindca lovea zilnic cei 71 de comercianti care au statistici: 3.054 de randuri,
niciunul citibil de proprietarul lui.

Verificat dupa aplicare, chiar in productie, cu RLS pornit si dandu-ne drept comerciantul cu
cele mai multe zile (totul intr-o tranzactie inchisa cu `rollback`, fara nicio scriere):
isi vede toate cele 249 de zile ale lui, **zero** randuri de la alte magazine, iar `anon` vede
in continuare zero. Functia `panou_carduri` a ramas neaplicata: ea tine de redesign.

⚠ **RAMAS DE FACUT, si nu se poate din sesiunea asta:** schema de referinta din Git nu mai
cuprinde politica noua, fiindca regenerarea cere o legatura la baza, pe care mediul mi-a
refuzat-o („Modify Shared Resources"). Se ruleaza, de catre el sau cu permisiunea lui:

    bash scripts/schema-baseline.sh          # rescrie migrations/000-schema-baseline.sql
    bash scripts/schema-baseline.sh --check  # trebuie sa spuna ca Git = productia

Pana atunci, `--check` va semnala o diferenta: e chiar politica de mai sus, nu o surpriza.

---

## C. Ce se verifica dupa fiecare migratie

```sql
select p.proname,
       has_function_privilege('anon', p.oid, 'execute')          as anon_poate,
       has_function_privilege('authenticated', p.oid, 'execute') as auth_poate
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('produse_sub_prag','numar_produse_sub_prag','stoc_combinatie',
                     'combinatie_aprinsa','fereastra_vanzari','canale_vanzare','vanzari_panou',
                     'panou_carduri');
```

Se asteapta `anon_poate = false` peste tot si `auth_poate = true`.

⚠ **`revoke ... from public` NU e de ajuns**, si s-a vazut chiar la prima migratie: privilegiile
implicite ale proiectului dau fiecarei functii noi din `public` un grant **pe nume** catre
`anon`. Ambele migratii revoca si pe nume, dar verificarea ramane: o functie noua scrisa fara
randul acela ar lasa pe oricine cu cheia publica sa ceara stocurile sau cifra de afaceri a
oricarui magazin.

---

## D. Variabile de mediu noi

Niciuna pana acum. (Sentry a fost pus separat, in `main`, pe 18.09, cu `SENTRY_AUTH_TOKEN` deja
in Vercel.)

---

## E. Ce s-a schimbat in cod, pe scurt

Lista e ca sa se stie **ce se uita la** dupa push, nu ca sa inlocuiasca istoricul Git
(`git log main..redesign-dashboard`).

| Zona | Fisiere | De verificat dupa push |
|------|---------|------------------------|
| Tipografie si fundal | `src/app/fonturi.ts` (nou), `src/app/stil-comun.css`, `src/app/(dashboard)/layout.tsx`, `src/app/(admin)/layout.tsx` | ⚠ Fundalul alb si Inter sunt inchise in clasa `.zona-aplicatie`. **Vitrinele raman pe Geist si pe fundalul lor**: se verifica o vitrina reala, nu doar panoul. |
| Suprafete | `src/components/ui/panel.tsx` | Cardurile au `ring-1 ring-foreground/10`, nu chenar. |
| Stoc scazut | `src/lib/stoc-prag.ts`, `src/lib/actions/stoc-scazut.actions.ts`, `src/components/dashboard/StocScazutRand.tsx`, `src/components/dashboard/ModalStocScazut.tsx`, pagina panoului | Banda arata numarul corect; modalul deschide lista; „Ignora" tine intre reincarcari. Depinde de migratia **1**. |
| Grafic de vanzari | `src/lib/vanzari.ts` (+ probe), `src/components/dashboard/PanouVanzari.tsx`, `src/components/dashboard/GraficVanzari.tsx`, pagina panoului; **sters**: `src/components/dashboard/RevenueChart.tsx` | Perioadele, canalele si comparatia. Depinde de migratia **2**. |
| Cele patru carduri | `src/lib/panou-carduri.ts` (+ probe), `src/components/dashboard/ExplicatieCard.tsx`, pagina panoului | Comenzi azi, Vanzari luna aceasta, Valoare medie comanda, Rata de conversie, fiecare cu diferenta procentuala; tooltip cu formula doar la conversie. Depinde de migratia **3**. ⚠ Se verifica si pagina **Statistici**: vizitele de acolo trebuie sa creasca dupa aplicarea politicii. |
| Tipuri | `src/types/database.types.ts` | ⚠ Intrarile pentru functiile noi sunt **scrise de mana** (regenerarea completa rescrie `store_settings` din tabela in vedere si rupe zeci de locuri). Dupa aplicarea migratiilor, ele descriu in sfarsit ceva ce exista si in productie. |

---

## F. Datorii cunoscute, de hotarat inainte de final

- `RAPORT-POPULARE.json`: 39 de defecte de cod si 61 de lipsuri de ecran gasite la popularea
  bazei demo. Nu sunt atinse inca.
- Cotele de TVA din Setari sunt inca 19 / 9 / 5, nu 21 / 11.
- `orders_daily_revenue` (grupare pe ziua **UTC**) nu mai e chemat din niciun loc de cod:
  verificat cu `git grep`, ramane doar in `migrations/`, in tipuri si in doua comentarii.
  De hotarat daca il stergem din baza sau il lasam. Cat timp exista, e o capcana: urmatorul
  care cauta „venit pe zile" il gaseste primul si primeste zile UTC.

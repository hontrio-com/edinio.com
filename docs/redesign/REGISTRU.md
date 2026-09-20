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
| 4 | `migrations/2026-09-20-analitice-sesiuni.sql` | sesiuni si vizitatori in `site_analytics` (coloane + indexuri), tabela `analitice_sare` si functia `analitice_sarea_zilei` | DA | **NU. De aplicat la final.** ⚠ Prima migratie care schimba o TABELA, nu doar adauga functii: patru coloane noi, toate optionale. |
| 5 | `migrations/2026-09-20-analitice-agregat-sesiuni.sql` | tabelele `analitice_zilnic` si `analitice_zilnic_sursa` (+ politici) si `agregeaza_analitice` care le umple | DA | **NU. De aplicat la final.** ⚠ Dupa aplicare, primele zile de sesiuni se strang la urmatoarea rulare a cronului `discount-release`; istoricul NU se poate reconstrui, fiindca randurile brute mai vechi de 8 zile nu mai exista. |
| 6 | `migrations/2026-09-20-trafic-si-harta.sql` | `trafic_panou`, `trafic_pe_sursa`, `comenzi_pe_judet` | DA | **NU. De aplicat la final.** |
| 7 | `migrations/2026-09-20-fereastra-azi-ieri.sql` | `fereastra_vanzari` capata „azi" si „ieri" | DA | **NU. De aplicat la final.** ⚠ Inlocuieste functia din migratia 2, deci se aplica DUPA ea. |
| 8 | `migrations/2026-09-20-palnie-si-venit-pe-sursa.sql` | `site_analytics.valoare`; `analitice_zilnic.sesiuni_cu_produs/_cu_cos/_cu_checkout`; `analitice_zilnic_sursa.vanzari`; `agregeaza_analitice` rescrisa ca sa le umple; `palnia_panou`; `trafic_pe_sursa` refacuta cu venit | DA | **NU. De aplicat la final.** ⚠ Atinge o TABELA cu trafic real (`site_analytics`) si cele doua tabele de agregat; toate coloanele sunt optionale sau cu implicit. Se aplica DUPA migratiile 4 si 5. ⚠ `trafic_pe_sursa` se sterge si se recreeaza (semnatura de intoarcere se schimba), deci ordinea fata de migratia 6 conteaza. |
| 9 | `migrations/2026-09-20-vanzari-detaliu.sql` | `vanzari_detaliu` (sumarul, produsele, categoriile, canalele si starile filei Vanzari) si `carduri_secundare` (clienti noi, clienti care revin, bucati, anulari - cu fereastra precedenta) | DA | **NU. De aplicat la final.** Numai functii noi; nu atinge nicio tabela. Se aplica DUPA migratia 2 (foloseste `fereastra_vanzari`). |
| 10 | `migrations/2026-09-20-verde-rebranding.sql` | Implicitul lui `businesses.primary_color` trece de la `#1AB554` la `#07c527` | DA | **NU. De aplicat la final.** Doar `set default`, deci atinge numai magazinele FACUTE DE ACUM INAINTE. ⚠ Cele existente NU se ating, si e o hotarare: `primary_color` e culoarea comerciantului, nu a noastra, iar un `update` peste randurile ramase pe vechiul implicit ar repicta intr-o noapte vitrine care nu ne-au cerut nimic. |

| 11 | `migrations/2026-09-21-suprimare-contacte.sql` | `recovery_optout` capata `phone` si `motiv`; `email` devine optional; o restrictie care cere macar un contact; index unic pe (magazin, telefon) | DA | **DA, 21.09.2026**, cu acordul lui. Verificat pe amandoua bazele: coloanele exista si `email` e `nullable`. |

| 12 | `migrations/2026-09-21-mesaje-recuperare.sql` | Tabela `recovery_sends` (jurnalul mesajelor de recuperare) cu index unic pe `(cos, canal, cheie)`, doua indexuri si politica de citire pentru comerciant | DA | **NU. De aplicat la final.** Tabela noua, nu atinge nimic existent. Verificat pe demo ca indexul unic musca si ca `anon` nu vede si nu scrie. |

| 13 | `migrations/2026-09-21-cosuri-ignorate.sql` | `abandoned_carts.ignorat_la` (un cos ramane in cifre, dar nu mai primeste mesaje) si index partial pe cosurile care pot fi contactate | DA | **NU. De aplicat la final.** O coloana optionala si un index; niciun rand atins. |

| 14 | `migrations/2026-09-21-atribuire-recuperare.sql` | `recovery_sends.deschis_la` si `.comanda_id` (+ index partial): linkul de recuperare lasa urma, si comanda se leaga de mesajul care a adus-o | DA | **NU. De aplicat la final.** Doua coloane optionale pe tabela adaugata de migratia 12, deci se aplica DUPA ea. |

| 15 | `migrations/2026-09-21-cosuri-sumar.sql` | `cosuri_abandonate_sumar`: toate cifrele filei, socotite in baza pe o fereastra data (inclusiv cele trei feluri de recuperare) | DA | **NU. De aplicat la final.** Numai o functie noua; nu atinge nicio tabela. Se aplica DUPA migratiile 12 si 14 (citeste `recovery_sends.deschis_la`). ⚠ Verificat ca `anon` NU are EXECUTE. |

⚠ Migratiile 1-3 sunt **numai citire**: functii noi si o politica de SELECT, niciun `alter table`,
niciun rand atins.

⚠ **Migratia 4 e prima care schimba o tabela**: adauga patru coloane la `site_analytics`, toate
optionale, plus doua indexuri si o tabela noua (`analitice_sare`). Nu atinge niciun rand existent
si nu strica scrierile de azi - codul vechi care insereaza fara coloanele noi ramane valid.
Indexurile se construiesc pe o tabela care creste cu fiecare vizita, deci la aplicare se face pe
rand, nu in acelasi minut cu push-ul.

### ⚠⚠ Migratia 11 a plecat INAINTE de final, si de ce

Regula e ca productia nu se atinge pana la unire. Aici s-a facut o exceptie, hotarata cu el:
`recovery_optout` avea numai `email`, deci **dezabonarea de la SMS nu se putea nici macar
exprima**, cu atat mai putin respecta. Iar trimiterea de mana din panou nu citea lista deloc.

⚠ Pe productie plecasera deja **34 de emailuri si 21 de SMS-uri** catre clienti adevarati, deci
gaura nu era teoretica. Un mesaj trimis cuiva care a cerut sa nu mai fie contactat nu se ia
inapoi, si nici banii pe SMS.

Migratia nu sterge nimic si nu atinge niciun rand: adauga doua coloane, slabeste un `not null`
si pune o restrictie care cere macar un contact. Codul vechi, care scria doar `email`, ramane
valid - `motiv` are implicit `'dezabonare'`.

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

## C2. ✅ FACUT 20.09.2026: pasul de DATE din productie

Nu e o migratie de schema, ci un `update` de o linie. **S-a facut pe 20.09.2026**, dupa push:
cele sase anunturi stinse automat s-au reaprins, deci lista de Noutati are acum cinci randuri
reale in loc de unul. Toate sase aveau `published_at` pus - adica fusesera publicate de el -
si niciunul n-avea semn de retragere anume; regula veche „unul singur odata" explica de ce
erau stinse.

⚠ Se intoarce dintr-o comanda: randurile atinse sunt in `zz_backup_anunturi_stinse_20260920`.

Pana acum, publicarea unui anunt le stingea pe toate celelalte (`unpublishOthers`),
fiindca panoul arata un singur anunt. In productie sunt **7 anunturi, dintre care
1 publicat**, desi toate sapte au data de publicare: celelalte sase au fost stinse
automat, nu retrase de el.

Cu lista noua, ele n-ar mai aparea, iar „ultimele cinci noutati" ar avea un singur rand:

```sql
-- Anunturile stinse de vechea regula „unul singur odata" se reaprind.
-- ⚠ De rulat DOAR daca el confirma ca niciunul dintre cele sase nu a fost retras dinadins.
update public.announcements set is_published = true where published_at is not null;
select count(*) filter (where is_published) as publicate from public.announcements;  -- se astepta 7
```

In baza demo s-a facut deja (plus un al cincilea rand, ca sa se vada asezarea plina).

## D2. O biblioteca noua in `package.json`

`blobatar@2.7.0` (https://github.com/Alain00/blobatar), ceruta de el pentru chipurile
utilizatorilor. N-are nicio dependenta proprie, si **nu ajunge in pachetul browserului**: SVG-ul
se deseneaza pe server, in `src/lib/avatar-blob.ts`, si se trimite ca text.

⚠ La unire trebuie sa treaca si `npm ci` pe Vercel: `package-lock.json` intra in acelasi commit
cu `package.json`.

## D. Variabile de mediu noi

Niciuna **ceruta** de cod. (Sentry a fost pus separat, in `main`, pe 18.09, cu `SENTRY_AUTH_TOKEN`
deja in Vercel.)

### ⚠ INCHIS: `TZ = Europe/Bucharest` NU SE POATE PUNE

Incercat pe 20.09.2026, dupa push. Vercel raspunde `env_key_reserved`: **`TZ` e nume
rezervat** si refuza sa fie creat, pe orice mediu. Deci propunerea nu era doar
de prisos, ci imposibila.

Nu se pierde nimic: analiza de mai devreme aratase deja ca variabila **nu e necesara**.
Codul care scrie date nu mai depinde de ceasul masinii (`formatDate`, `formatDateShort`,
`formatDateTime` si cele sase locuri din `email.ts` convertesc explicit la ora Romaniei),
iar cronurile Vercel se socotesc oricum in UTC.

⚠ Ce RAMANE de facut in locul ei: componentele de client (tabele din panou, zona de
admin) scriu inca pe ceasul VIZITATORULUI. Pentru un comerciant aflat in alt fus, orele
de acolo difera de cele de pe facturi. Se repara pe fiecare loc, nu dintr-o variabila.

---

## D3. Cele 8 chei de ramura din Vercel, dupa ID

Citite pe 20.09.2026. Se sterg **dupa id**, nu dupa nume: aceleasi nume exista si fara
ramura, pe Preview + Production, iar acelea sunt ale productiei si NU se ating.

| ID | Cheie |
|----|-------|
| `De8WIMkdZRMilZWj` | SUPABASE_SERVICE_ROLE_KEY |
| `FFSTvIfdQ8SxzDsy` | RESEND_API_KEY |
| `hvaAavTqkMXJ48rK` | NEXT_PUBLIC_SUPABASE_URL |
| `bhcSLqQSoDiKnQc5` | NEXT_PUBLIC_SUPABASE_ANON_KEY |
| `CLCp1RHrL19GceZR` | RESELLER_API_KEY |
| `3UcdKEMUf9Bs7YVt` | VERCEL_TOKEN |
| `8AI8v5yonibhRM74` | STRIPE_SECRET_KEY |
| `HuwGzKcjpUx4vO40` | SMARTBILL_TOKEN |

⚠ **Nu se sterg cat timp se mai lucreaza local**: dezvoltarea locala merge pe baza demo
prin `.env.development.local`. Sterse acum, lucrul local ar ajunge pe productie.

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
| Etichete de stare | `src/components/ui/eticheta-stare.tsx`, `src/lib/orders/status.ts`, `OrdersClient`, `OrderDetailClient`, `CustomersClient`, `ReturnsClient`, `EmagListings`, `EmagJurnal`, `EmagProbleme`, `TrendyolListings`, `TrendyolAutoMap`, `TrendyolClient`, `AboutYouListings`, `AboutYouOrders`, `AboutYouPreVerificare`, `AboutYouCategoryMapping`, `GoogleMerchantClient`, `OlxClient`, `StatisticiVanzari`, pagina panoului si `dashboard/features` | Un singur fel de eticheta in TOT panoul (22 de fisiere): punct colorat pe fundal neutru, varianta aleasa de el pe 20.09.2026. Se verifica: Comenzi, Retururi, Integrari (cartonasele), eMAG „Ce te tine pe loc”, listarile de marketplace. ⚠ La Google Merchant si OLX a iesit si ICONITA din eticheta: punctul spune acelasi lucru, iar douazeci de cartonase cu pastile pline faceau pagina sa tipe. ⚠ **RAMAN pe fundal plin, si asa trebuie**: cele trei butoane de schimbare a starii din `OrderDetailClient` sunt COMENZI, nu etichete - optiunea aleasa trebuie sa se vada apasata. |
| Comenzi recente | pagina panoului, `src/lib/utils/format.ts` (`acumCatTimp`) | Fiecare rand spune cand a venit comanda („acum 12 minute") si de unde (eMAG, Google Ads, Direct). |
| Fusul orar | `src/lib/utils/format.ts`, `src/lib/email.ts` (+ probe care pornesc un Node pe `TZ=UTC`) | Datele scrise de server erau pe UTC: o comanda de la 01:30 aparea „19 septembrie, 22:30". Acum toate trec prin ceasul romanesc. ⚠ RAMAS: componentele de client (tabele din panou, zona de admin) scriu pe ceasul VIZITATORULUI; pentru un comerciant din alt fus, orele difera de facturi. De facut in aceeasi trecere cu etichetele. |
| Noutati | `src/components/dashboard/ListaNoutati.tsx` (nou), `AnnouncementArticle`, `src/lib/announcements.ts` (`rezumatScurt`), `src/lib/actions/announcement.actions.ts`, pagina panoului | Cinci randuri in loc de un articol desfasurat, fara iconita la titlu. ⚠ **Publicarea nu mai stinge celelalte anunturi** (`unpublishOthers`, scoasa): altfel lista ar fi avut mereu un singur rand. Vezi pasul de date de mai jos. |
| Alertele de cont | `src/components/dashboard/BandaCont.tsx` (nou), `TrialBanner`, `PaymentPastDueBanner`, `GracePeriodBanner`, `ActivationChecklist`, `src/lib/abonament-timp.ts` (nou, + probe), `src/app/(dashboard)/layout.tsx` | O singura forma pentru toate vestile despre abonament, cu trei trepte (informare, atentie, urgent). ⚠ Zilele ramase se socotesc acum pe SERVER si se trimit ca prop: `GracePeriodBanner` e componenta de client si citea ceasul in randare, deci serverul si browserul puteau ajunge la doua numere diferite. |
| Navigatie | `src/lib/navigatie-panou.ts` (nou), `Sidebar`, `DashboardTopbar`, `BottomNav`, probele din `navigatia-nu-divergeaza.test.ts` si `decontarile-se-aduna-zi-cu-zi.test.ts` | Meniul e acum unul singur: erau doua copii, iar de pe telefon lipseau Oferte, SMS Marketing si Design sectiuni. Ordine noua, sageti la sectiunile cu submeniu, fara eticheta Beta la Oferte. Bara de jos: Acasa / Comenzi / Produse / Statistici. |
| Bara de sus | `CautareGlobala`, `ButonAdauga` (noi), `src/lib/actions/cautare-globala.actions.ts`, `src/lib/cautare-termen.ts`, `src/lib/avatar-blob.ts`, `DiscountsClient` | Cautare in produse, comenzi si clienti, cu rezultate sub camp. Buton Adauga (produs, discount, oferta). Chip de utilizator desenat din id. Doar prenumele. Facturare si abonament in meniul contului. |
| Sigla si starea magazinului | `src/lib/stare-magazin.ts` (nou, + probe), `Sidebar` | Sigla in locul initialei; bulina: verde publicat si domeniu bun, galben nepublicat, rosu domeniu cazut. |
| Tipuri | `src/types/database.types.ts` | ⚠ Intrarile pentru functiile noi sunt **scrise de mana** (regenerarea completa rescrie `store_settings` din tabela in vedere si rupe zeci de locuri). Dupa aplicarea migratiilor, ele descriu in sfarsit ceva ce exista si in productie. |
| Cosuri abandonate | `src/lib/abandoned/suprimare.ts` si `src/lib/abandoned/sms-segmente.ts` (noi, + probe), `src/lib/actions/abandoned-cart.actions.ts`, `src/app/api/cron/abandoned-recovery/route.ts`, `src/components/dashboard/AbandonedCartsClient.tsx`, `src/components/dashboard/cosuri/` (nou) | Trimiterea de MANA respecta acum dezabonarea (pe email SI pe telefon, normalizat) si refuza cosurile deja finalizate - pana acum numai cronul verifica, panoul nu atingea lista. Se verifica: un rand in `recovery_optout` opreste si emailul, si SMS-ul, din panou. ⚠ Socoteala SMS de sub casuta arata acum ce se plateste: masurat pe un mesaj romanesc adevarat, vechiul rand scria „1 SMS" pentru ceva ce pleaca in **3**. Depinde de migratiile **11**-**15**. |
| Rebranding (culoare + sigla) | `src/app/stil-comun.css`, `src/components/ui/Logo.tsx`, `scripts/brand/genereaza-sigle.mjs` (nou), `public/` (13 fisiere de sigla), `public/site.webmanifest`, plus 79 de locuri unde verdele era scris in cod | Verdele marcii e `#07c527`, verdele purtator `#008215` (5,00:1, aceeasi nuanta coborata pana trece pragul). Se verifica: panoul, site-ul de prezentare, o vitrina reala, un e-mail trimis, fila din browser si pictograma pe telefon. ⚠ Magazinele existente isi pastreaza culoarea lor, deci o vitrina care arata tot verde vechi NU e un defect. ⚠ Bannerul de share (`og-image.png`) e acum doar sigla pe fundalul marcii: cel vechi avea titlu scris cu fontul marcii si o fotografie, iar fontul vine din Google Fonts la build si nu exista ca fisier in depozit. De cerut designerului daca se vrea inapoi varianta cu titlu. |

---

## E2. Pagini de proba

Niciuna. Cele doua pagini facute ca sa se vada dintr-o privire toate etichetele de stare
(`dashboard/etichete-proba`) si toate alertele de cont (`dashboard/alerte`) au fost sterse dupa
ce si-au facut treaba, la cererea lui. Nu mai e nimic de scos inainte de unire.

⚠ Daca se mai face vreuna, se trece tot aici: nefiind legata din meniu, nu se vede in panou, dar
oricine cu cont ajunge la ea scriind adresa.

## F. Datorii cunoscute, de hotarat inainte de final

- `RAPORT-POPULARE.json`: 39 de defecte de cod si 61 de lipsuri de ecran gasite la popularea
  bazei demo. Nu sunt atinse inca.
- Cotele de TVA din Setari sunt inca 19 / 9 / 5, nu 21 / 11.
- ⚠ **`subtotal` nu inseamna acelasi lucru pe toate canalele.** Masurat pe baza demo, la 26
  din 95 de comenzi `subtotal + transport + ramburs - reduceri` nu da `total`. Comenzile de
  marketplace isi scriu `subtotal` FARA TVA, pe cand `total` e cu TVA (comanda 7110:
  270,25 x 1,21 = 327,00); unele comenzi din magazin poarta in total sume care n-au coloana
  lor. Fila Vanzari nu mai asaza cifrele ca pe o adunare si spune de ce, dar defectul de
  fond ramane in datele de la ingest. De hotarat daca se indreapta la ingest sau se lasa asa
  si se scrie peste tot ca `subtotal` e o fotografie, nu o componenta a totalului.
- `orders_daily_revenue` (grupare pe ziua **UTC**) nu mai e chemat din niciun loc de cod:
  verificat cu `git grep`, ramane doar in `migrations/`, in tipuri si in doua comentarii.
  De hotarat daca il stergem din baza sau il lasam. Cat timp exista, e o capcana: urmatorul
  care cauta „venit pe zile" il gaseste primul si primeste zile UTC.

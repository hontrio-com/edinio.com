# Email marketing: Mailchimp, Brevo, Klaviyo

Trecerea din 18.09.2026. Cererea proprietarului: *„Fa audit la toate 3 si fa-le PERFECTE si COMPLETE si
COMPATIBILE cu platforma noastra.”*

Documentatie citita ca text, din sursele lor autoritare (nu din paginile de prezentare):

* **Klaviyo**: `github.com/klaviyo/openapi`, `openapi/stable.json` (3 MB, 238 de cai), revizia
  `2026-07-15`; plus SDK-ul lor oficial de Node (`klaviyo-api-node`), pentru ce trimite in antete.
* **Brevo**: `swagger_definition_v3.yml`, plus `developers.brevo.com/docs/api-limits`,
  `/docs/limit-headers` si pagina de webhookuri de marketing (numele evenimentelor din corp).
* **Mailchimp**: `mailchimp-client-lib-codegen/spec/marketing.json` (specul din care e generat SDK-ul lor).

---

## Expunerea masurata

Citita din productie inainte de a deschide codul: **niciun magazin** n-a conectat Mailchimp, Brevo sau
Klaviyo; zero configurari, zero erori in jurnal, zero randuri in `mailchimp_suppressions` si
`brevo_suppressions`.

⚠ Expunerea zero ridica pragul: nu exista trafic real care sa scoata defectele la iveala, deci probele
sunt singura plasa, iar tot ce se putea masura s-a masurat pe viu (mai jos).

---

## Masurat pe viu, nu presupus

| Ce | Cum | Rezultat |
| --- | --- | --- |
| Filtrul webhookurilor pe un camp CRIPTAT (`brevo_config->>webhook_secret`) | tranzactie anulata: config scris, cautat prin vedere | gasit la amandoi; in tabel sta `enc.v1.…` |
| Apexul `edinio.com` pe rutele de webhook | cereri adevarate, GET si POST | **308** catre `www`, la amandoua |
| Slashul de la final la Klaviyo (`/events/`) | cereri cu cheie falsa | 401 curat, fara redirectare |
| `content-type` la Klaviyo (specul zice `vnd.api+json`) | sursa SDK-ului lor oficial | trimite `application/json` (axios, fara antet pus de mana) |
| Pretul liniei de comanda fata de produs | comenzile proprii, toate | difera la **188 din 364** de linii (52%) |
| Comenzi proprii anulate sau rambursate | ultimele 90 de zile | **~54 din 290** (~18%) |
| Cantitati fractionare pe linii | comenzile proprii, toate | zero |

---

## Defectele gasite si reparate

### Comune

**1. ⚠⚠ Webhookurile Mailchimp si Brevo stateau pe apex, care raspunde 308.** Adresa se facea din
`NEXT_PUBLIC_SITE_URL`, adica `https://edinio.com`. Mailchimp valideaza adresa cu un GET cand creeaza
webhookul si vrea 200: primea 308, inregistrarea cadea, iar salvarea setarilor inghitea eroarea. Brevo
ar fi trimis dezabonarile intr-o redirectare. Acum amandoua folosesc `adresaPublica()` (gazda canonica,
aceeasi reparatie ca la SMSO si notice.ro pe 17.09), iar esecul inregistrarii se scrie in jurnal.

**2. ⚠⚠ Anularea si rambursarea nu ajungeau la niciunul.** ~18% din comenzile proprii se termina asa, iar
venitul lor ramanea atribuit emailului. Acum le prinde triggerul de pe `orders` (vezi „A doua trecere”,
mai jos), oricare ar fi calea: panoul, lotul, procesatorii, rambursarile confirmate, Netopia, curierii.

* Mailchimp: `PATCH` cu `financial_status: "cancelled"` si `cancelled_at_foreign` (specul: *„passing a
  value for this parameter will cancel the order”*), sau `"refunded"`;
* Brevo: comanda retrimisa cu `status: "cancelled"` / `"refunded"` (upsert dupa id);
* Klaviyo: `Cancelled Order` / `Refunded Order`, numai pentru comenzile raportate ca vanzare.

**3. ⚠ Nicio sincronizare de email nu trecea prin `dupaRaspuns`.** Erau singurele din platforma pornite
cu `void` gol: fiecare face cateva cereri HTTP una dupa alta, iar actiunea raspunde imediat, deci puteau
fi taiate cand functia ingheata. Acum contactele si produsele trec prin `dupaRaspuns` (`after()` cu
jurnal), iar comenzile prin coada (vezi „A doua trecere”).

**4. Transport comun** (`lib/email-marketing/transport.ts`): termen de 15 s si `redirect: "error"` la
toti trei (pana acum numai Mailchimp), plus reluare la **429** dupa `Retry-After` sau
`x-sib-ratelimit-reset` (Brevo), de cel mult doua ori si cel mult 10 s. ⚠ Se reia NUMAI 429: o cadere de
retea poate insemna ca cererea a ajuns, iar un POST repetat ar dubla o comanda.

**5. Linkurile de produs ignorau domeniul propriu**, iar la Mailchimp si Brevo produsele sincronizate
nu primeau deloc link (se astepta un `storeUrl` pe care niciun apelant nu-l trimitea). Acum toate folosesc
`storeBaseUrl` (domeniul propriu cand exista) si `slug`, altfel id-ul, ca feedul Merchant Center.

### Klaviyo

**6. ⚠⚠ Abonarea readucea in lista dezabonatii si reclamantii de spam.** Comentariul din cod spunea ca
abonarea „nu invie niciodata un profil dezabonat”, si de aceea Klaviyo n-avea plasa locala. Documentatia
capatului spune pe dos: *„This API will remove any `UNSUBSCRIBE`, `SPAM_REPORT` or `USER_SUPPRESSED`
suppressions from the provided profiles.”* Acum `subscribeProfiles` citeste intai starea profilelor
(`GET /profiles?filter=any(email,[…])&additional-fields[profile]=subscriptions`, cate 100) si ii sare pe
cei cu suprimare globala, dezabonati sau suprimati pe lista noastra. Daca starea nu se poate citi, **nu
aboneaza pe nimeni**; conectarea refuza o cheie fara `profiles:read`. Consimtamantul poarta `custom_source`
(„Edinio: Checkout”), ca sa se vada in Klaviyo de unde a venit.

**7. ⚠ „Placed Order” pleca si pentru cardul inca neplatit**, contra regulii `vanzareaEConfirmata` pe
care o respecta Meta, TikTok si GA4. Acum la creare pleaca numai la ramburs si transfer; la plata online,
la evenimentul de plata din coada, cand banii au intrat. Klaviyo pastreaza doar primul eveniment cu acelasi
`unique_id`, deci si trimiterea dubla e inofensiva.

**8. Fara moneda.** `value_currency` lipsea, deci venitul intra in moneda implicita a CONTULUI. Acum `RON`.

**9. „Ordered Product”, cate unul pe linie** (metrica lor standard, pe care stau fluxurile si segmentele
pe produs), cu `unique_id` pe LINIE: acelasi produs in doua variante nu se pierde.

**10. Catalogul facea PATCH dupa orice esec al POST-ului**, deci si dupa o cheie invalida. Acum: PATCH
intai (produsul editat exista), POST numai la 404. Ordinea e asa fiindca specul nu da codul duplicatului
(scrie doar `4XX`), iar „nu exista” e 404 pe orice resursa cautata dupa id.

**11. Lotul de catalog se oprea la primul produs respins.** Acum se opreste doar la 401/403 (s-ar repeta
la fiecare produs); restul se numara si se scriu o data.

**12. Revizia** `2026-04-15` → `2026-07-15`, cea a specului stabil, pe care sunt verificate corpurile.

### Brevo

**13. ⚠⚠ Catalogul nu se actualiza niciodata.** Specul: *„When `updateEnabled` is `false` (the default)
… if the product ID already exists, a `400` error is returned.”* Nu trimiteam niciodata `updateEnabled`,
iar comentariul spunea „upserts by id”. Deci dupa prima creare nicio schimbare de pret, nume sau imagine
nu mai ajungea. Acum catalogul trimite `updateEnabled: true`.

**14. ⚠ Lotul se oprea la primul produs deja existent** (400, apoi `break`), iar `batchProducts`, nechemata,
trimitea cate 200 (specul: *„up to 100 product objects”*). Acum lotul merge prin `POST /products/batch`,
cate 100, cu `updateEnabled: true`. Pe planul gratuit, `POST /v3/products` primeste 2 cereri pe secunda.

**15. ⚠⚠ Panoul promitea o confirmare dubla care nu exista.** Scria sa o „activezi pe lista in Brevo”;
pentru contactele trimise prin API, lista Brevo n-are asa ceva. Acum exista confirmare dubla reala:
`POST /contacts/doubleOptinConfirmation` (email, `includeListIds`, `templateId`, `redirectionUrl`), cu
un sablon ales din contul lor si **verificat la salvare** (`doiTemplate: true`, care apare numai la
citirea unui singur sablon). Dupa confirmare, clientul ajunge inapoi in magazin. Importul clientilor
existenti e refuzat cat timp ea e pornita, fiindca `/contacts/import` n-o are.

**16. Webhookul asculta doar dezabonarea.** Acum si `hardBounce` si `spam`; in corp vin scrise
`unsubscribe`, `hard_bounce`, `spam` (ruta le recunoaste pe toate), iar un webhook vechi se actualizeaza,
nu se dubleaza.

**17. Liniile comenzii intra ca „creeaza daca lipseste”** (`updateEnabled: false`), nu ca upsert: pretul
liniei difera de al produsului la 52% din linii, deci un upsert ar fi repretuit catalogul la fiecare comanda.

**18. Cantitatea**: specul cere `quantity` intreg, altfel `quantityFloat`. Azi toate sunt intregi; acum si
o cantitate cu zecimale trece.

### Mailchimp

**19. ⚠ Fiecare comanda repretuia catalogul.** Liniile treceau prin `upsertProduct`, care rescria titlul si
pretul produsului cu ale liniei. Acum `ensureProduct`: GET, si POST numai daca lipseste.

**20. ⚠ Magazinul de comert ramanea legat de audienta veche.** Specul: *„The `list_id` for a specific
store cannot change.”* Id-ul era doar `edinio_<magazin>`, deci dupa schimbarea audientei comenzile intrau
in magazinul celei vechi. Acum id-ul e legat de audienta, se face unul nou la schimbare, `ensureStore`
refuza un magazin al altei audiente, iar webhookul de pe audienta veche se sterge.

**21. La deconectare, webhookul ramanea agatat** in contul lor. Acum se sterge (dupa ruta, deci si unul
vechi, de pe apex).

---

## Probele

* `src/lib/email-marketing/email-conform-documentatiei.test.ts` (58): transportul, regulile de suprimare
  Klaviyo pe toate cele cinci motive, corpurile verificate pe campurile cerute de spec, catalogul in lot la
  toti trei, `updateEnabled` si activarea comertului Brevo, confirmarea dubla, webhookurile pe gazda
  canonica, regulile pure ale evenimentelor (metricile Klaviyo, starea Mailchimp, atribuirea campaniei),
  captarea `mc_cid` rulata pe functia adevarata, si **coada**: triggerul prinde crearea si orice schimbare
  de status sau de plata, nu poate opri o comanda, pastreaza ordinea, are arenda mai lunga decat cronul, iar
  NICIO cale din aplicatie nu mai trimite comenzi pe langa ea.
* `src/lib/email-marketing/email-sync-runtime.test.ts` (36): functiile de eveniment ale celor trei rulate
  chiar ele, cu un PostgREST de proba si un `fetch` de proba; **ruta cronului rulata ea**, cu fiecare verdict
  insemnat corect (trimis, sarit, esuat reprogramat, refuzat abandonat si scris in jurnal); catalogul dupa
  starea din baza; ruta webhookului Brevo; `saveBrevoSettings` cu activarea comertului si moneda.
* `src/lib/orders/client-de-marketplace.test.ts`: poarta de marketplace ceruta in ORICE functie care citeste
  comanda (cautata dupa `.from("orders")`, nu dupa nume), si in fiecare functie de eveniment a cozii.
* Bancuri de mutanti: la prima trecere **70 de stricaciuni, toate prinse**; la a doua **59, toate prinse**
  dupa o intarire. Una scapase: o conditie strecurata la coada clauzei de ordine din revendicare
  (`and false`), fiindca proba cauta doar inceputul clauzei. Acum o cere intreaga.

Suita intreaga (9052), `tsc`, poarta de lint (57 de erori, niciuna noua) si buildul: verzi.

---

## Verificat pe productie

* `db5f2dd8`, desfasurarea `dpl_95pSuMPrMRNYsWosbcgdwfsdcQYj`, gata in 50 s, cu toate domeniile legate.
  CI: toate patru verificarile verzi.
* Rutele de webhook raspund **200** pe `www.edinio.com` (GET si POST); un secret strain nu scrie nimic.
* ⚠ **Ruta Brevo rulata pe productie, cu un secret adevarat**: am pus temporar un secret pe un magazin fara
  Brevo (`enabled: false`, fara cheie, deci nimic spre Brevo) si am trimis cinci evenimente. S-au scris
  exact trei, cu motivul corect: `hard_bounce`, `spam`, `unsubscribed`; `opened` si `soft_bounce` nu.
  Apoi randurile sterse si configurarea pusa inapoi la `null` (verificat: zero suprimari).
* Nicio eroare de rulare si nimic in `error_logs` dupa desfasurare.
* ⚠ Nevazut: o sincronizare adevarata. Niciun magazin n-a conectat inca vreunul dintre cei trei.

A doua trecere (`a83c69b6`, desfasurarea `dpl_FZc9J9kNuX7p11SJDFRfuEk1YBbF`):

* Migratia aplicata in productie INAINTE de desfasurare, baseline-ul regenerat din productie (numai adaugari:
  tabelul, cele doua functii, cele doua triggere), in acelasi commit. CI: „schema din Git = productie” verde.
* Triggerul probat pe productie intr-o tranzactie anulata (vezi punctul 22).
* ⚠ **Coada rulata cap la cap pe productie**: am pus manual randuri in coada pentru comenzi reale ale unor
  magazine fara email marketing. Cronul le-a revendicat in minutul urmator (arenda de 5 minute pusa), fiecare
  dispecer a citit comanda fara eroare si a insemnat randul: „sarit: comanda fara email” pentru o comanda
  fara email, „sarit: integrarea e oprita” pentru una cu email. Niciun apel catre vreun furnizor. Randurile de
  proba sterse apoi (coada: zero randuri).
* Ruta cronului raspunde 401 fara secret. Nicio eroare de rulare dupa desfasurare.

## A doua trecere (18.09.2026): „rezolva tot ce poti rezolva din cod”

### 22. ⚠⚠ Coada de evenimente de comanda, scrisa de baza

Pana acum fiecare cale din aplicatie anunta singura furnizorii, o singura data, dupa raspuns. Doua goluri:

* **expedierea si livrarea nu ajungeau la niciunul**: statusul `shipped` / `delivered` il pun ~17 urmariri de
  curier, fiecare in cronul ei; a le cabla una cate una ar fi ramas in urma la primul curier nou;
* **un esec al furnizorului pierdea evenimentul**: un 503 sau un termen depasit insemna o comanda care nu mai
  ajungea niciodata la ei.

Acum (`migrations/2027-01-28-email-marketing-coada.sql`): un **trigger pe `orders`** scrie in
`email_marketing_coada` cate un rand pe (comanda, furnizor, eveniment) la creare si la ORICE schimbare de status
sau de plata, numai pentru furnizorii conectati cu e-commerce pornit. `/api/cron/email-marketing` o goleste din
minut in minut, cu tiparul cozii de conversii: arenda de 5 minute (mai lunga decat `maxDuration`), ordinea
pastrata pe (comanda, furnizor), esec reprogramat (1, 5, 20, 60, 240, 720 de minute), refuz abandonat pe loc si
scris in jurnal. ⚠ Triggerul isi inghite orice eroare: o coada care cade nu poate strica o comanda.

Ce primeste fiecare:

| Eveniment | Mailchimp | Brevo | Klaviyo |
| --- | --- | --- | --- |
| creata | comanda intreaga, `PUT` (idempotent) | comanda intreaga, statusul de acum | „Placed Order” + „Ordered Product” (numai daca e vanzare) |
| platita | `financial_status: paid` | comanda cu statusul de acum | „Placed Order” (Klaviyo il pastreaza doar pe primul) |
| expediata | `fulfillment_status: shipped` | idem | „Fulfilled Order” |
| livrata | nimic (Mailchimp n-are stare de livrare) | idem | „Delivered Order” (metrica noastra) |
| anulata | `cancelled` + `cancelled_at_foreign` | idem | „Cancelled Order” |
| rambursata | `refunded` | idem | „Refunded Order” |

Brevo primeste la fiecare eveniment statusul din RANDUL de acum (`pending`, `processing`, `completed`,
`cancelled`, `refunded`), nu din eveniment: la ramburs „platita” vine DUPA livrare.

⚠ Probat pe productie inainte de livrare, intr-o tranzactie anulata: plata si expedierea scriu cate un rand pe
furnizor, repetarea nu dubleaza, anularea castiga cand vine impreuna cu rambursarea, marketplace-ul nu scrie
nimic, revendicarea ia doar cel mai vechi eveniment pe (comanda, furnizor).

### 23. ⚠⚠ Brevo: aplicatia eCommerce nu era activata niciodata

Documentatia lor: *„To use these endpoints, your account must have the Brevo eCommerce application enabled.”*
Pe un cont nou, fiecare produs si fiecare comanda ar fi fost respinse. Acum, la pornirea e-commerce:
`POST /ecommerce/activate`, apoi **moneda de afisare RON** (`/ecommerce/config/displayCurrency`; comenzile
lor n-au camp de moneda, deci suma se citeste in moneda contului). Activarea dureaza cateva minute (403 pana
atunci): panoul o spune, iar coada reia comenzile singura.

Comanda Brevo poarta acum si `billing` (adresa, oras, judet, cod postal, tara, telefon, metoda de plata) si
`coupons`.

### 24. ⚠ Catalogul intreg nu pleca niciodata

Cand comerciantul pornea e-commerce, produsele existente nu mergeau nicaieri: in catalog intrau doar cele
editate dupa. Acum tot catalogul pleaca singur la pornire (si la schimbarea audientei Mailchimp), iar panoul
are butonul **„Sincronizeaza catalogul”**. Cel mai mare catalog de pe platforma are **3351 de produse**, deci
totul merge in loturi: Klaviyo, joburi de creare si actualizare cate 100 (68 de cereri); Mailchimp,
`POST /batches` cate 500 de operatii (7); Brevo, `/products/batch` cate 100 (34).

⚠ **Hotaraste baza, nu apelantul**: activ se publica, scos din vanzare se scoate din recomandari (Klaviyo
`published: false`, Brevo `isDeleted`, Mailchimp sters), sters din baza se sterge si la ei. Pana acum un produs
stins, editat, era republicat in emailuri.

La Mailchimp produsul se pune intr-un singur `PUT` („Create or update product”), nu in pana la trei cereri.

### 25. ⚠ Mailchimp nu putea atribui venitul campaniei

Linkurile din campaniile lor poarta `mc_cid` (campania) si `mc_tc`. Nu le captam, deci Mailchimp nu stia carei
campanii sa-i dea venitul. Acum se fotografiaza la aterizare, langa `utm_*` si `gclid`, si pleaca pe comanda
drept `campaign_id`, `tracking_code` (numai `prec`, singura valoare permisa de spec) si `landing_site`.
Comanda poarta si `shipping_total`, `discount_total`, `promos` si `shipping_address`.

---

## Ce tine de comercianti

1. **Klaviyo**: cheia privata (`pk_…`) cu permisiuni de citire a profilelor, pe langa scriere. Fara ele,
   conectarea e refuzata cu mesajul care spune de ce.
2. **Brevo, confirmarea dubla**: un sablon de tip „Double opt-in confirmation” facut in Brevo, ales apoi in
   panou. **Brevo, comertul**: la prima pornire, cateva minute pana il activeaza ei.
3. **Mailchimp**: notificarile de comanda (confirmare, expediere, anulare, rambursare) pleaca numai daca
   comerciantul le-a facut in Mailchimp; noi trimitem doar starea.

## Ce ramane

1. **Nevazut pe trafic real**: niciun magazin n-a conectat vreunul dintre cei trei. Tot ce se putea masura fara
   un cont al lor s-a masurat (vezi mai sus); restul, dupa specurile si SDK-urile lor.
2. **Urmarirea pe site** (klaviyo.js, Brevo Tracker, Mailchimp Connected Site) nu exista: cosurile abandonate
   si produsele vazute raman pe sistemul Edinio, dinadins (un singur loc care trimite emailuri de recuperare).
3. **Variantele** pleaca drept produsul lor de baza, cu o singura varianta; comenzile poarta pretul liniei.

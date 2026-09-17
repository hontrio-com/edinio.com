# Google Analytics 4: evidenta integrarii

Trecerea din 17.09.2026. Cererea proprietarului: *„fa si aici un audit complet si verifica daca avem absolut
tot conform documentatiei lor si daca functioneaza totul PERFECT”*.

Documentatie citita ca text, cap la cap (nu rezumata de un model):

* Measurement Protocol: prezentare, trimiterea evenimentelor, referinta, validarea;
* comert electronic (`ecommerce`) si referinta evenimentelor recomandate (`purchase`, `refund`);
* Consent Mode (forma de baza), pentru site-uri cu banner propriu;
* OAuth 2.0 pentru aplicatii web, plus ghidul permisiunilor granulare;
* Data API: cote, rapoarte in timp real, `runReport`, `runRealtimeReport`;
* Admin API: `accountSummaries.list`, `dataStreams.list`, `measurementProtocolSecrets` (resursa, `list`, `create`).

⚠ Integrarea asta e a COMERCIANTILOR (OAuth, rapoarte in panou, tag pe vitrina, trimitere de pe server).
Urmarirea platformei Edinio (`edinio-marketing`, `admin-analytics`) a fost inchisa la auditul din 03.09.2026
si n-a fost redeschisa. Evenimentele din browser ale vitrinei (lista, produs, cos, checkout, achizitie) au
fost verificate atunci; aici s-a atins doar achizitia, ca sa poarte aceleasi valori ca serverul.

---

## Expunerea masurata

Citita din productie inainte de a deschide codul:

* **4 magazine** cu `google_analytics_config`: `okxi` (OAuth), `itp-blk` (OAuth, al proprietarului),
  `mokka` (conectare manuala), `teoshop` (blocat: are token, dar n-a ales nicio proprietate);
* **un singur magazin cu trimitere de pe server** (`api_secret`): `okxi`;
* la `okxi`, **164 de comenzi in 90 de zile, dintre care 152 din eMAG si Trendyol**. Pe vitrina raman 12,
  iar **3 au `ga_client_id`**;
* dupa legarea GA la `okxi` (14.08.2026): **60 de comenzi de marketplace si 4 comenzi cu cardul neplatite**
  trecute pe anulat sau rambursat;
* la magazinele conectate, transportul e **intre 8% si 21%** din totalul comenzilor de vitrina;
* tokenul OAuth e criptat in repaus (vederea `store_settings` il decripteaza doar pentru server).

---

## Ce ofera documentatia si ce foloseam

| Ce | Inainte | Acum |
| --- | --- | --- |
| OAuth, `analytics.readonly` | folosit | folosit, **cu dreptul acordat verificat** |
| `accountSummaries.list`, `dataStreams.list` | folosite | folosite; fluxul ales si dupa `edinio.com/<slug>` |
| `measurementProtocolSecrets.list` | nefolosit | **verifica `api_secret` lipit** |
| Data API `batchRunReports` | folosit | la fel |
| `runRealtimeReport` | folosit, totalul adunat din 10 tari | `metricAggregations: TOTAL` |
| Measurement Protocol `purchase` / `refund` | folosite | cu `session_id`, `consent`, `shipping`, `tax`, capatul UE |
| raspunsul Measurement Protocol | ignorat | citit, refuzul scris in jurnal |
| Consent Mode, forma de baza | folosit in browser | respectat si de server |
| revocarea tokenului la deconectare | nefolosita | **nefolosita, dinadins** (vezi mai jos) |
| Data Manager API | nefolosit | nefolosit (documentatia il recomanda pentru integrari NOI) |

---

## Defectele gasite si reparate

### 1. ⚠⚠ Rambursari pentru achizitii care nu intrasera niciodata in GA

`updateOrder` trimitea `refund` la orice trecere pe `cancelled` sau `refunded`. Dar achizitia NU pleaca
pentru o plata online neincasata, o comanda de marketplace, o comanda facuta de mana in panou, sau un
cumparator care a refuzat analiza. Pentru toate, rambursarea scadea din venitul GA bani care nu intrasera
acolo. La `okxi`, pana la 64 de comenzi au putut trimite asa ceva; nu exista istoric de statusuri care sa
spuna cate au trecut chiar prin panou.

Reparat: tabelul `ga4_comenzi_raportate` (migratia `2027-01-25`), cu RLS si fara politici. Randul se scrie
**abia dupa ce Google raspunde 2xx** la achizitie, iar rambursarea pleaca numai daca randul exista si nu
s-a mai rambursat. O urma a faptului, nu o deductie din metoda de plata.

⚠ Tabel separat, nu coloana pe `orders`: `orders` are `set_orders_updated_at`, iar o scriere din drumul de
analiza ar fi mutat `updated_at`. ⚠ Comenzile raportate inainte de migratie n-au rand, deci anularea lor nu
mai trimite rambursare: o rambursare lipsa lasa venitul prea mare, una falsa il strica fara urma.

### 2. ⚠⚠ Achizitia pleca de pe server si pentru cine REFUZASE analiza

Tag-ul din browser e in Consent Mode de baza: nu se incarca pana cand omul nu accepta analiza. Serverul
trimitea oricum, iar cand `_ga` lipsea inventa un `client_id`. Dar `_ga` lipseste tocmai la cine a refuzat.

⚠ Si un `_ga` prezent nu dovedea acordul: pe adresa comuna `edinio.com/<magazin>` cookie-ul sta pe
domeniul `edinio.com`, unde il scrie si tag-ul platformei.

Reparat: checkout-ul fotografiaza in comanda acordul dat **acestui magazin** (`edinio_cc_<slug>`), iar
`verdictTrimitere` hotaraste: fara banner, se trimite cu totul acordat (ca tag-ul); cu banner, doar daca
omul a acceptat analiza, cu `ad_user_data` si `ad_personalization` dupa alegerea pentru marketing; la o
comanda veche, doar daca are `_ga`. Cookie-urile GA nu se mai iau de la cine a refuzat analiza la magazin.

### 3. ⚠⚠ `value` purta transportul

Documentatia, la `purchase` si `refund`: *„Set value to the sum of (price \* quantity) for all items in items.
Don't include shipping or tax.”* Trimiteam totalul comenzii.

**Hotararea proprietarului, 17.09.2026: conform documentatiei, doar pentru GA4.** `valoriGa4`: `value` =
total fara transport, fara taxa de ramburs si fara TVA-ul adaugat peste (la preturi fara TVA); `shipping` =
transport + taxa de ramburs; `tax` = TVA. Din `total`, nu din articole: 275 din 304 comenzi respecta exact
`total = subtotal - reduceri + transport + taxa de ramburs`, iar articolele nu poarta reducerile.

⚠ Browserul si serverul folosesc ACEEASI functie: GA4 pastreaza un singur `purchase` pe `transaction_id`,
deci calculate diferit, venitul ar fi depins de care ajunge primul. Meta, TikTok si Google Ads raman pe total.

⚠ **Vizibil in conturi**: venitul GA4 al magazinelor scade cu cat costa transportul. Nu e o regresie.

### 4. ⚠⚠ Achizitia de pe server fara sesiune

Documentatia: `session_id` e „required for several common use cases”; fara el, evenimentul nu se leaga de
sesiunea lui, deci n-are sursa. La plata cu cardul, omul adesea nu se mai intoarce pe pagina de confirmare:
achizitia de pe server e singura, iar venitul cadea la „Unassigned”.

Reparat: checkout-ul ia cookie-urile `_ga_<ID>` (valoarea intreaga, cum accepta documentatia), serverul o
alege pe a fluxului magazinului si o trimite cu `engagement_time_msec`. Doar la achizitie: rambursarea vine
zile mai tarziu, iar sesiunea se leaga doar 24 de ore.

### 5. Raspunsul ignorat, parametrii taiati tacut

* Documentatia: Measurement Protocol raspunde 2xx daca a PRIMIT cererea; un non-2xx e o cerere stricata, de
  nereincercat. Raspunsul nu se citea. Acum un refuz se scrie in `error_logs` (`ga4.cumparare`, `ga4.rambursare`).
* „Parameter values ... must be 100 characters or fewer”, iar validarea implicita IGNORA parametrul mai lung.
  Numele de produs si id-urile se taie acum la 100.
* Capatul din UE (`region1.google-analytics.com`), documentat pentru colectarea datelor in UE.

### 6. ⚠⚠ `api_secret` neverificat

Google raspunde 2xx si la un `api_secret` gresit, deci un secret copiat din alt flux facea ca toate
achizitiile de pe server sa dispara, cu eticheta „Activ” in panou.

Reparat: `measurementProtocolSecrets.list` merge cu dreptul pe care il avem deja (`analytics.readonly`) si
intoarce `secretValue`. La salvare, un secret care NU e al fluxului legat se refuza; un secret deja salvat se
poate verifica din panou (butonul „Verifica”), iar panoul spune „verificat la Google” sau „neverificat”. La
schimbarea fluxului, verificarea se sterge. La conectarea manuala nu se poate verifica, si panoul o spune.

### 7. ⚠⚠ Dreptul OAuth acordat nu se verifica

Cerem `openid email` plus `analytics.readonly`, deci Google arata ecranul GRANULAR. Documentatia: aplicatia
„must check what scopes are granted by the users and can't assume users grant all requested scopes”. Un token
fara drept se salva, lista de proprietati cadea tacut, iar omul ramanea pe „Alege proprietatea”.

Reparat ca la Google Merchant (acelasi client OAuth, care avea deja `hasContentScope`): `hasAnalyticsScope`
in callback, inainte de salvare (`ga=noscope`), si din nou la reimprospatarea tokenului.

### 8. Toate caderile tokenului erau „sesiune expirata”

`getAccessToken` intorcea `null` pentru orice, deci o pana de cateva secunde la Google trimitea omul sa refaca
tot dansul OAuth. Acum `obtineTokenul` deosebeste `invalid_grant` (revocat), dreptul lipsa si
indisponibilitatea, iar un 403 de proprietate nu mai e prezentat ca „reconecteaza-te”.

### 9. Totalul in timp real, fluxul gresit, apelurile inghetate

* Totalul utilizatorilor activi aduna primele 10 tari; acum vine din `metricAggregations: TOTAL`.
* Fluxul se potrivea doar pe domeniul propriu, dar 58 din 71 de magazine stau pe `edinio.com/<slug>`: se lua
  primul flux web, care putea fi al altui site. Acum si dupa slug.
* Apelurile catre GA4 din comenzi erau `void`: pe serverless pot fi inghetate inainte sa plece. Aceeasi clasa
  de defect reparata la marketplace-uri pe 24.08.2026. Acum toate patru prin `dupaRaspuns`.
* Oprirea urmaririi din panou (`tracking_enabled: false`) opreste acum si serverul, nu doar tag-ul.

---

## Ce NU s-a facut, dinadins

* **Revocarea tokenului la deconectare.** Documentatia o recomanda, dar clientul OAuth e comun cu Google
  Merchant, cu `include_granted_scopes=true`. Revocarea ar fi taiat si legatura Merchant a aceluiasi cont Google.
* **Legarea `state`-ului OAuth de sesiunea browserului.** Callback-ul cere deja utilizatorul logat si
  proprietatea magazinului din `state`, iar `state` e semnat; nimeni nu poate lega contul sau GA la magazinul
  altcuiva.
* **Data Manager API.** Documentatia Measurement Protocol il recomanda pentru integrari server-la-server NOI;
  Measurement Protocol ramane „operational with no plans for deprecation”.

---

## Cum s-a probat

`src/lib/google-analytics/ga4-conform-documentatiei.test.ts`: **44 de probe**. Regulile se CHEAMA: valorile,
verdictul de acord, sesiunea, corpul cererii; raportarea achizitiei si a rambursarii pe o baza falsa, cu
`fetch` inlocuit; citirea acordului si a cookie-urilor intr-un browser de mana; `obtineTokenul` cu raspunsuri
Google simulate.

**Banc de mutanti: 50 din 50 prinsi**, pe 12 fisiere. ⚠ La prima trecere unul scapase din vina bancului: ancora
aparea de doua ori (in comentariu si in constanta), iar mutantul lovea comentariul. Ambele bancuri ale zilei au
fost reverificate apoi: fiecare ancora se potriveste exact o data.

---

## ⚠ O greseala a mea, reparata in aceeasi zi

Un script de inlocuire a ghilimelelor, rulat printr-un heredoc, a pierdut o bara inversa: `\1` a devenit
caracterul `\x01`, deci textul dintre ghilimele s-a STERS. A atins 15 locuri in fisierele GA4 si 29 in
commit-ul notice.ro deja impins (comentarii si fisa). Nimic functional, dar text mutilat in depozit. Toate au
fost refacute din scrierile mele si din transcrierea sesiunii de dinainte, iar la final niciun fisier nu mai
contine `\x01`.

---

## Ce ramane NEDOVEDIT

1. **Secretul `okxi` e al fluxului lor?** Se afla apasand „Verifica” in panoul lor, sau cu creditele OAuth
   (care stau doar in Vercel).
2. **Cate rambursari false au ajuns deja in GA-ul `okxi`?** Se poate citi din Data API, doar citire, tot cu
   creditele OAuth din Vercel. Proprietarul a aprobat citirea; creditele nu au fost decriptate.
3. **`teoshop`** a ramas cu tokenul si fara proprietate. Daca tokenul lui nu are dreptul de analiza, acum va
   vedea mesajul exact in loc de o lista goala.
4. **Nimic din cele de mai sus n-a trecut inca pe trafic real**: prima comanda de vitrina la `okxi` dupa
   desfasurare trebuie sa lase un rand in `ga4_comenzi_raportate`, cu acord si sesiune in `order_source`.

---

## Nota

**9 din 10.**

Conectarea OAuth, rapoartele si tag-ul de pe vitrina mergeau si merg. Tot ce era gresit fata de documentatie
e reparat, probat si prins de mutanti: venitul, rambursarile, acordul, sesiunea, secretul, dreptul OAuth.

⚠ **De ce nu mai mult**: reparatiile de pe server n-au rulat inca pe o comanda reala, iar doua masuratori
(secretul `okxi` si rambursarile deja trimise) cer creditele OAuth. Urca la 9,5 cand prima comanda de vitrina a
unui magazin cu secret lasa rand in `ga4_comenzi_raportate`, si la 10 cand secretul `okxi` e verificat la Google
si o anulare reala trimite (sau, corect, NU trimite) rambursarea.

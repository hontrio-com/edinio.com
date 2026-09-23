# Conturi de client in magazine: planul

Cerut pe 23.09.2026: cumparatorii dintr-un magazin sa isi poata face cont si sa vada acolo
istoricul comenzilor, istoricul facturilor si restul.

Documentul asta e PLANUL, nu raportul de lucru. Ce se face efectiv se scrie, in clipa in care
se face, in [`REGISTRU.md`](REGISTRU.md), ca orice altceva din redesign.

**Ramura Git:** `conturi-clienti`, pornita din `main` pe 23.09.2026.
**Baza:** ramura Supabase demo `krycmubsiojipwslxrka`. Productia NU se atinge.

---

## 0. Hotararile proprietarului, luate inainte de plan

**H1. Contul e OPTIONAL.** Isi face cont cine vrea. Comanda ca musafir ramane exact cum e azi,
nicaieri nu se cere cont ca sa poti cumpara.

**H2. Comerciantul aprinde functia din Setari.** E o setare pe magazin, stinsa implicit.

Din ele ies doua reguli care taie mult din plan:

- **Valul 1 nu atinge fluxul de comanda.** Nici `order.actions.ts`, nici `checkout-core.ts`,
  nici `OrderModal.tsx`. Checkout-ul e drumul banilor si exista in doua copii care s-au departat
  deja una de alta. Precompletarea adresei dintr-un cont e un val separat.
- **Cumparatorul anonim nu plateste nimic in plus.** Nicio cerere noua, niciun cookie, nicio
  citire. Asta e o proba, nu o intentie.

---

## 1. Ce s-a masurat inainte de a hotari ceva

Toate cifrele sunt citiri pe PRODUCTIE, 23.09.2026.

### Cine sunt cumparatorii

| Masura | Valoare |
|---|---|
| Comenzi, total | 548 |
| Din marketplace (`order_source` are cheia `marketplace`) | 205 |
| **Comenzi facute chiar in vitrina** | **343**, la 19 magazine |
| Comenzi de vitrina cu telefon normalizabil | **343, adica toate** |
| Comenzi de vitrina cu email | 276, adica 80% |
| Randuri in `customers` | 1.592, din care 368 fara email |
| Magazine publicate | 70 |
| Conturi in `auth.users` | 171 |
| Emailuri de cumparator care apar in DOUA magazine | **zero** |
| Emailuri care sunt si cont de comerciant, si cumparator | 1 |
| Cel mai fidel cumparator al platformei | 10 comenzi |

Din tabelul asta ies trei hotarari:

1. **Cheia de revendicare e telefonul, nu emailul.** Toate cele 343 de comenzi de vitrina au
   telefon; doar 80% au email. Un cont cheiat numai pe email ar lasa pe dinafara unul din cinci.
2. **Contul e pe MAGAZIN, nu pe platforma.** Zero oameni cumpara azi din doua magazine Edinio.
   Un cont de platforma ar face ambigue, dintr-o data, consimtamantul, dezabonarile si limitele
   de cupon, care sunt toate pe `business_id`.
3. **Istoricul e mic.** Cel mai mare cumparator are 10 comenzi. Paginarea se scrie corect de la
   inceput, dar nu se proiecteaza nimic pentru volum.

### Pe canale, si de ce conteaza

| Canal | Comenzi | Cu telefon | Cu email | Magazine |
|---|---|---|---|---|
| Vitrina proprie | 343 | 343 (100%) | 276 (80%) | 19 |
| eMAG | 131 | 130 | **0** | 1 |
| Trendyol | 74 | **0** | 74, toate aliasuri | 2 |

**Comenzile de marketplace NU intra in cont.** Trendyol nu are niciun telefon si are numai
emailuri-alias ale platformei lor, deci un cont pe email ar putea deschide istoricul altui om.
eMAG are telefon si s-ar lipi singur de cont. In plus, la amandoua ciclul comenzii e tinut de
ei, deci butoanele de retur si de factura nici n-ar avea ce face.

### Facturile

| Masura | Valoare |
|---|---|
| Comenzi cu factura | 299 din 548 |
| SmartBill | 286 |
| Oblio | 10 |
| fGO | 3, toate de TEST si stornate |
| Comenzi SmartBill cu `smartbill_invoice_url` completat | **zero** |

Ultimul rand e cel care conteaza: **un ecran „Facturile mele" construit din coloana de adresa
ar fi gol pentru tot istoricul.** PDF-ul se aduce viu de la casa de facturare, cu tokenul
comerciantului, pe server.

### Unde sunt servite magazinele

| Masura | Valoare |
|---|---|
| Magazine publicate | 70 |
| Cu domeniu propriu | 13 |
| Cu domeniu propriu si sanatos | 12 |
| **Publicate pe originea comuna `www.edinio.com`** | **57** |
| Cu domeniul masurat CAZUT | 1 |
| Din cele 19 magazine cu comenzi de vitrina, cate au domeniu sanatos | 8 |
| **Comenzi de vitrina acoperite de cele 8** | **318 din 343, adica 92,7%** |

Tabelul asta hotaraste capitolul 3, si e singurul motiv pentru care functia nu porneste peste
tot din prima zi.

### O descoperire de pe drum, care nu e despre conturi

**64 de comenzi au `order_source` NULL**, la 15 magazine, de la 31.05.2026 pana la 16.09.2026,
deci nu e doar istorie veche, se intampla si azi.

Urmarea: regula scrisa firesc, `not (order_source ? 'marketplace')`, intoarce NULL pentru ele,
deci le ARUNCA in tacere. Masurat: 279 de randuri in loc de 343. **Unul din cinci cumparatori
si-ar fi vazut contul fara comenzile lui, fara nicio eroare.**

Forma corecta, si singura care se foloseste de acum incolo:

```sql
not coalesce(o.order_source ? 'marketplace', false)
```

Panoul comerciantului nu are defectul asta: el filtreaza cu `.is("order_source->>marketplace", null)`,
care prinde si randurile NULL. Verificat.

---

## 2. Arhitectura: unde sta identitatea cumparatorului

S-au scris cinci arhitecturi independente, fiecare aparand alta ipoteza, judecate fiecare prin
patru lentile, apoi o sinteza pe care au atacat-o patru sceptici si un critic de completitudine.
Trei din patru sceptici au daramat prima sinteza. Ce urmeaza e forma de dupa reparatii.

### Hotararea

**Cumparatorul NU intra niciodata in `auth.users` si nu devine niciodata `authenticated`.**
Identitatea lui sta in tabele proprii din schema `privat`, sesiunea e un jeton opac al nostru
intr-un cookie `httpOnly`, si nu exista parola: intrarea se face cu un cod de sase cifre.

### De ce, pe litere: cele sapte capcane

Alegerea nu e de gust. Sunt sapte lucruri din codul de azi care omoara orice alta varianta.

**1. `handle_new_user` da fiecarui cont nou un profil de COMERCIANT.**
Declansatorul de pe `auth.users` insereaza un rand in `users_profile` cu `plan='free'`, pentru
ORICE cont nou, fara nicio conditie. Deci fiecare cumparator ar fi numarat langa comercianti in
panoul de admin, ar intra in distributia pe planuri si ar putea ajunge pe `/onboarding/details`
sa isi faca magazin.
→ **Raspuns: cumparatorul nu ajunge in `auth.users`, deci declansatorul nu se atinge deloc.**

**2. Poarta MFA refuza orice sesiune fara rand in `users_profile`.**
`src/lib/auth/mfa.ts:140`: `if (!profil) return true;`, iar `true` inseamna „opreste cererea".
`poartaMfaActiuneServer` ruleaza la FIECARE POST catre orice cale, dinadins fara nicio scutire
(id-ul actiunii se rezolva dintr-un manifest global), si ruleaza INAINTEA rutarii pe gazda.
→ **Raspuns: poarta iese pe prima linie fiindca nu gaseste niciun cookie `sb-*-auth-token`**
(`areCookieDeSesiune`, `poarta-mfa.ts:34-39`). Un cumparator logat costa exact cat unul anonim:
zero. Randuri schimbate in poarta MFA: doar un `export` pe `NUME_COOKIE_SESIUNE`, ca proba sa
importe constanta adevarata in loc de o copie.

**3. Cookie-ul Supabase se ciocneste cu cel al comerciantului.**
Numele vine din proiectul Supabase, nu din site, e host-only si `path:"/"`, si nu poate fi
`httpOnly` fiindca `createBrowserClient` cere sa-l citeasca JS-ul. Pe `www.edinio.com`, un
comerciant care s-ar loga si ca si cumparator pe vitrina lui si-ar pierde sesiunea de panou.
→ **Raspuns: cookie propriu, cu alt nume, `httpOnly: true`.** Cele doua nu se mai vad.
`httpOnly` conteaza aici mai mult decat oriunde: pe vitrina ruleaza pixelii alesi de comerciant.

**4. Pe domeniul propriu, `updateSession` nu ruleaza niciodata.**
Ramura de domeniu propriu din `src/proxy.ts` iese cu `rewrite` inainte de apelul de la `:431`,
deci nu exista nicio reimprospatare de token Supabase acolo.
→ **Raspuns: nu folosim tokenuri Supabase, deci nu avem ce reimprospata in proxy.** Jetonul
nostru e valabil 30 de zile si se roteste in rutele `/api/cont/**`, singurele locuri unde chiar
se poate scrie un cookie. Proxy-ul nu se atinge cu niciun rand.

**5. Rolul `authenticated` are deja granturi largi, si `orders` are o singura politica permisiva.**
`authenticated` are SELECT, INSERT, UPDATE, DELETE si TRUNCATE pe `orders` si pe `customers`.
`orders` are o singura politica, `for ALL to public`, si orice politica noua se aduna cu SAU.
Tabela are 225 de coloane fara niciun grant pe coloana: `internal_notes`, costurile de curier si
`order_source` cu `gclid`, `fbclid`, `client_ip` si `user_agent`.
→ **Raspuns: nu se adauga NICIO politica RLS pentru cumparatori.** Citirile trec prin functii
`security definer` care intorc o lista ALBA de coloane, numita in `returns table (...)`.
Cumparatorul e `anon` la nivel de baza si nu poate chema functiile direct: ele se cheama din
server, dupa ce sesiunea a fost verificata.

**6. Identitatea e telefonul, si exista trei `normalizePhone` deosebite in TypeScript.**
Adevarul e `public.normalize_phone` din SQL, care taie TOATE zerourile din fata. Cea din
`lib/customers.ts` taie unul singur, cea din `lib/utils/phone.ts` pastreaza forma locala.
→ **Raspuns: normalizarea se face NUMAI in SQL.** Nicio cheie de contact nu se calculeaza in
TypeScript. O proba cade daca vreun fisier de sub arborele contului importa `normalizePhone`.

**7. `/{slug}/confirm?orderId=<uuid>` e deja o usa publica catre datele unei comenzi.**
Citeste orice comanda a magazinului cu clientul de serviciu, fara sesiune, si arata nume, email,
telefon, adresa si bani. Singura paza e ca uuid-ul nu se ghiceste.
→ **Raspuns: ecranele de cont NU copiaza tiparul.** Fiecare citire poarta in `where` si
`business_id`, si `cont_id`. Pagina `confirm` ramane cum e in valul 1 (H1 spune ca fluxul de
comanda nu se atinge), dar intra la datorii scrise, cu ce s-a masurat: antetul
`Referrer-Policy` global e deja `strict-origin-when-cross-origin`, deci uuid-ul NU pleaca azi
catre pixelii terti prin `Referer`; ce ramane e `name=` pus de-a dreptul in adresa de intoarcere
de la plata, si hashurile din `window.__edinioAM`.

---

## 3. Problema originii comune, si de ce functia nu porneste peste tot

Asta e constatarea care a daramat prima sinteza, si e de temelie.

**Pe `www.edinio.com`, toate cele 57 de magazine fara domeniu propriu impart o singura origine.**
Pe fiecare pagina de vitrina, `src/app/(public)/[slug]/layout.tsx` incarca pixelii ALESI DE
COMERCIANT: Facebook, TikTok si Google Tag, iar cand bannerul de cookie-uri e stins din panou,
`bypass={!requireConsent}` le incarca neconditionat. Un container Google Tag Manager e executie
de JavaScript arbitrar, aleasa de comerciant.

Un script care ruleaza pe pagina magazinului A poate face, pur si simplu:

```js
fetch('/magazin-B/cont/comenzi', { credentials: 'same-origin' }).then(r => r.text())
```

si citeste raspunsul. **`httpOnly` nu apara nimic aici**, fiindca scriptul nu are nevoie sa
citeasca cookie-ul: il trimite browserul. `sameSite` nu se aplica, e same-site. CORS nu se
aplica, e same-origin. Si nu se repara nici scotand pixelii de pe paginile de cont (atacul vine
de pe ALTA pagina), nici cerand navigare de document (`window.open` catre aceeasi origine da
acces la DOM), nici cu un jeton in `localStorage` (aceeasi origine, acelasi `localStorage`).

**Pe o origine comuna cu JavaScript ales de chiriasi nu exista izolare.** Singurul raspuns e
separarea originilor.

### Hotararea pentru valul 1

**Contul exista numai acolo unde cererea a venit CHIAR pe domeniul magazinului.** Pe originea
platformei, rutele de cont raspund 404, exact ca atunci cand setarea e stinsa.

Regula se scrie o singura data, cu ajutorul care exista deja:

```ts
if (!esteDomeniulPropriu(host, business.custom_domain)) notFound();
```

Si se aseaza singura, fara niciun rand nou in proxy:

- Magazinele cu domeniu sanatos primesc oricum 307 de pe originea platformei catre domeniul lor,
  deci `www.edinio.com/<slug>/cont` ajunge la `magazin.ro/cont` inainte sa ruleze ceva.
- Daca un domeniu e masurat cazut, proxy-ul serveste inapoi pe originea comuna, iar verificarea
  de mai sus inchide contul automat, in aceeasi clipa. **Cade inchis, singur.**

**Ce acopera:** 8 din cele 19 magazine cu comenzi de vitrina, dar **318 din 343 de comenzi,
adica 92,7%**. Cele 11 magazine ramase au impreuna 25 de comenzi.

**Ce nu acopera:** 57 de magazine publicate stau pe originea comuna. Pentru ele, comutatorul din
Setari se arata STINS si nu se poate aprinde, cu textul: „Conturile de client cer un domeniu
propriu. Conecteaza-l din Setari, Domenii, si comutatorul se deschide."

**Drumul pentru restul, ca hotarare a ta, nu a mea:** o origine pe magazin,
`<slug>.edinio.com`, cu domeniu wildcard pe Vercel si o ramura noua in proxy. Rezolva problema
pentru toata lumea, dar e un val de sine statator, cu pretul lui in SEO si in certificate.
Il scriu in capitolul 14.

---

## 4. Modelul de date

Sapte tabele, toate in schema `privat`, niciuna expusa prin PostgREST.

```sql
create table privat.cont_cumparator (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  nume text not null default '',
  epoca_sesiunii integer not null default 1,
  sters_la timestamptz,
  creat_la timestamptz not null default now(),
  -- Cheia compusa exista ca sa poata fi tinta unei chei straine COMPUSE.
  unique (id, business_id)
);

create table privat.cont_contact (
  id uuid primary key default gen_random_uuid(),
  cont_id uuid not null,
  business_id uuid not null,
  fel text not null check (fel in ('email','telefon')),
  valoare_bruta text not null,
  valoare text not null,
  verificat_la timestamptz,
  creat_la timestamptz not null default now(),
  foreign key (cont_id, business_id)
    references privat.cont_cumparator(id, business_id) on delete cascade,
  check (fel <> 'telefon' or length(valoare) >= 9),
  check (fel <> 'email' or position('@' in valoare) > 1)
);
create unique index uq_cont_contact on privat.cont_contact (business_id, fel, valoare);
```

Restul, in aceeasi forma: `cont_sesiune`, `cont_comanda`, `cont_cod`, `cont_contact_blocat`,
`cont_jurnal`. DDL-ul complet intra in migratia 1.

### Cele sapte lucruri care se scriu altfel decat prima oara

Fiecare vine dintr-o constatare a scepticilor sau a criticului.

1. **Cheia straina e COMPUSA, `(cont_id, business_id)`.** Cu doua chei separate, nimic din baza
   nu oprea o sesiune a magazinului A legata de un cont al magazinului B. Regula o tine baza, nu
   o proba.
2. **`cont_comanda.order_id` e cheie primara.** O comanda are cel mult UN proprietar, si asta o
   apara baza, nu un `if`.
3. **`cont_contact_blocat` are `expira_la`, implicit 12 luni, si intra in cron.** Un termen care
   nu se scurge nu e retentie. Si `cont_sterge` NU mai scrie acolo contactul propriu al omului:
   altfel exercitarea dreptului de stergere ar crea chiar inregistrarea permanenta a
   identificatorului sters, iar omul care isi redeschide contul maine n-ar mai putea lega
   niciodata propriile comenzi.
4. **Nu exista niciun index partial `where sters_la is null` pe contacte.** Nu se poate scrie:
   `sters_la` e coloana altei tabele. Unicitatea e plina si merge fiindca `cont_sterge` chiar
   sterge randurile.
5. **`idx_cont_cod_cont on privat.cont_cod (cont_id)`.** Fara el, proba
   `chei-straine-indexate.test.ts` cade in chiar comitul migratiei.
6. **A opta tabela: `privat.cont_instiintare`.** Revendicarea unei comenzi vechi se apara prin
   instiintarea celui care o detinea, iar „pusa la coada in aceeasi tranzactie" nu inseamna nimic
   fara o coada: `deliver.ts` e un apel HTTP sincron care iese TACIT cand lipseste cheia Resend.
   Instiintarea se scrie ca RAND, in aceeasi instructiune cu legatura; daca insertul nu reuseste,
   tranzactia cade si legatura nu se comite. Un cron o goleste.
7. **Blocul de drepturi e scris NOMINAL pe fiecare din cele opt tabele**, cu un
   `do $$ ... has_table_privilege ... raise exception $$` dupa el. Prima scriere spunea „identic
   pe toate sase" pentru sapte tabele. Schema `privat` nu are `pg_default_acl`, deci o tabela
   sarita ramane de neatins pentru `service_role` si prima rulare cade cu eroare de drepturi.

---

## 5. Cum se autorizeaza citirile

Trei straturi, si niciunul nu e RLS.

1. **Sesiunea se verifica in SQL**, cu `privat.cont_sesiune_verifica(p_business, p_jeton)`, care
   cere si `epoca` potrivita, si `cont_cumparator.sters_la is null`, si setarea aprinsa pe
   magazin, si magazinul nesuspendat.
2. **Fiecare citire e o functie `security definer` cu lista ALBA de coloane** in
   `returns table (...)`. Nimic nu se intoarce cu `select *`.
3. **Identitatea nu vine niciodata din cerere.** `p_cont` vine numai din `sesiuneCurenta()`.

### Patru plase automate

- **Plasa coloanelor.** Citeste din baseline toate coloanele tuturor tabelelor publice numite de
  vreo functie `cont_*`, scade lista alba, si cade daca vreun nume ramas apare intr-un
  `returns table`. Universul e toate tabelele atinse, nu doar `orders`: `cont_retururile_mele`
  citeste din `return_requests`, singura tabela cu IBAN si cu text liber scris de om.
- **Plasa celor doua chei.** Orice functie `cont_*` care numeste o tabela din `public` trebuie sa
  poarte in `where` si `business_id`, si `cont_id`.
- **Plasa identitatii.** Cade daca vreun fisier de sub `src/app/api/cont/**` paseaza spre `p_cont`
  o valoare din `searchParams`, din corp sau dintr-un antet.
- **Plasa cheilor de depozit.** `orders.items[].customization.value` tine CHEI R2, nu nume de
  fisier, iar fisierele urcate inainte de 07.09.2026 stau inca in galeata publica, unde cheia E
  adresa. Lista alba coboara in interiorul lui `items`, iar personalizarea trece prin
  `randurileInstantaneului`, exact ca la emailuri.

`refund_iban` se mascheaza IN SQL, la ultimele patru caractere, nu in componenta: o mascare
facuta in randare se poate ocoli la a doua randare.

---

## 6. Cum intra omul in cont, si cum isi ia comenzile vechi

### Intrarea: cod de sase cifre, fara parola

Un singur camp: telefon sau email. Se refoloseste mecanismul scris deja pentru MFA
(`src/lib/auth/flux-mfa.ts`): generare, trimitere, verificare, plafon in baza plus plasa in
memorie dedesubt.

- **Emailul e canalul principal** si merge la orice magazin, prin Resend-ul platformei, cu marca
  magazinului (`storeEmailShell`, logo prin `/api/img?f=png`, altfel WebP iese negru in Gmail).
- **SMS-ul e al doilea canal, si numai unde exista furnizor.** Masurat: doar TREI magazine au
  SMSO configurat, toate trei pe ACEEASI cheie si acelasi expeditor, si unul singur a trimis
  vreodata prin el. Cine nu are furnizor nu vede optiunea.
- Raspunsul e acelasi si pentru un contact care exista, si pentru unul care nu exista.
- Plafonul sta in baza (`cont_cod.incercari`), nu doar in `consumaLimita`. Limitatorul durabil
  cade DESCHIS la eroare de baza, deci plasa din memorie ramane sub el.

### Revendicarea comenzilor vechi: patru usi

- **Usa A, jetonul din emailul de confirmare.** Cea mai tare dovada. Jetonul se consuma NUMAI
  prin POST, cu un buton: scanerele corporate de email apasa linkurile inaintea omului, iar un
  jeton de unica folosinta consumat la GET ar fi ars inainte sa ajunga la el.
- **Usa B, contact verificat.** Dupa ce codul a confirmat un telefon sau un email, se leaga
  comenzile magazinului care se potrivesc pe el. Aici intra instiintarea din tabela 8.
- **Usa C, numar de comanda plus contact**, ca la retur. Comanda intrata pe usa asta capata o
  **vedere REDUSA**, si asta e scris in SQL, pe o coloana `vedere`, nu in proza: numar, data,
  linii, total, stare. Fara adresa, fara factura, fara AWB, pana cand contactul de pe ea e
  verificat printr-un cod. Numerele de comanda sunt secventiale la 7 din 8 magazine, deci usa
  asta e un oracol de enumerare si nu are voie sa deschida mult.
- **Usa D, comerciantul leaga de mana**, din ecranul lui de Clienti.

Potrivirea se face pe telefonul normalizat SAU pe email, in SQL, cu regula de marketplace scrisa
in forma tare si o singura data:

```sql
where o.business_id = p_business
  and not coalesce(o.order_source ? 'marketplace', false)
  and (
    (c.fel = 'telefon' and public.normalize_phone(o.customer_phone) = c.valoare)
    or (c.fel = 'email'  and lower(btrim(coalesce(o.customer_email,''))) = c.valoare)
  )
```

⚠ Cele doua ramuri se unesc prin SAU, nu prin cascada. `customer_orders`, functia care pare gata
de refolosit, cere pe ramura de email ca telefonul comenzii sa LIPSEASCA, iar `customer_phone` e
`not null`: masurat, din 359 de emailuri distincte, 358 intorc zero comenzi. **Nu se refoloseste.**

⚠ `customer_orders` ramane cu `execute` pentru `anon`. Azi e inofensiva fiindca e
`security invoker`, dar e chiar functia spre care s-ar intinde mana, iar facuta `definer` ar
deveni pe loc un capat public prin care oricine cere istoricul oricui, avand un `business_id` si
un numar de telefon. **Migratia 1 ii revoca grantul.**

---

## 7. Ecranele

Sub `/{slug}/cont/`, toate cu `Cache-Control: private, no-store`.

| Ruta | Ce arata |
|---|---|
| `/cont` | Salutul, ultimele comenzi, si numarul comenzilor nelegate din ultimele 30 de zile, cu „Ai comandat recent si nu vezi comanda aici?" |
| `/cont/comenzi` | Lista, paginata cu tiparul casei |
| `/cont/comenzi/[id]` | Comanda: linii, bani, stare, adresa, urmarirea coletului, buton catre retur |
| `/cont/facturi` | Documentele fiscale ale comenzilor lui |
| `/cont/retururi` | Cererile lui de retur |
| `/cont/date` | Contacte: adauga, verifica si **scoate** |
| `/cont/preferinte` | Dezabonarea de la email si de la SMS |
| `/cont/export` | Datele lui, la cerere |

**Numarul de pe prima pagina** e raspunsul la o problema reala: H1 interzice precompletarea la
checkout, deci omul logat tasteaza contactul de la zero si poate scrie altul. Cifra nu divulga
nimic, e un numar pe magazin, si transforma un esec tacut intr-o usa.

**Urmarirea coletului.** Din 17 curieri, doar 6 scriu azi o adresa de urmarire pe comanda, si
lipsesc exact cei cu care se livreaza cel mai mult in Romania. Se scrie un modul care compune
adresa publica de urmarire din numarul AWB si din curier, pentru toti 17. E cea mai ieftina
imbunatatire din tot valul si foloseste si panoului.

**Preferintele** sunt cel mai ieftin ecran si fac adevarata o promisiune DEJA PUBLICATA: sablonul
de confidentialitate al fiecarui magazin promite art. 21 si retragerea consimtamantului. Datele
exista, in `recovery_optout` si `sms_optout`, cheiate pe exact contactele pe care contul le
verifica.

---

## 8. Facturile

Nu gazduim niciun document fiscal: cele trei case emit la ele. `smartbill_invoice_url` e gol la
toate cele 286 de facturi. Deci:

- O ruta `/api/cont/factura/<order_id>` care verifica sesiunea, verifica prin `cont_comanda` ca
  order-ul e al lui, si abia apoi aduce PDF-ul cu tokenul comerciantului, pe server.
- **Verifica `%PDF-` pe octeti.** O adresa care cere autentificare nu raspunde cu eroare,
  raspunde 200 cu o pagina de login.
- **Refuza documentele de TEST**, recunoscute dupa gazda din link (`testuat.fgo.ro`). Un PDF de
  sandbox e valid si are numar si serie; garda de PDF nu-l prinde.
- Niciodata nu se da clientului adresa furnizorului: SmartBill intoarce doua adrese cu regimuri
  opuse, iar cea de editare e o pagina de login.
- Raspunsul e `private, no-store`, si nu trece prin corpul unei functii peste 4,5 MB.

⚠ **Comanda pe firma.** Titularul documentului fiscal e FIRMA, contul e al unei PERSOANE. Un
angajat care isi face cont ar primi facturile firmei. Se masoara cate comenzi de vitrina au
`billing_company` si se hotaraste anume. E in capitolul 14.

---

## 9. Setarea din panou

Coloana `cont_client_config` in `privat.store_settings`, si apoi, obligatoriu si in aceeasi
migratie:

1. `privat.reconstruieste_store_settings()`, altfel coloana nici nu se vede prin vedere;
2. `privat.reconstruieste_store_settings_upd()`, altfel declansatorul rescrie randul INTREG cu
   lista veche de coloane si valoarea noii coloane se pierde **tacit, la fiecare salvare a
   oricarei alte setari**.

Scrierea se face cu `jsonb_merge_config`, nu citeste-modifica-scrie. ⚠ `jsonb_merge_config` iese
TACIT cand magazinul n-are rand in `store_settings` (`if v_id is null then return;`), iar ecranul
raspunde „salvat". Cate magazine n-au rand acolo nu s-a masurat niciodata: se masoara la Etapa 0.

Comutatorul e stins implicit si nu se poate aprinde cand magazinul nu are domeniu propriu
sanatos, cand nu are nici email, nici SMS, sau cand e suspendat.

**Iconita „Cont" din antetul vitrinei nu are voie sa se aprinda singura.** `resolveActions` pune
actiunile aparute dupa salvare la coada listei si le socoteste PORNITE. Poarta sta in `areDate`
din `useHeaderSettings`, nu in lista de actiuni.

**Garda de suspendare.** `/cos` si `/checkout` citesc fiecare `businesses.suspended_until` si
`users_profile.plan_expires_at` al proprietarului si redirecteaza. Fara aceeasi garda pe cont,
intr-un magazin oprit omul s-ar putea inca autentifica, iar `cont_cere_cod` ar cheltui creditul
de SMS al unui comerciant care nu mai plateste. Cuvantul „suspendat" nu aparea in niciuna din
cele 296 de capcane gasite de cei 14 exploratori.

**Cand comerciantul stinge functia:** propunerea mea e ca datele sa ramana si doar accesul sa se
inchida, iar Setarile sa spuna cati oameni au cont. E o intrebare pentru tine, in capitolul 14.

---

## 10. GDPR si stergerea

- **Exportul** contine tot, inclusiv retururile (cu IBAN-ul si motivul lui) si `cont_jurnal`.
  Un export care lasa afara tocmai ce pastram despre om e mai rau decat niciunul.
- **Stergerea contului** e a CONTULUI, nu a comenzilor: venitul lunilor incheiate nu scade
  retroactiv si facturile nu raman fara nimic in spate. Se spune pe ecran ce ramane, nu doar ce
  dispare.
- **Dezabonarea NU se sterge niciodata.** Omul care cere stergerea e de multe ori chiar cel care
  ceruse sa nu mai primeasca mesaje. Exista deja o proba care apara regula si citeste migratia de
  pe disc.

### Trei reparatii pe care le aduce valul asta, la cod care exista azi

1. **`customer_anonymize` nu sterge adresa IP.** Sterge cheia `ip`, dar codul scrie cheia
   `client_ip`. Supravietuiesc si `fbc`, `ttp`, `mc_tc`, toti `utm_*` si `ga_sesiuni`. Lista
   neagra se inlocuieste cu o lista ALBA a cheilor care au voie sa RAMANA.
2. **`customer_anonymize` nu sterge `refund_iban` si `reason` din retururi.** IBAN-ul identifica
   o persoana, iar motivul e text liber in care omul isi scrie adesea numele. ⚠ Dar golirea se
   face numai pentru retururile INCHISE: pe unul aprobat si nerambursat, comerciantul ar ramane
   cu obligatia OUG 18 si fara contul in care sa plateasca.
3. **Contactele se sterg pe amandoua formele.** Prima scriere sterge dupa `p_keys`, iar cheia e
   TELEFON-INTAI, deci un om cu telefon si email are o singura cheie si emailul lui ar fi
   supravietuit. Cei doi sceptici au gasit-o independent.

⚠⚠ **Si o coliziune care trebuie rezolvata INAINTE de migratie.** `customer_anonymize` e
`security invoker`, acordata lui `authenticated`, si e chemata dinadins cu clientul
UTILIZATORULUI, ca paza sa fie RLS si nu un `if`. Tabelele din `privat` sunt insa date numai lui
`service_role`. Atinse direct din corpul ei, prima apasare pe „Anonimizeaza" ar da
`42501: permission denied` si **s-ar opri toata anonimizarea, pentru toti comerciantii**.

Raspunsul: o functie proprie `public.cont_rupe_legaturile(bid, p_keys)`, `security definer`, cu
verificarea de proprietate CHIAR in corpul ei
(`exists (select 1 from businesses where id = bid and user_id = (select auth.uid()))`), acordata
lui `authenticated`, chemata din `customer_anonymize`. E tiparul casei pentru functii definer.

---

## 11. Migratiile, in ordine

| # | Ce aduce |
|---|---|
| 1 | Cele opt tabele din `privat`, indexurile, blocul de drepturi NOMINAL cu verificare, si `revoke execute on customer_orders from anon` |
| 2 | `cont_client_config` pe `privat.store_settings` + cele doua reconstruiri |
| 3 | Sesiunea: `cont_sesiune_creeaza`, `cont_sesiune_verifica`, `cont_sesiune_incheie` |
| 4 | Codurile: `cont_cere_cod`, `cont_verifica_cod`, cu plafonul in baza |
| 5 | Citirile: `cont_comenzile_mele`, `cont_comanda_mea`, `cont_retururile_mele`, `cont_facturile_mele` |
| 6 | Revendicarea: `cont_maturare`, `cont_revendica_cu_jeton`, `cont_revendica_o_comanda`, plus scrierea in `cont_instiintare` |
| 7 | `cont_sterge`, `cont_export`, `public.cont_rupe_legaturile` |
| 8 | Cresterea lui `customer_anonymize`: lista alba pe `order_source`, contactele pe amandoua formele, IBAN si motiv pe retururile inchise |

Fiecare functie primeste, imediat dupa definitie, `revoke all ... from public, anon, authenticated`
si apoi grantul. Un `revoke from anon` singur e o operatie NULA pe o functie fara ACL explicit, si
`create or replace` reface granturile implicite.

Fiecare migratie intra in [`REGISTRU.md`](REGISTRU.md) in clipa in care e scrisa.

---

## 12. Probele

Pe langa cele patru plase din capitolul 5:

1. Anonimul nu plateste nimic in plus: nicio cerere noua, niciun cookie.
2. Un jeton emis pentru magazinul A nu naste sesiune in magazinul B. Baza o apara deja prin
   cheia compusa; proba e confirmarea.
3. Regula de marketplace e scrisa o singura data, in forma tare, si trece peste `order_source`
   NULL. Proba masoara pe cele doua forme si cere acelasi numar.
4. Niciun cod de sase cifre nu ajunge in `notice_sms_log.message`, in `cont_jurnal` sau in
   `error_logs.details`.
5. Cheile de depozit nu ies din cont: nicaieri sub arborele contului nu apare `PREFIX_INCARCARI`
   sau o gazda `r2.dev`.
6. `customer_anonymize` sterge amandoua contactele unui om cu telefon SI email, in acelasi fisier
   cu proba care apara dezabonarea.
7. `Cache-Control: private, no-store` ajunge pe raspuns pe AMANDOUA gazdele.
8. Semnul lung nu ajunge pe ecranele noi. ⚠ Plasa de azi acopera doar panourile de curier si
   ecranele de integrari; ecranele de Clienti au deja semnul lung pe ecran si nicio proba nu cade.
9. `formatPrice`, `formatDate` si zilele romanesti pe toate ecranele de bani si de date.

---

## 13. Etapele

**Etapa 0, masuratorile care mai lipsesc.** Cate magazine n-au rand in `privat.store_settings`.
Cate au stins campul de email la checkout (la acelea nici comenzile viitoare n-au email). Cate
comenzi de vitrina au `billing_company`. Cate au `customization` cu fisiere, si cate sunt
dinainte de 07.09.2026. Cate din cele 286 de facturi SmartBill au si serie, si numar. Cate
telefoane normalizate sunt purtate de doua emailuri deosebite.

**Etapa A, temelia.** Migratiile 1-4, sesiunea, codul, `/cont/intra`. Nimic vizibil inca.

**Etapa B, citirea.** Migratia 5, `/cont`, `/cont/comenzi`, `/cont/comenzi/[id]`, plus modulul de
urmarire a coletului pentru toti 17 curieri.

**Etapa C, revendicarea.** Migratia 6, cele patru usi, instiintarea si cronul ei.

**Etapa D, restul ecranelor.** Facturi, retururi, date, preferinte, export, stergere.

**Etapa E, panoul.** Fila din Setari, garda de suspendare, ce vede comerciantul la Clienti,
notificarea catre el la „nu am fost eu".

Fiecare etapa trece singura de cele patru porti locale si de CI.

---

## 14. Ce ramane hotararea ta

1. **Cele 57 de magazine de pe originea comuna.** Valul 1 le lasa pe dinafara, si asta acopera
   92,7% din comenzile de vitrina. Facem valul 2 cu `<slug>.edinio.com`, sau ramane asa?
2. **Cand comerciantul stinge functia**, ce se intampla cu conturile facute deja. Propunerea mea:
   datele raman, accesul se inchide.
3. **Comanda pe firma.** Un angajat cu cont ar vedea facturile firmei. Se arata, se ascunde, sau
   se arata fara documentul fiscal?
4. **Anularea unei comenzi `pending`** din contul lui: se poate sau nu?
5. **Diacriticele pe ecranele noi.** Vitrina de azi e fara („Finalizeaza comanda"), panoul e cu.
   Contul sta langa vitrina, deci as merge fara, dar e textul care se vede.

---

## 15. Pasul zero, inainte de orice cod

⚠⚠ **Cele 8 variabile Vercel care leaga preview-ul de baza demo sunt legate de ramura
`redesign-dashboard`.** Verificat azi: pe `conturi-clienti` sunt ZERO. Un preview al ramurii noi
ar cadea inapoi pe valorile de Preview fara ramura, care sunt **ALE PRODUCTIEI**: Supabase de
productie, Resend adevarat, Stripe adevarat, SmartBill adevarat.

Deci, inainte de prima desfasurare a ramurii, cele 8 chei se copiaza pe `gitBranch:
conturi-clienti`. `SUPABASE_SERVICE_ROLE_KEY` o pui tu, MCP-ul nu o da.

⚠ Si lista de la final creste de la 8 la 16 chei, sterse **dupa id, niciodata dupa nume**:
aceleasi nume exista si fara ramura, si acelea sunt ale productiei.

⚠ `scripts/schema-baseline.sh` citeste DOAR `.env.local`, care arata catre PRODUCTIE, pe cand
`next dev` foloseste `.env.development.local`, care arata catre demo. Rulat fara variabile pe
linia de comanda, ar suprascrie baseline-ul cu schema productiei.

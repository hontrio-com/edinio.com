# notice.ro: evidenta integrarii

Trecerea din 17.09.2026. Documentatie oficiala: colectia Postman `documenter.getpostman.com/view/6644801/2sBY4VJcUg`
(29 de capete). SDK oficial: `github.com/noticero/notice-sdk-php`.

Intrebarea proprietarului: *„”*. Raspunsul masurat: **trimiterea
mergea, tot ce trebuia sa vina INAPOI nu mergea deloc.**

---

## Expunerea masurata

Citita din productie inainte de a deschide codul:

* **405 SMS-uri** in `notice_sms_log`, 28.06 - 17.09, **402 reusite**, trafic si in dimineata trecerii;
* **3 magazine** cu notice.ro pornit: `suporti-numar` (**399** dintre SMS-uri), `bricosmart` (3),
  `itp-blk` (3, magazinul proprietarului);
* tot traficul e SMS de stare a comenzii; **zero** cosuri abandonate, **zero** WhatsApp,
  **zero apeluri de voce** in tot jurnalul (desi `bricosmart` are vocea pornita);
* **zero** livrari confirmate din 398 de mesaje cu id de furnizor;
* `notice_inbox`: **zero randuri** in trei luni; `sms_optout`: zero.

⚠ notice.ro duce **tot** traficul real de SMS al platformei. SMSO, trecut cu o zi inainte, avea zero.

---

## Ce spune documentatia, si ce NU spune

⚠⚠ **Colectia nu are niciun exemplu de raspuns, la niciunul dintre cele 29 de capete.** Colectia veche,
citata in cod (`2s9YyzbxNU`), a fost stearsa de ei (404). SDK-ul PHP doar decodeaza JSON-ul. Deci
**forma oricarui raspuns al lor e nedocumentata**, si tot ce citim e citit tolerant.

| Capat | Folosit inainte | Acum |
| --- | --- | --- |
| `POST /sms-out` | da, pe toate caile | la fel |
| `GET /templates` | da (sabloane + proba de conexiune) | la fel |
| `GET /sms-in` | **scris si nechemat** | cron orar `notice-raspunsuri` |
| `POST /audio` | da, dar id-ul apelului se pierdea | `audio_id` citit, limita de 900 aplicata |
| callback `POST /audio` | 4 stari din 8, niciuna ajungea pe rand | toate 8, rezultatul scris ca atare |
| `/whatsapp/devices*` | scrise; 2 nechemate | la fel (expunere zero) |
| `/whatsapp/send` | scris | la fel (expunere zero) |
| `/whatsapp/inbox`, `/outbox` | **scrise si nechemate** | la fel, vezi mai jos |
| `GET /audio` | nefolosit | nefolosit |
| `/sms-out/resendsms`, `DELETE /sms-out` | nefolosite | nefolosite, nu e nevoie |
| sabloane: adaugare, modificare, stergere | nefolosite | nefolosite, le tine comerciantul la ei |
| `/login`, `/auth/sms-token` | nefolosite | nefolosite: comerciantul lipeste tokenul lung |
| **WhatsApp Cloud (`/waba/*`, 7 capete)** | **nefolosit deloc** | nefolosit, vezi „” |

---

## Defectele gasite si reparate

### 1. ⚠⚠ „” nu era auzit de nimeni

`getNoticeInboundSms` era scrisa anume pentru `GET /sms-in` si **nu o chema niciun fisier**. Un
cumparator care raspundea „” la un SMS de la notice.ro nu ajungea nicaieri.

Reparat: `/api/cron/notice-raspunsuri`, orar la minutul 46. Pentru fiecare magazin cu notice.ro pornit
cere lista, iar `asazaRaspunsurile` o aseaza: un rand o singura data (index unic pe magazin + id-ul lor),
„” in `sms_optout`, **acelasi tabel pe care il citeste SMSO**, in aceeasi forma a numarului.

### 2. ⚠⚠ Garda de dezabonare de la SMSO era ocolita cu totul

In recuperarea cosului abandonat **notice.ro se incearca PRIMUL** si intoarce `handled: true`, deci
calea SMSO, singura cu garda, nu se atingea niciodata la un magazin cu notice.ro pornit.

Reparat: regula s-a mutat in `src/lib/sms-dezabonare.ts`, neutra fata de furnizor, si se cheama pe calea
notice.ro **inaintea** trimiterii. Un om oprit intoarce `handled: true`, ca lantul sa NU incerce SMSO,
adica acelasi mesaj refuzat pe alt drum. Mesajele de stare a comenzii trec mai departe, dinadins.

⚠ Si normalizarea e una: notice.ro tine `07XXXXXXXX`, SMSO `7XXXXXXXX`. Scrise fiecare in forma lui,
acelasi om ar fi fost doua randuri si niciuna dintre garzi n-ar fi gasit randul celeilalte.

### 3. ⚠⚠ Apelurile de voce: id pierdut, stari pierdute, anularea citita ca esec

Trei lucruri, fiecare de ajuns ca sa nu mearga nimic:

* `POST /audio` intoarce `audio_id`, pe care `extractId` nu-l cauta. **Randul apelului ramanea fara
  id**, deci niciun callback nu-l mai putea gasi;
* ruta cauta id-ul printre `id|message_id|...` si nu stia de `audio_id`; iar stari ca `failed` treceau
  si de cuvintele de livrare SMS;
* documentatia are **8** stari (`confirmed | cancelled | no_response | no_answer | failed | unknown |
  queue_full | delivered`), prima reparatie le stia pe 4.

⚠⚠ Doua intelesuri care conteaza:

* `cancelled` = **clientul a apasat tasta de anulare**. La un apel de confirmare a comenzii, asta
  inseamna ca **a anulat comanda**. Se scria `failed`, adica exact informatia pentru care exista apelul
  se pierdea. Acum se scrie ca atare, iar panoul arata „”;
* `delivered` = „”, **nu un rezultat al apelului**. Citit ca
  rezultat, ar fi suprascris un „” cu „”. Acum nu scrie nimic.

Si orice corp cu `audio_id` se opreste pe ramura de voce, inaintea celei de livrare SMS.

### 4. ⚠⚠ Adresa pe care o copiaza comerciantul era pe apex

In productie `NEXT_PUBLIC_SITE_URL = https://edinio.com`, iar **apexul raspunde `308` catre `www`**
(masurat cu o cerere reala). Adresa de webhook se compunea de acolo in doua locuri: in
`noticeWebhookUrl` (callback-ul vocii) si **in panoul pe care comerciantul o copiaza in notice.ro**.
Un server care nu urmeaza redirectarile nu ne mai gaseste si nu spune nimic.

⚠ Prima reparatie, din aceeasi zi, a atins doar primul loc, pe care nu-l vede nimeni.

Reparat: `src/lib/adresa-publica.ts`, un singur loc, cu `||` (nu `??`: local variabila e sirul gol, iar
`??` nu cade pe el) si cu apexul ridicat la `www`. Folosit de notice.ro, SMSO, panoul notice.ro si,
**din acelasi motiv, de pagina Innoship** (singurul alt loc care dadea unui server strain o adresa pe
apex; expunere zero). Panoul spune acum: daca ai lipit candva alta adresa, inlocuieste-o.

### 5. Raspunsurile pe webhook ocoleau garda si s-ar fi dublat

Ramura de raspuns a webhook-ului scria direct in `notice_inbox`: fara „”, fara id, deci dublat de
cron daca vin pe ambele drumuri. Acum trece prin aceeasi `asazaRaspunsurile`, cu `sursa: "webhook"`
(un mesaj fara id intra, o singura data) si cu corpul brut pastrat in `raw`.

### 6. Doar de la numere carora magazinul le-a scris

Nu stim daca `/sms-in` contine doar raspunsuri la mesajele noastre. Un numar caruia magazinul nu i-a
scris niciodata prin notice.ro nu intra nici in inbox, nici pe lista de oprire. Aceeasi regula ca la
webhook-ul SMSO, unde tine si loc de garda: adresa nu e semnata. O citire picata a listei de numere
**arunca**; goala, fiecare „” ar fi parut strain.

---

## ⚠⚠ Ce am gresit EU in aceeasi zi, prins inainte de commit

Trecerea a fost intrerupta de o cadere a editorului dupa primele reparatii. La reluare, recitind
specificatia intreaga si masurand din nou, au iesit doua greseli ale primei jumatati:

### A. Indexul partial: cronul n-ar fi scris NICIUN raspuns

Migratia `2027-01-23` a facut indexul unic **partial** (`where provider_id is not null`). PostgREST
scrie `ON CONFLICT (business_id, provider_id)` **fara predicat**, iar Postgres nu poate folosi un index
partial fara predicatul lui:

    ERROR 42P10: there is no unique or exclusion constraint matching the ON CONFLICT specification

**Masurat pe productie**, cu `insert ... select ... where false on conflict (...) do nothing`: nu scrie
nimic, dar face potrivirea. Probele de atunci treceau verde, fiindca baza lor falsa accepta orice upsert.
Iar motivul scris pentru predicat era fals: intr-un index unic, NULL-urile sunt oricum distincte.

Reparat in `2027-01-24-notice-indexul-unic-fara-predicat.sql`, aplicat si verificat pe productie:
`indisunique = true`, `indnullsnotdistinct = false`, fara predicat, iar aceeasi inserare de proba trece.
⚠ Proba citeste acum forma indexului din `000-schema-baseline.sql`, **fotografia productiei**, nu din
migratie; baza falsa nu poate prinde asa ceva.

### B. „”: o concluzie fara date

Am scris in trei comentarii ca notice.ro nu are rapoarte de livrare si nici webhook de raspunsuri, din
zero livrari confirmate. **Nedovedit.** Pagina lor de prezentare promite „” pentru
notificarile trimise si pentru raspunsuri, iar panoul nostru trimitea comerciantul la „Integrare API ->
Webhook URL". Si masurat pe magazine: **399 din 405 SMS-uri sunt ale unui magazin care n-a avut
NICIODATA secret de webhook**, deci nicio adresa de lipit. Zero rapoarte se explica pe deplin prin asta.

Comentariile spun acum ce e dovedit (callback-ul vocii) si ce nu (webhook-ul SMS), iar ambele drumuri de
raspuns raman.

---

## O lista pe care n-o intelegem nu e o lista goala

Forma lui `/sms-in` nu e documentata nicaieri. Daca ei intorc mesaje si **niciunul** nu are un numar pe
care sa-l recunoastem, un parser tolerant le-ar sari pe toate, iar cronul ar raporta „” din ora in ora.
Exact felul in care `notice_inbox` a stat trei luni gol fara ca nimeni sa afle.

Deci: `faraNumar` se numara, iar cand sunt TOATE asa, cronul scrie un `warning` cu **numele campurilor
primite** (doar numele, fara valori). Si fiecare trecere lasa in jurnalul Vercel un rand cu numere:
`magazine_atinse, citite, scrise, opriri, fara_id, straini, picate, forma_necunoscuta, pagini_pline`.

⚠ **Limita ramasa, spusa pe fata:** se citeste doar prima pagina. La celelalte liste ei dau 25 pe
pagina; la `/sms-in` nu scrie, iar forma paginarii nu e documentata. La volumul de azi (cateva SMS-uri pe
zi) nu musca; `pagini_pline` arata daca incepe.

---

## Ce s-a schimbat, pe fisiere

| Fisier | Ce |
| --- | --- |
| `migrations/2027-01-23-notice-raspunsurile-se-citesc-o-singura-data.sql` | `notice_inbox.provider_id` (+ indexul partial gresit, pastrat ca istorie) |
| `migrations/2027-01-24-notice-indexul-unic-fara-predicat.sql` (nou) | indexul unic fara predicat |
| `src/lib/notice-raspunsuri.ts` (nou) | `asazaRaspunsurile`, `citesteRaspunsurile`, `stareaVocii`, `randulApelului`, `asazaApelul`, `ETICHETA_VOCE` |
| `src/lib/sms-dezabonare.ts` (nou) | regula de oprire, comuna celor doi furnizori |
| `src/lib/adresa-publica.ts` (nou) | adresa data altora ca sa ne cheme inapoi |
| `src/app/api/cron/notice-raspunsuri/route.ts` (nou) | cronul orar, cu semnalul de forma necunoscuta |
| `src/app/api/notice/webhook/route.ts` | voce prin `asazaApelul`, raspunsuri prin `asazaRaspunsurile`, rapoarte doar pe randuri notice.ro |
| `src/lib/notice.ts` | `audio_id`, limita de 900, numele campurilor la `/sms-in`, trimiterea la colectia care exista |
| `src/lib/notice-notify.ts` | garda de dezabonare pe cosul abandonat, adresa prin `adresaPublica` |
| `src/lib/smso-urma.ts`, `src/app/api/smso/webhook/route.ts`, `src/lib/actions/sms.actions.ts` | regula de oprire si adresa luate din locul comun |
| `src/components/dashboard/NoticeConfigClient.tsx` | adresa de copiat pe `www`, text cinstit, rezultatul apelurilor |
| `src/app/(dashboard)/dashboard/features/innoship/page.tsx` | adresa de urmarire pe `www` |
| `vercel.json` | cronul `notice-raspunsuri`, `46 * * * *` |

---

## Cum s-a probat

`src/lib/notice-raspunsuri-si-vocea.test.ts`: **45 de probe**. Baza falsa filtreaza pe `eq`/`in` si
intoarce doar randurile care au INTRAT la un upsert, ca PostgREST; clientul notice.ro se proba cu
`fetch` inlocuit.

**Banc de mutanti: 59 din 59 prinsi**, pe 13 fisiere, inclusiv fotografia schemei de productie.

La prima jumatate a trecerii, patru mutanti scapasera, trei pentru acelasi viciu: proba cauta
**cuvinte in fisier**, iar cuvintele apareau si in adnotarea de tip. De aceea regulile de voce stau acum
in `notice-raspunsuri.ts` si se **cheama**.

⚠ Un mutant nu e in banc, dinadins: scoaterea lui `.eq("provider", "notice")` din `asazaApelul`. Randuri de
voce exista doar la notice.ro, deci filtrul nu se poate deosebi de lipsa lui; e o plasa, nu o regula.

⚠ **Refuzat, si pe buna dreptate:** o proba prin clientul Supabase real care sa scrie un rand in
`notice_inbox` pe productie si sa-l stearga. Potrivirea `ON CONFLICT` e dovedita pe productie fara nicio
scriere; drumul complet il va dovedi prima trecere a cronului.

---

## Ce ofera si nu folosim

* **WhatsApp Cloud (`/waba/*`)**: mesaje prin API-ul oficial Meta, sabloane aprobate si, mai ales,
  **confirmarea comenzii cu butoane** „”: `POST /waba/orders/notify` cu idempotenta pe
  `order_id + event`, apoi `GET /waba/orders/{id}` pentru raspuns. E cea mai buna forma de confirmare pe
  care o au, si nu e integrata deloc. Functionalitate noua, nu defect.
* `GET /audio`: ar putea reconcilia apelurile al caror callback s-a pierdut, ca `/status` la SMSO. La zero
  apeluri, nu are pe ce.
* `retriable` la `POST /audio`: reincercare automata, nefolosita.
* Inbox/outbox WhatsApp pe dispozitiv: scrise, nechemate. Expunere zero.

---

## Ce ramane NEDOVEDIT

1. **Exista un webhook pentru SMS in panoul lor, si in ce forma trimite?** Nu e in API. Se poate vedea in
   `app.notice.ro` -> Integrare API, pe `itp-blk`.
2. **Forma lui `/sms-in`.** O va arata prima trecere a cronului cu raspunsuri reale; daca n-o
   recunoastem, alarma spune ce campuri au venit.
3. **Tokenul pentru dispozitivele WhatsApp.** Textul lor spune ca dispozitivele cer alt token decat
   trimiterea, dar numele variabilelor lipseste din documentatie. Expunere zero.
4. **Limita de 130 de caractere la SMS.** Documentata ca „”. Patru mesaje mai lungi
   (pana la 318) au fost acceptate pe 28.06; nu stim daca au fost taiate sau impartite. De atunci cel mai
   lung a avut 108.
5. **Comerciantii care au lipit adresa de pe apex.** `bricosmart` si `itp-blk` au secret de webhook; nu
   stim daca au lipit-o si unde.

---

## Nota

**9 din 10.**

Trimiterea e dovedita de trafic real (402 SMS-uri reusite), iar tot ce trebuia sa vina inapoi e acum
scris, probat si prins de mutanti: raspunsurile, oprirea, rezultatul apelurilor, adresa.

⚠ **De ce nu mai mult**: drumul intors n-a rulat inca niciodata pe date reale, iar doua dintre formele pe
care le citeste nu sunt documentate de nimeni. La BT iPay aceeasi situatie a primit 9. Nota urca la 9,5
cand prima trecere a cronului pe productie raporteaza `magazine_atinse: 3, picate: 0, forma_necunoscuta: 0`,
si la 10 cand un raspuns real ajunge in `notice_inbox` sau cand se stie daca webhook-ul lor de SMS exista.

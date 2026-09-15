# Packeta: evidenta integrarii

> **Ce e fisierul asta.** Evidenta pe care o tinem pentru fiecare curier pana cand integrarea lui e
> 10/10 din toate punctele de vedere: securitate, optimizare, functionalitate, compatibilitate cu
> platforma, si conformitate cu documentatia lor. Se tine la zi ODATA CU codul, in acelasi commit.
>
> Conventia: cate un fisier per curier, in `docs/curieri/`. Al saptelea.

**API-ul real:** `POST https://www.zasilkovna.cz/api/rest`, XML, radacina = numele metodei, cu
`apiPassword` ca PRIM argument. 24 de metode.

**Referintele autoritare, amandoua verificate pe 16.09.2026:**

1. ⚠⚠ **Site-ul lor, `docs.packeta.com`**, care e un Docusaurus. Pagina obisnuita nu serveste
   nimic la `curl` (4,5 KB de coaja), **dar forma cu `/index.html` intoarce paginile randate**
   (`docs.packeta.com/<cale>/index.html`, zeci de KB). Asa se citesc paginile care NU sunt in
   depozit.
2. **`github.com/Packeta/api-documentation`**, depozitul lor public. ⚠ **E OPRIT IN FEBRUARIE
   2026** si nu mai tine pasul cu site-ul: nu are nici pagina de push tracking, nici taxa
   logistica romaneasca. Integrarea din august s-a scris de pe el, si de aici vin cele doua
   lucruri gasite azi.

**Cod:** `src/lib/packeta/` (`client.ts`, `xml.ts`, `expediere.ts`, `taxa-logistica-ro.ts`,
`statusuri.ts`, `puncte.ts`, `puncte-flux.ts`, `suprapunere.ts`),
`src/lib/actions/packeta.actions.ts`, cronul `src/app/api/cron/packeta-tracking`,
`PacketaConfigClient.tsx`.

---

## Expunerea masurata, 16.09.2026

| ce | cat |
| --- | --- |
| Magazine cu Packeta configurata | **ZERO** |
| Colete emise vreodata | **ZERO** |
| Comenzi care au ales Packeta la checkout | 0 |
| Operatii in registrul de operatii externe | 0 |

⚠ Zero peste tot, ca la eColet si Colete Online. Integrarea e livrata si pusata din 15.08.2026, dar
n-a fost niciodata probata pe fir: n-avem cont, deci nici `api_password`, nici `api_key`.

---

## ⚠ Trei lucruri care o fac altfel de toate celelalte

**1. E XML, nu JSON.** Nicio alta integrare din platforma nu vorbeste XML, si nu exista nicio
biblioteca de XML in proiect. `lib/packeta/xml.ts` e scris de la zero, cu 24 de probe verificate
contra exemplelor LITERALE din documentatie. E codul cu cel mai mare risc din toata integrarea.

**2. NU EXISTA ANULARE. DELOC.** Lista lor de metode n-are nimic de tip cancel sau delete, iar
documentatia spune ca nici editarea comenzilor exportate nu se poate. Un colet creat gresit ramane
creat si se sterge doar de mana, din contul lor. De aici: emiterea trece INTAI prin
`packetAttributesValid()` (gratis, nu creeaza nimic, si intoarce chiar NUMELE campului gresit),
`cuRegistru` se cheama FARA `legaturaVie`, iar verdictul `necunoscut` produce un mesaj care OPRESTE
reincercarea in loc s-o invite.

**3. Un singur `addressId` hotaraste tot.** Punct Packeta, automat Z-BOX si curier de livrare la
adresa sunt id-uri din ACELASI spatiu, si nu exista camp `country`: tara, moneda implicita si
formatul de telefon decurg din `addressId`. Un id gresit trimite coletul in alta tara fara nicio
eroare.

---

## Inchis

### I-1. ⚠⚠ Taxa logistica romaneasca, ceruta de ei din 1 ianuarie 2026

Documentatia lor (`guides/ro-logistics-tax`, actualizata pe 30.07.2026):

> „Starting from January 1, 2026, Romania has introduced new legislation that imposes a fixed tax
> on all packets originating from outside the European Union. This tax applies to packets where the
> price of the goods is less than EUR 150 at the time of ordering. **Merchants and platforms
> handling packets to Romania must account for and apply this tax.**"
>
> „**Non-compliance**: Please make sure your integration is updated to include this field. Omitting
> this data may result in non-compliance with Romanian regulations."

Campul e `<roLogisticsTaxDeclaration>`, in `packetAttributes`, cu `<isSubjectToTax>` (boolean) si
`<countryOfOrigin>` (ISO 3166-1 alpha-2).

⚠ **Integrarea noastra s-a scris pe 15.08.2026, DUPA ce pagina exista**, si n-a prins-o: s-a citit
din depozitul lor de pe GitHub, oprit in februarie. Campul nu e acolo nici azi.

⚠ **SE TRIMITE DOAR CAND COMERCIANTUL O DECLARA**, si asta e hotararea care conteaza. In tabelul
lor de structuri blocul e `required: no`, iar `countryOfOrigin` e cerut doar cand `isSubjectToTax`
e adevarat. O declaratie „nu e supus" pusa de NOI ar fi o afirmatie juridica facuta in numele
comerciantului, despre marfa lui: taxa atarna de ORIGINEA marfii (nu de tara expeditorului, un
magazin din Bucuresti poate vinde marfa chinezeasca) si de pretul ei sub 150 EUR. Primul lucru
platforma nu-l stie.

Deci: o bifa in Setari, cu explicatia legii langa ea, plus tara de origine. ⚠ Iar o declaratie pe
JUMATATE arunca in loc sa se omita tacut, fiindca omisa ar insemna exact neconformitatea pe care
campul o apara.

### I-2. ⚠⚠ O garda promisa in comentariu, care nu exista

Unii curieri Packeta CER dimensiunile (`requiresSize` in fluxul lor) si refuza coletul fara ele.
Comentariul din `packeta.actions.ts` spunea: „daca nici acelea nu exista, `lipsuriExpediere`
opreste aici".

⚠ **Nu oprea.** `lipsuriExpediere` nu se uita deloc la dimensiuni: `construiesteAtribute` omitea pur
si simplu `size`, iar coletul pleca la Packeta fara ele si era refuzat de EI, cu mesajul lor, dupa
ce ajunsesem la emitere.

⚠⚠ **Si a doua jumatate a gaurii:** `dimensiuni_implicite` era **citita** la emitere si tipata in
config, dar **nu putea fi scrisa de nicaieri**: ecranul de configurare n-o avea deloc, iar
`construieste()` n-o trimitea. Deci pentru curierii care cer dimensiuni, emiterea era **imposibila**
oricat ar fi incercat comerciantul, si nimic nu-i spunea de ce.

Ambele jumatati sunt inchise: garda exista si se aprinde doar cand curierul chiar cere, iar setarea
se poate scrie si se vede inapoi. ⚠ Doua laturi din trei nu se salveaza: ar trece de garda si ar fi
refuzate de ei.

---

## Ce era deja bine, si nu se atinge

Toate astea vin din valul din august, cu verificarea adversariala (24 din 38 de constatari au trecut
de refutare):

- **`xml.ts` scris de la zero**, cu `text()` care deosebeste „lipseste" de „gol", entitati numerice
  des-escapate (altfel eticheta ZPL ajunge la imprimanta cu `&#94;` in loc de `^`), si un document
  rupt care ARUNCA, tradus de apelant in verdictul `necunoscut`.
- **`packetAttributesValid()` inainte de orice creare**, singura integrare care ne da NUMELE
  campului gresit inainte de efectul real.
- **`marcheazaAnulata` cu rezultatul verificat**: la esec, slotul ramanea `reusit` si emiterea
  urmatoare adopta coletul MORT. La un furnizor fara anulare.
- **Fluxurile de puncte sunt MONDIALE**, deci filtrarea pe tara se face INAINTE de cache, altfel un
  magazin romanesc ar tine punctele din toata Europa.
- ⚠ **`apiKey` circula in CALEA adresei fluxurilor**, deci adresa nu se logheaza niciodata;
  mesajele numesc fluxul, nu URL-ul.
- **Rotunjirea rambursului pentru RON nu e documentata** (au reguli doar pentru CZK, HUF, EUR), deci
  se trimite suma exacta: o rotunjire inventata ar incasa de la client alta suma decat cea din
  comanda.
- **`currency` se OMITE dinadins**: implicitul lor e moneda tarii de destinatie, iar tara vine din
  `addressId`.
- **Suprapunerea**: in Romania Packeta revinde Cargus, FAN, DPD si Sameday, pe care ii avem si
  direct, si prin Innoship. Acelasi curier poate ajunge in checkout pe TREI cai, cu trei preturi.
  Nu se ascunde niciunul, iar panoul o spune.
- **Statusuri**: 17 coduri, ⚠ din care 8 si 13 nu exista in nomenclatorul lor, iar `7/10/11` sunt
  finale prin hotararea NOASTRA, fiindca ei nu declara care status e final. ⚠ `5 ready for pickup`
  NU e livrare (coletul asteapta), iar `12 collected` e preluarea DE LA comerciant.

---

## Deschis

### D-1. ⚠ Push tracking: EXISTA, si e complet documentat

Memoria proiectului spunea, din august, ca „documentatia lor publica nu descrie niciun webhook".
**Nu mai e adevarat**, si nici nu era chiar atunci: pagina `docs/packet-tracking/pushtracking` era
in sitemap, dar nu in depozitul de pe GitHub de unde s-a citit.

Contractul e intreg: POST cu JSON, un eveniment pe cerere, antetele `X-Webhook-Timestamp`,
`X-Webhook-Signature` (`hash_hmac('sha256', "{timestamp}.{rawBody}", key)`), `X-Webhook-Version` si
`X-Webhook-Event-Id` (UUID4, pentru deduplicare). Se raspunde 200 sau 202; orice altceva declanseaza
reincercari cu backoff (1, 2, 4, 8 minute, pana la 8 ore), apoi livrarea se opreste pana se repara.

⚠ **Nu e self-serve:** activarea cere un email la `integrations@packeta.com` cu adresa webhookului
(HTTPS), iar ei trimit inapoi o cheie de semnare. Deci nu e ceva ce se poate porni din panou.

**De ce nu s-a facut azi:** cere o ruta PUBLICA noua, o cheie per magazin si verificare de
semnatura in timp constant, adica exact genul de suprafata pe care n-as deschide-o fara un cont pe
care s-o pot proba. Cronul (`41 */2`) acopera intre timp aceeasi nevoie, mai lent. ⚠ Dar contractul
e destul de precis cat sa se poata scrie si proba offline, deci e o lucrare COSTATA, nu una
necunoscuta.

### D-2. Ce ramane nefacut din august, si de ce

- **Anularea** nu exista la ei, deci nu e o lipsa a noastra.
- **Rotunjirea rambursului pentru RON** ramane netradusa, fiindca ei n-o documenteaza.
- **Id-urile curierilor romani** nu sunt in documentatie; se citesc din fluxul `carrier`, cu cheia
  reala. De aceea panoul are butonul „Incarca curierii".

### D-3. ⚠⚠ Nedovedit live, si aici cantareste greu

**Zero magazine, zero colete.** Iar integrarea are doua parti care se probeaza doar pe fir: parserul
XML scris de mana, si `addressId`-ul care hotaraste tara. La un furnizor **fara anulare**, prima
greseala ramane facuta.

---

## Nota, cinstit

**9/10.**

Integrarea era deja serioasa: XML scris de la zero cu probe pe exemplele lor, validare inainte de
orice creare la un furnizor fara anulare, si un val de verificare adversariala in august care a
taiat 14 din 38 de constatari raportate.

Ce s-a inchis azi sunt doua lucruri pe care le stia documentatia LOR DE PE SITE si nu depozitul lor
de pe GitHub: taxa logistica romaneasca, ceruta prin lege de la 1 ianuarie 2026, si o garda pe
dimensiuni care era promisa intr-un comentariu dar nu exista, cu setarea care ar fi satisfacut-o
imposibil de scris.

⚠ **Ce lipseste, si de ce nu e 10:**

1. **Nedovedit live** (D-3), si aici mai mult decat la ceilalti: parserul XML scris de mana si
   `addressId`-ul care hotaraste tara se probeaza doar pe fir, la un furnizor **fara anulare**.
2. **Push tracking** (D-1) exista si e complet documentat, dar cere o ruta publica, o cheie per
   magazin si un schimb de emailuri cu ei ca sa se activeze. E o lucrare costata, nu una
   necunoscuta, si o fac cand exista un cont pe care s-o probez.

⚠ Si lectia, a doua oara in doua zile: **depozitul de documentatie al unui furnizor poate fi mai
vechi decat site-ul lui.** La Packeta e oprit in februarie 2026, si din diferenta au iesit ambele
constatari de azi. La Colete Online, pe dos: site-ul era o coaja si specul statea in bundle.

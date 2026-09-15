# Cargus: evidenta integrarii

> **Ce e fisierul asta.** Evidenta pe care o tinem pentru fiecare curier pana cand integrarea lui e
> 10/10 din toate punctele de vedere: securitate, optimizare, functionalitate, compatibilitate cu
> platforma, si conformitate cu documentatia lor. Se tine la zi ODATA CU codul, in acelasi commit.
>
> Conventia: cate un fisier per curier, in `docs/curieri/`. Al patrulea, dupa `WOOT.md`, `DPD.md`
> si `SAMEDAY.md`.

**API-ul real:** `https://urgentcargus.azure-api.net/api`, in spatele unui gateway Azure. Doua
antete la fiecare cerere: `Ocp-Apim-Subscription-Key` (cheia de abonament, verificata de gateway)
si `Authorization: Bearer` (jetonul din `LoginUser`, valabil 24 de ore).

⚠ **Gateway-ul si Cargus raspund la coduri DIFERITE, si asta ajuta la diagnostic:** un 401 vine de
la Azure si inseamna cheie de abonament gresita sau inactiva, pe cand un **500** vine de la
backendul lor si inseamna aproape mereu ca userul sau parola de WebExpress sunt gresite. Cargus
intoarce 500 acolo unde altii ar intoarce 401.

**Referintele autoritare, amandoua verificate pe 15.09.2026:**

1. **`DocumentatieAPIV3-2.0-EN.pdf`, 68 de pagini**, adusa de la
   <https://www.cargus.ro/wp-content/uploads/DocumentatieAPIV3-2.0-EN.pdf>. ⚠ Copia de pe Desktop
   pe care se sprijinea auditul din iulie **nu mai exista**, exact ca modulul de WooCommerce al
   DPD-ului; a fost readusa de pe site. **SHA256 identic** cu cel notat de auditul din 09.09
   (`22FA1C...822C0`), deci e acelasi document, nu o revizie noua.
2. **`cargus.1.6.0.zip`, modulul lor OFICIAL de WooCommerce**, din `Downloads`. E referinta cea
   mai buna pentru FORMA incarcaturii: documentatia lor se contrazice pe alocuri, iar modulul
   arata care forma chiar ruleaza.

**Cod:** `src/lib/cargus.ts`, `src/lib/actions/cargus.actions.ts`, ramura Cargus din
`src/lib/actions/shipping.actions.ts`, modulele pure din `src/lib/shipping/` (`coletele-cargus.ts`,
`raspunsul-awb-cargus.ts`, `plata-in-punct-cargus.ts`, `datele-cargus.ts`), cronurile
`src/app/api/cron/cargus-tracking` si `cargus-repayments`, ferestrele `CargusAwbModal.tsx`,
`CargusConfigClient.tsx` si `CargusPickupModal.tsx`, ruta de eticheta `src/app/api/cargus/awb`.

---

## Expunerea masurata, 15.09.2026

| ce | cat |
| --- | --- |
| AWB-uri Cargus emise vreodata | **ZERO** |
| Magazine cu Cargus configurat | 2 (o zona pornita, una oprita) |
| Comenzi care au ales Cargus la checkout | 2 |
| Comenzi la Ship & Go | 0 |
| Operatii Cargus in registrul de operatii externe | 0 |
| Comenzi peste 50 kg, pe toata platforma | 0 |

⚠ **Cargus e cel mai mic trafic dintre curierii trecuti pana acum**, si asta schimba ce inseamna
fiecare constatare de mai jos: sunt defecte pe drumuri care **inca n-au fost umblate**. Niciunul
n-a facut rau cuiva, si niciunul n-ar fi fost prins de un utilizator, fiindca nu exista utilizator.

⚠ **Si totusi nu e o integrare noua:** memoria proiectului spune ca era singura integrare pe care
proprietarul o testase LIVE inainte de auditul din iulie. Deci codul a functionat candva pe un cont
adevarat; ce lipseste azi din baza e istoricul, nu incercarea.

---

## Ce foloseste platforma din API-ul lor

| Calea lor | Folosim | Unde |
| --- | --- | --- |
| `LoginUser` | **da** | jeton tinut 23h in instanta, cu parola in cheia de cache |
| `Awbs` (POST) | **da** | `createCargusAwb` |
| `Awbs?barCode=` (DELETE) | **da** | anularea, doar cat timp coletul n-are checkpoint |
| `AwbDocuments?barCodes=&type=&format=` | **da** | eticheta A4 sau 10x14 |
| `ShippingCalculation` | **da** | cotarea din checkout, cu NUME de judet/localitate |
| `PickupLocations` | **da** | expeditorul, dupa `LocationId` |
| `PriceTables` | **da** | tabelele de pret ale contractului |
| `PudoPoints` | **da** | punctele Ship & Go |
| `Orders` (PUT) | **da** | validarea comenzii de ridicare, cand punctul n-are AutomaticEOD |
| `Counties?countryId=1` | **da** | nomenclatorul de judete |
| **`AwbTrace/GetDeltaEvents`** | **da, de azi** | tot ce s-a miscat in cont intr-un interval |
| **`AwbTrace/WithRedirect`** | **da, de azi** | starea unor AWB-uri anume, mai multe pe cerere |
| **`CashAccount/GetByDate`** | **da, de azi** | rambursurile din contul colector |
| `Awbs?barCode=` (GET) | nu | fisa expedierii; `AwbTrace` da mai mult |
| `Localities`, `Streets` | nu | nomenclatoare fine; noi trimitem NUME, pe care ei le accepta |
| `CashAccount/GetByDeductionDate` | nu | `GetByDate` acopera aceeasi intrebare pe interval |
| `AwbStatus/GetAwbSyncStatusByBarCode` | nu | starea de sincronizare; `AwbTrace` da evenimentele |
| `Awbs/WithgetAwb` | nu | ⚠ vezi I-1: forma lui de raspuns ne-a aratat defectul |
| `intl-countries`, `pricing/calculate`, `awb` (export) | nu | API-ul lor de export, serviciul 41 |

---

## Inchis

### I-1. ⚠⚠ „[object Object]" nu mai e un numar de AWB

`createCargusAwb` scria `String(barCode ?? "").trim()`, cu o singura paza: sirul gol si „null".
Dar `String({})` da `"[object Object]"`, care nu e niciuna din ele. Trecea, si se scria pe comanda
ca numar de expediere. De acolo mai departe eticheta se cere pe el, urmarirea il intreaba, anularea
il trimite la Cargus: **nimic nu mai da eroare**, si nimeni nu afla pana nu suna clientul.

⚠ **Nu e o temere teoretica.** Modulul lor oficial (`class-cargus-admin.php`, randurile 1254-1300)
trateaza raspunsul la crearea AWB-ului in doua forme:

* `is_string($awbs)` inseamna codul de bare;
* `is_array($awbs)` inseamna **EROARE**, cu mesajul ori in `status`/`command`, ori pe `Error`-ul
  fiecarui element, ori ca lista de siruri.

Deci Cargus chiar intoarce obiecte pe raspunsuri cu HTTP 200, iar modulul lor le citeste ca esec.
Noi le scriam ca succes.

⚠ **Si „eroare" nu se poarta ca „necunoscut", fiindca deosebirea costa bani.** La eroare ei ne-au
spus limpede ca expedierea nu s-a facut, deci slotul din registru se elibereaza si omul poate
incerca din nou. La necunoscut nu stim daca a plecat sau nu, si atunci slotul ramane blocat: un
colet care POATE a plecat nu are voie sa fie reincercat de la sine.

### I-2. ⚠⚠ Trei colete primesc TREI fise, nu una care le cantareste pe toate

Fereastra il lasa pe comerciant sa spuna „3 colete" si trimitea `parcels: 3`, dar `parcelsDetails`
era **mereu o singura intrare, cu greutatea intreaga**. Corpul care pleca la Cargus spunea deodata
doua lucruri care nu se potrivesc: trei bucati, si un singur cod de colet care le cantareste pe
toate.

Invarianta e scrisa in chiar modulul lor (randurile 1155-1197): bucla construieste EXACT cate un
`ParcelCodes[i]` per bucata, iar `TotalWeight` se aduna din greutatile lor.

⚠ **Ce costa:** o eticheta tiparita pentru o expediere de trei colete inseamna doua colete plecate
fara eticheta. Asta nu se vede ca eroare nicaieri; se vede ca marfa pierduta.

Acum: greutatea se **imparte**, nu se inventeaza, iar restul cade pe ultima parte (10 kg in 3 parti
dau inapoi exact 10 kg, nu 9,99, adica nu un kilogram in minus la fiecare a suta expediere).
Plafoanele sunt ale lor (**9 plicuri**, **15 colete**) si se refuza INAINTE de orice apel, iar
fereastra le spune inainte de apasare. Un plic de 3 kg nu se mai **taie tacut** la 1 kg: se refuza,
fiindca taiat, Cargus cantareste la depozit si factureaza diferenta.

### I-3. ⚠⚠ Un punct Ship & Go care incaseaza NUMAI PE CARD nu mai primeste ramburs in numerar

Se cerea un singur lucru de la punct: `ServiceCOD`. Documentatia lor cere doua, si a doua e chiar
cea care se vede la ghiseu:

```
"ServiceCOD"  - the delivery point dose or dose not allow COD
"PaymentType" - payment type of the delivery point
                ( 1 - no payment available, 2 - pay only by card,
                  3 - pay by cash or card, 4 - pay only cash )
```

Un punct cu `ServiceCOD: true` si `PaymentType: 2` trecea filtrul nostru, iar coletul pleca acolo
cu `CashRepayment`. **Cumparatorul ajunge la ghiseu cu banii in mana si nu are cum sa plateasca:**
coletul se intoarce, marfa se blocheaza, si nimeni nu stie de ce.

⚠ **Si pe dos, la fel de scump:** rambursul in contul colector se incaseaza la ghiseu CU CARDUL,
deci un punct „doar numerar" nu poate face asta.

⚠ **Lipsa campului PASTREAZA punctul, dinadins.** E optional in raspunsul lor; taiat, un cont care
nu-l trimite ar ramane BRUSC fara niciun punct Ship & Go, iar o lista goala nu produce niciun mesaj
in interfata: defectul ar fi tacut si total. Acelasi rationament si pentru o valoare noua pe care
nu o stim.

### I-4. ⚠ Cota descrie expedierea care chiar pleaca

Ramura Cargus cerea UN singur pret si il punea pe amandoua optiunile, la adresa si Ship & Go. Dar
livrarea in punct pleaca pe **serviciul 38 (PUDO Delivery)**, care are tariful LUI, iar cota se
facea pe serviciul ales dupa greutate (34/35/50). Aceeasi comanda cota 34 si emitea 38.

Deci cumparatorul platea un transport, iar comerciantului i se factura altul, si diferenta o ducea
el. Nimic nu da eroare cand doua preturi diferite sunt amandoua valide.

⚠ **Costa o cerere in plus la cotare**, si se plateste. Dar alternativa nu e „o cerere mai putin",
ci „un pret care nu e al expedierii". Iar o cotare picata NU sterge optiunea: cade pe tariful fix
al zonei, ca sa nu se repete fundatura platita la FAN.

### I-5. Urmarirea coletului, si numararea banilor

Cargus era, alaturi de inca vreo doi, fara nicio bucla de urmarire: clientul se oprea la creare,
anulare, tiparire si ridicare.

**Doua rute, fiecare la ce e buna.** `AwbTrace/GetDeltaEvents?FromDate&ToDate` intoarce dintr-o
singura cerere tot ce s-a miscat in cont intr-un interval; numai cei ramasi pe dinafara primesc
intrebarea pe nume, prin `AwbTrace/WithRedirect?barCode=[lista]`, in loturi de zece.

⚠⚠ **DOUA FORMATE DE DATA IN ACELASI API.** Documentatia lor le scrie in doua capitole vecine:
`GetDeltaEvents` cere **`mm-dd-yyyy`**, american, iar `CashAccount/GetByDate` cere **`yyyy-mm-dd`**,
ISO. Trimise invers, cele doua **nu dau eroare**: `03-11-2026` citit ca ISO e o data valida, si
invers. Intervalul cerut e ALTUL, raspunsul vine gol, si cronul raporteaza linistit „zero de
verificat". De aceea cele doua au functii cu NUME diferite, nu un parametru care se poate uita.

⚠ **Forma interogarii a fost PROBATA pe PostgREST inainte de a fi scrisa:** identica pe coloanele
Woot intoarce 138 de randuri adevarate, deci sintaxa, `.or()`-ul si ordonarea merg; pe coloanele
Cargus intoarce zero fiindca zero AWB-uri s-au emis vreodata. Vezi `zero-randuri-nu-e-succes`.

**Rambursurile, in schimb, HOTARASC.** `CashAccount/GetByDate` da campuri structurate si
documentate, iar din ele se scriu randuri in `courier_settlements`, tabelul care se vede deja in
`/dashboard/settlements`.

⚠ **Doua date, si nu inseamna acelasi lucru.** `RepaymentDate` e cand s-a INCASAT banul de la
cumparator; `DeductionDate` e cand a plecat ordinul de plata catre comerciant. In tabel intra
**numai ce a fost virat**, fiindca `transfer_date` inseamna chiar ziua virarii, e `not null` si
intra in cheia unica. Un ramburs incasat si nevirat ar trebui sa imprumute o data care nu exista,
iar tabelul ar ajunge sa spuna ca banii au sosit cand n-au sosit. Se numara separat si intra la
rularea urmatoare, cand chiar pleaca ordinul.

⚠ **Nu se atinge `payment_status`**, ca la Woot: el declanseaza si facturarea automata, iar o
interpretare gresita ar emite facturi in lant.

Migratia `2027-01-19-cargus-isi-urmareste-coletul.sql`, aplicata.

---

## ⚠⚠ De ce cronul INREGISTREAZA si nu hotaraste

Fiindca **ei nu publica nicio enumerare de stari**. In toate cele 68 de pagini ale documentatiei V3
statusul apare ca TEXT liber, iar singurul exemplu din ea e `"Status": "Tiparit"`. Nu exista niciun
tabel de coduri, asa cum are DPD in „Appendix 1", si niciun boolean cumulativ, asa cum are Sameday
in `expeditionSummary.delivered`.

Un `switch` pe textul lor ar fi o presupunere imbracata in logica, iar prima formulare neprevazuta
ar cadea tacut pe ramura implicita. **Aceeasi cumpana s-a luat la Woot, si acolo a iesit bine:**
cronul a strans perechile din trafic, iar harta s-a scris DIN DATE cateva ore mai tarziu. De aceea
fiecare formulare noua se striga pe nume in raspunsul cronului: asa creste vocabularul.

⚠ **Singurul semnal structurat e confirmarea.** `GetDeltaEvents` si `WithRedirect` intorc
`ConfirmationDate` si `ConfirmationPersonaName`. Sunt campuri, nu text liber, deci se pastreaza
separat: cand harta se va scrie, ele vor fi temelia ei. **Dar nici ele nu muta comanda azi:**
documentatia lor nu spune daca o confirmare inseamna livrare sau doar „cineva a semnat ceva", iar
un refuz se confirma si el, de catre curier. Un „Livrat" pus pe o confirmare de REFUZ ar emite si
factura, si aia e greu de intors.

---

## Ce era deja inchis, verificat rand cu rand azi

Auditul din 09.09.2026 a dat Cargusului **4,67/10** pe un snapshot de atunci. ⚠ Raportul acela e
**in urma**: cinci din zece constatari erau deja inchise cand l-am recitit azi, iar altele au fost
inchise intre timp de lucrari care nu purtau numele Cargus.

| constatare | stare azi |
| --- | --- |
| CARGUS-01, PDF-ul trimitea intreg blocul din spate | **inchis** de `raspunsEticheta` |
| CARGUS-02, testul de conectare fara poarta | **inchis** in `secretDinConfig`, care are `getUser` si verificarea proprietarului INAINTE de a intoarce secretul |
| CARGUS-04, cache-ul de token ignora parola | **inchis**, `cheieToken` o hasuieste |
| CARGUS-06, fara termene HTTP | **inchis**, cinci `AbortSignal.timeout` |
| CARGUS-07, recuperarea anularii | **inchis**, cu alarma in `/admin/logs` si slotul din registru eliberat doar dupa confirmare |
| CARGUS-03, cota nu descrie expedierea | **inchis azi**, vezi I-4 |
| CARGUS-05, raspunsul AWB convertit arbitrar | **inchis azi**, vezi I-1 |
| CARGUS-09, multi-colet fara validare | **inchis azi**, vezi I-2 |
| CARGUS-10, tracking si reconciliere | **inchis azi**, vezi I-5 |
| CARGUS-08, ridicarea nu devine manifest urmarit | **deschis**, vezi D-2 |

Si, in plus, tot ce sta deja bine: emiterea trece prin `poartaAwbPropriu` INAINTE de orice apel la
curier si prin `cuRegistru`, deci un rezultat deja reusit se adopta in loc sa nasca al doilea colet;
diacriticele se scot de pe judet, localitate si adresa, iar „Sector X" se plieaza in „Bucuresti",
fiindca la Cargus capitala e o singura localitate; `normalizePhone` e pe tot drumul; plicurile,
livrarea sambata, valoarea declarata si rambursul in cont sau in plic sunt toate cablate.

---

## Deschis

### D-1. ⚠ Serviciul pentru peste 50 kg: documentatia lor se contrazice cu modulul lor

Documentatia spune de trei ori, in trei capitole:

> `ServiceId: - 34 for totalweight 0-31 kg ; 35 for 31 kg < totalweight <= 50 ; 50 for totalweitght > 50 kg`

Dar **anexa aceluiasi document** nu listeaza niciun serviciu 50: are 34 Economic Standard, 35
Standard Plus, **36 Palet Standard**, 38 PUDO Delivery, 39 Multipiece. Iar **modulul lor oficial**
foloseste **36** pentru 51-800 kg.

Codul nostru trimite **50**, adica ce scrie in corpul documentatiei. Nu se poate hotari din
documente, si se lamureste pe cont, la prima expediere grea. **Masurat: zero comenzi peste 50 kg pe
toata platforma.**

### D-2. Ridicarea nu devine un manifest urmarit

`Orders` PUT valideaza comanda deschisa pe punctul de ridicare, iar raspunsul se arata omului, dar
nu se pastreaza nicaieri: nu exista o stare de „ridicare ceruta azi" pe care panoul s-o arate.
⚠ Si nu se poate face un dedupe simplu pe zi: validarea opereaza pe comanda deschisa, iar AWB-uri
noi pot cere o validare ulterioara in aceeasi zi.

### D-3. Rambursul nu se vede pe COMANDA, doar in decontari

`courier_settlements` raspunde la „mi-au virat banii?". La „unde sunt banii de pe comanda asta?"
raspunde deocamdata numai Woot, care are coloanele lui. La Cargus ar cere o migratie noua pentru un
drum cu zero trafic; se face cand apar rambursuri adevarate.

### D-4. Nomenclatoarele fine si retururile

`Localities`, `Streets` si `AwbStatus/GetAwbSyncStatusByBarCode` raman neatinse: noi trimitem NUME
de judet si localitate, pe care ei le accepta si le valideaza. Retururile (`ConsumerReturnType`),
livrarea pre10/pre12 si exportul international (serviciul 41, pe alt API) sunt nefacute deliberat,
din iulie.

### D-5. ⚠⚠ Nedovedit live, si aici mai mult decat oriunde

**ZERO AWB-uri Cargus in toata viata platformei.** Ce se poate spune despre drumurile neumblate e
„respecta documentatia lor si modulul lor", nu „merge".

---

## Nota, cinstit

**9/10.**

Emiterea, anularea, eticheta, cotarea, punctele Ship & Go si validarea ridicarii erau intregi din
iulie; de azi platforma stie si ce se intampla cu coletul dupa ce pleaca, si isi numara banii de
ramburs. S-au inchis patru defecte care ar fi lovit prima expediere adevarata: un numar de AWB care
putea fi „[object Object]", un corp care spunea trei colete si descria unul, un punct de ridicare
care nu putea incasa forma de ramburs trimisa acolo, si o cota care nu era a expedierii.

⚠ **Ce lipseste, si de ce nu e 10:**

1. **Nedovedit live** (D-5), si aici cantareste mai mult decat la ceilalti: la Woot sunt 172 de
   AWB-uri, la Sameday unul, aici **niciunul**. Toate reparatiile de azi sunt sprijinite pe
   documentatia lor si pe modulul lor, nu pe un colet care a plecat.
2. **Serviciul pentru peste 50 kg** (D-1) nu se poate hotari din documente: documentatia lor se
   contrazice cu propria anexa si cu propriul modul. Se lamureste pe cont.
3. **Harta de stari** nu exista, si nu din lene: **ei nu publica niciuna**. Cronul strange
   vocabularul din trafic, exact ca la Woot, si abia pe el se va putea cabla mutarea comenzii.
   Pana atunci comanda nu se misca singura, si asta e o alegere, nu o scapare.

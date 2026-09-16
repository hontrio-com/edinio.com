# GLS: evidenta integrarii

> **Ce e fisierul asta.** Evidenta pe care o tinem pentru fiecare curier pana cand integrarea lui e
> 10/10 din toate punctele de vedere: securitate, optimizare, functionalitate, compatibilitate cu
> platforma, si conformitate cu documentatia lor. Se tine la zi ODATA CU codul, in acelasi commit.
>
> Conventia: cate un fisier per curier, in `docs/curieri/`. Al noualea, dupa `WOOT.md`, `DPD.md`,
> `SAMEDAY.md`, `CARGUS.md`, `COLETE-ONLINE.md`, `ECOLET.md`, `PACKETA.md` si `SMARTSHIP.md`.

**Care GLS:** **MyGLS** (`api.mygls.ro`), API-ul national din contract, **nu** dev-portal-ul
`api.gls-group.net` (ShipIT). Sunt doua familii sub aceeasi marca, iar contul comerciantului nu are
ShipIT.

**Referinta autoritara:** doua PDF-uri luate de proprietar de pe site-ul lor, pe 16.09.2026:

| fisier | md5 | ce e |
| --- | --- | --- |
| `MyGLSAPI.pdf` | `aabf8114e596fdcfc7bf90453c138300` | 46 pagini, ver. 25.12.11, changelog pana la 30.03.2026 |
| `MyGLS API XXL.pdf` | `9ba9cc02d9f0061c25dd9f01e4e99b2a` | 18 pagini, colete XXL si listele de expeditie |

⚠ **Primul are md5 IDENTIC** cu cel notat in memoria proiectului pentru
`https://api.mygls.ro/docs/MyGLS_API.pdf`. Deci e acelasi document unic pe regiune, iar tot ce s-a
scris pe el pana acum ramane valabil. Al doilea e nou pe disc si a fost citit acum cap-coada.

**Cod:** `src/lib/gls/` (`client.ts`, `expediere.ts`, `statusuri.ts`, `appendix-g.ts`, `puncte.ts`,
`parola.ts`, `data-net.ts`, `eticheta.ts`, `rambursul-se-stinge-la-plata.ts`),
`src/lib/actions/gls.actions.ts`, cronul `src/app/api/cron/gls-tracking`, ruta de eticheta
`src/app/api/gls/awb`, ferestrele `GlsAwbModal.tsx` si `GlsConfigClient.tsx`.

---

## Expunerea masurata, 16.09.2026

| ce | cat |
| --- | --- |
| Magazine cu GLS configurat | **2** (VetDepo si Insula Bucuriei, amandoua pe productie) |
| AWB-uri emise vreodata | **ZERO** |
| Comenzi cu punct de ridicare GLS | **ZERO** |
| Operatii `gls` in registrul de operatii externe | **ZERO** |
| Comenzi in baza, total | 468 |

⚠ **Nu e zero curat, ca la SmartShip sau Packeta: doi comercianti au butonul apasat si asteapta.**
Asta schimba prioritatea. Nu conteaza cate lucruri sunt teoretic de facut, ci ce se rupe la PRIMA
emitere reala, si ce costa bani pe a doua.

---

## ⚠ Ce am reverificat azi din memorie, si ce a iesit

Memoria proiectului (`gls-integrare`) purta in antet „patru defecte care rup prima emitere reala,
NEREPARATE". **Verificat rand cu rand in cod: toate patru sunt reparate**, in commitul `cf5718d5`
din 14.08. Antetul memoriei ramasese in urma muncii, exact clasa de greseala pe care proiectul o are
deja scrisa ([[masuratoarea-scrisa-in-cod-ramane-in-urma]]).

| ce spunea memoria | ce e in cod azi |
| --- | --- |
| `ZipCode` pleaca gol la fiecare comanda romaneasca | `order.actions.ts` scrie `postal_code` ori de cate ori exista, nu doar la extern; iar `gls.actions.ts` cade pe codul unui punct GLS din aceeasi localitate si il trece in avertismente |
| Un raspuns care a creat coletele dar n-a intors eticheta e clasat „esuat" | `if (numere.length === 0)` cu SI, nu SAU: daca avem numere, operatia a REUSIT |
| `DeleteLabels` nu sterge, iar codul 6 face fundatura | `coletulAPlecat()` deosebeste „deja sters" de „GLS l-a preluat", uitandu-se la ISTORICUL coletului |
| 23 din 90 de coduri Appendix G in nicio multime, printre ele `92` = livrat | `appendix-g.ts` e copiat mecanic din PDF si comparat automat cu multimile din `statusuri.ts`; `92` e in `LIVRAT` |

**De asemenea confirmate ca fiind deja in cod:** INS cere `Count = 1` (Appendix A, 28) si se
verifica local; PSD cere obligatoriu `ContactName` + `ContactPhone` + `ContactEmail` (pagina 36) si
se verifica local; cele sapte tari sunt toate in `TARI_MYGLS`, iar gazda e pe lista alba, deci
`tara` nu poate scoate cererea din domeniul furnizorului; mediul emiterii se pastreaza pe operatie;
`ShipItThermoZpl` a fost scos din panou fiindca apare doar la `GetPrintedLabels`, nu si la
`PrintLabels`.

---

## 1. ⚠⚠ CUMPARATORUL PLATEA DE DOUA ORI, SI NIMIC NU SEMNALA ASTA

Comanda pleaca cu plata la livrare. Comerciantul emite AWB-ul. **Abia dupa aceea** clientul
plateste online: un link de plata trimis de magazin, o reincercare reusita la procesator, o comanda
de marketplace incasata mai tarziu.

Coletul e deja la GLS cu suma veche pe el, deci curierul mai incaseaza o data la usa bani pe care
magazinul ii are.

Din toate celelalte unghiuri ale aplicatiei comanda arata platita. Nimic nu se uita la ce poarta
coletul, deci defectul iese la iveala abia cand suna clientul.

⚠ **Si GLS documenteaza metoda EXACT pentru asta.** `ModifyCOD` (pagina 29) primeste
`ParcelNumber` sau `ParcelId` si un `CODAmount` „zero sau pozitiv" (Appendix A, codul 8: „COD amount
has to be >= 0"). Pana azi n-o chema nimeni: aparea o singura data in tot codul, intr-un comentariu.

**Ce s-a facut:**

- `modificaRamburs()` in `gls/client.ts`. ⚠ Raspunsul lor n-are `ErrorCode` la nivelul principal,
  ca celelalte metode: are un STEAG (`Successful`) si o lista proprie (`ModifyCODError`), deci
  `apelMyGls` nu poate prinde refuzul si se citeste aparte.
- ⚠ **`Successful` trebuie sa fie CHIAR `true`.** Un `false` cu lista de erori goala nu e succes, e
  o tacere: nu stim daca suma s-a schimbat. Citit ca reusita, am fi raportat „rambursul e stins"
  pentru un colet care pleaca mai departe cu suma veche, iar nimeni n-ar mai fi verificat. Aceeasi
  regula ca la `cancelCOOrder` de la Colete Online.
- `rambursul-se-stinge-la-plata.ts`, chemat din `dupaPlata`, **singurul loc prin care trec toate
  platile online** (Netopia, Stripe, Revolut, Klarna, iPay), si care se aprinde exact o data, pe
  drumul „platita-acum".
- Suma de ramburs se pastreaza acum in registru la emitere. ⚠ `ramburs: 0` e o AFIRMATIE („coletul
  a plecat fara ramburs"), deci acolo nu se cheama nimic; lipsa ei inseamna „AWB emis inainte ca
  suma sa fie pastrata", si acolo se cheama, fiindca `CODAmount: 0` pe un colet fara ramburs nu
  strica nimic, pe cand tacerea ar costa cat o incasare dubla.
- ⚠ **Acelasi mediu in care s-a emis.** Productia si testul sunt baze separate: un `ModifyCOD`
  trimis in alta parte ar raspunde „colet negasit" pentru un colet care chiar pleaca spre client, iar
  noi am fi raportat ca s-a rezolvat.
- ⚠ **Nu sta in `gls.actions.ts`.** Acolo fiecare export devine endpoint apelabil din browser, iar
  functia asta se cheama dintr-un webhook de plata, unde nu exista nicio sesiune care sa treaca de
  poarta. Pusa acolo, ar fi fost o cale publica de a stinge rambursul oricarei comenzi al carei id
  il ghicesti.
- Cand nu merge, `logError` la severitate **critica**, cu AWB-ul in mesaj: ce ramane e un colet care
  incaseaza la usa bani deja incasati, iar comerciantul trebuie sa schimbe suma de mana in MyGLS.
  Pentru asta trebuie sa AFLE.

---

## 2. ⚠ „Configurat complet" traia in PATRU copii

`gls.actions.ts`, cronul de urmarire (care scria chiar deasupra ei „aceeasi regula ca in
gls.actions.ts"), lotul de comenzi, si acum si stingerea rambursului ar fi facut a patra.

Patru copii ale aceleiasi propozitii inseamna ca un camp nou devenit obligatoriu se adauga in trei
din patru, iar a patra cale cheama GLS cu o configurare incompleta si primeste un refuz pe care
nimeni nu-l leaga de cauza. Vezi [[acelasi-lucru-in-doua-copii]].

Regula sta acum in `glsGata()`, in `client.ts`, langa `pallexGata` si `postaGata`, care fusesera
deja adunate asa. ⚠ Proba cauta INSIRUIREA DE CAMPURI, nu numele functiei: cine rescrie regula o
face tocmai fiindca nu stie de `glsGata`, deci ar scrie-o pe litere.

---

## Ce am citit azi in documentatie si NU era in cod

Changelog-ul PDF-ului merge pana la 30.03.2026. Verificat fiecare intrare fata de cod:

| intrare | in cod | ce inseamna |
| --- | --- | --- |
| #34 `HidePhoneNumberOnLabels` (30.03.2026) | **NU** | steag optional care ascunde telefonul de pe eticheta tiparita. Eticheta noastra sta pe R2 si poarta numele, adresa si telefonul CUMPARATORULUI, deci ar fi o imbunatatire reala de confidentialitate. E o alegere a comerciantului, nu o reparatie: cere un comutator in panou. |
| #24 `PrintLabels_20251022` + `PIN` | **NU** | PIN-ul apare doar cand coletul are serviciul P&S si `PickupType = LabellessParcelLocker (2)`, adica livrare fara eticheta la locker. Noi livram la punct cu PSD, deci nu ne atinge azi. |
| #32 `GetClientReturnAddress` STERSA (30.03.2026) | nu o chemam | bine asa: metoda nu mai exista. |
| #31 `GetDeliveryPoints`/`GetLocations` in `MasterDataService` | **NU** | `GetDeliveryPoints` **nu raspunde** (masurat: inchide conexiunea, si pe productie si pe test), de aceea punctele vin din `map.gls-romania.com/data/deliveryPoints/ro.json`. `GetLocations` ar da `Routing.DepotNumber` dintr-un cod postal si ar putea inlocui cautarea noastra de cod postal, dar e o optimizare, nu o reparatie. |
| XXL: `ParcelPropertyList`, `PackageType` 1-7, max 80 kg/colet | **NU** | dimensiunile si tipul ambalajului. Obligatorii doar pentru Serbia (unde oricum refuzam pe fata, din alt motiv) si pentru coletele XXL. |
| XXL: `GetParcelListToDispatchList`, `SetDispatchList`, `GetDispatchList`, `GetDispatchListReport` | **NU** | lista de expeditie, ceruta pentru coletele XXL. Integrare separata, cu ecran propriu. |
| XXL: serviciul `USM` (Used Machine Service) | **NU** | ⚠ la el `DeliveryAddress` trebuie sa fie IDENTICA cu `PickupAddress`, scris cu semnul exclamarii in exemplul lor. |

---

## Ce ramane deschis, si de ce

1. **Prima emitere reala de AWB (D-5).** Doi comercianti au GLS pornit si niciunul n-a emis inca
   nimic. Tot ce se poate proba fara fir e probat; codul postal al expeditorului, `ZipCode`-ul
   destinatarului si serviciul PSD se dovedesc doar cu un colet adevarat.
2. ✅ **`FinalDeliveryAddress` la PSD: FACUT (16.09.2026).** Documentatia lor, pagina 9,
   verbatim: „Backup delivery address (recipient's own address) when using PSD service. Used if
   ParcelShop becomes unavailable." Fara ea, un punct inchis inseamna colet intors — iar la
   ramburs, si marfa intoarsa, si bani neincasati.

   **Ce il bloca:** strada cumparatorului era SUPRASCRISA cu adresa punctului la plasarea comenzii,
   deci se pierdea. Blocajul era in checkout, nu la GLS. S-a ridicat in aceeasi zi: se pastreaza
   acum in `shipping_address.home_address`.

   **Cum se trimite:** doar la PSD (la o livrare obisnuita adresa de livrare E deja a omului), si
   doar cand e INTREAGA. ⚠ La ei `Name`, `Street`, `City` si `ZipCode` sunt toate REQUIRED
   intr-un `Address`; una incompleta ar fi refuzata cu totul, adica ar strica si expedierea care
   altfel pleca bine. Mai bine fara rezerva decat fara colet.

   ⚠ Codul postal al rezervei se rezolva pe localitatea CUMPARATORULUI, prin aceeasi cadere in
   trei trepte ca destinatia — nu se imprumuta codul punctului, care e alta adresa.

   ⚠ **Ce ramane adevarat:** rezerva exista doar cand cumparatorul chiar si-a scris adresa
   (formularul nu o cere cand se alege un punct) si niciodata pentru comenzile de marketplace.
   Masurat pe 16.09: din 106 comenzi cu punct, 100 vin de pe eMAG si n-au nicio strada. Pentru
   comenzile de dinainte de 16.09 nu se poate compune deloc: strada nu mai exista nicaieri.
3. **Ridicarea de la comerciant** (`CreatePickupRequest`, `PickupService.svc`) si **anularea in
   lot** (`DeleteLabels` primeste pana la 50 deodata): amandoua reale si nefacute. La zero AWB-uri,
   n-au cui sa foloseasca inca.
4. **`HidePhoneNumberOnLabels`**: vezi tabelul de mai sus. Comutator in panou, cand se cere.
5. ⚠ **Punctele nu spun daca incaseaza ramburs.** `acceptsCash`/`acceptsCard` apar doar in fisierul
   UNGURESC, iar `CodHandler`/`CardPaymentAllowed` doar in metoda de API care nu raspunde. Deci un
   cumparator cu ramburs poate alege un punct care nu incaseaza, si se afla abia la emitere. Nu se
   poate repara din datele pe care le avem.

---

## Nota, cinstit

**9,5/10.**

Integrarea era deja foarte buna, si asta nu e o formula de politete: auditul din 14.08 a fost
temeinic, iar tot ce am verificat azi rand cu rand a iesit deja rezolvat. Codurile Appendix A sunt
impartite dupa FAZA emiterii (`CODURI_INCERTE`), nu dupa „diferit de zero"; Appendix G e copiat
mecanic din PDF si comparat automat; codul 6 de la stergere e deosebit prin istoricul coletului;
mediul emiterii calatoreste cu operatia.

Ce s-a inchis azi sunt doua lucruri pe care documentatia le stia si codul nu:

1. `ModifyCOD` exista de la inceput si n-o chema nimeni, deci un cumparator care platea online dupa
   emitere platea de doua ori;
2. regula de „configurat complet" traia in patru copii, si urma sa faca a cincea.

⚠ **Ce lipseste, si de ce nu e 10:**

1. **Nedovedit live.** Cantareste mai mult aici decat la curierii cu zero magazine: doi comercianti
   au butonul apasat, deci prima emitere reala e o intamplare care se poate produce maine.
2. **`FinalDeliveryAddress`** e o gaura reala, si e blocata de o hotarare de checkout care atinge
   toti curierii cu punct de ridicare. Trebuie facuta acolo, cu proba pe toti, nu strecurata aici.
3. **Ridicarea si anularea in lot** sunt functionalitati intregi, nu reparatii; le fac cand exista
   trafic care sa le ceara.

**Probe:** 10 noi. Banc de mutanti **10 din 10**, cu mutantul pe APELANT la amandoua reparatiile
(`dupaPlata` pentru stingerea rambursului, lotul de comenzi pentru regula de configurare).
`tsc` curat, **8.194 de probe verzi**, build OK, fara migratie.

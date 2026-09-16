# UPS: evidenta integrarii

> **Ce e fisierul asta.** Evidenta pe care o tinem pentru fiecare curier pana cand integrarea lui e
> 10/10 din toate punctele de vedere. Se tine la zi ODATA CU codul, in acelasi commit.
>
> Conventia: cate un fisier per curier, in `docs/curieri/`. Al saisprezecelea.

⚠ **TRECEREA ASTA E TINTITA, NU COMPLETA.** S-a facut in aceeasi sesiune cu FedEx, si scopul ei a
fost anume: **sa caute la UPS tiparele dovedite la FedEx**. Nu e un audit pe sapte dimensiuni ca
acela. Ce n-a fost cautat e scris la urma.

**Referinta autoritara:** `github.com/UPS-API/api-documentation`, verificat pe 16.09.2026: **41 de
fisiere `.yaml`**, acelasi numar ca la trecerea anterioara. Descarcate azi si citite: `Rating.yaml`
(240 KB), `Shipping.yaml` (597 KB), `Tracking.yaml`, `OAuthClientCredentials.yaml`, `Locator.yaml`,
`TimeInTransit.yaml`, `UPSTrackAlert.yaml`.

**Cod:** `src/lib/ups/` (`client.ts`, `expediere.ts`, `preturi.ts`, `statusuri.ts`),
`src/lib/actions/ups.actions.ts`, cronul `src/app/api/cron/ups-tracking`.

---

## Expunerea masurata, 16.09.2026

| ce | cat |
| --- | --- |
| Magazine cu UPS configurat | **ZERO** (din 129) |
| AWB-uri emise vreodata | **ZERO** |
| Operatii `ups` in registru | **ZERO** |

---

## Ce s-a reparat

### 1. ⚠⚠ Un refuz DOVEDIT al autentificarii iesea „nu stim” si bloca o comanda despre nimic

Acelasi defect ca la FedEx si Shipo — **cei trei clienti sunt scrisi dupa acelasi sablon**. In
`apel()`, luarea tokenului statea INAUNTRUL lui `try`, iar `catch`-ul rescria orice a iesit de acolo
prin `ambiguu`, adica `necunoscut` pe o scriere.

La UPS `token()` are TREI refuzuri dovedite, toate cu mesaj lucrat:
- **401/400** „UPS a respins credentialele";
- **403** „Blocked Merchant" — contul e blocat pentru API, cheile n-au nicio vina;
- **429** „Quota Limit Exceeded" — nu schimba cheile, mai incearca.

Toate trei inseamna acelasi lucru: **cererea de expediere nu a plecat**. Rescrise ca `necunoscut`,
blocau randul din registru si scoteau la om o comanda despre care se stia sigur ca nu s-a intamplat
nimic cu ea. Acum verdictul lor ajunge neatins la apelant.

⚠ Reparat in toti trei deodata, cu o proba comuna — `src/lib/integrari/refuzul-tokenului-ramane-refuz.test.ts`
— care ii apara pe toti trei si **cade daca apare al patrulea client scris la fel**. Cand repari un
tipar, cauta-i copiile.

### 2. Cheia respinsa cerea un token nou la fiecare cotare

UPS avea deja **single-flight** (`tokenuriInZbor`), care opreste ploaia de tokenuri cerute in aceeasi
clipa. Dar nu si sirul de cereri una dupa alta: un magazin cu chei gresite cerea un token nou la
FIECARE deschidere de checkout. Iar `/security/v1/oauth/token` are `429` in chiar schema lor
(„Quota Limit Exceeded"), si cota e a CONTULUI — deci bataia in ea strica autentificarea si pentru
cererile bune.

Acum refuzul DOVEDIT se tine minte 60 de secunde. ⚠ **Doar el**: gardul e `verdictFurnizor(e) ===
"esuat"`, iar `eroareCuStatus` da `esuat` numai pe 4xx fara 408 — deci o cadere la ei (5xx) sau un
timeout nu inchide poarta degeaba.

---

## Ce am verificat si era deja bine

| tiparul cautat (dovedit la FedEx) | ce am gasit la UPS |
| --- | --- |
| diacriticele scoase doar din strada | **nu e cazul**: `taie()` nu scoate, dar fiecare loc de apel infasoara explicit cu `stripDiacritics`, iar orasul trece prin `normalizeLocalityName`, care scoate el insusi. Nimic nu pleaca cu diacritice. |
| retur incheiat citit ca livrare | **nu e cazul**, si e scris de ce: UPS **n-are niciun tip de retur** in API. `esteRetur()` intoarce `false` si spune motivul. Un retur ajunge ca `X` (exceptie). |
| livrarea creduta prea devreme | **deja rezolvat**: `type: "D"` NU inseamna livrat (explicatia lor il desface in „loaded on delivery vehicle, out for delivery, delivered"). Livrarea se dovedeste cu `deliveryDate[type=DEL]`. |
| cheia de cache fara secret | **deja rezolvat**: trece prin ajutorul comun, cu gazda inauntru. |
| specificatia lor a crescut intre timp | **nu**: 41 de `.yaml`, acelasi numar. |

---

## ⚠ Ce NU s-a cautat in trecerea asta

Trecerea a fost tintita pe tiparele de la FedEx. **N-au fost reluate**: corpul cererii camp cu camp
fata de `Shipping.yaml`, cotarea fata de `Rating.yaml`, securitatea actiunilor de server, checkout-ul,
si cronul. Toate au fost facute la auditul anterior (vezi memoria `ups-integrare`), dar nu si azi.

Ramane deschis de atunci, si nu s-a atins: valuta valorii declarate luata dupa DESTINATAR desi UPS o
cere a EXPEDITORULUI, si instiintarea de punct fara `EMail` desi campul e in `required`.

---

## Nota, cinstit

**9/10** — si nota e a starii integrarii, nu a trecerii de azi.

Integrarea era buna si ramane buna. Ce s-a reparat azi e un defect real si de acelasi rang cu cele
mai grave gasite la FedEx: un refuz dovedit citit ca nesiguranta, exact pe drumul unde nesiguranta
blocheaza comanda.

⚠ **De ce nu e mai mult:** zero magazine si zero AWB-uri, deci nimic nu e dovedit live; trecerea de
azi a fost tintita, deci cele cinci dimensiuni de mai sus n-au fost recitite; si cele doua constatari
vechi raman nereparate.

**Probe:** 10 comune celor trei clienti (FedEx, UPS, Shipo). Banc de mutanti: **3 dintre cei 14
lovesc anume UPS**, toti prinsi. `tsc` curat, **8.271 de probe verzi**, build OK, fara migratie.

---

## Adaugat pe 16.09.2026, gasit pe drumul altui curier

### ⚠ Marcajul cronului rescria codul de status vechi

`ups-tracking` era unul dintre cele OPT cronuri in care `marcheazaVerificat` scria
`ups_status_code: codNou ?? o.ups_status_code`. Pe fiecare drum fara cod nou (fara configurare, apel
picat, fara stare) se scria inapoi codul CITIT la inceputul rularii. Intre citire si scriere sta un
apel extern: daca in rastimp comerciantul a dezlegat AWB-ul si a emis altul, coloana fusese golita,
iar randul o invia. Un cod FINAL inviat astfel scoate expedierea NOUA din urmarire pentru totdeauna,
tacut.

Acum starea se scrie doar cand exista un cod nou. Marcajul de rotatie ramane NECONDITIONAT, si asta
e la fel de important: sarit, o expediere care pica mereu ar sta in capul cozii la fiecare rulare si
ar infometa urmarirea intregii platforme. Proba comuna `codul-vechi-nu-invie.test.ts` apara amandoua
regulile si enumera dosarul de cronuri, deci cade si daca apare un cron nou scris la fel.

### Expunerea, remasurata

`ups_config.enabled` este fals la toate cele 129 de magazine, la fel `fedex_config` si `dhl_config`.
Zero AWB-uri emise vreodata. Nota ramane 9/10 din acelasi motiv de dinainte: nimic nu e dovedit live.

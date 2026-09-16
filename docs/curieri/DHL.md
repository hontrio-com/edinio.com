# DHL Express: evidenta integrarii

> **Ce e fisierul asta.** Evidenta pe care o tinem pentru fiecare curier pana cand integrarea lui e
> 10/10 din toate punctele de vedere. Se tine la zi ODATA CU codul, in acelasi commit.
>
> Conventia: cate un fisier per curier, in `docs/curieri/`. Al saptesprezecelea.

⚠ **TRECEREA ASTA E TINTITA, NU COMPLETA.** S-a facut in aceeasi sesiune cu FedEx si UPS, si scopul
ei a fost anume: **sa caute la DHL tiparele dovedite la FedEx**, plus sa verifice daca specificatia
lor s-a schimbat. Ce n-a fost cautat e scris la urma.

**Referinta autoritara:** OpenAPI-ul oficial MyDHL API, public si fara autentificare.

**Cod:** `src/lib/dhl/` (`client.ts`, `expediere.ts`, `statusuri.ts`), `src/lib/actions/dhl.actions.ts`,
cronul `src/app/api/cron/dhl-tracking`.

---

## Expunerea masurata, 16.09.2026

| ce | cat |
| --- | --- |
| Magazine cu DHL configurat | **ZERO** (din 129) |
| AWB-uri emise vreodata | **ZERO** |
| Operatii `dhl` in registru | **ZERO** |

---

## ⚠⚠ DHL a publicat o versiune noua a specificatiei, si noi trimiteam cea veche

Integrarea e scrisa pe **3.3.1** (`x-release-date: 2026-06-28`). Pe 16.09.2026 pagina lor da
**3.3.2** (`x-release-date: 2026-09-06`), la
`developer.dhl.com/sites/default/files/2026-09/dpdhl-express-api-3.3.2.yaml`.

Conteaza fiindca versiunea nu e o eticheta: se trimite ca **antet `x-version` obligatoriu pe fiecare
operatie**, iar o valoare pe care ei n-o mai primesc da codul `9001 The x-version header value is
invalid.` — adica integrarea moare in intregime, nu pe bucati.

**Cele doua specificatii au fost comparate rand cu rand: 86 de randuri de diferenta, citite toate.**
NIMIC din ce trimitem noi nu s-a schimbat:

| ce s-a schimbat la ei | ne atinge? |
| --- | --- |
| `packageTypeCode`: `WB1`, `WB2`, `WB3`, `WB6` scoase; `BB1`, `BB2`, `BB3`, `BB6` puse | **nu** — nu trimitem campul deloc |
| `registrationNumbers.typeCode`: s-a adaugat `FSR` (Food Safety Registration) | nu |
| nota „customerReference cu `typeCode: CU` e obligatorie" scoasa de la nivel de FACTURA | **nu** — noi o punem la nivel de EXPEDIERE, care n-a fost atins |
| o lista a crescut de la 3.000 la 5.000 de elemente | nu |
| schema raspunsului OAuth, stearsa | nu — MyDHL API e pe Basic, n-am folosit-o |

Deci mutarea pe 3.3.2 nu schimba niciun octet din ce pleaca spre ei. Constanta, antetul fisierului si
proba s-au mutat impreuna, cum cere chiar comentariul de deasupra ei.

⚠ **Ce NU se poate dovedi fara un cont la ei:** daca serverul lor mai primeste si 3.3.1. De aia se
trimite versiunea PUBLICATA azi, nu cea de acum doua luni — aia e singura despre care stim sigur ca e
in vigoare. Daca prima cheie de cont da `9001`, asta e primul lucru de verificat.

---

## Ce am cautat si NU era cazul

| tiparul cautat (dovedit la FedEx) | ce am gasit la DHL |
| --- | --- |
| refuzul tokenului rescris ca „nu stim” | **nu e cazul**: MyDHL API e pe `Authorization: Basic` trimis preemptiv. Fara OAuth, fara token, fara cache de token — deci niciuna dintre cele trei capcane ale lui. |
| retur incheiat citit ca livrare | ⚠ **DHL rezolvase deja capcana asta, inaintea tuturor.** `RT` e clasificat `problema`, final, retur; iar `eLivrat` raspunde din tabel pentru orice cod cunoscut, si lasa dovada (semnatura) sa decida numai pentru un cod NECUNOSCUT. Comentariul din cod descrie chiar cum era invers la inceput si ce ar fi costat: factura la ANAF pentru marfa intoarsa in depozit. **FedEx era copia care nu invatase lectia asta.** |
| diacriticele scoase doar din strada | **nu e cazul**: DHL are `text(brut, max)`, o functie prin care trece tot ce pleaca spre ei, si scoaterea traieste chiar in ea. E modelul dupa care s-a reparat FedEx. |

---

## ⚠ Ce NU s-a cautat in trecerea asta

Corpul cererii camp cu camp, cotarea, securitatea actiunilor de server, checkout-ul si cronul n-au
fost recitite azi. Au fost facute la auditul anterior (vezi memoria `dhl-integrare`), inclusiv cele
doua defecte critice dovedite atunci prin mutatie.

---

## Nota, cinstit

**9/10** — nota starii integrarii, nu a trecerii de azi.

DHL e, dintre cele trei atinse azi, cel mai bine asezat: e singurul la care tiparul cel mai scump
(returul citit ca vanzare) era **deja** rezolvat, si rezolvat cu argumentul scris alaturi. Ce s-a
schimbat azi e o singura constanta — dar una de care atarna fiecare cerere.

⚠ **De ce nu e mai mult:** zero magazine si zero AWB-uri; trecerea a fost tintita; iar mutarea pe
3.3.2 e argumentata, nu probata — nimeni n-a atins serverul lor.

**Probe:** proba versiunii, mutata impreuna cu constanta. Banc de mutanti: **1 dintre cei 14 loveste
anume DHL**, prins. `tsc` curat, **8.271 de probe verzi**, build OK, fara migratie.

---

## Adaugat pe 16.09.2026, gasit pe drumul altui curier

### ⚠ Marcajul cronului rescria codul de status vechi

`dhl-tracking` era unul dintre cele OPT cronuri cu tiparul `dhl_status_code: codNou ?? o....` in
`marcheazaVerificat`. Fara cod nou se scria inapoi codul citit la inceputul rularii; daca intre timp
AWB-ul fusese dezlegat si reemis, coloana golita era INVIATA, iar un cod final scotea expedierea noua
din urmarire pentru totdeauna. Reparat la toate opt, cu proba comuna care enumera dosarul de cronuri.

### ⚠ Valoarea declarata la cotare: DHL era exemplul corect

Reparatia de la 14.09 (`valoareaDeclarataLaCurier` plus `buildDhlOptions`) s-a dovedit a fi lipsa la
FedEx, unde `totalDeclaredValue` pleca doar la emitere. Blocul FedEx e acum scris dupa modelul de
aici, inclusiv podeaua din catalog. DHL nu s-a atins.

### Expunerea, remasurata

`dhl_config.enabled` este fals la toate cele 129 de magazine. Zero AWB-uri. Nota ramane 9/10.

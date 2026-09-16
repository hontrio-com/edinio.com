# Revolut: evidenta integrarii

Trecerea din 17.09.2026, ultimul dintre cei cinci procesatori. Documentatie oficiala:
`developer.revolut.com/docs/api/merchant`.

⚠ **Si acest site de documentatie e un SPA**: cerut cu un client obisnuit intoarce doar navigatia,
iar pagina de webhook-uri raspunde 403. Continutul adevarat e in chiar pachetul paginii (3,3 MB de
HTML) si de acolo s-a citit. A doua oara intr-o zi, dupa Klarna. Vezi
`specul-sta-in-bundle-nu-in-pagina`.

---

## Expunerea masurata

Nu chiar zero, si asta conteaza:

* **un magazin configurat** (`okxi`), acum cu `enabled: false`, dar avand `secret_key`, `webhook_id`
  **si `signing_secret`** — deci un webhook chiar a fost inregistrat la ei candva;
* **o singura comanda reala**: `ORD-MSKFBSOC-730`, 24,13 lei, din 08.08.2026, cu `revolut_order_id`
  scris (deci plata **a fost pornita**), ramasa `cancelled/unpaid`;
* zero randuri in registru, zero in jurnal.

Cineva a incercat o data, pe productie, si apoi a stins integrarea.

⚠ **Verificat anume: nimic din calea Revolut nu anuleaza comenzi.** Anularea aceea a fost a omului,
nu a codului. (La Netopia exact acest tipar se dovedise a fi un defect, de aceea s-a verificat.)

---

## ⚠⚠ Gaura: rambursarile nu pot ajunge la noi NICIODATA

Revolut are **trei** evenimente de webhook, si atat: `ORDER_AUTHORISED`, `ORDER_CANCELLED`,
`ORDER_COMPLETED`. **Niciunul despre rambursari.** Numarate in chiar pachetul documentatiei lor.

Deci o rambursare facuta in portalul Revolut nu poate fi **impinsa** catre noi. Singurul mod de a
afla e `refunded_amount` de pe comanda lor. Iar campul acela **lipsea cu totul din tipul nostru**, si
cronul se uita exclusiv la comenzi `unpaid`.

Reparat cu o a doua trecere in cron, care intreaba despre comenzile PLATITE si trece raspunsul prin
**aceeasi** regula ca toti ceilalti (`lib/plati/banii-s-au-intors.ts`, cinci apelanti acum).

⚠ Si `refundOrder` exista scrisa si **nu o chema nimeni**, a treia oara acelasi tipar (iPay, Klarna,
Revolut). Acum are actiune aparata de registru si buton in panou.

---

## ⚠ A doua gaura: semnatura invalida disparea in tacere

Verificarea semnaturii e **corecta**: `v1.{timestamp}.{corp}`, HMAC-SHA256, comparatie in timp
constant, mai multe semnaturi acceptate in acelasi antet (asa se face rotatia la ei).

Dar o semnatura **invalida** raspundea `200` si scria doar `console.error`.

`200` e corect pentru o cerere falsificata: n-are rost s-o punem pe Revolut s-o repete. Dar are un al
doilea inteles, mult mai suparator:

> daca `signing_secret` se roteste la **ei** si nu si la noi, **fiecare webhook legitim** devine
> „invalid", e aruncat cu 200 (deci nerepetat), si integrarea se opreste complet fara ca cineva sa
> afle. Comenzile ar ramane neplatite, iar singura plasa ar fi cronul.

Iar `console.error` nu ajunge nicaieri: jurnalele de rulare se rotesc si nimeni nu le citeste. Acum se
scrie in `error_logs`, cu `business_id`, la `warning`: o cerere falsificata izolata e zgomot de
internet, ce conteaza e **tiparul**.

---

## Ce am verificat si era deja bine

* **Semnatura se verifica INAINTE** de orice atingere a comenzii.
* **Suma se verifica** inainte de marcarea platii.
* **`capture_mode: automatic`**, deci nu e nevoie de captura separata (spre deosebire de Klarna, unde
  tocmai lipsa capturii era gaura).
* **`finalizeazaPlataComenzii`** e motorul comun; `finalize` e idempotent si nu raporteaza `paid`
  cand baza n-a scris.
* **Config lipsa ramane 200**, dinadins: comerciantul poate deconecta Revolut fara ca webhookul sa fie
  sters de la ei, iar un 503 acolo ar reincerca la nesfarsit.
* **Cronul nu alarmeaza** pe `pending` sau pe „clientul n-a platit", care sunt stari normale.

---

## ⚠ Ce ramane deschis

1. **Nimic nu a fost probat pe trafic adevarat.** Singura comanda reala a fost anulata de om inainte
   de plata, iar magazinul a stins integrarea. N-avem credentiale de probat.
2. **De ce a stins-o comerciantul nu se poate afla din platforma**: zero randuri in jurnal si in
   registru, adica integrarea n-a apucat sa raporteze nimic. Se poate afla doar intrebandu-l.
3. **Rambursarea partiala nu se poate porni** din panou (doar integrala), ca la ceilalti. Se
   **detecteaza** insa corect si se spune comerciantului, cu amandoua sumele.

---

## Nota, cinstit

**9/10.**

Gaura rambursarilor era reala si, ca la iPay si Klarna, avea forma cea mai suparatoare: campul de la
ei exista, iar noi nici nu-l declaram. Iar semnatura invalida care dispare in tacere putea opri
integrarea intreaga fara ca nimeni sa afle.

⚠ **De ce nu e mai mult:** ca la iPay si Klarna, n-a fost niciodata atinsa de o plata dusa la capat.

**Probe:** 21, intre care sapte pe semnatura, chemand functia REALA. Banc de mutanti **17 din 17**,
si el cuprinde un **recensamant peste toti cei cinci procesatori**: fiecare cron trebuie sa aiba o
trecere care intreaba despre comenzile platite, niciunul n-are voie sa-si faca propria regula despre
ce inseamna „banii s-au intors", si niciun buton de rambursare n-are voie sa fie legat de selectorul
de status. Cade daca al saselea procesator apare fara ele.

⚠ **Trei greseli de-ale mele in trecerea asta, toate prinse de banc:**

1. **Proba de secret gol nu apara nimic.** Cerea doar ca un secret gol sa nu valideze o semnatura
   facuta cu secretul adevarat, ceea ce e adevarat oricum. Adevarul de aparat e ca
   `createHmac("sha256", "")` scoate un HMAC valid pe o cheie pe care o stie toata lumea. Aceeasi
   lectie ca la jetonul Netopia.
2. **Am masurat POZITIA in loc de SENS.** Proba cerea ca `verifyWebhookSignature` sa apara inaintea
   citirii comenzii; mutantul `const valid = true || verify...` a trecut.
3. **Doi mutanti de-ai mei erau prost tintiti** (unul lovea alt `logError` din fisier, altul punea un
   comentariu pe care proba il stergea oricum). Corectati, nu numarati drept prinsi.

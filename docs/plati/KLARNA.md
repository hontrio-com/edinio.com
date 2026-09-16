# Klarna: evidenta integrarii

Trecerea din 17.09.2026, a patra dintre procesatori. Documentatie oficiala: `docs.klarna.com`,
Payments API si Order Management API.

⚠ **Site-ul lor de documentatie e un SPA**: cerut cu un client obisnuit intoarce doar navigatia.
Continutul adevarat s-a citit randat in browser. Aceeasi lectie ca la Colete Online
(`specul-sta-in-bundle-nu-in-pagina`).

---

## Expunerea masurata: ZERO

Zero magazine cu `klarna_config` din 130, zero comenzi, zero randuri in registru, zero in jurnal.
Ca la iPay: integrarea e **oferita** in catalog, dar n-a rulat niciodata pentru nimeni.

---

## ⚠⚠ Gaura principala, si e PE DOS fata de celelalte trei

La Netopia, Stripe si iPay banii erau **luati** si noi nu stiam. Aici banii **nu se iau deloc**, iar
marfa a plecat.

Lantul, verificat cap la cap:

1. `placeOrder` intoarce `fraud_status: PENDING` (Klarna se hotaraste mai tarziu);
2. comanda se pune pe `confirmed` / `unpaid`, cu `klarna_order_id` scris;
3. cronul **exclude anume** comenzile cu `klarna_order_id`, si bine face: altfel ar replasa aceeasi
   autorizare la fiecare cinci minute;
4. `merchant_urls` inregistra **doar** `confirmation`, deci Klarna n-avea unde sa ne anunte;
5. `getOmOrder` nu se mai chema din nicio parte.

**Rezultatul:** daca Klarna accepta dupa verificare, **nimeni nu captureaza**. Comerciantul nu
incaseaza niciodata, comanda arata „confirmata", si nimic nu semnaleaza.

### Ce s-a facut

`reiaKlarnaInAsteptare` in `lib/klarna-finalize.ts`, chemata de o a doua trecere in cron. **Se
intreaba, nu se asteapta un callback**: specificatia lor de Order Management arata ca
`GET /ordermanagement/v1/orders/{id}` intoarce chiar `fraud_status`, `expires_at`,
`captured_amount` si `refunded_amount`.

* **ACCEPTED** -> se captureaza, si abia apoi se marcheaza platit. La Klarna banii se iau prin
  `capture`; marcat platit fara el, „platit" ar fi o minciuna.
* **REJECTED** -> comanda **nu se anuleaza**, aceeasi hotarare ca la cardul refuzat de la Netopia:
  refuzul e al lui Klarna, nu al cumparatorului. Dar se striga raspicat, fiindca marfa poate fi
  pregatita.
* **inca PENDING** -> se tace, **pana cand autorizarea e la mai putin de 48 de ore de expirare**.
  Dupa `expires_at` banii nu mai pot fi capturati deloc. O alarma la fiecare cinci minute ar fi
  zgomot si n-ar mai fi citita cand chiar conteaza.
* **interogare picata** -> `inca-in-verificare`, niciodata „refuzat". O pana de retea citita ca
  refuz ar fi cea mai urata purtare cu putinta.
* **deja capturat** -> nu se recaptureaza: o rulare picata dupa capture nu ia banii a doua oara.

---

## ⚠ A doua gaura: rambursarile

`refunded_amount` era **declarat in tipul nostru si necitit de nimeni**, exact ca la iPay. Iar
`refundOrder` exista scrisa si **nu o chema nimeni**. Deci o rambursare facuta in portalul Klarna nu
ajungea niciodata la platforma.

Reparat cu o a treia trecere in cron, care trece rezultatul prin **aceeasi** regula ca ceilalti
(`lib/plati/banii-s-au-intors.ts`, patru apelanti acum), si cu un buton in panou, apărat de registru.

---

## ⚠ Un comentariu care mintea

In `klarna-finalize.ts` statea scris, ca fapt: *„Klarna nu expune cautare dupa `merchant_reference`,
**si nu exista cron de reconciliere Klarna**"*. A doua jumatate e falsa din ziua in care s-a scris
`api/cron/klarna-reconcile`.

⚠ E cea mai scumpa specie de comentariu gresit: o afirmatie falsa despre **ce plase exista**. Cine o
citeste fie scrie inca o plasa degeaba, fie se bizuie pe una care nu e acolo.

---

## Ce am verificat si era deja bine

`klarna-finalize.ts` e scris exceptional, si merita spus:

* **Toate cele cinci iesiri** de dupa `placeOrder` salveaza `klarna_order_id`. Autorizarea e
  consumata la prima plasare, deci id-ul e SINGURA legatura cu comanda Klarna; pierdut, ramane o
  comanda orfana, eventual deja capturata.
* **Suma se verifica** inainte de capture, si nepotrivirea are alarma proprie.
* **Capture doar pe ACCEPTED**, niciodata pe PENDING.
* **A cincea iesire**, cea mai scumpa (capture reusit dar marcarea platii picata), salveaza legatura
  separat, ca un om sa poata inchide cazul.
* **Cronul nu alarmeaza pe refuzuri obisnuite**: un refuz antifrauda e `warning`, nu `critical`,
  fiindca alarmele critice ingropate sub rezultate normale nu mai trezesc pe nimeni.

---

## ⚠ Ce ramane deschis

1. **Nimic nu a fost probat pe trafic adevarat.** N-avem credentiale Klarna si niciun magazin nu l-a
   pornit vreodata. Probele masoara purtarea codului, nu o plata dusa la capat.
2. **`merchant_urls.notification` tot nu se inregistreaza.** Nu mai e nevoie pentru corectitudine
   (cronul intreaba), dar cu el am afla mai repede decat in cinci minute. Nu s-a adaugat fiindca n-a
   putut fi probat contra unui cont real, si un callback neprobat e o plasa in care crezi degeaba.
3. **Rambursarea partiala nu se poate porni** din panou (doar integrala), ca la ceilalti. Se
   **detecteaza** insa corect si se spune comerciantului, cu amandoua sumele.

---

## Nota, cinstit

**9/10.**

Gaura verificarii antifrauda era reala si de un fel pe care nu-l mai intalnisem: banii nu se pierdeau
dupa ce intrau, ci **nu intrau niciodata**, in tacere, dupa ce marfa plecase. Restul integrarii a
rezistat la o citire atenta si e, pe bucata de finalizare, cel mai bine scris cod dintre cei patru
procesatori.

⚠ **De ce nu e mai mult:** ca la iPay, integrarea n-a fost niciodata atinsa de o plata adevarata si
nu am cum s-o ating.

**Probe:** 17, plus banc de mutanti **17 din 17**, intre care marcarea platii fara capture, refuzul
antifrauda care ar anula comanda, o interogare picata citita drept refuz, si un `return` timpuriu
care ar face trecerile noi cod mort.

⚠ **Si a patra oara intr-o zi**, o proba de-a mea a masurat PREZENTA unui sir in loc de fapta: ceruse
doar ca `.not("klarna_order_id", "is", null)` sa apara undeva in fisier, iar acelasi sir mai apare in
interogarea de rambursari. Prinsa de banc si stransa pe interogarea potrivita.

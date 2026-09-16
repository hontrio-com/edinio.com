# BT iPay: evidenta integrarii

Trecerea din 17.09.2026, dupa Netopia si Stripe. Documentatie oficiala: `iPay - API Documentatie RO`,
61 de pagini, versiunea 12.02.2026, citita integral.

---

## ⚠⚠ Expunerea masurata: ZERO

Zero magazine cu `ipay_config` (din 130), zero comenzi cu `payment_method = ipay`, zero randuri in
registrul de operatii externe, zero in jurnalul de erori. **~1000 de linii care n-au rulat niciodata
pentru nimeni.**

Asta schimba natura trecerii. La Netopia si Stripe, prioritatea a venit din trafic real si defectele
s-au verificat pe bani adevarati. Aici nu exista nimic de masurat.

⚠ **Dar integrarea E OFERITA**: e in catalogul de integrari, in `PAYMENT_PROCESSOR_TYPES`, are pagina
de configurare, iar `isConfigured` cere doar `enabled + username + password`. Orice comerciant o poate
porni maine. **O integrare care n-a rulat niciodata e cea mai probabil stricata, si tocmai acum nimeni
n-ar observa.**

---

## ⚠⚠ Defectul principal: raspunsul se calcula si se arunca

`resolveIpayStatus` calcula corect ca statusurile **4** (rambursat integral) si **7** (rambursat
partial) inseamna bani intorsi. Dar **niciun apelant nu citea acel camp**: si `/api/ipay/return`, si
cronul se uitau exclusiv la `resolved.paid`. Verificat prin cautare, nu presupus.

Iar cronul interoga doar comenzi `unpaid` + `pending`, in ultimele 3 zile.

**Deci o rambursare facuta in consola iPay nu ajungea niciodata la platforma.** Al treilea procesator
cu aceeasi gaura, dar aici cu o rasucire proprie: verdictul era deja calculat si apoi azvarlit.

⚠ **Si aici cronul e SINGURA cale.** iPay **nu are webhook server-la-server** (scris in chiar antetul
rutei de intoarcere), iar dupa o rambursare cumparatorul nu se mai intoarce in magazin. Daca nu
intrebam noi, nu aflam niciodata.

### Ce s-a facut

* **Regula despre bani s-a MUTAT, nu s-a copiat.** Modulul scris pentru Stripe pe 16.09 a devenit
  `lib/plati/banii-s-au-intors.ts`, cu trei apelanti: webhook-ul Connect, `stripe-reconcile` si acum
  `ipay-reconcile`. O proba face recensamantul si cade daca vreunul isi face copia lui.
* **A doua trecere in `ipay-reconcile`**, care intreaba despre comenzile PLATITE. Fereastra 120 de
  zile, cifra retelelor de carduri pentru contestatii.
* **Rambursarea se poate porni din panou.** `ipayRefund` exista de mult **si nu o chema nimeni**;
  acum are actiune aparata de registru si buton propriu, ca la Netopia.

⚠ **Raspunsul lor aduce mai mult decat Stripe dintr-o singura citire:**
`paymentAmountInfo.refundedAmount`, lista `refunds[]` **si steagul `chargeback`**. Deci si
contestatiile se prind, fara niciun webhook.

---

## ⚠ Patru capcane armate, descarcate inainte sa traga

Toate in `resolveIpayStatus`, toate pe campuri pe care azi nu le citea nimeni. **Niciuna nu a pagubit
pe cineva** (integrarea n-a rulat), dar fiecare astepta pe primul care le-ar fi legat.

| status | ce zicea codul | ce ar fi costat |
|---|---|---|
| **6** declined | `cancelled` | ⚠⚠ chiar defectul reparat la Netopia cu o zi inainte: un card refuzat (blocat, fonduri insuficiente, CVV gresit) ANULA comanda, iar `/api/ipay/start` refuza comenzile anulate, deci cumparatorul nu mai putea reincerca **niciodata** |
| **1** pre-auth held | `paid` + `confirmed` | banii sunt doar **blocati**, nu incasati; incasarea cere `deposit.do`. Marcata platita, comanda declansa facturarea automata pe bani care nu sunt ai comerciantului |
| **7** partially refunded | `refunded` | supra-declara: baza ingaduie doar `unpaid`/`paid`/`refunded`, deci ar fi spus ca s-au intors TOTI banii si ar fi scos comanda din semnalul de marfa plecata fara bani |
| **3** reversed | `cancelled` | stare de 2-phase pe care nu o folosim, mapata oricum |

⚠ **Noi folosim doar 1-phase**: nicaieri in `src/` nu se cheama `registerPreAuth.do`. Statusurile 1 si
3 se numesc totusi pe fata, ca ziua in care cineva porneste 2-phase sa nu le gaseasca mapate gresit.

---

## O capcana din CHIAR exemplul lor

In exemplul de la pagina 50, dupa o rambursare **totala**, `depositedAmount` ajunge **0** si numai
`approvedAmount` ramane 2600. Deci suma incasata **nu** se poate citi din `depositedAmount` dupa o
rambursare. Se compara cu `amount`, suma comenzii, care nu se misca.

⚠ Si `refunds[]` se citeste ca **rezerva** pentru `refundedAmount`: fara ea, un raspuns mai vechi ar
fi dat „zero intors" pentru o rambursare adevarata. Iar cand nu stim, se intoarce `undefined`, nu `0`:
**„nu stim" nu e „zero"**.

---

## Ce am verificat si era deja bine

* **Autentificarea e CEA RECOMANDATA de ei** (doc 6.2.1): `Authorization: Basic base64(user:pass)`,
  nu metoda „legacy nerecomandata" cu parola in corpul cererii.
* **Suma SI moneda** se verifica inainte de marcarea platii, pe amandoua caile.
* **`finalizeazaPlataComenzii`** e motorul comun, ca la toti ceilalti.
* **Ruta de intoarcere nu minte** pe o scriere picata: omul ajunge pe pagina de esec, nu pe una de
  multumire falsa.
* **Cronul cauta si dupa `ipay_order_number`**, referinta NOASTRA scrisa inainte de apel, deci o
  comanda nu iese din raza plasei daca id-ul bancii nu s-a putut scrie.
* **Plafoane de rafala** in ruta de pornire, ca la Netopia.

---

## ⚠ Ce ramane deschis

1. **Nimic nu a fost probat pe trafic adevarat**, si nu se poate: n-avem credentiale iPay si niciun
   magazin nu l-a pornit vreodata. Toate probele cheama codul REAL cu `fetch` inlocuit, pe corpuri
   luate din chiar exemplele documentatiei lor, dar asta nu e acelasi lucru cu o plata dusa la capat.
2. **2-phase (`registerPreAuth.do`, `deposit.do`, `reverse.do`) nu e folosit si nu e scris.** Statusurile
   lui sunt numite corect, dar calea nu exista. Daca vreun comerciant o cere, e o trecere separata.
3. **Rambursarea partiala nu se poate porni** din panou (doar integrala), din acelasi motiv ca la
   Netopia: ar cere o suma introdusa de om si o istorie a sumelor deja intoarse. ⚠ Dar se **detecteaza**
   corect si se spune comerciantului, cu amandoua sumele.

---

## Nota, cinstit

**9/10.**

Cele patru capcane erau armate si una dintre ele era, cuvant cu cuvant, defectul reparat la Netopia cu
o zi inainte. Gaura rambursarilor era reala si avea forma cea mai suparatoare cu putinta: raspunsul se
calcula corect si se arunca.

⚠ **De ce nu e mai mult:** integrarea n-a fost niciodata atinsa de o plata adevarata, si nu am cum s-o
ating. La Netopia am dat 10 abia dupa ce am rulat fluxul cap la cap pe sandbox-ul proprietarului. Aici
nu exista nici sandbox, nici credentiale. Nu dau o nota mai mare pentru cod pe care nu l-am vazut
mergand.

**Probe:** 24, care cheama codul REAL cu `fetch` inlocuit si masoara PURTAREA. Banc de mutanti
**22 din 22**, intre care revenirea la „cardul refuzat anuleaza comanda", pre-autorizarea luata drept
incasare, „nu stim" devenit zero, si un `return` timpuriu care ar fi facut a doua trecere cod mort.

⚠ **Trei greseli de-ale mele, scrise ca sa nu se repete:**

1. **Am afirmat inainte sa verific.** Am spus ca defectul Netopia se repeta VIU aici. Nu era viu:
   nimeni nu citea campul. Tiparul semana, si m-am luat dupa el.
2. **Am cazut in capcana pe care fisierul o descria.** La `stripe-reconcile` am pus trecerea noua dupa
   un `return` timpuriu, cu avertismentul scris cu zece randuri mai sus. Aici l-am vazut la timp,
   fiindca il cautam anume.
3. **Probele mele au masurat de trei ori PREZENTA in loc de FAPTA** (un sir `503` oriunde in ramura,
   numele `bizPlatite`, numele `status.contestat`). Toate trei prinse de banc si stranse.

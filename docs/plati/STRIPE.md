# Stripe: evidenta integrarii

Trecerea din 16.09.2026, dupa Netopia. Metoda e aceeasi: expunerea se masoara din baza de
productie INAINTE de orice citire de cod, iar ce se afirma se si probeaza.

---

## ⚠ Stripe sunt DOUA integrari sub acelasi nume

Prima constatare, si schimba tot restul.

| | **A. Platforma** | **B. Connect** |
|---|---|---|
| cine plateste pe cine | comerciantii platesc **Edinio** | cumparatorii platesc **comerciantii** |
| rute | `checkout`, `portal`, `retry-payment`, `return`, `webhook`, `domain-checkout` | `connect/{create,refresh,return,disconnect}`, `connect/webhook`, `order-checkout` |
| cronuri | `stripe-reconcile` (abonamente), `reconcile-subscriptions` | `stripe-reconcile` (comenzi) |
| secretul webhook-ului | `STRIPE_WEBHOOK_SECRET` | `STRIPE_CONNECT_WEBHOOK_SECRET` |

## Expunerea masurata, 16.09.2026

**A. Platforma, adica venitul lui Edinio.** 18 conturi cu `stripe_customer_id`; **52 de facturi,
7.855,93 lei**, 51 platite si una stornata; prima pe 03.06, ultima pe **15.09** (cu o zi inainte de
trecere). Pe planuri: 13 basic (9 lunar, 1 anual, 4 fara interval scris), 3 premium, 1 ultra.
**Zero facturi fara numar SmartBill** din 52, deci legatura cu facturarea fiscala e sanatoasa.
Patru conturi cu `payment_failed_at`, toate cazuri ADEVARATE de dunning (plan expirat, nicio factura
dupa esec), nu steaguri ramase aprinse.

**B. Connect.** 7 comenzi in 2 magazine, **971,01 lei incasati**, sesiuni `cs_live_` (bani adevarati).
Sapte magazine au cont conectat, **trei** il au pornit cu `charges_enabled` si `payouts_enabled`.
Patru din cele 7 comenzi sunt `cancelled`, doua in ACELASI minut: o actiune in masa din panou, nu o
anulare automata. ⚠ Verificat anume, fiindca la Netopia exact acest tipar s-a dovedit a fi un defect
(statusul 12 anula comanda). **Aici nu se repeta**: nimic din calea Stripe nu anuleaza singur comenzi.

---

## ⚠⚠ Defectul: banii care se intorc nu ajungeau NICIODATA la platforma

Numarate in cod, toate felurile de evenimente Stripe tratate oriunde erau **sase**:

```
account.updated · checkout.session.completed · checkout.session.async_payment_succeeded
customer.subscription.deleted · invoice.payment_succeeded · invoice.payment_failed
```

Niciunul nu e despre bani intorsi. Nici `charge.refunded`, nici `charge.dispute.created`. Iar
`stripe-reconcile` se uita **exclusiv** la comenzi `unpaid`, deci nici el n-avea cum sa afle.

**Ce insemna:** comerciantul ramburseaza un cumparator din panoul Stripe (locul cel mai la indemana,
si unde a facut-o dintotdeauna), sau cumparatorul castiga o contestatie, iar comanda ramane **`paid`
la noi pentru totdeauna**. Banii dusi, marfa dusa, platforma arata o vanzare incheiata cu bine.
Facturarea automata a emis deja documentul fiscal, iar nimeni nu afla ca trebuie stornat.

⚠ E aceeasi gaura pe care Netopia o avea in aceeasi zi, dar aici muscatura e mai probabila: panoul
Stripe ramburseaza cu doua clicuri.

### Ce s-a facut

* **`lib/stripe-banii-s-au-intors.ts`**, un singur loc pentru regula, cu doi apelanti.
* **Webhook-ul Connect** trateaza `charge.refunded` si `charge.dispute.created`, si a capatat
  **dedupe de evenimente** (webhook-ul de platforma il avea de la inceput; asta nu). Fara el, o
  relivrare ar striga a doua oara pentru aceiasi bani, iar comerciantul ar cauta o a doua rambursare
  care nu exista.
* **A treia trecere in cronul de reconciliere**, care **INTREABA** despre comenzile platite. Merge
  chiar daca in panoul lor nu e bifat niciun eveniment nou.

### ⚠ Ce trebuie pornit in panoul Stripe

Codul nu-si poate cere singur evenimentele. Pe capatul **Connect** trebuie bifate `charge.refunded`
si `charge.dispute.created`. Pana atunci lucreaza doar plasa din cron (la 15 minute), care
intreaba in loc sa astepte.

---

## ⚠⚠ Rambursarea partiala NU se poate scrie, si nu se minte

`orders_payment_status_check` ingaduie exact trei valori: `unpaid`, `paid`, `refunded`. Nu exista
`partially_refunded`, **desi `lib/orders/marfa-a-plecat-fara-bani.ts` il numara intr-un set**. Acolo
e valoare MOARTA, fiindca baza nu o poate tine.

Deci la o rambursare partiala nu se scrie `refunded`: ar spune ca s-au intors TOTI banii, ceea ce e
fals, si ar scoate comanda din semnalul de marfa plecata fara bani. Se lasa `paid` (adevarat: o parte
din bani chiar au ramas) si se strica tacerea, cu **amandoua sumele** in notificare.

**O necunoscuta spusa e mai buna decat o cifra gresita scrisa in baza.**

## ⚠ O contestatie nu e o rambursare

La `charge.dispute.created` banii sunt retinuti de banca, dar litigiul **se poate castiga**. Comanda
nu se misca deloc. Se striga tare, si mesajul spune ce conteaza: **ca exista un termen**, si ca fara
raspuns contestatia se pierde din oficiu.

---

## Alte doua reparatii

1. **Un comentariu care mintea.** `stripeAccountId` era documentat drept „contul conectat al
   magazinului, **daca plata cu cardul e activa**". Codul nu se uita la `enabled`, si bine facea: e
   folosit pe drumul de CONFIRMARE, iar `account.updated` scrie singur `enabled: charges_enabled`.
   Afirmatia falsa era o INVITATIE de a „repara" ceva bun, si atunci banii ar fi intrat la comerciant
   cu comanda ramasa neplatita pe veci. Comentariul spune acum de ce codul face pe dos.
2. **O scriere care nu-si citea raspunsul.** In `invoice.payment_failed`, scrierea lui
   `payment_failed_at` ignora eroarea. E SINGURUL lucru pe care se leaga bannerul de plata restanta:
   picata in tacere, comerciantul nu afla ca i-a esuat plata si magazinul se suspenda fara prevenire.
   Acum se verifica si se raspunde `500`, deci Stripe relivreaza.

---

## Ce am verificat si era deja bine

Integrarea asta e scrisa cu grija reala, si mai multa decat Netopia. Verificat anume:

* **Semnaturile** se verifica inaintea oricarei atingeri, pe amandoua webhook-urile, si cad **inchis**
  daca secretul lipseste (`constructEvent` arunca, nu accepta).
* **Versiunea de API e fixata** (`2026-04-22.dahlia`), nu lasata pe implicitul SDK-ului.
* **Nepotrivirea de suma** e tratata, cu o hotarare argumentata in cod: se marcheaza platit (banii
  sunt deja capturati; un refuz ar lasa comanda neplatita cu banii luati) dar se striga `critical`.
* **`order-checkout`** are amandoua plafoanele de rafala (IP si durabil pe comanda), refoloseste
  sesiunea deschisa doar daca suma se potriveste, si poarta o **hotarare scrisa** despre de ce NU
  pune `idempotencyKey`.
* **Citirile picate** raspund `503`, deci Stripe reincearca pana la trei zile.
* **`invoice.payment_succeeded`** isi verifica ambele scrieri si intoarce `500`, dupa un incident din
  28.08 in care era singura ramura surda.
* **Facturile de 0 lei** nu emit document fiscal, dupa incidentul FC 0489 din 24.07.
* **`stripe_events`**: RLS pornit cu **zero politici**, deci drepturile acordate lui `anon` (INSERT,
  DELETE) sunt inerte. Verificat in baza, nu presupus.

---

## ⚠ Ce ramane deschis

1. **Rambursarile de pe contul PLATFORMEI** (abonamente) nu sunt tratate. Daca Edinio ramburseaza un
   comerciant, factura fiscala trebuie stornata de mana. Cele 52 de facturi au una stornata deja,
   deci se intampla. Nu s-a scris aici fiindca fluxul fiscal al platformei e alt lucru decat comenzile
   comerciantilor, si merita trecerea lui.
2. **Nu s-a putut masura daca gaura a muscat deja.** `STRIPE_SECRET_KEY` e gol in `.env.local` (cheia
   traieste doar in Vercel, ceea ce e corect), deci nu s-au putut interoga conturile conectate pentru
   rambursari si contestatii existente. ⚠ Prima incercare a raportat „0 rambursari" pentru fiecare
   cont, si era o MINCIUNE a masuratorii, fiindca Stripe raspundea „nu ai dat nicio cheie". Vezi
   memoria `zero-randuri-nu-e-succes`. Numarul real se poate afla din panoul Stripe.
3. **Fluxul cap la cap nu a fost parcurs**, spre deosebire de Netopia: ar cere o plata adevarata pe
   contul conectat al unui comerciant, adica banii LUI, nu ai nostri. Sandbox-ul Stripe cere chei de
   test pe care platforma nu le are configurate.

---

## Nota, cinstit

**9,5/10.**

Gaura gasita era reala si costa bani adevarati, iar cele doua reparatii mai mici inchid un comentariu
care invita la stricat si o scriere care putea tacea. Restul integrarii a rezistat la o citire atenta:
semnaturi, idempotenta, plafoane, reconciliere, si hotarari SCRISE acolo unde codul pare ciudat.

⚠ **De ce nu e 10:** fluxul cap la cap n-a fost parcurs pe bani adevarati, si nu se poate parcurge
fara contul unui comerciant. La Netopia s-a putut, fiindca sandbox-ul lor era conectat pe magazinul
proprietarului.

**Probe:** 17 in `lib/stripe-banii-care-se-intorc.test.ts`, care cheama regula REALA pe o baza falsa
si masoara PURTAREA (ce s-a scris, ce i s-a spus omului), nu siruri in fisiere. Banc de mutanti
**16 din 16**.

⚠ **Doua probe de-ale mele au trecut peste mutant si au fost stranse:** una cerea doar „exista un
`503` pe undeva in ramura" (si mai era unul acolo), alta cerea doar ca numele `bizPlatite` sa apara.
A doua oara in aceeasi zi cand masor prezenta in loc de fapta.

⚠⚠ **Si am cazut chiar eu in capcana pe care fisierul o descria.** `stripe-reconcile` poarta de
dinainte un comentariu despre un `return` timpuriu care facea a DOUA trecere cod mort. Am adaugat a
treia trecere la sfarsit si am lasat un `return` pe cazul „nicio comanda neplatita", adica exact
cazul NORMAL: paza rambursarilor n-ar fi rulat niciodata. Prins de bancul de mutanti, si acum exista
o proba care cere ca intre inceputul functiei si a treia trecere sa nu existe nicio iesire care sa nu
fie o eroare.

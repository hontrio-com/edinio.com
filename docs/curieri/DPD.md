# DPD Romania: evidenta integrarii

> **Ce e fisierul asta.** Evidenta pe care o tinem pentru fiecare curier pana cand integrarea lui e
> 10/10 din toate punctele de vedere: securitate, optimizare, functionalitate, compatibilitate cu
> platforma, si conformitate cu documentatia lor. Se tine la zi ODATA CU codul, in acelasi commit.
>
> Conventia: cate un fisier per curier, in `docs/curieri/`. Al doilea, dupa `WOOT.md`.

**API-ul real:** `https://api.dpd.ro/v1/`, in stil Speedy: `userName` si `password` in CORPUL
fiecarei cereri JSON, nu in antet.

⚠ **PDF-ul `DPD-API-documentation-v1-2-1.pdf` NU se aplica Romaniei.** Acela e DPD **Baltics**
(LT/LV/EE): alte cai (`/shipments`), alt fel de autentificare (bearer). Cine porneste de la el scrie
cod care nu merge niciodata, si nu afla din mesaje de eroare de ce.

⚠ **REFERINTA AUTORITARA E ACUM CEA OFICIALA, adusa pe 15.09.2026:** documentatia lor de Web API,
<https://api.dpd.ro/web-api.html>, cu „Appendix 1 - Track And Trace Operation Codes" si cu toate
lungimile de camp. E mai buna decat modulul de WooCommerce pe care se sprijinea auditul din iulie,
si care intre timp a disparut de pe disc.

⚠ **Ce ramane mostenit, si se spune pe fata:** Auditul din 05.07.2026 s-a facut pe modulul oficial de
WooCommerce (`dpdro` v3), din `Desktop/modul_woocommerce_dpd`. **Dosarul acela nu mai exista azi**
(verificat 15.09.2026). Deci orice afirmatie NOUA de conformitate cere intai readucerea modulului;
ce scrie mai jos despre „conform" e mostenit din auditul de atunci, nu reverificat acum. Vezi
lectia din `copia-locala-nu-e-dovada`.

**Cod:** `src/lib/dpd.ts`, `src/lib/actions/dpd.actions.ts`, ramura DPD din
`src/lib/actions/shipping.actions.ts`, `src/components/dashboard/DpdConfigClient.tsx`,
`DpdAwbModal.tsx` si `DpdPickupModal.tsx`.

---

## Expunerea masurata, 15.09.2026

| ce | cat |
| --- | --- |
| AWB-uri DPD emise vreodata | **3 reusite, 2 esuate** |
| Comenzi care poarta un numar AWB DPD | 5 |
| Comenzi care au ales DPD la checkout | 4 |
| Magazine cu DPD configurat | 2 |
| Zone DPD cu cotare LIVE (`auto_price`) | **0** |

⚠ **DPD e al DOILEA curier al platformei**, dar la mare distanta de primul: Woot are 172 de AWB-uri.
Ordinea de lucru vine de aici (vezi `cati-awb-s-au-emis-vreodata`), si de aceea DPD urmeaza dupa
Woot, nu inaintea lui.

---

## Ce foloseste platforma din API-ul lor

| Calea lor | Folosim | Unde |
| --- | --- | --- |
| `location/site` | **da** | `resolveDpdSiteId`, numele localitatii → `siteId` |
| `location/office` | **da** | `getDpdOffices`, punctele de ridicare |
| `services/destination` | **da** | `getDpdDestinationServiceIds`, ce servicii merg pe ruta |
| `calculate` | **da** | `calculateDpdDomesticPrice` si `calculateDpdIntlPrice` |
| `shipment` | **da** | `createDpdShipment` si `createDpdIntlShipment` |
| `shipment/cancel` | **da** | `cancelDpdShipment` |
| `print/extended` | **da** | `getDpdAwbPdf`, eticheta A4 sau A6 |
| `pickup` | **da** | `requestDpdCourierPickup`, chemarea curierului |
| `track` | **da** | `getDpdTracking`, prin cronul `dpd-tracking`. ⚠ cel mult 10 colete pe cerere |
| `shipment/info` | nu | starea expedierii; `track` da mai mult, pe colet |
| `validation/address` | nu | validarea adresei inainte de emitere |
| `client/contract` | nu | datele contractului |
| `print/voucher` | nu | voucherul de ramburs |

---

## Inchis (auditul din 05.07.2026, commit `f228862`)

Cele patru constatari critice de atunci, toate reparate in acelasi val: localitatea se rezolva prin
`siteId` din nomenclatorul lor, nu prin nume (orase omonime in judete diferite); diacriticele se
scot pe adrese; `normalizePhone` a fost pus la loc pe tot drumul DPD, de unde se pierduse la o
rescriere; si chemarea curierului, care nu exista deloc, a fost adaugata.

Plus: serviciul se alege dupa preferinta (2505 DPD STANDARD), nu orbeste primul din lista;
dimensiunile din fereastra chiar pleaca in `parcels[].size`; rambursul poarta `currencyCode`;
`pickupOfficeId` pentru livrarea la punct; valoarea declarata; si „deschidere inainte de livrare"
doar pe serviciile care o accepta.

⚠ **Bucurestiul la DPD e UN SINGUR `siteId`** (642279132), fara sectoare, deci acolo „Sector X" se
plieaza in „Bucuresti". E pe dos fata de Woot si Sameday, unde sectoarele sunt localitati separate.
Vezi `sameday-audit-2026-07` pentru tabelul celor trei forme.

---

### I-1. ⚠ Urmarirea coletului, si aici comanda CHIAR se muta

Cronul `dpd-tracking` merge la doua ore si citeste `track`, cu harta de stari din chiar
**Appendix 1** al lor. Spre deosebire de Woot, unde nu exista nicio enumerare si de aceea cronul
doar inregistreaza, aici comanda se muta singura si factura pleaca la livrare.

⚠⚠ **„Livrat" e codul `-14`. NEGATIV.** Iar `14` exista in CEALALTA lista a lor (Appendix 2,
codurile de exceptie), unde inseamna „Refused by recipient - not ordered". Un parser care taie
semnul ar inchide comanda si ar emite factura pe un REFUZ.

⚠ **`124 Delivered Back to Sender` NU e livrare**, desi ii scrie numele in ea: e returul ajuns
inapoi la comerciant. ⚠ Si **`134`/`1134`** (colet pregatit la punct, instiintare trimisa) nu sunt
livrare: coletul e in dulap, dar omul nu l-a ridicat. Aceeasi lectie pe care FAN a platit-o cu `S46`.

⚠ **Refuzurile nu sunt finale**: dupa `44`, `123` si `111` vine returul, deci coletul inca se
misca. Capete de drum adevarate: `-14`, `124`, `125`, `127`, `128`, `129`.

⚠ **Lotul e de zece, si e al LOR**: „Allowed are up to 10 parcels", scris in documentatie. Marcajul
se scrie pentru TOATE cele cerute, nu doar pentru cele intoarse: un numar necunoscut contului
lipseste din raspuns, iar marcat doar ce s-a intors, restul ar bloca permanent capul cozii.

**18 probe, banc de mutanti 12 din 12**, intre care si „livrarea devine 14, fara semn".

---

### I-2. ⚠ Lungimile de camp sunt ale LOR, si una era pe dos

Trecere de conformitate pe documentatia lor oficiala, 15.09.2026. Patru neconformitati, toate pe
drumul emiterii:

| campul lor | cat ingaduie ei | ce faceam |
| --- | --- | --- |
| `content.contents` | 100 | ⚠ taiam la **50**: jumatate din descrierea marfii se pierdea degeaba, si tocmai ea conteaza la vama |
| `shipmentNote` | 200 | ⚠ **nemarginit**, iar campul „Observatii" din panou n-avea nicio limita |
| `ref1` | 30 | ⚠ nemarginit (numarul comenzii vine dintr-un format ales de comerciant) |
| `recipient.clientName` | 3 pana la 60 | ⚠ nemarginit |

⚠ **Ce costa:** DPD refuza la EMITERE, cu comerciantul pe fereastra si clientul pe fir. Iar taierea
prea stransa nu e „prudenta", e tot neconformitate.

⚠ **Numele scurt NU se umple.** Ei cer minimum 3 caractere; un nume mai scurt e o problema de DATE,
iar umplut de noi ar trimite coletul pe un nume care nu exista. Se taie maximul, atat, si refuzul
lor spune adevarul. O proba cade daca cineva incepe sa-l umple.

Panoul arata acum si numaratoarea („0/200 de caractere, cat accepta DPD"), ca omul sa vada limita
inainte, nu s-o afle din refuz. **7 probe, banc de mutanti 6 din 6.**

---

## Deschis

### D-1. Validarea adresei inainte de emitere

`validation/address` spune daca adresa e livrabila INAINTE sa se emita. Azi aflam abia din refuzul
emiterii, cand comerciantul e deja pe fereastra de AWB.

### D-2. Nedovedit live

Trei AWB-uri reusite si doua esuate in toata viata platformei. Ce se poate spune despre drumurile
neumblate e „respecta ce stim din modul", nu „merge".

---

## Nota, cinstit

**9,5/10.** Emiterea, anularea, eticheta, cotarea si chemarea curierului au trecut auditul din
iulie; de la 15.09.2026 platforma stie si ce se intampla cu coletul dupa ce pleaca, pe harta
PUBLICATA de ei, deci comanda se muta singura si factura pleaca la livrare; iar lungimile de camp
respecta acum chiar documentatia lor, dupa o trecere care a gasit patru neconformitati.

⚠ **Ce lipseste, si de ce nu e 10:**

1. **`validation/address`** (D-1): adresa s-ar putea verifica INAINTE de emitere. Azi se afla din
   refuz. ⚠ Masurat insa: din cele cinci operatii DPD din viata platformei, o singura emitere a
   esuat, si a reusit la reluare un minut mai tarziu, plus o cerere de curier picata. Nu e un tipar
   de adrese gresite, deci nu justifica un apel in plus pe drumul emiterii.
2. **Nedovedit live** (D-2): trei AWB-uri reusite in toata viata platformei, dintre care unul
   international. Ce se poate spune despre drumurile neumblate e „respecta documentatia lor", nu
   „merge".

⚠ Si o nuanta care se uita usor: **Bucurestiul la DPD e UN SINGUR `siteId`**, fara sectoare, deci
acolo „Sector X" se plieaza in „Bucuresti". E pe dos fata de Woot si Sameday. Vezi tabelul celor
trei forme din `sameday-audit-2026-07`.

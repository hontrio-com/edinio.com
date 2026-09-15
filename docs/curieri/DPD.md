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

⚠⚠ **REFERINTA AUTORITARA NU MAI E PE DISC.** Auditul din 05.07.2026 s-a facut pe modulul oficial de
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
| `shipment/info` | **NU** | ⚠ urmarirea coletului. Vezi D-1. |
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

## Deschis

### D-1. ⚠ Urmarirea coletului nu exista, si e acelasi gol ca la Woot

`shipment/info` da starea expedierii. **Nu-l chemam niciodata**, si nu exista nicio ruta de cron
pentru DPD, desi paisprezece curieri au una, intre ei si curieri care n-au emis in viata lor niciun
AWB.

⚠ Si se vede in date: comenzile DPD raman pe starea la care le-a lasat emiterea. Acelasi tipar care
tine 203 comenzi Woot pe „Expediata" pentru totdeauna.

De facut, dupa tiparul deja asezat la Woot: citirea starii, harta de stari (⚠ DPD le documenteaza,
spre deosebire de Woot), ruta de cron, intrare in `vercel.json`, si legarea tranzitiei de expedierea
citita, care de la 15.09.2026 e ceruta de o proba peste toate cronurile.

### D-2. Validarea adresei inainte de emitere

`validation/address` spune daca adresa e livrabila INAINTE sa se emita. Azi aflam abia din refuzul
emiterii, cand comerciantul e deja pe fereastra de AWB.

### D-3. Referinta autoritara trebuie readusa

Modulul oficial nu mai e pe disc. Pana nu e readus, nicio afirmatie noua de conformitate nu se poate
sprijini pe altceva decat pe codul nostru si pe raspunsurile lor.

### D-4. Nedovedit live

Trei AWB-uri reusite si doua esuate in toata viata platformei. Ce se poate spune despre drumurile
neumblate e „respecta ce stim din modul", nu „merge".

---

## Nota, cinstit

Emiterea, anularea, eticheta, cotarea si chemarea curierului sunt scrise si au trecut auditul din
iulie. Ce lipseste e acelasi lucru care lipsea si la Woot pana azi: **dupa ce pleaca coletul,
platforma nu mai stie nimic despre el**. Nota onesta: **7/10**.

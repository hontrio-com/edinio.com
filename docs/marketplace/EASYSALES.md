# easySales

Integrarea cerută pe 12.10.2026. Comerciantul are deja cont easySales și și-l conectează: comenzile
magazinului pleacă în easySales, unde se fac factura și AWB-ul, iar starea, AWB-ul și factura se
întorc în Edinio. Edinio nu încheie nimic cu easySales (hotărârea proprietarului): relația e a
comerciantului.

Planul întreg, cu fiecare afirmație marcată [A] (documentația lor), [C] (codul și baza noastră) sau
IPOTEZĂ: `docs/marketplace/EASYSALES-PLAN.md`. Fișierul de față spune ce s-a construit și ce
rămâne deschis.

## Sursele

| Ce | Unde |
|---|---|
| Documentația | colecția Postman publică „easySales V2” (6542984/SzfDvj4T) și mediul ei publicat „Production”, descărcate pe 12.10.2026 |
| Originalul | NU intră în depozit: în exemple are ce par a fi credențiale reale și date de cumpărători. sha256 al originalului: `b1073237b09ca80f499428e067839a3bce27b086fc7bc9d0c2f51be7c8868e38` |
| Copia din depozit | `docs/marketplace/easysales-api-schema-2026-10-12.json`: numai numele, metoda, calea, cheile interogării și tabelele de câmpuri (92 de cereri, 57 de tabele), fără exemple și fără valorile variabilelor. sha256 (pe LF) `3828ef3f929da89be4ba2458269c9b30f726f09e7f826da9dd4694644b681024`; o probă cere chiar amprenta |
| Rutele | `src/lib/easysales/rute-colectie.ts` (87), derivate din schemă; `contractul-api.test.ts` cere ca fiecare cerere a codului să fie una dintre ele |
| Gazda | `https://easy-sales.com/api/v2` și `https://easy-sales.com/oauth/token`, constante; `EASYSALES_API_URL` numai pentru probe |

## Ce face fiecare parte la noi

| Parte | Unde |
|---|---|
| Conectarea în două trepte, garda „un cont, un magazin” pe client ȘI pe website, exclusivitatea canalelor | `conectare.ts`, `exclusivitate.ts`, `src/lib/integrari/cont-marketplace-unic.ts` |
| Tokenul (grantul `website`), emis numai sub zăvorul din bază (o emitere revocă tokenul în uz) | `token.ts`, RPC-urile `easysales_ia_emiterea` / `easysales_scrie_tokenul` |
| Clientul HTTP: ritm comun pe contul lor (250/min din 500), termene 20 s / 60 s, 401 și 403, jurnal fără corpuri | `client.ts`, `erori.ts` |
| Ștampila comenzii la inserare și coada (în bază) | migrația 73: `easysales_stampileaza_comanda`, `easysales_marcheaza_comanda`, regula comună `easysales_se_stampileaza` |
| Comanda spre `POST /orders/save`, cu garda sumelor (`reconciliazaComanda`) | `mapare-comanda.ts`, `identitate.ts`, `comenzi.ts` |
| Starea, AWB-ul și factura înapoi, numai înainte, prin `tranzitieComandaMarketplace` | `stari.ts`, `curieri.ts`, `oglinda.ts` |
| Webhook-urile: jetonul din adresă + semnătura, inboxul curățat pe listă albă | `webhook.ts`, `semnatura.ts`, `inbox.ts`, ruta `/api/easysales/webhook` |
| Abonările, sănătatea, notificările | `abonari.ts`, `sanatate.ts`, `notificari.ts` |
| Cronul la minut | `/api/cron/easysales-sync`, `coada.ts` |
| Porțile din Edinio (fără factură și AWB de aici, starea și editarea după trimitere) | `origin.ts` (`procesataInEasySales`), `awb-propriu.ts`, `invoice-auto.actions.ts`, casele de facturare, `order.actions.ts`, `bulk-orders.actions.ts`, `paza.ts`, `cont_anuleaza_comanda` |
| Panoul și pagina comenzii | `/dashboard/features/easysales`, `EasySalesConfigClient.tsx`, `easysales/EasySalesComandaPanel.tsx` |

## Ce NU are API-ul, și ce am făcut cu asta

- **Niciun sandbox.** Colecția nu pomenește unul. Singurul mediu de probă e serverul fals (`fals-easysales.ts`), mai strict decât documentația acolo unde ea tace. Măsurătorile E0 se fac pe contul de probă al comerciantului.
- **Ștergerea clienților și a comenzilor.** Se pot doar suprascrie (`PATCH /customers/{id}`, rutele PUT ale adreselor și ale comenzii). Hotărârea proprietarului: ștergerea de acolo o face comerciantul; Edinio îl anunță la anonimizare (`customer-manage.actions.ts`).
- **Răspunsul lui Save Order.** Exemplul e copiat de la Add. `internal_id` se păstrează când vine, altfel se află din `GET /orders?order_display_id=`.
- **Cheia de potrivire a lui Save** (M-COM-1). De aceea un Save nu se reia orb: după un răspuns pierdut se caută întâi comanda, iar abia după 10 minute și două citiri goale se trimite din nou.
- **Codul HTTP al plafonului de comenzi** (M-COM-6). Mesajul „Orders limit exceeded” se citește înaintea codului.
- **Formula semnăturii** (ce acoperă `$payload`, M-WH-1). Se calculează pe corpul brut și pe subșirul `payload`, niciodată pe o reserializare; modul `masoara` trece singur în `impune` la prima livrare care dovedește formula.
- **Ce comenzi vede un token de website** (M-EXT-1). De el atârnă bucla de stoc (E4).

## Hotărâri

| Hotărârea | Motivul |
|---|---|
| Clientul API și website-ul sunt ale comerciantului, câte unul pe magazin | un token nou îl revocă pe cel vechi [A]; un website pe două magazine le-ar amesteca cataloagele |
| Comenzile cu plată online și transfer pleacă după încasare | o automatizare a lor ar emite AWB sau factură pe bani neîncasați |
| Ridicarea personală, curierul propriu, lockerele, străinătatea, altă monedă decât RON și fișierele de personalizare rămân în Edinio | AWB spre casa unui om care vine la magazin; livrare făcută de magazin; operatorul lor n-ar avea fișierele |
| `order_total` = suma încasată (setarea „Totalul trimis” o poate schimba) | definiția lor („products values + shipment tax”) nu se potrivește cu ce plătește cumpărătorul; M-COM-2 alege |
| `order_source.easysales` se îmbină cu `jsonb_set`, niciodată prin rescrierea lui `order_source` | atribuirea (utm, consimțământ) stă în aceeași coloană |
| Jetonul adresei de webhook se derivă (HMAC) din secretul de semnare, iar în bază stă numai hash-ul lui | abonările se pot reface oricând fără jetonul în clar |
| `EASYSALES_LIVE=false` stinge numai conectările noi; `EASYSALES_PILOT` deschide magazinele pilot | magazinele conectate au comenzi ștampilate: oprirea lor e pauza, nu variabila |
| Stingerea comenzilor sau deconectarea mută comenzile netrimise înapoi în Edinio, cu notificare | altfel ar rămâne comenzi ștampilate (fără factură și AWB din Edinio) care nu mai pleacă |

## Măsurat pe fir

**Încă nimic pe un cont easySales real.** Contul de probă îl creează comerciantul (Edinio nu creează conturi). Până atunci:

- **Pe DEMO** (`krycmubsiojipwslxrka`), cu baza adevărată și easySales fals: trimiterea (7 scenarii: prima trimitere, răspuns pierdut cu comanda ajunsă, răspuns pierdut cu comanda neajunsă, plata online, 422 cu întoarcerea la Edinio, plafonul, anularea în timpul apelului), oglinda (procesare, expediere cu AWB și curier, livrare, retur anunțat o singură dată, anulare fără AWB, plasa pe 24 de ore), alocarea articolelor (cursa a doi lucrători), probele SQL ale migrațiilor (REGISTRU, rândurile 72-73).
- **Fără rețea:** maparea pe valori (exemplul Save al lor se reface la zecimală), stările (și în `valori-permise`), contractul cu colecția, termenele, secretele, webhook-ul, abonările, testul fără scrieri.

## Ce rămâne deschis

- **E0, pe contul de probă:** emiterea cu lista de scope-uri și JWT-ul decodat, 401 vs 403 la tokenul revocat, Save Order pe exemplul nostru (M-COM-1..9), semnătura și numele câmpului secretului (M-WH-1), ce comenzi vede tokenul de website (M-EXT-1), modelul de stoc (M-STOC-1).
- **E3 (catalogul) și E4 (bucla de stoc)** pornesc numai după E0: un catalog ținut pe stoc 0 nu vinde nimic, iar o împingere de stoc pe un model greșit scade aceeași bucată de două ori.
- **Producția:** migrațiile 72 și 73 se aplică înaintea codului, cu acordul proprietarului; baseline-ul se regenerează în același push.
- **Textul din catalogul public** și ghidurile din centrul de ajutor sunt ciorne care așteaptă textul proprietarului.

## Nota cinstită

Integrarea e construită pe documentație și pe un server fals; niciun octet n-a plecat încă spre easy-sales.com. Tot ce e marcat IPOTEZĂ în plan rămâne ipoteză până la E0, iar codul e scris să cadă în siguranță acolo unde documentația tace: comanda care nu pleacă se întoarce în Edinio, nu se pierde.

# Registru de verificare: sistemul de livrare si cele 17 integrari de curierat

Deschis pe 13.09.2026. Aduna cele doua audituri externe (Astra 09.09, Codex 13.09) si
verificarea mea proprie pe codul de azi.

**UNDE S-A AJUNS, 14.09.2026:** 14 constatari inchise cu proba si mutanti, 4 coborate de
masuratoare, 4 infirmate pe codul curent, si **una singura ramasa deschisa**: SYS-P1-03
(restul), partea din comisionul de ramburs care atarna de transport. Aceea nu se poate inchide
la cotare, fiindca cere suma finala, iar suma finala contine chiar transportul pe care il
cotam. E scrisa asa, nu inchisa de forma.

⚠ Cele patru constatari pe care auditurile le dau drept cele mai grave (SYS-P1-01, SYS-P1-06 si
cele doua jumatati ale lui SYS-P1-02) s-au dovedit, pe masuratoare, ori inchise deja de alt
mecanism, ori fara nicio instanta vie. Asta nu inseamna ca auditurile gresesc: arhitectural au
dreptate. Inseamna ca ordinea de lucru nu se poate lua din gravitatea declarata, ci din ce
atinge productia.

**`SHIPPING_QUOTE_SECRET` e PUSA, 14.09.2026, ora 01:47.** Proprietarul a adaugat-o in Vercel pe
toate cele trei medii si a redesfasurat `3127db32`; desfasurarea a trecut pe READY. De acum
cotatiile nu mai sunt semnate cu cheia de service role, deci o rotire a acesteia nu le mai
atinge. Costul rotirii, masurat: singura comanda din fereastra a venit cu 37 de minute INAINTE
de redeploy si era oricum una Trendyol, adusa prin ingest, care nu trece prin cotare. Iar
`placeOrder.shippingRejected` are ZERO aparitii in sapte zile, deci nu exista fond de zgomot in
care sa se ascunda un efect.

⚠ Simbolurile vechi traiesc 24 de ore. Un cos abandonat recuperat maine poate inca purta unul
semnat cu cheia veche; atunci comanda cade pe `max(suma ceruta, tarif implicit)` si se
jurnalizeaza ca `placeOrder.shippingRejected`. Acela e steagul de urmarit, si e prima data cand
ar avea vreo aparitie.

## Cum se citeste

Un audit facut de alt model nu e adevar, e o **ipoteza de verificat**. Fiecare rand de mai
jos are un verdict pronuntat pe codul si pe datele de ACUM, nu pe snapshotul din care a fost
scris raportul.

| verdict | ce inseamna |
|---|---|
| CONFIRMAT | reprodus pe codul curent, cu ancora in sursa |
| CONFIRMAT, CU CORECTIE | defectul exista, dar descrierea din audit e imprecisa |
| LARGIT | clasa e mai intinsa decat spune auditul; fisierele in plus sunt numite |
| COBORAT | corect arhitectural, dar fara suprafata exploatabila azi, masurat in baza |
| INFIRMAT | nu se reproduce pe codul curent |

⚠ **Nicio constatare nu se inchide pe baza unui comentariu din cod, a lui `tsc` sau a unei
probe care doar cauta siruri.** Fiecare reparatie are proba care apara REGULA si mutanti pusi
pe APELANT, aratati ca pica proba si ca se pun la loc.

## Ce a schimbat masuratoarea

Ambele audituri distribuie riscul peste 17 integrari. Productia spune altceva:

| curier | AWB-uri emise vreodata |
|---|---|
| **Woot** | **211** (un magazin, `suporti-numar`, 186 cu ramburs, 7 in 24h) |
| DPD | 5 |
| ceilalti 15 | **0** |

Alte masuratori care schimba gravitatea unor constatari:

- **0 din 129** de magazine au reguli sau clase de transport.
- **0 din 129** au `default_shipping_cost` NULL sau zero.
- **218 din 435** de comenzi poarta un AWB.
- **234** de comenzi cu ramburs, la **17** magazine, **214** in ultimele 90 de zile. E cea mai
  mare suprafata vie din tot sistemul de livrare, si de aceea rambursul a trecut inaintea
  celorlalte constatari ramase.
- **15** comenzi cu transport zero (5 magazine), si **14 din 129** de magazine cu prag de
  livrare gratuita.
- **254** de comenzi poarta un curier ales de cumparator (woot 216, pickup 12, own 11,
  sameday 8, dpd 4, cargus 2, gls 1). **Zero** au o cheie care nu exista in `shipping_zones`,
  dar **doua** stau pe o zona inchisa intre timp: cursa dintre checkout si setari.
- **6** comenzi livrate la punct de ridicare, in tot istoricul: 5 Sameday, 1 DPD. Restul
  comenzilor cu curier sunt la adresa.
- **0** comenzi poarta un identificator de serviciu de curier. Numarand cheile din
  `shipping_address` pe toate cele 436 de comenzi, `woot_service_id`, `colete_service_id`,
  `ups_service_code`, `dhl_product_code` si `fan_point_type` nu apar niciunde.
- **0** AWB-uri GLS, Pall-Ex sau eColet, si **0** comenzi Pepita.

## Constatari verificate

### Inchise, cu proba si mutanti

| ID (Astra / Codex) | verdict | ce era | commit |
|---|---|---|---|
| WO-P1-01 | CONFIRMAT | `cancelWootAwb` primea identificatorul expedierii de la browser si il trimitea neatins la `DELETE /orders/{id}` | `4c97f325` |
| WO-P1-02 | CONFIRMAT | `cancelWootOrder` nu arunca la `{success:false}`, iar actiunea ii arunca rezultatul; comanda se golea si omul citea „AWB anulat" | `4c97f325` |
| WO-P1-03 | CONFIRMAT | `createOrder` promitea `order_id: number` fara nicio validare; lipsa lui devenea sirul „undefined" | `4c97f325` |
| PLAT-P1-02 / SYS-P1-07 (partial) | CONFIRMAT | anularea nu era compare-and-set pe AWB; inchis pentru Woot, FAN il avea deja (2 din 17) | `4c97f325` |
| CARGUS-01, DPD-01 | **LARGIT** | `.buffer as ArrayBuffer` trimitea blocul din spate. Auditurile numesc 2 rute; erau **4**: plus **Sameday** si **FAN Courier** | `a3558c42` |
| (niciun ID) | **NOU** | cinci rute serveau eticheta fara `Cache-Control: private, no-store`, desi poarta datele cumparatorului | `a3558c42` |
| UPS-P1-01 / SYS-P1-11 | CONFIRMAT | `BUGET_MS` iesea exact 0, deci cronul sarea fiecare colet si raporta `ok: true` | `9003b35a` |
| PALLEX-08 | **LARGIT** | eticheta se depozita in R2 cu implicitul `public, max-age=31536000`. Astra numeste doar Pall-Ex; **eColet** facea la fel si nu e numit de nimeni | `56796201` |
| SYS-P1-05 | CONFIRMAT (regresie proprie) | indisponibilitatea unui curier devenea oferta semnata la tariful zonei. Instanta vie masurata: `okxi` cu zona Sameday pe tarif viu si `price: 0`, deci pleca semnat „0,00 lei". Filtrul sta acum intr-un singur loc, inaintea semnarii, si prinde si cele 27 de situri preexistente | `8c1b7991` |
| PLAT-P2-12 (a doua jumatate) | CONFIRMAT | rezultatul incert arata identic cu lipsa refuzurilor, pe patru drumuri. `refuzuriPeComanda` intoarce acum un verdict, iar panoul are a treia stare | `e5293e3e` |
| SYS-P1-02 (ramura NULL) | CONFIRMAT, CU CORECTIE | `if (tarifImplicit == null) return { shipping: claimed }` accepta suma din browser neverificata: singurul loc unde transportul putea fi ales integral de client. Acum cere recotare, iar verdictul poarta cauza, ca mesajul sa nu minta. Masurat inainte: **0 din 129** de magazine aveau tarif implicit NULL, deci inchiderea fail-closed n-a atins niciun drum viu | `4cffd635` |
| SYS-P1-09 / PLAT-P1-04 | **LARGIT** | `deleteOrder` stergea randul fara sa se uite daca exista un colet viu, si citea din cele 17 coloane de AWB exact una: `gls_awb_number`, curierul cu ZERO expedieri. Acum refuza cat expedierea e vie, citeste toate cele 17 si curata etichetele GLS, Pall-Ex si eColet. Masurat: din 218 de comenzi cu expediere se opresc **192** (cele la `shipped`); cele 26 incheiate raman stergibile, fiindca regula se uita la STARE, nu la existenta AWB-ului. Hotararea de produs a fost delegata de proprietar pe 14.09.2026: s-a ales tiparul Shopify/WooCommerce (fara stergere peste o expediere activa), fara arhivare, fiindca aici nu exista coloana de arhiva | `f1aceba7` |
| SYS-P1-03 (suma) | **LARGIT** | rambursul se semna ca BOOLEAN, iar SUMA venea din browser si intra direct in cererea catre curier. Auditurile numesc curierii; erau **opt** locuri, fiindca **Woot, Colete si eColet** primeau obiectul `destination` intreg si isi luau singuri `cod` din el. Acum toti primesc `pragulRambursului` = `max(cat cere browserul, valoareMarfii)`, iar la cei trei brokeri campul a fost scos din TIP, ca `tsc` sa enumere apelantii. Masurat: 234 de comenzi cu ramburs, 17 magazine, 214 in 90 de zile, **niciuna atinsa** (browserul trimite totalul, pragul e doar marfa, deci `max` intoarce chiar numarul lui) | `5d9f807b` |
| SYS-P1-02 (identitatea curierului) | **LARGIT** | `selected_courier`, `courier_label` si `delivery_type` se scriau pe comanda direct din browser, in AMANDOUA checkout-urile. Auditul numeste doar livrarea gratuita; drumurile erau **doua**, fiindca `autoritativeShipping` intoarce un NUMAR si nu spune niciodata ca optiunea pretinsa n-a fost verificata: si `esteGratuit`, si caderea pe `max(suma, tarif implicit)`. Banii nu erau in joc, identitatea expedierii da (factura, emailul cumparatorului, panoul, punctul de ridicare). Acum se cere ca cheia sa EXISTE in `shipping_zones`; pornirea NU se cere, fiindca doua comenzi `own` reale stau pe o zona inchisa intre timp, si un zid acolo ar taia o vanzare cinstita. Masurat: din 254 de comenzi cu curier, **zero** ar fi pierdut ceva | `d2cc19ea` |

### Confirmate, inca deschise

| ID | verdict | nota |
|---|---|---|
| SYS-P1-03 (restul) | CONFIRMAT | suma s-a inchis in `5d9f807b`. RAMANE partea pe care pragul nu o poate acoperi: plafonul din catalog nu cunoaste transportul, deci cine subdeclara ramane dator cu comisionul aferent transportului. Inchiderea deplina cere suma finala, care la cotare inca nu exista: ea contine chiar transportul pe care il cotam |

### Coborate de masuratoare

| ID | de ce |
|---|---|
| SYS-P1-04 | regulile de transport nu sunt legate de cotatie, dar **0 din 129** de magazine au vreo regula sau clasa |
| PLAT-P2-12 (prima jumatate) | gruparea doar dupa `fel` ar ascunde refuzul unui curier cand altul a reusit. Masurat: 172 de operatii AWB, 164 reusite, 8 esuate, si **ZERO** comenzi cu refuz ascuns de ALT furnizor. Cele 6 potriviri gasite sunt pe ACELASI furnizor, adica exact cazul tratat dinadins: reusita stinge alarma dupa ce problema s-a reparat |
| SYS-P1-01 | tokenul chiar nu leaga serviciul, contractul/BYOC, punctul sau reteaua, si asta ramane adevarat arhitectural. Dar **niciuna** din cele 436 de comenzi nu poarta vreun identificator de serviciu: `shipping_address` nu contine nicaieri `woot_service_id`, `colete_service_id`, `ups_service_code`, `dhl_product_code` sau `fan_point_type`. Nici macar cele 216 comenzi Woot, singurul curier cu volum, fiindca serviciul se alege la EMITERE, de comerciant. A lega serviciul in semnatura ar schimba formatul de semnare si ar invalida toate cotatiile in circulatie, pentru campuri pe care nicio comanda reala nu le poarta |
| SYS-P1-02 (punctul de ridicare) | blocul `locker_*` se scrie tot din browser (`order.actions.ts:1709`), dar **nu merita reparat, si asta s-a masurat**. Suprafata vie: **6** comenzi in total, 5 Sameday si 1 DPD; toate celelalte comenzi cu curier au `delivery_type: address` si niciun `locker_id`. Iar consumatorii il pazesc deja singuri: `cargus.actions.ts:160` si `dpd.actions.ts:161` il folosesc numai cand `courier` SI `delivery_type` se potrivesc, adica exact cele doua campuri devenite de incredere in `d2cc19ea`. Un id strain cade la emitere, la curier, sub ochii comerciantului. Inchiderea adevarata ar cere un apel la API-ul curierului chiar in pasul cu banii, exact ce `quote-token.ts` argumenteaza ca nu trebuie facut |

### Infirmate pe codul curent

| ce | de ce |
|---|---|
| SSRF la Woot | `WOOT_BASE` e hardcodat (`woot.ts:6`) |
| „Woot n-are termene" (jumatate din WO-P2-07) | `ASTEPTARE_MS = 20_000` pe fiecare cerere |
| nota din ruta FAN: „Posta si Packeta pun deja `no-store`" | Posta **nu are eticheta deloc**; Packeta o trimite printr-o actiune, ca base64 in browser. Corectat in `33c955e1` |
| SYS-P1-06: „doi curieri pot rezerva aceeasi comanda" | nu se mai poate din 09.09.2026. `poartaCuBaza` isi citeste singura comanda cu toate cele 17 coloane plus martorii, iar `deCeNuSePoateAwbPropriu` refuza pe AWB-ul oricarui ALT curier; `poarta-awb.test.ts:233` cere ca **fiecare** actiune de emitere sa treaca prin poarta, cu curierul ei. Furnizorul din cheia registrului e o alegere anume, scrisa in `awb-propriu.ts:20-28`: scos, al doilea curier ar ADOPTA referinta primului, si dintr-un defect vizibil ar iesi unul tacut |

## ⚠ Corectii la propriile mele afirmatii

Se scriu aici, nu se sterg, fiindca o masuratoare gresita folosita ca argument e mai
periculoasa decat lipsa ei.

1. **„Magazinul `okxi` a fost sters pe 11.09, de aceea niciun magazin nu mai are tarif zero."
   FALS.** `okxi` exista: business `635bc524`, **142 de comenzi, ultima chiar azi**, livrare
   pornita. E acelasi business cu VetDepo (confirmat si de `oblio-gestiune.test.ts:16`). Ce
   s-a sters pe 11.09 a fost magazinul `okxishop` si legatura Trendyol, nu acesta. Am folosit
   deductia asta ca sa explic o masuratoare; explicatia era inventata.

2. **„Doar trei perechi magazin-curier coteaza live." SUBNUMARAT.** Prima interogare a numarat
   doar `auto_price = 'true'`, dar codul spune `zone.auto_price !== false`, cu implicitul
   **true** (`shipping.actions.ts:750`). Cu semantica reala sunt **zece** perechi activate cu
   tarif viu, dintre care **cinci** cheama efectiv un API de tarif (celelalte sunt `own`,
   `pickup` si `gls`, aflate in `FARA_API_DE_TARIF`). Cele cinci stau pe trei magazine:
   `okxi`, `tonel-beauty`, `yulmis-sound`.

3. **O proba de-a mea a lasat sa treaca un mutant, si de vina era proba, nu codul.**
   Verificarea ca `deleteOrder` cere toate cele 17 coloane era `corp.includes("cargus_awb_number")`.
   Mutantul care scria `NUcargus_awb_number` a TRECUT nevazut: subsirul e tot acolo. O
   verificare pe subsir nu apara niciodata o lista de nume, fiindca fiecare nume stricat il
   contine inca pe cel bun. Selectul se sparge acum pe virgula si se compara ca multime.
   Fara banc de mutanti, proba ar fi ramas verde si goala.

## Constatari noi, pe care nu le are niciun audit

| ce | dovada |
|---|---|
| `shipping_zones` tine DOUA forme JSON: obiect la 19 magazine, **array gol la 110** | `jsonb_typeof` peste `store_settings`. Nu e rupt azi (un array gol da zero curieri), dar e simptomul validarii slabe pe care ambele audituri o semnaleaza la salvare |
| comentariu ramas in urma la `order.actions.ts:294-297` | sustine ca `okxi` are `default_shipping_cost` 0,00; azi e **18,00**. Pretul zonei Sameday chiar e 0, deci jumatate din afirmatie e inca adevarata |
| eColet depoziteaza eticheta cu antet public | reparat in `56796201`; Astra semnaleaza cazul doar la Pall-Ex |
| Sameday si FAN trimiteau blocul din spate al PDF-ului | reparat in `a3558c42`; auditurile numesc doar Cargus si DPD |
| eticheta Pepita ramanea ORFANA la fiecare stergere de comanda | ea sta in galeata PRIVATA, deci `deleteFromR2` ar fi cautat-o unde nu e si ar fi raportat linistit reusita; iar `pepita` NU e in `MARKETPLACE_CU_CICLU_PROPRIU`, deci comenzile ei chiar ajung la stergere. Reparat in `f1aceba7` cu `stergeIncarcarea`. Masurat: 0 comenzi Pepita azi |
| suma rambursului ajungea la OPT locuri, nu la cei sase curieri numiti de audituri | **Woot, Colete si eColet** primeau obiectul `destination` intreg si isi luau singuri `cod` din el. Un prag pus doar la apelant i-ar fi ocolit pe toti trei, iar proba ar fi trecut verde. Reparat in `5d9f807b`, cu campul scos din TIPUL lor |
| curierul nevalidat ajungea pe comanda pe DOUA drumuri, nu doar pe cel gratuit | auditul numeste `esteGratuit`. Cauza e mai sus: `autoritativeShipping` intoarce doar un NUMAR, deci nu spune niciodata ca optiunea pretinsa n-a fost verificata, si atunci campurile se scriu si cand semnatura pur si simplu nu bate. Reparat in `d2cc19ea` |
| o cheie de pe lantul de prototipuri ar fi trecut drept curier | o verificare scrisa firesc ca `zone[curier] !== undefined` raspunde „da” pentru `constructor`, `toString` sau `__proto__`. Inchis din capul locului cu `hasOwnProperty.call`; niciun audit nu-l numeste |
| `shipping_zones` in forma de ARRAY nu declara niciun curier | 110 magazine din 129 o au asa. Fara paza pe `Array.isArray`, un array cu o insusire cu nume ar fi trecut drept harta de zone |
| **„Testeaza conexiunea" STERGEA credentiala pe care o testa** | `WootConfigClient` salva configul inainte de proba, ca actiunea sa aiba ce citi. `pastreazaSecretele` pastreaza doar campurile GOALE, deci o cheie tastata gresit o suprascria pe cea buna: butonul de verificare era butonul de deconectare. Regula scrisa pe TIPAR (`proba-conexiune-nu-scrie.test.ts`, toate panourile) a gasit si **SmartBill**, pe care niciun audit nu-l numeste fiindca nu e curier. Masurat: Woot 5 magazine/3 pornite (singurul curier cu trafic real, 211 AWB-uri), SmartBill **7 cu token, toate 7 pornite**. Reparat in `06aa1ae7` |
| **cheia SMSO decriptata cobora in browser** | `settings/page.tsx` o citea cu service role si o dadea ca prop catre `SettingsClient`: singurul loc din platforma unde o credentiala de integrare ajungea in clar in payloadul RSC. Iar nota care justifica citirea descria o fila SMS care **nu avea niciun apelant**: `saveSmso` si `sendTestSms` erau definite si nechemate. A doua copie, moarta, a unei integrari cu panou viu si corect (`SmsoConfigClient`). SCOASA, nu mascata. Masurat: 3 magazine cu cheie SMSO. Reparat in `06aa1ae7` |
| **bugetul lotului nu acoperea nici UN apel de curier** | marja era de 30s sub `maxDuration`, socotita pentru scrierile de la final. Dar `runPool` nu intrerupe o lucrare pornita (dinadins), ci verifica termenul doar inainte sa porneasca alta: un AWB pornit la 269,9s ducea functia pana pe la 340s din 300, platforma o taia si nu se mai intorcea NIMIC, desi serverul stia ce reusise. Cel mai lung apel, citit din surse: **GLS 60s + 10s** cautarea codului postal. Aceeasi clasa cu bugetul cronului UPS, care iesea exact 0 (`9003b35a`). Reparat in `7bf75c7d`. ⚠ Si proba era la fel de gresita: cerea doar 20s marja, deci trecea verde peste defect; acum CALCULEAZA pragul scanand termenele celor 15 curieri, cu prag si pe cautarea insasi. Masurat: loturile reale au 3-8 operatii pe minut, deci fereastra n-a fost atinsa niciodata |
| **INFIRMAT:** „lotul arunca avertismentele emiterilor REUSITE" | verificat pe codul curent: **nicio** actiune de emitere nu intoarce vreun avertisment pe forma de succes. `createGlsAwbAction` intoarce doar `{ awb, etichetaBase64 }` sau `{ error }`, iar cautarea dupa `avertisment`, `atentionare` sau `warning:` in tot `src/lib/actions` nu gaseste asa ceva pe nicio actiune de AWB. Avertismentele GLS (codul postal completat de noi) se scriu in `operatii_externe.detalii`, adica in REGISTRU, nu in raspuns. Deci la `:515` nu se arunca nimic care sa existe |
| „sarite" amesteca trei motive, dar UNUL chiar e numit | auditul spune ca nu se numeste nicio comanda. Fals pentru coletele duse de marketplace: ele se aduna in `duseDeEi` si ies pe un rand anume, cu numerele lor (`:495`, `:522-527`). Raman amestecate celelalte doua, „n-are curier potrivit" si „are deja AWB", care cer miscari OPUSE: prima cere emitere pe bucata, a doua nu cere nimic. Inca DESCHIS |

## Hotarari care nu-mi apartin

1. **Dezlegarea unui AWB Woot refuzat la anulare.** Azi nu se dezleaga nimic la refuz dovedit,
   dinadins: `woot_order_id` e singura cheie de anulare si de eticheta.

## Ce nu s-a putut verifica

Niciun apel cu acreditari reale catre cei 17 furnizori, nicio expediere creata sau anulata in
sandbox, niciun test cu cititor de ecran. Constatarile marcate ca inchise sunt dovedite pe
cod, pe date de productie si pe probe; nu pe raspunsurile vii ale curierilor.

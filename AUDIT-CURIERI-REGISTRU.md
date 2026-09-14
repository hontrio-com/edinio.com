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
| „sarite" amesteca trei motive, dar UNUL chiar e numit | auditul spune ca nu se numeste nicio comanda. Fals pentru coletele duse de marketplace: ele se aduna in `duseDeEi` si ies pe un rand anume, cu numerele lor. Celelalte doua erau intr-adevar contopite, si cer miscari OPUSE: „n-are curier potrivit" cere emitere pe bucata, „are deja AWB" nu cere nimic. Iar la reluarea lotului cele deja facute se sar la fel, deci numarul nu scade si arata ca un esec care nu se repara. Reparat in `11c80f9e`: fiecare motiv are contorul lui, `skipped` ramane SUMA (ca loturile de facturi si de status sa nu se clinteasca), si se NUMESC doar comenzile care cer o miscare |
| **zonele de livrare se scriau BRUT**, desi clasele si regulile treceau prin parsere | `updateShippingConfig` re-parsa clasele si regulile „ca sa garanteze forma jsonb valida", dar zonele mergeau neatinse. Iar `min="0"` din formular e doar o sugestie a navigatorului: serverul nu se uita deloc la pret, iar in ecran o casuta golita se salveaza ca ZERO fara nicio vorba. Din prima zona pornita se deduce `default_shipping_cost`, adica pretul vazut pe pagina de produs, in cos, la finalizare, si citit de Google din datele structurate. Reparat in `8be295af` cu `parseShippingZones`, cu tariful socotit din zonele CURATATE (altfel parserul ar fi stat decorativ langa gaura) si cu scriere curatata in AMANDOUA ramurile, `update` si `insert`. Masurat inainte: din 25 de zone pornite, ZERO preturi negative si niciun tarif implicit nul, deci nicio valoare din productie nu se misca |
| **o cheie `__proto__` in zone otravea prototipul obiectului scris in baza** | `iesire["__proto__"] = zona` nu creeaza o cheie: cheama setterul mostenit si SCHIMBA prototipul. Iar `JSON.parse`, chiar drumul pe care soseste configuratia, creeaza o insusire proprie cu numele asta. Obiectul intors si scris in baza ar fi capatat un prototip ales din afara, deci orice `zone["curier-inexistent"]?.enabled` ar fi raspuns „da", cu pretul venit tot de acolo. ⚠ Prima mea paza (`hasOwnProperty`) era COD MORT, iar proba trecea din alt motiv decat credeam; a aratat-o o sonda, nu rationamentul meu. Reparat in `8be295af`, si proba verifica acum chiar prototipul |
| **butonul se invartea pana la reincarcarea paginii, in 17 ferestre** | Tiparul era acelasi peste tot: `setEmitand(true)`, apelul asteptat, `setEmitand(false)` pe randul urmator. O actiune de server ARUNCA la o desfasurare in curs sau o retea cazuta, deci stingerea nu mai rula: niciun mesaj, buton blocat, iar omul nu stia daca AWB-ul s-a facut. Ori apasa iar, si ieseau doi AWB-uri taxabili, ori astepta degeaba. Masurat: 69 de functii aprind un steag, 56 sunt fara `finally`, in 17 ferestre; 47 dintre ele lasa fereastra deschisa, deci blocarea chiar se VEDE. Inchis cu un clichet, nu cu un val peste 17 ferestre vii: `5b6c3b45` pune o harta cu numere pe fereastra si cere EGALITATE, deci cad si regresia (numarul urca) si reparatia nedeclarata (numarul scade). Apoi loturi mici, ca sa nu se atinga 17 ferestre vii dintr-o data: `dd4f4a70` GLS si Posta, `45ea490a` cele doua ferestre de ridicare, `d08470ba` Cargus si DPD, `bc7b50ee` Colete si Packeta, `f387e1fd` FedEx, `2fea1c0a` Pall-Ex, `17c0501d` Innoship, `478818c1` Sameday, `d6b6388b` UPS, `8cac7179` Woot, `280aeae9` DHL, `ed35b317` Shipo, `94d03fa8` SmartShip. ⚠ ARCUL E INCHIS: toate cele 56 de aprinderi au stingere in `finally` sau o scutire numita, iar harta din `INCA_NEREPARATE` e GOALA. Si tocmai de aceea clichetul nu dispare: o lista goala e cea mai stransa forma a ei, fiindca de acum orice aprindere noua fara stingere o face sa nu mai fie goala. Mutantul care pana acum apara sensul „nu repara tacut" a fost intors pe dos si apara acum sensul „nu strica tacut". ⚠ Forma e cea de la eColet, nu cea de la FAN: in `try` doar APELUL, ramificarea afara, fiindca altfel un `toast` care arunca ar scoate mesajul „nu stim daca a ajuns" pentru un AWB care CHIAR plecase. ⚠ Si mesajul are TREI cazuri, nu doua: schimba la curier, schimba doar la noi (`dezleagaPacketaAction` nu vorbeste deloc cu Packeta), sau doar citeste. Clasificat citind fiecare actiune: dupa verb as fi gresit la `dezleaga`, iar dupa metoda HTTP as fi gresit la Shipo, unde anularea e un `GET` care SCRIE |
| **regula a invatat de PATRU ori, si de fiecare data citind, nu cazand** | Un val mecanic peste 17 ferestre ar fi trecut de `tsc`, de suita si de build, si ar fi stricat lucruri. Ce s-a aratat, pe rand: la **Colete** forma e `useTransition`, deci `finally` merge INAUNTRUL callbackului, nu in jurul functiei, care nici macar nu e `async`. La **Pall-Ex**, `borderouCerut` nu e steag de incarcare, ci „omul a cerut sa vada borderoul", si ramane dinadins aprins pe reusita: un `finally` ar fi inchis panoul chiar cand se umple, pe pasul fara de care marfa nu pleaca. La **Sameday**, steagul chiar e de incarcare, dar sta intr-un efect cu anulare, iar `if (anulat) return` sare peste stingere dinadins: un `finally` ar fi stins rotirea pornita de o rulare mai noua. La **Woot**, proba numara FUNCTII, nu asteptari, iar `handleSelectService` ascundea a doua asteptare; reparand-o doar pe prima, numarul ar fi scazut si a doua ar fi ramas stricata pe vecie. ⚠ Ultimele doua au cerut scutiri numite in proba, cu motivul scris si cu mutantul lor, fiindca o scutire nesupravegheata e chiar o portita. Si tot lotul Woot a scos la iveala trei defecte ALE PROBEI: taia corpul functiei fara sa recunoasca inchiderea unui efect (deci imprumuta `finally` de la vecin), cerea `catch (` si cadea pe `catch {`, si scanerul geaman nu taia comentariile, deci un comentariu care pomenea numele probei facea manerul sa para reparat. ⚠ Si de DOUA ori s-a schimbat doar MESAJUL, nu reparatia, ceea ce e alt fel de invatatura: la **Shipo** era sa scriu „apasa Verifica", dar fereastra n-are verificare de AWB si nici anulare, singurul „Verifica datele" fiind validarea de DINAINTE de emitere, iar emiterea e facturata din prima fiindca n-au mediu de proba; la **SmartShip**, `handleCereOferta` nu naste niciun AWB (raspunsul vine de la oameni, „poate dura ore sau zile"), deci nesiguranta acolo nu e „s-a emis?", ci „a intrat cererea?" |
| **o actiune care ARUNCA intr-o tranzitie inlocuia tot panoul cu o pagina de 500** | Alt defect decat steagurile, si de aceea n-a fost niciodata in harta: `startCreate(async () => …)` nu aprinde niciun steag de mana, butonul se stinge dupa `isPending`. Dar o aruncare acolo nu e prinsa de nimeni IN FEREASTRA, iar singurele granite de erori din proiect sunt `app/error.tsx` si `app/global-error.tsx`, amandoua la radacina si niciuna in `(dashboard)`. Cea dintai inlocuieste TOT panoul cu o pagina de 500: comerciantul pierde formularul completat si tot nu afla daca AWB-ul a plecat, la Woot, singurul curier cu trafic adevarat masurat. Reparat in `1e228740`, cu o afirmatie noua care cere ca orice callback de tranzitie care asteapta sa prinda caderea. Masurat inainte de a scrie regula: exact 4 asemenea callbackuri in ferestrele de curier, doua la Colete si doua la Woot. ⚠ CE NU SE PRETINDE: documentatia React nu spune ce se intampla cu `isPending` la o respingere, zice doar ca ramane `true` pana cand Actiunile „se incheie", si trimite la o granita de erori. Deci NU se afirma ca butonul ramane rotind; regula cere doar ca omul sa primeasca un mesaj in loc de o pagina de 500 |
| **„CADERI REALE" care erau doar o rulare taiata** | Am pusat lotul doi cat timp inca rula CI-ul lotului unu, iar GitHub a anulat rularea veche. Verificatorul meu numara orice stare care nu e `success` drept nereusita, deci mi-a raportat cadere pentru `dd4f4a70`, desi celelalte trei joburi trecusera si codul era intreg. Doua indreptari: `cancelled` se numara acum separat, cu un rand care trimite la URMAS (care cuprinde oricum schimbarile), si nu mai pusez peste o rulare in curs. ⚠ Si a treia oara in aceeasi zi, aceeasi clasa: unealta a crapat pe `⚠` in consola cp1252 exact pe ramura noua, adica fix atunci cand avea ceva de raportat. Pe verde n-as fi vazut-o niciodata |
| **plasa probei era croita pe NUMELE fisierului, nu pe ce face fereastra** | `ferestrele-sunt-dialoguri-adevarate` cerea `/AwbModal\.tsx$/`, deci cele trei ferestre de ridicare nu fusesera NICIODATA cuprinse. `CargusPickupModal` si `DpdPickupModal` n-aveau nici rol, nici `aria-modal`, nici nume, nici Escape, nici capcana de focus: cine cheama curierul fara mouse nu putea ajunge in fereastra cu Tab si nu o putea inchide, iar proba era verde tocmai fiindca nu se uita la ele. Reparat in `c38b91a9`: plasa e acum `(Awb\|Pickup)Modal`, adica 21 de ferestre, iar argumentul carligului se DEDUCE din invelis in loc sa fie scris de mana, cu scutirea eMAG preluata din proba surora. ⚠ INFIRMAT pe drum: pregateam si constatarea „ferestrele de ridicare raman montate, deci data implicita Cargus se invecheste peste noapte"; masurat, `OrdersClient` le randeaza sub `{xPickupOpen && businessId && …}`, deci le monteaza abia la deschidere, si cade toata. Tot de aceea regula despre argument e o cerinta de FORMA, nu un defect viu: azi `true` s-ar purta la fel, si am indreptat comentariile care spuneau altfel. ⚠ Si prima rulare a bancului a prins 9 mutanti din 9 peste doua fisiere care NU COMPILAU (uitasem `>`-ul care inchide eticheta): probele care scaneaza surse le citesc ca text, doar `tsc` vede sintaxa |
| **lotul de AWB-uri pornea fara nicio intrebare** | butonul de alaturi cere confirmare pentru facturi, iar acesta emitea pana la 50 de expedieri REALE, platite, dintr-o apasare. Si greseala e mai greu de desfacut decat o factura: aceea se storneaza, un colet la Packeta sau DHL nu se poate anula prin API. Reparat in `11c80f9e`, cu o intrebare care spune faptele (cate comenzi, ca sunt reale si platite, care curieri n-au drum inapoi), nu un „esti sigur?" gol. ⚠ Regula e pe TIPAR: proba cere confirmare pentru ORICE lot care creeaza documente sau expedieri reale, iar mutantul care scoate confirmarea de la FACTURI, buton neatins de reparatie, e prins |

## Hotarari care nu-mi apartin

1. **Dezlegarea unui AWB Woot refuzat la anulare.** Azi nu se dezleaga nimic la refuz dovedit,
   dinadins: `woot_order_id` e singura cheie de anulare si de eticheta.

## Ce nu s-a putut verifica

Niciun apel cu acreditari reale catre cei 17 furnizori, nicio expediere creata sau anulata in
sandbox, niciun test cu cititor de ecran. Constatarile marcate ca inchise sunt dovedite pe
cod, pe date de productie si pe probe; nu pe raspunsurile vii ale curierilor.

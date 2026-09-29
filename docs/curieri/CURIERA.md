# Curiera: evidenta integrarii

> **Ce e fisierul asta.** Evidenta pe care o tinem pentru fiecare curier pana cand integrarea lui e
> 10/10 din toate punctele de vedere: securitate, optimizare, functionalitate, compatibilitate cu
> platforma, si conformitate cu documentatia lor. Se tine la zi ODATA CU codul, in acelasi commit.
>
> Conventia: cate un fisier per curier, in `docs/curieri/`. Al optsprezecelea, si primul scris odata
> cu integrarea, nu dupa ea.

**Care Curiera:** Curiera Transport Solutions SRL, transportator romanesc care ruleaza pe platforma
**CourierManager** sub marca lui. Punctele lui de ridicare sunt reteaua FAN (lockere „FANbox",
oficii „Sediul FAN"), dar id-urile sunt ale Curiera si nu se amesteca cu punctele FAN Courier.

**API-ul real:** `https://app.curiera.ro/cscourier/API/<operatie>`, POST form-urlencoded, cheia in
antetul `api_key`. Documentatia arata gazda platformei (`app.couriermanager.eu`); cheia merge pe
amandoua, dar numai gazda Curiera e a lor, deci numai ea se foloseste, fixa, fara suprascriere din
configurare.

**Referinta autoritara:** `https://app.curiera.ro/cscourier/Main?apiDocs=true`, citita pe 29.09.2026
(HTML, 49.164 octeti, md5 `7b8bd6c1427928730fba532577dc0e70`), 35 de operatii. Plus **contul de test**
primit de la ei („CLIENT TEST INOVEX.RO", cheie de CLIENT), pe care s-a probat tot ce e mai jos.

**Cod:** `src/lib/curiera/` (`client.ts`, `expediere.ts`, `statusuri.ts`, `puncte.ts` si probele
lor), `src/lib/actions/curiera.actions.ts`, cronul `src/app/api/cron/curiera-tracking`, ferestrele
`CurieraConfigClient.tsx` si `CurieraAwbModal.tsx`, migratia `migrations/2026-09-29-curiera-curier.sql`.

---

## Expunerea masurata, 29.09.2026

| ce | cat |
| --- | --- |
| Magazine cu Curiera configurat | **ZERO** (integrare noua, in productie din 29.09.2026) |
| AWB-uri emise in productie | **ZERO** |
| AWB-uri de proba pe contul de test | 15 (plus doi membri de grup), **toate anulate**, verificat cu `get_shipments`; doua erau ciorne, anulate prin `change_status` |

---

## ⚠⚠ Ce NU spune documentatia, masurat pe fir

Fiecare rand de aici a costat o expediere de proba. Toate sunt si in antetul `client.ts`, si fiecare
are o proba in `client.test.ts` construita din raspunsul real.

### 1. O expediere gresita NU e refuzata: iese o CIORNA cu un numar de AWB

Cu serviciu inexistent si fara adresa de ridicare, `create_shipment` a raspuns `status: "done"`,
`message: "AWB was created"`, cu numar, stare `initial`, iar in `data.errors`:

    Serviciul este incorect:nuexista
    Lipseste orasul expeditorului
    Lipseste judetul expeditorului
    Campul tip expediere lipseste sau este incorect
    Lipseste adresa destinatarului
    Numarul de telefon al expeditorului este obligatoriu
    Telefonul destinatarului este obligatoriu

Citit dupa `status`, comerciantul ar fi primit un AWB care nu pleaca niciodata. **Regula: `data.errors`
nevid = refuz dovedit**, iar ciorna se anuleaza pe loc. ⚠ `cancel` raspunde „forbidden" pe o ciorna;
merge numai `change_status` cu `status=anulat` (cu `cancelled` in engleza raspunde „invalid status").
⚠ Starea `initial` SINGURA nu e refuz: documentatia spune ca un cont se poate seta sa porneasca
expedierile API in ciorna (`Initial_api_status`). Atunci emiterea reuseste si avertizeaza.

Si de aici: „There are no mandatory fields except api_key" e adevarat la propriu. `lockere` fara punct
a fost primit FARA eroare. Deci `lipsuriExpediereCuriera` e singura plasa, si ruleaza inaintea registrului.

### 2. Diacriticele se strica pe eticheta

Pe etichetele tiparite: „Timișoara" -> „Timi?oara", „Mărășești" -> „Mara?e?ti", „Âî" -> doua caractere
de inlocuire. Trec curat doar formele cu sedila (ş, ţ) si „ă". **Tot textul pleaca in ASCII** (`ascii`
din `expediere.ts`), nu doar orasul.

### 3. `to_str` isi pune singur „Str.", iar `to_sector` langa `to_address` se pierde

`to_str=Bulevardul Unirii` a iesit pe eticheta „Str. Bulevardul Unirii". `to_address` pleaca asa cum
e, dar `to_sector` trimis langa el nu apare nici in raspuns, nici pe eticheta. Deci linia intreaga in
`to_address`, iar in Bucuresti sectorul se scrie in linie („..., Sector 3") cand nu e deja acolo.
Nu se ghiceste niciodata.

### 4. Punctul rescrie adresa destinatarului

Cu `to_delivery_location`, orasul, judetul si adresa destinatarului devin ale PUNCTULUI (un
„Cluj-Napoca" trimis a iesit „Bucuresti"). Iar `service_type=standard` cu punct e mutat singur pe
`LOCKERE`. Serviciul `lockere` primeste toate cele trei tipuri de punct (locker, pudo, oficiu) si
ramburs la punct.

### 5. Plicul nu e uniform

| operatie | reusita | refuz |
| --- | --- | --- |
| `test_connection`, `me`, `create_shipment`, `get_status`, `get_history`, `get_info` | `{status:"done", data, message}` | `{status:"failed", error, message}` |
| `list_services`, `list_delivery_locations`, `list_statuses`, `list_codes`, `get_shipments` | LISTA BRUTA | plicul `failed` |
| `cancel` | plicul `done` | TEXTUL „forbidden" (si pe anulat, si pe inexistent, si pe ridicat, si pe ciorna) |
| `print` | PDF | TEXTUL „Not found:<nr>" / „Shipment is canceled:<nr>", cu antet `application/json` |
| `get_statuses` (documentat pentru lot) | **CORP GOL**, si pe AWB-uri reale | |

Deci lotul de stari merge pe `get_status` cu `awbnos=a,b,c` (200 de numere intr-un apel, 0,3 s), iar
dupa „forbidden" la anulare se CITESTE starea ca sa se afle ce inseamna.

### 6. Tacerea nu e o stare

`get_status` pe un AWB necunoscut: `status: "done"`, cu `no: ""`, `status: ""`, `date: 0`. O cheie
gresita sau lipsa: HTTP **200** cu `{status: "failed", error: "BAD_LOGIN"}`. Cu un singur numar,
`data` vine obiect; cu `awbnos`, lista cu `request_no` pe fiecare rand.

### 7. `ramburs_type` e al contractului

Am trimis `ramburs_type=cash`; contul l-a scris `cont`. Nu se mai trimite: e o setare a contului.

### 8. Grupul de colete

`cnt=2` a intors `all_numbers: ["X", "X/1"]` desi al doilea colet exista ca `X/2`, iar `cnt` in
raspuns a ramas „1". Eticheta grupului are o pagina pe colet. Pe comanda se tine liderul `X`.

---

## Hotarari

1. **Pret fix pe zona, nu cotare live.** `get_price` exista, dar pe contul de test intoarce `price: 0`
   pentru ORICE cerere, chiar goala, cu `detailed_price.tva: 21`. Nu se poate dovedi daca `price` e cu
   sau fara TVA (la `create_shipment` vin separat `price` si `price_with_vat`, deci probabil fara), iar
   un 0 semnat ar fi livrare gratuita. `curiera` sta in `FARA_API_DE_TARIF` si `FARA_PRET_AUTOMAT`.
   ⚠ Nu s-a scris nicio functie de cotare nechemata.
2. **Punctele de ridicare: da**, toate tipurile, o singura retea, filtrate pe `can_pickup` (41 de
   puncte de unde nu se poate ridica). Program pe zile NUMITE, deci se spune fara ghiceala.
3. **Eticheta nu se pastreaza nicaieri**: `print` e o citire pura, deci nici R2, nici tabel.
4. **Anularea** ca la FAN (`dezleaga`): cheia de client are doar `cancel_uncollected`, adica anuleaza
   numai pana la ridicare. Refuzul dovedit dezleaga cu mesaj; `necunoscut` opreste.
5. **Lamurirea unui raspuns pierdut la emitere**: `get_shipments` poarta `customer_reference`, deci
   dupa un `necunoscut` se cauta o data AWB-ul viu cu referinta noastra (`EDN-<magazin>-<comanda>`).
6. **Urmarirea**: lot pe `get_status` la doua ore; la schimbarea cheii `stare|cod` se citeste istoricul
   si se semnaleaza o singura data fiecare eveniment-problema (lectia Postei: un „avizat" urmat de
   „in_curs" intre doua treceri s-ar fi pierdut). Pagina publica de urmarire merge direct cu AWB-ul:
   `https://app.curiera.ro/cscourier/Main?tracking=true&appcont=4416&awbno=<AWB>` (verificat).

7. **Checkoutul**: Curiera se vinde NUMAI cand e configurata complet (`curieraGata`), si la adresa, si
   la punct; altfel iese din lista si plasa de 25 s n-o repune. Punctul nu se ofera peste 30 kg
   (`FANBOX_MAX_WEIGHT_KG`, aceleasi dulapuri FANbox ca la FAN; limitele pudo si ale oficiilor lor nu
   sunt publicate). Filtrul pe oras pliaza acum si cratima: „Piatra Neamț" gaseste „Piatra-Neamt"
   (inainte: zero puncte la Piatra Neamt, Cluj Napoca, Miercurea Ciuc).

---

## Proba cap-coada, pe baza demo si pe contul de test (29.09.2026)

Prin aplicatia locala (magazinul de proba `floraria-mirei`), nu prin scripturi:

| pas | ce s-a vazut |
| --- | --- |
| Integrari | cardul Curiera dupa Poșta Română, fara lacat |
| Configurare | cheia salvata nu ajunge in pagina (doar inlocuitorul, `new-password`); „Testeaza conexiunea" cu campul gol foloseste cheia salvata: „Conectat la Curiera · Cont client: CLIENT TEST INOVEX.RO"; serviciile devin liste citite de la ei; salvarea pastreaza cheia |
| Setari > Livrare | Curiera integrata, doar „Pret" fix, 17 lei implicit |
| Checkout | „Livrare prin Curiera" si „Curiera: locker sau punct de ridicare"; pentru „Sector 3" lista aduce lockerele FANbox din Bucuresti, cu „Non-stop"; comanda #0001 poarta `locker_id: "16478"` (sir) si orasul/judetul/codul postal ale punctului, din fisa semnata |
| Emitere (actiunea reala) | AWB 710916391 la locker: nume ASCII, serviciul 443, ramburs 166,90, referinta `EDN-C4CC-0001`; a doua apasare refuzata |
| Eticheta | PDF valid, ~120 KB, `AWB-Curiera-710916391.pdf` |
| Urmarire | cronul: 1 verificat, comanda mutata `pending -> processing` (neridicat); fara secret, 401 |
| Anulare | anulat la Curiera, toate coloanele golite, registrul `anulat`; reemiterea da un AWB nou (710916500, doua colete de 1,25 kg, rambursul doar pe primul), anulat si el |

⚠ Fereastra AWB n-a putut fi apasata in browser: fila de automatizare era ascunsa, iar React 19 nu
dezvaluie continutul transmis in flux intr-o fila ascunsa. Actiunile s-au chemat cu protocolul Next,
din pagina, cu sesiunea contului de proba, exact cum le cheama fereastra.

## Recenzia de dupa cablare (6 recenzenti, 25 de constatari, verificate de mana)

Reparate: lamurirea dupa referinta lega o CIORNA REFUZATA (raman in `get_shipments` cu `errors`) si
pierdea starea de ciorna; motive langa o expediere care nu e ciorna devin „nu stim"; `deja` pe un AWB
anulat la Curiera elibereaza slotul in loc sa-l readopte; lotul arata avertismentele (ciorna); sectorul
depozitului din Bucuresti intra in `from_address`; checkoutul gated pe `curieraGata`; greutatea la punct;
cratima in filtrul pe oras; eticheta cu nume de zona („(locker sau punct)"); in cron, termenul verificat
inaintea FIECAREI comenzi (o felie de AWB-uri proaspete cu facturi trecea de 60 s), istoricul cerut si
la o clipa noua a aceleiasi chei (a doua livrare esuata cu acelasi motiv), istoricul picat nu mai scrie
cheia, `CodeChanged` fara stare o mosteneste, alarmele de cheie si de AWB necunoscut de la primul (un
magazin mic tacea mereu), mesajul de anulare neutru; in panou, anularea refuzata e avertisment (nu verde,
nu „expediaza cu alt curier"), lista de servicii picata nu mai e „contul nu are", serviciile extra se pot
pune si pe un singur AWB, „oficiu FAN". Registrul productiei: migratia 68.

Lasat: editorul regulilor de transport (`ShippingRulesEditor`, `COURIER_OPTIONS`) nu tinteste Curiera,
si nici pe ceilalti 11 curieri noi; e o hotarare pentru toti, nu pentru unul.

## A doua verificare, inainte de productie (3 recenzenti, 17 constatari)

Doua erau ordinea livrarii (migratia 68 INAINTEA codului, schema de referinta regenerata in acelasi
push), deci chiar planul. Restul, reparate: ⚠⚠ „Deconecteaza" lasa zona pornita, iar la un magazin care
avea NUMAI Curiera checkoutul ramanea fara nicio livrare si comanda nu se mai putea plasa (acum
deconectarea stinge si zona); o stare FINALA cu istoricul picat nu se mai amana (comanda iesea din coada
cu cardul pe „In curs de livrare"); un `StatusChanged` necunoscut nu mai mosteneste problema de dinainte,
iar un cod din aceeasi clipa cu iesirea din avizat ia starea noua; un refuz determinist alarmeaza de la
primul; dupa „forbidden", o citire picata a starii e „nu stim" (numarul ramane pe comanda); la locker
FANbox, un singur colet de cel mult 30 kg si la emitere (fereastra si lot); fereastra nu mai ofera
servicii extra cablate din contul de test; notificarea duce la pagina lor de urmarire; textele (de unde
vine cheia, serviciul gresit, ce pierzi la deconectare, statusul mutat de urmarire, butonul din refuzul
portii) spun ce face codul. Productia a fost verificata inainte doar citind: corpul lui
`cont_comanda_mea` identic cu cel din migratie fara randul Curiera (md5), migratia aplicata intr-o
tranzactie ANULATA a trecut fara exceptie.

## In productie, 29.09.2026

Migratia 68 a fost aplicata pe `rtefdpioqmowkdiybwrr` la 10:02 UTC, INAINTEA codului. Au urmat
verificarile. Pe `orders` sunt 8 coloane `curiera_*`, iar `curiera_config` apare in vedere si in
declansator. Secretul e trecut. Indexul exista. Registrul are 'curiera' si pastreaza 'emag'.
`cont_comanda_mea` nu e deschisa lui `anon`/`authenticated`. Drepturile pe coloane sunt identice cu
GLS. Nu exista niciun AWB si nicio configurare. Jurnalul bazei nu arata nicio eroare „does not
exist".

Schema de referinta a fost regenerata din productie. Diferenta e exact migratia, iar `--check` iese
egal. `tipuri-db --check` arata 0 fantome, `verifica:coloane` 408/408, iar suita 10315/10315.
Commitul a mers in acelasi push cu codul (`6d76019d`, `6bafedd8`, `55466597`).
CI-ul pe `55466597` a trecut toate cele 4 verificari: restaurarea pe o baza goala, Git = productie,
tipurile, apoi teste si build. Deploy-ul `dpl_TLdJF5cJ3JWeWVyZD8iUHNXu3RgU` e READY pe edinio.com si
pe domeniile magazinelor. Proba pe productie: `/api/cron/curiera-tracking` raspunde 401 fara
secret, pe ruta lui (`x-matched-path`), iar catalogul `/integrari` arata Curiera la Curieri. In
primele minute, paginile care citesc coloanele noi (comenzi, pagina comenzii, Setari) si vitrinele au
avut 0 raspunsuri 5xx si 0 erori in jurnal.

## Dupa prima conectare in productie, 29.09.2026

Primul comerciant (el, cu contul de test) a apasat „Testeaza conexiunea”, a dat refresh si a pierdut
tot. Din acelasi motiv nu vedea butonul de AWB la comenzi: in productie nu era salvata nicio
configurare Curiera. Proba nu salveaza, intentionat si la fel ca la ceilalti 17. Asta ramane.
S-au adaugat doua lucruri:

- dupa o proba reusita, fara nimic salvat, pagina spune ca nu e salvat nimic si ce lipseste;
- adresa de ridicare vine precompletata din datele magazinului, cat timp nu e salvata niciuna
  (`src/lib/curiera/precompletare.ts`, regula casei `adresaPublica`). De la Curiera nu vine nimic:
  `test_connection` da doar numele, iar `list_addresses` a intors o lista GOALA pe contul de test,
  deci forma unui rand nu e cunoscuta si nu se citeste.

Tot atunci el a cerut butonul de AWB direct in lista „Comenzi”, fara intrat in fiecare comanda.
Curiera nu avea coloana acolo, desi o aveau cei 9 curieri mai vechi. Acum are coloana „AWB Curiera”:
pe fiecare rand e fie „Creeaza AWB”, trecut prin aceeasi garda ca ceilalti, fie numarul AWB-ului,
care redeschide fereastra pentru eticheta. Optiunile ferestrei vin din `optiuniAwbCuriera`, aceeasi
functie pe care o foloseste si pagina comenzii. Recensamantul butoanelor pazite a urcat de la 9 la
10; cu garda scoasa de pe butonul Curiera, pica. Emiterea pe lot (bifezi si apesi „Genereaza AWB”)
exista deja si il includea pe Curiera.

Probat pe serverul local legat de baza demo, prin ruta reala. Casa Lumen, fara Curiera, vine cu
numele, telefonul, emailul, adresa, orasul si „Municipiul Bucuresti”. Floraria Mirei, cu Curiera
salvat, isi pastreaza valorile, fara nota.

---

## Ce ramane deschis, si de ce

- **Cotarea live**, pana cand Curiera pune un tarif pe contul de test: atunci se afla ce e `price`,
  `total`, `zone_price`, `cod_total_price`, si se leaga cu regimul de TVA al magazinului.
- **Webhookul `awb_event_handler`** (evenimente cu intarziere de maxim 60 s): nesemnat, deci ar cere
  semnatura in adresa, iar cronul ramane oricum plasa. Nevazut pe fir.
- **`create_return`** (retur tardiv) si **`order_pickup`** (chemarea curierului): cheia de test nu are
  `create_retur`; ridicarea urmeaza setarea contului (`pickup_requested` necompletat = implicitul lor).
- **Starea `livrat` la FANbox**: nu stim daca se pune la depunerea in locker sau la ridicare (la GLS
  conta pentru ramburs). Se afla din primul colet real.
- **Rambursul dupa plata online**: `update_shipment` accepta doar `cnt`, `client`, `sender_id`,
  `recipient_id`, deci suma de ramburs nu se poate stinge dupa emitere (GLS are `ModifyCOD`).
- **Adresa de ridicare din contul Curiera** (`list_addresses`): de citit abia dupa ce vedem un rand
  real, de pe un cont care are adrese definite la ei.
- **Codurile de motiv** sunt text liber pe cont (26 pe contul de test). Nu misca nimic; apar in
  descrierea starii.

## Nota, cinstit

Nescrisa inca: integrarea e in productie din 29.09.2026, dar n-a emis niciun AWB real. Se noteaza dupa prima trecere cu trafic
adevarat, ca la ceilalti saptesprezece.

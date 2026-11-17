# SAGA Web: evidenta integrarii

> **Ce e fisierul asta.** Evidenta integrarii, tinuta la zi ODATA CU codul: ce stim despre API si de
> unde, hotararile si de ce, securitatea, ce e legat in platforma si ce asteapta inca dovada pe fir.

**Ce face.** SAGA e programul de CONTABILITATE al comerciantului, nu o casa de facturare. Trimitem in
SAGA documentele DEJA emise de casa magazinului (SmartBill, Oblio, fGO, Facturis, Factureaza.ro, easybill):
factura vie a comenzii si stornarea ei, ca acelasi document sa nu mai fie introdus de mana de contabil.

**Cod:** `src/lib/saga/` (`config.ts` regula „gata" si tipurile, `document-sursa.ts` documentele celor
sase case si ziua lor, `reguli.ts` hotararile pure (garda de reemitere, planul cronului, textele),
`xml.ts` compunerea pura, `client.ts` firul, `jurnal.ts` jurnalul trimiterilor, `server.ts` lacatul,
cheia rotita, exportul, garda `sagaPermiteReemiterea` si starea panoului), `src/lib/actions/saga.actions.ts`,
`src/app/api/cron/saga-export/route.ts`, `src/components/dashboard/SagaConfigClient.tsx`,
`src/components/dashboard/saga/SagaComandaPanel.tsx`, pagina `dashboard/features/saga`.
**Baza:** `docs/facturare/2027-02-06-factureaza-easybill-saga.sql` (migratia comuna a celor trei;
se aplica INAINTE de deploy, dupa `2027-02-05-facturis.sql`).
**Probe:** `src/lib/saga/*.test.ts` (198; `server.test.ts` pe purtare, cu baza si firul false; `legat.test.ts`
pe sursa, pentru ruta, actiuni si panou). Banc de mutanti cu SHA-1: 88 de mutanti, la reparatiile din 17-18.11.

---

## Sursele, in ordinea increderii

1. **Documentatia lor**: https://web.sagasoft.ro/DocumentatieAPI (descarcata si citita integral pe
   17.11.2026: importul, cele cinci citiri, schemele XML Facturi, Comenzi, Incasari, Plati, NC, Clienti,
   Articole).
2. **Manualul SAGA C**, „Import date" (manual.sagasoft.ro, topic 76): aceleasi scheme, fara formate.
3. **Modulul Odoo `deltatech_saga`** (pagina lui din magazinul Odoo, singurul integrator public al
   acestui API): formatul implicit al datei in XML (`%d-%m-%Y`), „Send to SAGA" fisier cu fisier, si
   avertismentul ca **o retrimitere dubleaza facturile in SAGA**.
4. **Masuratori pe fir** (17.11.2026, numai citiri, cu chei vadit inventate; vezi mai jos).

## Ce stim despre API

| | |
| --- | --- |
| Import | `POST https://web.sagasoft.ro/api/v20260225/Import`, multipart: `file` + `importAutomat` (`true`/`false`, implicit `false`) |
| Coduri la import | 200 integral · 207 partial sau cu avertismente (corp: raportul, fisier text) · 422 esuat (raportul) · 400 cerere eronata |
| Corp la 200 | JSON `{success, message}` in exemple (C# il citeste cu majuscule, PHP/Python cu litere mici) |
| Fara import automat | fisierul ramane in SAGA Web la „Diverse, Import date"; contabilul finalizeaza |
| Acces | `Authorization: Bearer <cheie>` + `X-Saga-Cod-Fiscal` la FIECARE cerere |
| Cheia | generata din „Utilizatori, Integrare API, Genereaza cheie de acces", doar de un Admin |
| ⚠ Rotatia | „in anumite situatii" raspunsul aduce `X-Saga-Refresh-Token`: cheia NOUA, de salvat si folosit la apelul urmator, „in caz contrar, cheia de acces va fi blocata" |
| Citiri | `Situatii/GetStocArticol`, `GetSituatieStocuri`, `GetSoldCont`, `GetBalanta`, `GetArticol`; datele strict `dd.MM.yyyy` |
| Fisierul de facturi | `F_<cod-fiscal>_<numar-factura>_<data-factura>.xml`; mai multe facturi = mai multe `<Factura>` |
| Iesiri / Intrari | `<FurnizorCIF>` = codul firmei → „Iesiri"; altfel „Intrari" |

**Masurat pe fir, 17.11.2026** (chei inventate, numai `GET`, nimic trimis la import):

| cerere | raspuns |
| --- | --- |
| fara `Authorization` | `500`, corp gol |
| orice cheie inventata (si in forma de JWT), cu sau fara cod fiscal | `400`, `text/plain`, „A aparut o eroare. Reincercati mai tarziu." |

Deci refuzul cheii NU e 401 si NU e JSON, iar mesajul lor nu spune ce e gresit. Raspunsurile brute
sunt fixturi in `client.test.ts`.

---

## Hotarari, si de ce

### ⚠ Cheia rotita si concurenta: un LACAT pe magazin, si scrierea conditionata a cheii
Doua apeluri simultane pe acelasi magazin (cronul si un buton, doua file) ar pleca amandoua cu cheia K1;
primul primeste K2, al doilea foloseste o cheie deja veche si o poate bloca. O cheie blocata se reface
numai de mana, de un Admin din SAGA. De aceea:
* **lacat cu termen** in baza (`privat.saga_apel_in_curs`, `saga_ocupa_apelul` / `saga_elibereaza_apelul`):
  se ia INAINTE de citirea cheii, se elibereaza DUPA scrierea celei noi. Termen 120 s (importul are 30),
  ca un proces taiat de platforma sa nu tina lacatul pe veci. Nu `pg_advisory_lock`: prin PostgREST un
  lacat de sesiune nu tine intre doua cereri HTTP. Nu doar „reincercare optimista": nu stim ce face SAGA
  cu o cheie veche folosita dupa rotatie;
* **cheia noua se scrie inainte de orice alt pas**, chiar inaintea citirii corpului (proba o cere), pe
  ORICE raspuns, si refuzurile; in sesiune se trece pe ea chiar daca scrierea pica;
* **scrierea e atomica si conditionata** (`saga_roteste_cheia`): pune cheia noua numai daca baza tine
  inca cheia cu care a plecat apelul. Daca omul a salvat intre timp alta cheie, a lui castiga. Atinge
  doar `api_key`, nu rescrie tot JSON-ul;
* **salvarea configurarii se face si ea sub lacat**: altfel ar fi putut pune la loc o cheie veche;
* butonul asteapta lacatul 20 s; cronul nu asteapta (magazinul ocupat ramane pe trecerea urmatoare).

### „Testează conexiunea" nu probeaza o cheie NOUA
O proba fara salvare n-ar avea unde pastra cheia rotita: cheia tastata ar muri chiar la proba. Butonul
probeaza cheia SALVATA (cu codul fiscal din formular); cheia noua se probeaza la „Salvează", care o si
pastreaza. Proba e o citire fara efect (`GetSoldCont`, contul 5311), autentificata, si se citeste PE
DOS: esec numai la refuzul de acces (400/401/403); orice 200 inseamna ca accesul a trecut. Soldul citit
nu se pastreaza nicaieri. Salvarea probeaza numai cand e ce proba (cheie noua, cod fiscal schimbat,
integrare inactiva): o cheie moarta nu are voie sa-l impiedice pe om sa OPREASCA trimiterea automata.

### Ce pleaca
* **Documentele de la TOATE casele**, pe perechi: fiecare factura, apoi stornarea ei. O comanda stornata
  la o casa si refacturata la alta are trei documente de trimis, nu unul. Doua facturi nestornate la doua
  case pleaca amandoua (sunt emise), cu avertisment. La Facturis, Factureaza.ro si easybill cheia spune
  ca exista, dar documentul pleaca abia cand numarul s-a citit.
* **Nu pleaca:** documentele de test (fGO pe `testuat.fgo.ro`, Factureaza.ro cu cheia `test:`), stornarea
  SmartBill care poarta, ca rezerva, numarul facturii stornate (ar dubla numarul in SAGA), comenzile in
  alta moneda (casele emit de aici doar in lei), documentele fara data cunoscuta, tara de nerecunoscut.
* **Data documentului** vine din registrul de operatii externe, din randul `reusit` al CHIAR acelui
  document (potrivit dupa referinta): intai `detalii.data` (contractul C1, „YYYY-MM-DD", scrisa de casa la
  emitere si la adoptare); altfel ziua randului, in UTC la SmartBill si Oblio (ele isi dateaza documentele
  cu `toISOString()`, deci noaptea, intre 00:00 si 03:00 la noi, ziua lor e ieri) si in ora Romaniei la
  celelalte. ⚠ Fara randul documentului NU se ia randul cel mai nou al casei: documentul ramane
  „nepregatit" si se spune de ce. O data ghicita muta vanzarea in alta perioada fiscala.
* **O cheie pe document** in registru: `export:saga:<factura|storno>:<casa>:<serie>#<numar>`. Acelasi
  document nu intra de doua ori; un raspuns pierdut blocheaza in loc sa dubleze.
* **Stornarea asteapta factura ei**: daca factura tocmai n-a intrat, stornarea nu pleaca in locul ei.
  ⚠ Exceptie, numai pe calea omului: factura NELAMURITA de la o trimitere trecuta nu tine stornarea
  (registrul o blocheaza, iar deblocarea ar retrimite-o, adica ar dubla-o daca a intrat). Omul afla ca
  stornarea a plecat peste o factura nelamurita. Cronul tot asteapta.
* **Stornarea trebuie sa anuleze exact factura plecata**: alt total decat al facturii din jurnal (si cand
  factura e doar nelamurita) inseamna „nepregatit", nu o diferenta tacuta in contabilitate.

### ⚠⚠ Garda de reemitere (contractul C2)
```ts
export async function sagaPermiteReemiterea(admin: SupabaseClient<Database>, businessId: string, orderId: string): Promise<{ ok: true } | { ok: false; mesaj: string }>
```
La refacturarea dupa storno, casa scrie factura noua peste cea veche si STERGE stornarea de pe comanda.
Daca factura veche e in SAGA si stornarea ei nu, stornarea nu mai e nicaieri: in SAGA venitul e dublat.
Fiecare casa cheama garda in emiterea manuala cand refactureaza dupa storno, inaintea registrului.
* **DA:** SAGA neconectat; factura comenzii n-a intrat in SAGA; stornarea ei a intrat.
* **NU:** factura e in SAGA (intrata sau `necunoscut`), iar stornarea ei poate pleca si n-a plecat
  (netrimisa, refuzata la acces, numar necitit). Mesajul numeste miscarea care dezleaga: „Stornarea
  facturii X n-a plecat încă în SAGA. Trimite-o din panoul SAGA al comenzii, apoi emite factura nouă.”
* ⚠ **Garda nu e niciodata o fundatura**, deci trec si: `trimite_stornari` oprit (le introduce
  contabilul); stornarea care nu POATE pleca (numarul de rezerva SmartBill); stornarea lasata omului
  (`necunoscut`: poate a intrat; `respins`, `nepregatit`: se introduce de mana); perechile fara stornare
  (reemiterea la o casa nu atinge facturile vii ale altei case). Pe toate le prinde plasa de mai jos.
* **Citirea picata = NU** (cu mesaj). Nu arunca niciodata; cel mult trei citiri (configurarea, comanda,
  jurnalul comenzii).

### Plasa: factura inlocuita fara stornare in SAGA
`facturiInlocuiteFaraStornare`: facturi plecate in SAGA (intrate sau nelamurite) care nu mai sunt pe
comanda, la o casa unde registrul are o stornare reusita, fara tot atatea stornari vechi intrate. Panoul o
spune MEREU; trimiterea manuala o pune in avertismente; cronul o semnaleaza O DATA, la prima incercare a
documentului care a inlocuit-o. Textul spune „nu apare intrata", nu „n-a ajuns": poate fi nelamurita sau
introdusa de contabil.

### Verdictele
| SAGA | jurnal | registru |
| --- | --- | --- |
| 200 | `importat` (cu import automat) / `incarcat` (asteapta contabilul) | reusit |
| 200 cu `success:false` | `respins` | esuat |
| 207 | `avertismente` (raportul pastrat) | **reusit**: a intrat ceva, retrimis s-ar dubla |
| 422 | `respins` (raportul pastrat) | esuat |
| 400 cu motiv JSON, 401/403/404/429 | `refuzat` | esuat |
| ⚠ 400 FARA motiv (textul generic, masurat) | pe loc, sub acelasi lacat, o citire (`GetSoldCont`) cu aceeasi cheie: refuzata → `refuzat` (accesul, dovedit); trece sau nu raspunde → `necunoscut` | esuat / necunoscut |
| 5xx, 3xx, 408, 2xx nedocumentat, retea, termen | `necunoscut` | necunoscut (blocheaza, omul verifica) |

⚠ In registru (`ultima_eroare`) intra numai starea si codul („Trimiterea în SAGA: respins de SAGA (cod
422)..."), NU textul SAGA: raportul poate numi clientul, iar registrul il citesc si paginile platformei.
Textul intreg sta in jurnalul magazinului si in mesajul dat omului. Sfatul la „nelamurit" urmeaza
importul automat al trimiterii: cu el, „la Ieșiri"; fara, „Diverse, Import date".

Un fisier = un document: un 207 pe un fisier cu mai multe facturi n-ar spune CARE au intrat.
`redirect: "manual"`: un POST redirectionat ar fi devenit GET, iar un 200 de acolo ar fi parut import.
Raportul se decodeaza dupa setul declarat, altfel UTF-8 strict, altfel windows-1250.

### Importul automat: ales de om, implicit OPRIT
Implicit fisierele raman la contabil („Diverse, Import date"), care le verifica. Cu importul automat,
SAGA importa pe loc si raspunde cu raportul (vazut in pagina comenzii).

### Liniile XML: cifrele facturii emise
Din comanda, cu regulile comune (`invoiceVat`, `planulCotelor`, `codSiNatura`, `reconciliazaComanda`,
`invoiceParty`, `liniaAdresei`): cota pe linie, transportul si reducerile impartite pe cote, garda de
total si linia „Ajustare rotunjire". In SAGA linia poarta pretul FARA TVA (4 zecimale), valoarea fara
TVA si TVA-ul; la preturi cu TVA ele se scot din totalul liniei, deci suma lor e chiar `orders.total`.
Reducerile: cantitate -1, pret pozitiv. Stornarea: aceleasi linii cu cantitati, valori si TVA cu minus.
Codul articolului = SKU (`CodArticolClient`), numai pe marfa; gestiunea, numai pe marfa si numai daca e
configurata. Campurile nemarcate „Optional" pleaca mereu (chiar goale); telefonul si emailul clientului
pleaca GOALE (nu-i trebuie contabilitatii).
* ⚠ **TVA-ul casei care a emis**: SmartBill si Oblio emit FARA TVA cand numele cotei e gol la ele
  (`!!tax_name`, `!!vat_name`, exact testul lor). Acelasi steag ajunge in `invoiceVat`, altfel documentul
  din SAGA ar fi avut TVA, iar cel emis nu. Din configurarile lor se citesc DOAR numele cotei si `enabled`
  (semn ca exista), prin `->>`: tokenurile lor n-au ce cauta in exportul SAGA. Configurarea lipsa (casa
  deconectata) ramane „cu TVA", regula magazinului.
* **Tara** pleaca drept cod ISO: „Romania", „România", „ro" → „RO"; gol → „RO". Un nume de nerecunoscut
  NU pleaca ghicit (tara schimba regimul de TVA): documentul ramane „nepregatit", cu motivul.
* **Judetul** pleaca drept cod („CJ", „B"), numai in Romania. Unul de nerecunoscut sau lipsa NU pleaca gol
  tacut: documentul pleaca (e emis), cu avertisment care numeste judetul primit.
* Liniile care nu dau totalul comenzii au mesajul lor („nu pleacă în SAGA ... Introdu-l în SAGA după
  documentul emis"), nu pe al emiterii, care ar fi trimis omul sa emita o factura care exista.

### Clientii
Firma: codul fiscal cu „RO" la platitor, Reg. Com., si un `GUID_cod_client` din codul ei fiscal (acelasi
partener la fiecare comanda). Persoana fizica: numele si adresa, fara CNP inventat; sau, la alegere, un
singur client generic, FARA adresa nimanui (SAGA nu mai creeaza cate un partener pe cumparator).

### Trimiterea automata (cron `7,37 * * * *`)
Numai documentele emise prin Edinio DUPA pornire (`trimitere_automata_de_la`), din ultimele 10 zile:
cele vechi le-a introdus probabil contabilul. ⚠ Fereastra nu e tacuta: panoul comenzii spune, pe document,
ca nu mai pleaca singur (emis inainte de pornire sau acum peste 10 zile) si ca se trimite de acolo.
* Nu reia ce cere un om (respins, nelamurit, nepregatit); refuzurile de acces le reia de cel mult 3 ori.
* ⚠ Daca ultima incercare a magazinului a fost refuzata SAU nelamurita, intai o proba de conexiune; fara
  200, magazinul se sare (o pana SAGA ar fi lasat cate un document nou „nelamurit" pe trecere).
* Stornarea unei facturi de dinainte de pornire pleaca singura (a introdus-o contabilul): emiterea
  facturii se citeste FARA fereastra, altfel regula nu s-ar fi aplicat niciodata.
* ⚠ Termenul trecerii se verifica inaintea FIECARUI document, nu a comenzii (o comanda poate avea patru):
  rezerva de 60 s acopera importul (30 s) si proba de dupa un 400 (15 s).
* Rotatie pe magazine, plafon de 20 de magazine, 10 comenzi pe magazin si 60 de documente pe trecere.
* Omul afla prin clopotel, PE LOC (o trecere taiata nu mai pierde semnalarile stiute), o data pe
  document, fara textul SAGA in jurnalul platformei.

### Lotul din lista comenzilor (C3)
Termenul (200 s din 300) se verifica tot pe document. Oprit de cheie, de SAGA cazut sau ocupat, lotul e
`oprit` si spune DE CE (`motivOprire`: doar motivul, lista il pune dupa „Lotul s-a oprit:"); fara motiv,
lista spune timpul. Avertismentele (total rotunjit, judet, stornare peste factura nelamurita, facturi
inlocuite) pleaca in `avertismente`, cate unul pe comanda, nu printre erori.

---

## Securitate

* `api_key` criptat in baza (`privat.campuri_secrete`), mascat in browser (`mascheazaConfigSaga`, care
  goleste cheia si inainte ca `CAMPURI_SECRETE` sa stie de SAGA). Configurarea se citeste numai cu cheia
  de serviciu, dupa garda de proprietar. Cheia pleaca doar in antet si in corpul RPC-urilor, niciodata
  in adrese sau jurnale.
* Codul fiscal pleaca intr-un antet: forma stricta (`(RO)?\d{2,10}`), deci nicio injectie de antet.
* Modulele cu chei sunt `server-only` si NU „use server"; actiunile isi verifica proprietarul; cronul are
  `verificaCron` inaintea bazei.
* Jurnalul (`saga_exporturi`): RLS, comerciantul citeste ce e al lui, scrie numai serverul; fara XML si
  fara date personale in plus; raportul taiat la 4000 de caractere. Pastrare: 24 de luni (cronul
  `saga-export` sterge ce a imbatranit). ⚠ La comanda stearsa (`order_id` devine gol), cronul goleste
  raportul si mesajul randului (pot numi clientul); randul ramane, ca urma a trimiterii.
* Registrul de operatii primeste numai starea si codul trimiterii, nu textul SAGA (vezi Verdictele).
* Salvarea si deconectarea cer randul scris inapoi (`.select()`): zero randuri nu e succes.

## Ce trebuie legat (coordonatorul)

Legat (17.11): `CAMPURI_SECRETE.saga_config`, sigla, cardul Integrari, panoul din pagina comenzii, lotul,
cronul in `vercel.json`, tipurile `saga_exporturi` si cele trei functii, indexul `saga_exporturi_creat_la_idx`.
Ramas:
* **Casele** cheama `sagaPermiteReemiterea` in refacturarea manuala dupa storno (inaintea registrului) si
  scriu `detalii.data` pe randul `reusit` al facturii si al stornarii (C1), si la adoptare.
* Propunere: index partial pentru golirea rapoartelor comenzilor sterse,
  `on saga_exporturi (id) where order_id is null and (raport is not null or mesaj is not null)`: fara el,
  golirea citeste tabela intreaga la fiecare trecere.

## Lasat dinadins

* **Incasarile** (`I_<data>.xml`): in SAGA incasarile vin de obicei din extrasele de cont; trimise si de
  aici, s-ar dubla. Cer si un cont de trezorerie ales de contabil si data reala a platii.
* **Comenzi, Articole, Clienti, NC**: alta lucrare. **Citirile de stoc**: alta lucrare.
* **Liniile exacte de la casa** (`citesteFactura` la Facturis): propunere; azi se recompun din comanda cu
  aceleasi reguli comune, iar stornarea se verifica fata de totalul facturii trimise.

## ⚠ CE ASTEAPTA DOVADA PE FIR (prima trimitere reala)

1. **Formatul datei** in XML (ales `DD-MM-YYYY` dupa integratorul Odoo; un singur loc: `dataSaga`).
2. **`<Pret>` fara TVA** si numerele cu punct zecimal.
3. **`<FacturaNumar>`** cu seria lipita („EDN0001") si acceptarea lui `GUID_factura` / `GUID_cod_client`.
4. **Corpul la 200** (JSON `{success, message}`?) si cat de des vine `X-Saga-Refresh-Token`.
5. **207 pe un singur document**: a intrat documentul? (azi: da, deci nu se retrimite).
6. Elementele goale, `ClientCIF` gol la persoana fizica, diacriticele (ș, ț cu virgula).

## De intrebat SAGA, in scris

* Ce face SAGA cu o cheie veche folosita DUPA ce a trimis una noua (blocare pe loc? toleranta?).
* Daca `GUID_factura` deduplica (o retrimitere ar fi recunoscuta) si formatul cerut.
* Formatul datelor si al numerelor in XML; numele fisierului e citit sau doar informativ?

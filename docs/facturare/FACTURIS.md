# Facturis Online: evidenta integrarii

> **Ce e fisierul asta.** Evidenta integrarii, tinuta la zi ODATA CU codul, in acelasi commit:
> securitate, functionalitate, compatibilitate cu platforma, conformitate cu documentatia lor, si ce
> asteapta inca dovada pe fir. A patra casa de facturare, dupa SmartBill, Oblio si fGO.

**Cod:** `src/lib/facturis/` (`config.ts` regula „gata", `client.ts` firul, `document.ts` compunerea
pura, `server.ts` citirea configurarii), `src/lib/actions/facturis.actions.ts`,
`src/components/dashboard/FacturisConfigClient.tsx`, `src/app/api/facturis/pdf/route.ts`, plus regulile
comune din `src/lib/billing/*`.
**Migratia:** `docs/facturare/2027-02-05-facturis.sql` (aplicata pe DEMO; se muta in `migrations/` cand
intra in productie).
**Probe:** `src/lib/facturis/*.test.ts`.

---

## Sursele, in ordinea increderii

1. **Documentatia lor, API v2.0**: https://facturis-online.ro/apidoc/ (descarcata pe 17.11.2026, 36 de
   capete: Produse, Clienti, Avize, Bonuri, Chitante, Facturi, Proforme, Incasari, Facturi furnizori,
   NIR, Stoc, Fisa produs).
2. **Modulul lor oficial de WordPress**, `facturis-online-sync` 2.0.5 (de pe wordpress.org, citit
   integral). Arata forma reala a cererii si cateva campuri pe care documentatia nu le are.
3. **Ghidul easySales de conectare** (care integreaza Facturis): de unde se ia cheia, si **mesajele de
   eroare reale**, pe care documentatia nu le listeaza.

## Ce stim despre API

| | |
| --- | --- |
| Capat | `POST https://api.facturis-online.ro/api/`, un singur camp de formular: `json` |
| Autentificare | in CORPUL cererii: `APIkey`, `u` (utilizator), `p` (parola), `c` (cod fiscal firma) |
| Reusita | `{"success": 2000, "result": ...}` (2000 numar in documentatie, comparat ca sir in modulul lor) |
| Refuz | `{"error": <cod>, "result": "<mesaj>"}` |
| Coduri stiute | 1005 camp obligatoriu, 1112 client existent, 1115 email invalid, 5005 „Nu exista rezultate" |
| Emitere factura | `Facturi` / `Ins` cu `dataFact` + `dataProd[]` → intoarce DOAR id-ul (`result.id`) |
| Citire factura | `Facturi` / `Get`, filtru `facturi_key` → seria, numarul, totalul, clientul, liniile |
| PDF | `FacturiHtml` / `Facturi`, `id_fact` → octetii PDF-ului (nu JSON) |
| Stare | `Facturi` / `ChangeStatus`: Emisa · Platita · Partial Platita · Anulata |
| Incasare | `RegistruIncasari` / `Ins`, cu `fk_clienti_key` si `idFacturi` (imperechere cu factura) |

**Mesaje reale (ghidul easySales):** „Datele de autentificare sunt gresite", „Cheia API este invalida",
„Pentru activare … activati pachetul Complet++" (API-ul cere un pachet anume), „Seria nu a fost gasita!
Folositi o serie creata in contul de cloud.", „Campul 'Serie' este obligatoriu." (deci seria e
obligatorie, desi documentatia o da optionala), „Nu aveti permisiuni pentru operatia solicitata".

**Cheia:** Setari > Integrari > API > „Genereaza Cheia", cu utilizatorul administrator. Campul „Ip
Acces" trebuie lasat GOL: Vercel n-are o adresa de iesire fixa.

---

## Hotarari, si de ce

### Cererea se CODEAZA
Exemplul lor PHP lipeste JSON-ul necodat (`"json=" . json_encode(...)`), iar modulul lor sterge din
toate textele `%`, `&`, `'` si `"` tocmai ca sa nu-si rupa singur cererea. Noi codam campul ca exemplul
lor `curl --data-urlencode`, deci textele pleaca intregi (o firma „Tom & Jerry SRL" ramane asa).

### Acreditarile stau in corp, nu in adresa
Titlul documentatiei arata `?json={json}` in adresa. Acolo cheia si parola ar fi ajuns in jurnalele
oricarui proxy dintre noi si ei.

### Emiterea intoarce doar id-ul; numarul se CITESTE
Pe comanda se scrie intai CHEIA (`facturis_invoice_key`), apoi seria si numarul, dintr-o citire facuta
imediat (trei incercari). ⚠ Citirea NU arunca niciodata: documentul exista deja, iar o eroare ar fi
trimis omul sa apese din nou. Daca nu raspunde, cardul arata „Citește numărul" (o citire pura).
⚠ De aceea, peste tot unde platforma intreaba „are comanda factura?", la Facturis se intreaba
**cheia**, nu numarul: dispecerul automat, lotul, editarea comenzii, easySales, About You.

### Totalul se verifica de doua ori
Inainte: garda comuna `reconciliazaComanda` (liniile trebuie sa dea `orders.total`, rotunjirea legitima
intra intr-o linie „Ajustare rotunjire"). Dupa: totalul documentului citit de la ei se compara cu cel
trimis; daca difera, documentul s-a emis si se SPUNE (avertisment pe ecran + `facturis.totalDiferit`
in jurnal). Documentatia nu spune cum isi refac ei totalurile, deci verificarea de dupa e plasa.

### Fiecare linie poarta toate cifrele, din acelasi numar
`facturi_prod_pretftva` e obligatoriu; restul (pret cu TVA, valoare, TVA, total) e optional. Le trimitem
pe toate, socotite din acelasi numar, ca sa n-aiba ce sa nu se potriveasca. La preturi cu TVA, totalul
liniei e ce a platit clientul; pretul fara TVA pleaca cu patru zecimale.

### Reducerile: cantitate -1, pret POZITIV
Modulul lor de WordPress trimite reducerile cu pret negativ. Regula europeana BR-27 din e-Factura
interzice pretul net negativ al unui articol; cantitatea negativa e permisa. Factura trebuie sa poata
pleca in SPV.

### Persoana fizica: codul fiscal `0000000000000`
Asa il cere ANAF in e-Factura cand CNP-ul nu se stie (si asa trimite si SmartBill). Fara el, conturile
Facturis cu cod fiscal obligatoriu ar refuza cu 1005.

### Stornarea: o factura cu minus, COPIATA din factura lor
Facturis n-are stornare in API. Ghidul easySales o descrie ca „o factura negativa, in aceeasi serie".
Liniile se copiaza din factura CITITA de la Facturis, nu se recompun din comanda: comanda se poate
schimba dupa facturare, iar stornarea trebuie sa anuleze exact documentul emis. Seria: cea de stornari
din configurare, altfel a facturilor. Factura anulata in Facturis nu se storneaza.
In pagina comenzii stornarea cere a doua apasare („Da, stornează"); din lista nu se poate storna.
Dupa storno comanda e iar facturabila (regula comuna `slotFacturare`), cu „Emite factură nouă".

### Incasarea: optionala, doar platile cu cardul, o singura data
Cu „Marchează factura încasată la plata online cu cardul" pornit, la emitere, daca comanda e DEJA
platita cu cardul (`isCardPaymentMethod`, aceeasi multime ca la SmartBill), se scrie in registrul lor de
incasari o plata „Card", imperecheata cu factura. Sub registrul nostru, cu cheia pe factura: o a doua
inregistrare ar dubla plata in evidenta comerciantului. ⚠ Un esec aici NU strica emiterea: se spune ca
incasarea trebuie marcata de mana.

### Salvarea face proba de conexiune
Daca Facturis raspunde NU (chei gresite, cont fara API), nu se salveaza: altfel integrarea ar fi
„activa" si ar refuza prima factura. Daca Facturis nu raspunde deloc, se salveaza cu avertisment.
⚠ Proba nu foloseste `facturi_key: "0"`: in PHP `empty("0")` e adevarat, deci filtrul s-ar fi putut sari
si proba ar fi adus toate facturile contului. Foloseste o zi in care nu poate exista nimic (01.01.2000).

### Moneda
Ca in dispecerul automat, si pe calea manuala: o comanda in alta moneda nu se factureaza in lei.

---

## Securitate

* `api_key` si `password` sunt criptate in baza (`privat.campuri_secrete`) si mascate in browser
  (`CAMPURI_SECRETE`); numele sunt identice in cod, in migratie si in tip (proba le compara).
* Configurarea se citeste numai cu cheia de serviciu, dupa garda de proprietate (`configurareaMagazinului`).
* PDF-ul trece prin noi (`/api/facturis/pdf`), cu sesiune, poarta MFA si dovada de proprietar; antetul
  `%PDF-` si marimea se verifica inainte sa plece mai departe (la comerciant, la cumparator, la eMAG).
* Emiterea, stornarea si incasarea trec prin registrul de operatii externe: un raspuns pierdut
  blocheaza, nu dubleaza. Verdictele: refuzul lor e `esuat`; legatura rupta, 5xx, raspuns necitibil,
  2000 fara id sunt `necunoscut` pe scrieri.
* Modulele cu chei (`client.ts`, `server.ts`) sunt `server-only` si NU sunt „use server".

## Unde e legata in platforma

Dispecerul automat (a patra, dupa fGO) · facturarea in lot · pagina comenzii (fila Facturis) · lista
comenzilor (coloana Facturis: emitere si PDF) · editarea comenzii si adaugarea de produse (blocate pe o
comanda facturata) · easySales, About You si Posta (citesc factura) · urcarea facturii la eMAG si
Trendyol (PDF-ul prin API) · contul cumparatorului (`privat.cont_documentul_comenzii`) · registrul
(`operatii_externe_furnizor_check`) · pagina Integrari, panoul de admin, ghidurile din Ajutor,
catalogul de pe site. Proba care cade la prima uitare: `facturis-legat-peste-tot.test.ts`.

---

## Lasat dinadins

* **Proformele.** API-ul are `Proforme` / `Ins`, dar NU are o citire a proformelor: n-am putea afla
  numarul documentului emis si nici n-am avea o conversie in factura. O proforma fara numar pe ecran ar
  fi mai rau decat niciuna.
* **Anularea** (`ChangeStatus` → Anulata). Cu e-Factura, o factura trimisa in SPV nu se mai anuleaza,
  se storneaza; un buton de anulare ar fi un act fiscal gresit la indemana.
* **e-Factura.** O trimite Facturis, din contul comerciantului.
* **Sincronizarea de produse si stoc.** Alta lucrare, nu facturare.
* Campurile pe care le trimite modulul lor, dar documentatia nu le are: `unique_id_insert`,
  `facturi_prod_um`, `prod_cod_cautare: "all"`, `idMarketpalce`. Trimitem numai ce e documentat; registrul
  nostru e paza impotriva duplicatului.

## Masurat pe fir, 17.11.2026 (cu chei INVENTATE: nu se creeaza nimic)

| cerere | raspuns |
| --- | --- |
| orice metoda, chei gresite (citire, emitere, PDF) | `200`, `{"error":1004,"result":"Datele de autentificare sunt gresite"}` |
| fara campurile de autentificare | `200`, `{"msg":"Campul este obligatoriu!","cod":1005,"error":"1005","result":{"c":{...},"u":{...},"p":{...}}}` |
| JSON stricat | `200`, `{"error":"2110","result":"The json format is incorrect! "}` |

De aici trei lucruri care nu erau in documentatie: **autentificarea se verifica INAINTEA validarii**
(deci un refuz la emitere chiar inseamna „nimic creat"); **codul vine si ca TEXT** („2110"); **erorile
de validare vin ca OBIECT, cate unul pe camp** (fara ramura pentru el, mesajul ar fi fost JSON brut).
Si PDF-ul cu chei gresite vine JSON, nu PDF: garda `%PDF-` il prinde si mesajul lor ajunge la om.

Rulat apoi CHIAR clientul nostru (nu `curl`) pe acelasi capat: proba de conexiune da `refuz: true` cu
mesajul tradus (deci salvarea se opreste), iar emiterea, citirea si PDF-ul ies cu verdictul `esuat`
(registrul lasa reincercarea libera dupa corectarea cheilor). Raspunsurile brute stau in
`client.test.ts`.

## ⚠ CE ASTEAPTA DOVADA PE FIR

N-avem cont Facturis de proba, deci drumul CU chei bune n-a atins serverul lor. Ce s-a putut dovedi
fara el e in probe (69: clientul, compunerea si legarea in platforma; banc de mutanti 12 din 12).
**Prima factura reala e dovada.** De urmarit atunci:

1. Raspunsul la `Ins`: `result.id` (documentatia) sau `result.id_fact` (modulul lor). Le primim pe amandoua;
   fara niciunul, operatia iese `necunoscut` si omul verifica.
2. Totalul documentului fata de cel trimis (avertismentul `facturis.totalDiferit` in jurnal).
3. Linia de reducere cu cantitate -1: daca o refuza, reducerea trece pe alta forma.
4. Codul `0000000000000` la persoana fizica.
5. Formatul `incasari_data` (DD-MM-YYYY HH:MM:SS, alt format decat la facturi, cum spune documentatia).

## De intrebat Facturis, in scris

* Daca `Facturi` / `Ins` primeste referinta facturii stornate (`facturi_factura_precedenta`, pe care
  `Get` o intoarce), ca stornarea sa poarte BT-25 in e-Factura.
* Daca `unique_id_insert` (trimis de modulul lor) e o cheie de idempotenta.
* Daca exista o citire a proformelor.

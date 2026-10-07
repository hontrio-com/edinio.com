# e-packet

Al nouasprezecelea transportator, cerut pe 07.10.2026. **Broker**: un cont si un credit pentru
DPD (`DPD`), Sameday (`SDY`), Cargus (`CGS`), FAN Courier (`FCR`), Dragon Star (`DSC`) si TCE (`TCE`).

## Sursele

| Ce | Unde |
|---|---|
| Documentatia | `https://app.e-packet.ro/docs/api` (pagina randata pe server, citita integral pe 07.10.2026) |
| Specificatia | `https://app.e-packet.ro/docs/api/openapi.json`, OpenAPI 3.1, v1.0, 6 cai |
| Copia din depozit | `docs/curieri/EPACKET-openapi.json`, sha256 `7f1c3cc0ded5a20f0eabe934637e2a315ff1746ecd443cf75353abbe0a5992db` (o proba cere chiar amprenta) |
| Gazda API | `https://zbdnzolswscjoxhpsbtt.supabase.co/functions/v1/api/v1` (o functie Supabase a lor) |
| Contact (anulari) | contact@e-packet.ro, 0371 236 562, L-V 09:00-17:00 |

⚠ Specificatia are cateva descrieri RUPTE la conversia lor din YAML (`"lei.": null`, `"0": null`):
textul intreg se recompune din bucati, iar pagina HTML le arata tot rupte. Nimic din ce trimitem
nu atarna de ele.

## Cele 6 cai si ce face fiecare la noi

| Cale | La noi |
|---|---|
| `GET /localities` | potrivirea localitatii (`localitati.ts`), proba de conexiune, formularul |
| `GET /lockers` | punctele din checkout si codul postal al localitatii (`puncte.ts`) |
| `POST /quotes` | tarifele din fereastra de AWB (NU checkoutul, vezi mai jos) |
| `POST /awb` | emiterea (`creeazaAwbEpacket`), prin registrul de operatii |
| `GET /label` | eticheta, ceruta la fiecare descarcare (nu se pastreaza) |
| `GET /status` | cronul `epacket-tracking`, dezlegarea, legarea unui AWB existent |

## Ce NU are API-ul, si ce am facut cu asta

1. **Anulare**: „nu este disponibila prin API: contactati-ne". In „Editeaza comanda" butonul e
   „Detaseaza AWB" (`manualOnly`, ca DHL si Packeta): citeste starea, scoate numarul de pe comanda,
   spune cinstit daca ramane viu si platit, si scrie in jurnal.
2. **Idempotenta si cautare**: „fiecare POST /awb creeaza si taxeaza un AWB nou, chiar cu aceeasi
   referinta", iar o lista de AWB-uri nu exista. Un raspuns pierdut ramane `necunoscut` in registru
   si BLOCHEAZA reincercarea. Supapa: fereastra are „AWB-ul exista deja in aplicatia e-packet?"
   (`leagaAwbEpacketAction`): numarul se verifica cu `GET /status`, sa nu fie pe alta comanda, se
   scrie, iar randul din registru se inchide `reusit`. Daca nu exista, omul deblocheaza din pagina
   comenzii (supapa generica a registrului).
3. **Istoric**: `GET /status` da doar starea curenta. Un „avizat" urmat de „in_livrare" intre doua
   treceri ale cronului nu se afla. Ei nu reintreaba curierul mai des de 30 de minute.
4. **Lot de stari**: un AWB pe cerere, 60 de cereri pe minut pe cheie („toate adresele la un loc").

## Masurat pe fir (cheia de test, 07.10.2026)

Fiecare rand de aici a costat o cerere, iar AWB-urile de test sunt in sandboxul DPD/Sameday (nu
pleaca, nu se taxeaza).

### Erorile

- Forma unica, documentata si confirmata: `{error: {code, message, field?}}`, `message` in romana.
- Fara cheie si cu cheie gresita: 401 `invalid_api_key`, la fel pe toate caile si pe metoda gresita.
- 422 `invalid_field` cu `field` pe fiecare camp verificat (lista de mai jos). Nimic nu se creeaza.
- 422 `sandbox_not_supported` pentru CGS cu cheia de test („doar: DPD, SDY").
- ⚠⚠ **502 `courier_refused` cu un mesaj GENERIC** („Verificati adresele, dimensiunile si
  optiunile"): asa a raspuns DPD la un cod postal care nu era al localitatii. Clientul pune in mesaj
  sfatul despre codul postal. Verdict: refuz dovedit.
- `courier_unavailable` (502), `internal_error` (500), alt 5xx si termenul depasit, pe EMITERE:
  `necunoscut` (curierul poate sa fi creat expedierea dupa ce e-packet a renuntat).

### Validarea lor (toate 422, inainte de curier)

| Camp | Regula masurata |
|---|---|
| `first_name`, `last_name` | 3-25 caractere, cel putin o litera („Al", „123" refuzate; 26 refuzat) |
| `phone` | „0712345678, +40712345678 sau un numar de fix"; strain refuzat; spatii/cratime ignorate |
| `email` | obligatoriu (si gol e refuzat) |
| `postcode` | obligatoriu la adresa, exact 6 cifre |
| `street` | obligatoriu, max 50 |
| `number` | obligatoriu, max 10; „FN" si „." primite |
| `block` | max 30 |
| `contents` | obligatoriu, max 50 |
| `reference` | max 100 |
| `courier` | numai majuscule (`dpd` refuzat) |
| `cash_on_delivery` | toate patru campurile; `amount` > 0; IBAN „majuscule si cifre, fara spatii"; titular FARA diacritice |
| `locker_id` | obligatoriu la D2L; un id de alta retea = „Locker necunoscut"; cu `locality_id` sau `street` langa el: refuzat |
| colet | greutate 0,1-100; dimensiuni OBLIGATORII 1-300 la colet |
| plic | DPD max 0,5 kg; plicul cu dimensiuni e PRIMIT (desi scrie „doar cu greutatea") |
| DPD | 31,5 kg pe colet, cel mult 10 colete, deschidere doar cu ramburs |
| Toti | sambata doar la Cargus; asigurare nu peste 32 kg |
| Necunoscute | „Camp necunoscut: foo" (refuza orice camp in plus) |

### ⚠ Neconcordante intre cotare si emitere

- DPD cu `open_package` FARA ramburs: `POST /quotes` a dat oferta disponibila (47,44 lei), iar
  `POST /awb` identic a fost refuzat. Deci `lipsuriExpediereEpacket` cere rambursul la DPD.
- Cheia de test coteaza Sameday absurd: 3.305-4.750 lei pentru 2 kg. DPD plauzibil (40-56 lei).

### ⚠ Diacriticele pe eticheta (pdftotext pe PDF-urile lor)

- Sameday, in ADRESA, **sterge** literele cu diacritice: „Strada Mărășești" -> „Strada Mreti",
  blocul „Ș2" -> „2". Numele si continutul le-au pastrat (UTF-8 corect).
- DPD mascheaza numele destinatarului pe eticheta („ANA**********", „STE**********"): nu e o
  problema de diacritice, e confidentialitatea lor.
- Deci TOT textul pleaca in ASCII (`ascii` din `curiera/expediere.ts`). Cargus, FAN, Dragon Star si
  TCE n-au mediu de test, deci nu s-au putut vedea: regula e una, pe tot.

### Nomenclatoarele

- **Localitati**: 14.179, in 42 de judete, numele FARA diacritice, cand cu majuscule. Satele poarta
  comuna in paranteza („Boureni (Motca)"). Acelasi nume in mai multe judete („Sfantu Gheorghe" in
  4), si de 6 ori de doua-trei ori in ACELASI judet („Salistea" in VL).
- ⚠ **Bucurestiul nu exista**: sunt „Sectorul 1 (Bucuresti)" ... „Sectorul 6", id 14515-14520, si
  „sector 3" nu gaseste nimic (trebuie „Sectorul 3").
- Cautarea prinde SUBSIRURI si in judetul din `display_name` („cluj" in CJ intoarce si
  „Agarbiciu (Cluj)"), deci potrivirea exacta se face la noi.
- **Puncte**: Sameday 7.365 (toate `locker`), DPD 2.524 (1.785 `office`, 739 `locker`), FAN 4.132
  (3.242 `locker`, 890 `paypoint`), Cargus 2.107 (1.939 `office`, 168 `locker`). TOATE au localitate,
  cod postal si coordonate. Id-urile sunt text, FAN cu litere (`F1000142`). DSC/TCE: 422.

### Codul postal

- E-packet il cere; checkoutul nostru nu il cere la comenzile din tara (doar 73 din 600 de comenzi
  reale au un cod de 6 cifre).
- DPD refuza un cod al altei localitati (502), dar a primit si codul oficiului (`400001`), si al unui
  locker de cartier (`400663`) pe aceeasi adresa din Cluj; Sameday primeste chiar `000000`.
- Deci codul se ia: din comanda (sau din linia de adresa), altfel din punctele LOR din localitate
  (oficiile DPD intai, apoi cel mai des). Fereastra spune de unde vine.
- ⚠ In Bucuresti DPD intoarce ACELEASI 172 de puncte pentru fiecare sector, toate cu `010011` (codul
  lui generic pentru oras). Propus pe o adresa din Sectorul 3 („Bd. Theodor Pallady 51"), DPD l-a
  PRIMIT: AWB de test `81382564628`, emis din fereastra, 07.10.2026. Sameday are coduri pe sector
  (271 din 295 de puncte din Sectorul 3 incep cu `03`).

### Emiterea si restul

- 201 cu `awb_number` (numarul curierului real), `price`, `credit_left` (0 pe test), `pickup`.
- `pickup` vine la DPD (cu interval), `null` la Sameday, cum scrie.
- Eticheta: `%PDF-`, `X-Label-Size` A6/A4; fara `size` iese A4; `A5` refuzat (422). La 2 colete DPD:
  o pagina pe colet („1 of 2", „2 of 2").
- Starea: `creat` imediat dupa emitere; AWB necunoscut = 404 `not_found` (si la eticheta).

## Masurat pe comenzile reale (productie, 600 de comenzi, 120 de zile, doar agregat)

- Localitatea se potriveste singura la **558 din 600** (93%). Raman: 17 cu judetul mascat „***"
  (date anonimizate de marketplace), 5 fara judet, 11 din Bucuresti fara sector scris nicaieri, 3
  omonime, 6 greseli de scriere („Merghideal", „Baia de arana"). Toate se aleg in fereastra.
- ⚠ Regresie prinsa la masuratoare: taierea judetului de la coada orasului transforma „Ramnicu
  Valcea" in „Ramnicu" (24 de comenzi). Acum e doar forma de rezerva.
- ⚠ Checkoutul scrie satele ca „Sat (Comuna)" („Tantava (Gradinari)"): se desfac in sat + comuna.
- Adresa se desparte in strada si numar la **371 din 436** de linii (restul n-au numar: fereastra
  cere „FN" sau numarul).
- Numele se desparte in prenume si nume de cate 3-25 de litere la 546 din 600.

## Hotarari

| Hotarare | De ce |
|---|---|
| Pret FIX in checkout (`FARA_API_DE_TARIF`) | tariful lor e costul comerciantului din credit, cheia de test coteaza absurd, o cotare dureaza 1,6-3,5 s |
| Tarifele tuturor curierilor in fereastra de AWB | omul vede ce plateste si alege curierul la fiecare comanda |
| Reteaua punctului in id (`SDY:79`) | reteaua se alege in configurare si se poate schimba intre comanda si AWB |
| Lockere in checkout sub limita retelei | Sameday 20, DPD 15, Cargus 15, FANbox 30 kg; PayPoint-urile FAN (10 kg) nu se ofera |
| In lot nu se ghiceste | localitate, numar, cod postal, nume nelamurite = motiv, „emite din fereastra" |
| Emailul magazinului cand comanda n-are | e-packet il cere; fereastra spune ca notificarile curierului ajung atunci la magazin |
| Starile: harta lor, 19 coduri | publicata, cu coloana „Final"; proba cere egalitate cu tabelul lor |
| „creat" = In procesare, nu Expediata | marfa e inca la comerciant |
| Punctul ALTUI curier se livreaza ACASA (`livrare.ts`) | la punct, `address` e adresa PUNCTULUI: o comanda pentru un FANbox prin Curiera pleca in fereastra e-packet „la adresa", adica la Kaufland. Acum: strada din `home_address`, avertisment in fereastra, refuz cu motiv in lot |

## Probat in browser (server local, baza DEMO, 07.10.2026)

- Checkout Casa Lumen, Cluj-Napoca: apar „Livrare prin e-packet" si „Locker Sameday prin e-packet";
  lista de easybox-uri vine de la ei, alegerea ramane. Pretul e al zonei, trecut prin regulile
  magazinului (treapta de greutate), ca la ceilalti curieri.
- Configurare: „Testeaza conexiunea" spune cheia de TEST si ca nu s-a salvat nimic; cautarea
  localitatii de ridicare + codul postal propus (Floresti, `407280`); salvarea; cheia NU e in clar
  in baza.
- Fereastra AWB pe comanda #0001 (Floraria Mirei): localitatea (Sectorul 3) si numele despartite
  singure; fara cont de ramburs, refuzul spune ce lipseste INAINTE de orice cerere; tarifele;
  emiterea DPD (registrul inchis `reusit`, coloana din lista se schimba pe loc, „DPD · test");
  eticheta (`%PDF-`, A4) si starea (`creat`) citite pentru acelasi AWB.
- „Detaseaza AWB": numarul iese de pe comanda, iar mesajul spune ca AWB-ul e inca viu la ei si cum
  se cere anularea.
- ⚠ Aici s-a gasit punctul altui curier (vezi Hotarari): dupa reparatie, aceeasi comanda arata
  avertismentul si adresa de acasa (Bd. Unirii / 5 / A1 / 12).

## Ce ramane deschis

- **Zero AWB-uri reale.** Tot ce e aici e pe sandboxul DPD/Sameday. Cargus, FAN, Dragon Star si TCE
  nu au mediu de test, deci emiterea prin ei e dovedita doar pe validarea lor (422), nu pe un colet.
- **Tarifele reale** nu s-au vazut: cu cheia live trebuie privite o data, inainte de orice discutie
  despre pret automat in checkout.
- **Tranzitiile de stare** sunt citite din tabelul lor, nu vazute: in sandbox toate raman `creat`.
- Expeditorul de la locker (L2D/L2L) nu e oferit: ridicarea e mereu de la adresa.

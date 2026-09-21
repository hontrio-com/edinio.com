# Etichetele mai multor comenzi, într-un singur PDF

**21.09.2026.** Cerut prin suport de un comerciant. Înainte de orice linie de cod, măsurat
pe producție:

| Curier | Expedieri emise, în toată viața platformei |
|---|---|
| Woot | **267** |
| DPD | 5 |
| Sameday | 1 |
| ceilalți paisprezece | **0** |

Cele 267 sunt ale unui **singur magazin**, care face între 4 și 18 AWB-uri pe zi și își
descărca etichetele una câte una, deschizând o fereastră pe comandă. De acolo vine lotul.

⚠ **Se construiește pentru toți cei șaisprezece, dar se poate dovedi doar pe Woot.** Ceilalți
n-au emis niciodată nimic, deci codul lor n-a fost văzut de trafic real. Expunerea zero nu e o scuză, e un motiv să ridici
pragul de atenție.

## Cum e făcut

| Fișier | Ce ține |
|---|---|
| `src/lib/orders/etichete-lot.ts` | **Regula, fără niciun I/O**: a cui e eticheta unei comenzi, pe ce coloană se vede expedierea, ce nu intră în document și de ce |
| `src/lib/orders/etichete-adunate.ts` | **Orchestrarea**, cu aducătorul și lipitorul primite ca parametri, ca să poată fi probată fără să mimez șaisprezece API-uri |
| `src/lib/orders/eticheta-sursa.ts` | **Aducerea octeților** de la fiecare curier |
| `src/lib/orders/lipeste-pdf.ts` | **Lipirea**, cu `pdf-lib` încărcat la cerere |
| `src/app/api/etichete/route.ts` | Ruta: paza, plafonul, fluxul de ieșire |

### Trei hotărâri care nu se văd din cod

**PDF-ul se judecă din octeți, nu din ce spune curierul.** UPS trimite GIF, GLS și eColet pot
trimite ZPL, iar un curier picat trimite o pagină HTML de eroare cu `Content-Type:
application/pdf`. Se citesc primii patru octeți, și atât. O pagină goală lipită în document
se vede abia la imprimantă, cu coletul pe masă.

**Paginile ies în ordinea SELECȚIEI, nu în ordinea răspunsurilor.** Aducerile merg în
paralel, deci a treia comandă poate răspunde prima. Comerciantul lipește eticheta de pe
pagina N pe coletul N: două colete schimbate între ele înseamnă două livrări greșite, aflate
de la clienți. Apărat de o probă cu întârzieri puse pe dos.

**Răspunsul pleacă în flux.** Vercel refuză corpurile peste 4,5 MB, iar optsprezece etichete
A4 trec de prag fără efort. Aceeași hotărâre ca la feedurile Pepita.

### De ce o bibliotecă de PDF, deși `emag/pdf-simplu.ts` spune că n-am vrut una

Acolo era vorba de a **scrie** o pagină cu douăsprezece rânduri de text: un format mic și
așezat, scris o dată. Aici e vorba de a **citi** PDF-uri făcute de șaisprezece curieri și de
a le pune cap la cap, ceea ce cere tabela de referințe încrucișate, renumerotarea obiectelor
și fonturile încorporate ale fiecăruia. Scris de mână, ar fi fost un analizor de PDF-uri,
adică exact felul de cod care merge pe trei fișiere și se rupe pe al patrulea, la un
comerciant.

⚠ `pdf-lib` se încarcă **la cerere** (`await import`), deci intră în pachet doar pe ruta care
chiar lipește și nu atârnă de gâtul niciunei alte porniri reci. Obiecția din `pdf-simplu.ts`
rămâne valabilă și e respectată. O probă o cere explicit.

## Ce a ieșit la iveală pe drum

⚠⚠ **Ruta `pallex/document` NU chema poarta de abonament, de când există.** Adică un magazin
cu abonamentul expirat își putea trage mai departe etichetele, iar fiecare cerere chema
API-ul curierului cu credențialele comerciantului.

Cum a scăpat: plasa din `poarta-eticheta.test.ts` caută `<furnizor>/awb/route.ts`, iar
documentul Pall-Ex stă la `pallex/document`. **Un defect scăpat printr-un nume de dosar**, de
la plasa pusă anume să-l prindă. Găsit pe 21.09.2026, când plasa a fost lărgită pentru ruta
lotului, și închis atunci.

⚠ **Și a doua plasă a căzut singură, corect.** Mutarea drumurilor GLS, eColet și Pall-Ex din
rute în `src/lib/<curier>/eticheta-sursa.ts` a scos încărcările în R2 din raza probei
„nicio etichetă nu se depozitează cu antet public". Proba avea un prag pe **numărul** de
încărcări găsite și a picat imediat, în loc să iasă verde peste o singură încărcare. Fără
pragul acela, prima încărcare publică de după mutare n-ar mai fi fost prinsă de nimeni.

## Ce nu face

- **Nu emite nimic.** E o citire: nu creează expedieri, nu costă, se poate relua oricând.
- **UPS nu intră în document**: eticheta lui e GIF. Se spune pe nume, se sare, și se ia din
  rândul comenzii.
- **Poșta Română** n-are etichetă deloc: API-ul lor nu o dă, se tipărește din aplicația lor.
- **Innoship** dă câte o etichetă pe colet; în document intră prima, ca numărul de pagini să
  rămână numărul de comenzi.
- **Pall-Ex**: în document intră eticheta (`label`), nu avizul (`note`).

## Ce ar merita urmărit mai departe

⚠ **Doi curieri pot da mai multe etichete într-o singură cerere, și noi le cerem una câte una:**

- **Cargus**: `AwbDocuments?barCodes=[...]` primește o listă; noi îi trimitem un singur cod
  (`cargus.ts`, în funcția de etichetă).
- **FAN Courier**: `awb/label?awbs[]=` e la plural (`fancourier.ts`).

La ei, un lot ar fi **o singură cerere** în loc de N. Nu s-a făcut acum fiindcă niciunul
dintre cei doi n-a emis vreodată o etichetă pe platformă, iar o optimizare pe un drum nevăzut
de trafic real e o ipoteză, nu o îmbunătățire.

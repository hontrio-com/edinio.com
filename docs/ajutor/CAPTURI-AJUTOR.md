# Capturile de ecran din centrul de ajutor

24 de capturi, câte una într-un singur ghid din 406. Toate au aceeași formă.

23 sunt făcute. A rămas una, la eMAG, apărută odată cu ghidurile pentru
integrările noi. Numărul de aici se învechește; lista adevărată se rescrie
oricând cu `npm run capturi -- --lista`, fiindcă o scoate codul din ghiduri, nu
o ține minte cineva.

## Unde se pun

```
public/capturi/ajutor/<categorie>/<slug-ul-ghidului>.webp
```

Folderele sunt deja făcute, câte unul pentru fiecare din cele nouă categorii:

| folder | capturi |
|---|---:|
| `public/capturi/ajutor/produse/` | 7 |
| `public/capturi/ajutor/design-si-pagini/` | 6 |
| `public/capturi/ajutor/marketing-si-clienti/` | 3 |
| `public/capturi/ajutor/primii-pasi/` | 2 |
| `public/capturi/ajutor/comenzi-si-livrare/` | 2 |
| `public/capturi/ajutor/plati-si-facturare/` | 1 |
| `public/capturi/ajutor/setari/` | 1 |
| `public/capturi/ajutor/suport/` | 1 |

**Numele fișierului poate fi ori slug-ul ghidului, ori titlul lui.** Scriptul le
recunoaște pe amândouă, trece peste diacritice și majuscule, și redenumește
singur fișierul la slug. Dacă un nume s-ar potrivi la două ghiduri, nu alege
niciunul și îți spune, în loc să mute poza în ghidul greșit.

În niciun caz nu se pune numărul pasului în nume. Pașii se
rescriu și se reordonează; un nume care conține „pas3” ar rămâne lipit de pasul
greșit după prima reordonare, fără să crape nimic și fără să observe cineva.

Lista completă, cu numele exact al fiecărui fișier și cu ce trebuie fotografiat
în el, stă în **`CAPTURI-AJUTOR.csv`** (se deschide în Excel).

## Dimensiuni

| | |
|---|---|
| **Raport** | **16:10 exact** (toate, fără excepție) |
| **Recomandat** | **1440 × 900 px** |
| Minim acceptat fără avertisment | 1344 × 840 px |
| Nu mai mic de | 672 × 420 px (se vede moale) |

Caseta în care se așază poza are **672px** lățime în pagină: coloana de text are
720px, iar bulina numerotată a pasului plus spațiul ei iau 48px. 1440 înseamnă
puțin peste dublul ei, adică poza rămâne clară și pe ecrane cu densitate mare.

⚠ **Raportul trebuie să fie exact 16:10.** Poza se așază cu `object-cover`: una
cu alt raport nu iese strâmbă și nu dă nicio eroare, i se **taie tăcut din
margini**. De aceea scriptul de legare măsoară fiecare fișier și refuză să lege
unul cu raport greșit, în loc să-l lege cu un avertisment pe care nu-l citește
nimeni.

## Ce se fotografiază

**Nu tot ecranul.** Fiecare captură are scris dinainte ce anume arată — textul
apare chiar în substituentul punctat din pagină și în coloana din CSV. De pildă:
„Colțul din dreapta al cardului, cu butonul cu săgeată pentru restrângere”.

Un ecran întreg de 1440px micșorat la 672px face totul de peste două ori mai mic
decât e în realitate: textul de 13px din panou ajunge la 6px pe pagină, adică
ilizibil. Rețeta are trei pași și nu poate sări peste al doilea:

1. **Fotografiază la densitate dublă.** În Chrome: DevTools → *Toggle device
   toolbar* → lățime **1440**, DPR **2** → meniul cu trei puncte → *Capture
   screenshot*. Iese un fișier de 2880px, adică de două ori mai mulți pixeli
   decât are nevoie ecranul — exact rezerva din care se decupează.
2. **Decupează zona descrisă în coloana „ce se fotografiază"**, nu tot ecranul. Din fișierul de 2880px
   iei o fereastră 16:10 lată de aproximativ **1440px**, adică vreo 720px din
   lățimea reală a panoului.
3. **Exportă 1440 × 900.** Decupajul are deja fix atâta, deci nu se pierde nimic.

Așa, ce se vede în poză apare în ghid la aceeași mărime la care îl vede omul în
panou. Al doilea pas e cel care contează: fără decupaj, chiar și o poză perfectă
tehnic e ilizibilă, iar fără primul pas decupajul iese moale, fiindcă n-are de
unde lua pixeli.

⚠ Nu micșora fereastra browserului ca să încapă mai puțin în cadru. Sub 1024px
panoul trece pe aranjamentul de telefon, iar ghidul ar arăta alt ecran decât cel
despre care vorbește.

## Formatul

**`.webp`**, cu compresie cu pierderi la **calitate 85–90**.

Nu e o preferință de stil, e o constrângere reală: componenta desenează poza cu
`unoptimized`, iar loader-ul proiectului lasă imaginile locale neatinse. Adică
**Next nu convertește și nu redimensionează nimic** — fișierul pe care îl pui
ajunge la vizitator exact așa cum e. Ce urci, aia se descarcă.

WebP e și formatul casei: din cele 168 de imagini din `public/`, 75 sunt deja
webp. Ține textul de interfață curat, spre deosebire de JPEG, și cântărește de
câteva ori mai puțin decât PNG pe același ecran.

Ținta de greutate: **sub 150 kB** per fișier, iar scriptul semnalează orice
depășește 200 kB. Cu multe capturi, fiecare 50 kB în plus se adună repede
în depozit.

Scriptul acceptă și `.png`, `.jpg` și `.avif`, dacă e nevoie undeva, dar
implicit rămâne webp.

## Cum ajung în pagină

Fișierul pus în folder **nu se vede singur**: calea lui trebuie scrisă în ghid.
Se face dintr-o comandă, oricâte capturi ai adăuga:

```
npm run capturi
```

Scriptul se uită prin `public/capturi/ajutor/`, potrivește fiecare fișier cu
ghidul care are același slug, îi măsoară raportul și scrie `src` în ghid. Merge
de câte ori vrei: pe cele deja legate le lasă în pace.

Ce raportează, în loc să treacă peste:

- fișier cu raport greșit → **nu se leagă**, cu dimensiunea găsită și cea cerută;
- fișier al cărui nume nu se potrivește cu niciun ghid, sau pus în categoria
  greșită → **nu se leagă**, cu motivul;
- fișier legat, dar mai mic de 1344px sau mai greu de 200 kB → se leagă, cu
  observație.

Cât timp `src` lipsește, ghidul arată în locul pozei un dreptunghi punctat cu
textul a ce trebuie fotografiat. Locul e rezervat la raportul corect de la
început, deci când vine poza adevărată nu se mișcă nimic în pagină.

Verificare fără să scrie nimic: `npm run capturi -- --proba`.

Lista de lucru se rescrie din date cu `npm run capturi -- --lista`, iar în ea
rămân doar capturile care încă n-au fișier. Așa nu se lucrează niciodată după o
listă veche, în care ar putea sta ghiduri care între timp au dispărut.

# Pagini: ce se reface si in ce ordine

Cerut pe 25.09.2026, in 12 puncte. Ca la `DISCOUNTURI.md` si `CLIENTI.md`: se bifeaza pe
masura ce se face, si tot ce scrie aici e **masurat**, nu presupus.

---

## Ce am gasit inainte sa incep

### Pe productie (25.09.2026, numai numaratori)

| | |
|---|---|
| pagini proprii | **34**, in 14 magazine; **29** publicate |
| marimea blocurilor | maxim 9.881 octeti, mediana 2.197; cel mult 17 blocuri pe pagina |
| blocuri folosite (sus) | text 44, titlu 27, buton 8, produse 8, coloane 7, FAQ 5, hero 4, imagine 4, contact 4, html 2 (0 cu JS), video 1 |
| in coloane | text 6, contact 5, spatiu 5, social 4, titlu 3, linie 2, imagine 2, video 2, **harta 1**, produse 1, buton 1 |
| formulare / mesaje | 6 formulare in 6 magazine; 14 mesaje in 3 magazine |
| pagini fara H1 | **22 din 29** publicate |
| pagini pe un slug rezervat | 0 |

⚠ Harta e folosita O SINGURA DATA, iar FAQ de cinci ori. Ce se schimba la ele trebuie sa lase
exact la fel blocurile existente: toate campurile noi sunt optionale, iar lipsa lor = aspectul de azi.

### Auditul (securitate, performanta, optimizare, functionalitate)

Fara nimic critic sau grav. Autorizarea e pe server peste tot, RLS-ul e pe proprietar, HTML-ul
comerciantului se curata la randare, JavaScript-ul ruleaza intr-un cadru fara `allow-same-origin`,
`javascript:` nu trece de `resolveHref`, iar toate rutele magazinului sunt rezervate.

Ce s-a gasit, verificat de mine in cod inainte de a fi scris aici:

| | Ce | Ce se face |
|---|---|---|
| M1 | Un formular trimitea emailul la **orice adresa** scrisa de comerciant, de pe expeditorul platformei, cu textul scris de vizitator. Un cont nou putea face din el un releu de spam, iar reputatia expeditorului e a tuturor. | ⚠ Masurat: singurul formular cu adresa proprie foloseste chiar emailul magazinului. Destinatarul se limiteaza la emailul magazinului sau al contului, **la trimitere** (nu doar la salvare, fiindca RLS-ul lasa proprietarul sa scrie direct in tabel). |
| M2 | Videoul: nicio limita de rata la cererea de incarcare, iar tipul fisierului **nu intra in semnatura** (verificat pe `X-Amz-SignedHeaders`: `content-length;host`). Se putea urca HTML sub eticheta de video pe `edinio-cdn.com`. | Limita de rata ca la `/api/upload`; `content-type` semnat (probat local: `content-length;content-type;host`). **Limita de 50 MB exista deja si tine**: dimensiunea e in semnatura. |
| M3 | Ce se scria in editor IN TIMPUL unei salvari se marca „Salvat”, iar doua file deschise se suprascriau tacut. | Salvarea retine versiunea salvata; pagina modificata intre timp in alta fila se refuza cu mesaj. |
| M4 | Pagina publica: ~10 citiri pe cerere, printre ele toate formularele magazinului chiar fara bloc de contact. | Formularele se citesc numai cand pagina are bloc de contact cu formular. |
| M5 | Imagini brute (`<img>` fara dimensiuni, fara incarcare lenta), pana la 10 MB. | `loading="lazy"`, `decoding="async"`, prioritate pe imaginea de sus. |
| M6 | 22 din 29 de pagini publicate fara H1: titlul din hero era `<h2>`. | Primul titlu mare al paginii devine H1 cand pagina n-are altul; descrierea SEO lipsa cade pe primul paragraf. |
| L | Inaltimea hartii accepta 0 sau NaN; culorile cu 3 cifre dadeau o culoare invalida la butoane; eroarea de incarcare a imaginii era tacuta; emailul formularului trimitea la radacina magazinului, nu la pagina. | Reparate odata cu blocurile respective. |

⚠ **Un defect mai lat, gasit pe drum:** toate fonturile magazinelor, si Geist (implicitul), se
incarcau numai cu setul `latin`, care nu are **ă, ș, ț**. Fiecare litera romaneasca se desena cu
fontul de rezerva, in mijlocul cuvantului. Se adauga `latin-ext` (fisierul se descarca doar pe
paginile care chiar au asemenea litere).

---

## Cele 12 puncte

- [x] **1. Auditul** de mai sus, reparat.
- [x] **2. Nume de sistem.** Rutele erau toate rezervate, dar NUMELE nu: o pagina „Acasa”,
  „Finalizare comanda” sau „Contul meu” primea `acasa` / `finalizare-comanda` / `contul-meu-2`,
  adrese libere, si arata in meniu ca o pagina de sistem care nu e. Se verifica si titlul, si
  slugul, in formular pe loc si pe server.
- [x] **3. Pagina noua**: sablon (goala, Despre noi, Contact, FAQ, Prezentare), tipul paginii,
  publicata sau ciorna, in meniu sau nu, descrierea pentru Google, tipografia.
- [x] **4. Imaginile** se aleg din Biblioteca Media; fisierul nou se urca tot acolo.
- [x] **5. Fonturi**: 33 de fonturi in patru familii, alese PE BLOC (text, titlu, buton, FAQ,
  titlul si subtitlul din hero), cu marime, grosime, spatiere, inaltime de rand. ⚠ O tipografie la
  nivel de pagina a existat cateva ore si a fost scoasa la cererea lui („font per text, nu la nivel
  de pagina”), cu tot cu coloana `design`.
- [x] **6. Asezare**: fundal cu imagine sau gradient, colturi, umbra, chenar, latime proprie,
  ascundere pe telefon sau desktop; la coloane: aliniere jos/intinsa, ordine inversa pe telefon.
- [x] **7. Culoarea proprie** cu roata de culori si cod hex.
- [x] **8. Linkurile** cu sugestii: pagini de sistem, paginile tale, categorii, produse.
- [x] **9. Animatii** la aparitie (pe orice bloc) si efecte noi la butoane si imagini.
- [x] **10. Limita la video**: exista (50 MB) si e impusa pe server. Se adauga limita de rata.
- [x] **11. Harta**: butoane Waze si Google Maps cu siglele lor, zoom, harta sau satelit, adresa.
  ⚠ Pinul personalizat pe Google cere cheie Google Maps si facturare; el a ales sa ramana pinul lor.
  O varianta pe OpenStreetMap (Leaflet) a fost facuta si scoasa in aceeasi zi.
- [x] **12. FAQ**: stiluri, coloane, iconite, culori, primul deschis sau nu, mai multe deschise.

---

## Stare, 25.09.2026 seara

Scris tot, pe demo. `tsc`, lintul (fara erori noi), `next build` si toate probele trec
(`src/lib/pages/pagini-redesign.test.ts`, 15 probe noi). Pe demo, toate cele 7 pagini publicate ale
`casa-lumen` raspund 200 si au **exact un H1** fiecare, plus descriere.

⚠ **Nevazut inca pe ecran**, in editor: fereastra noua, panourile de aspect si animatie, roata de
culori, sugestiile de link, harta cu pin (Leaflet), FAQ-ul in cele cinci stiluri. Se verifica
autentificat, pe telefon si pe desktop, inainte de a spune ca punctele sunt gata.

⚠ `sanitize-html` NU s-a urcat: vezi REGISTRU, D2.

### A doua trecere, dupa ce le-a incercat el (25.09.2026)

| Ce a spus | Cauza | Reparat |
|---|---|---|
| Alinierea la text nu face nimic | `text-left` scris fix pe continutul blocului de text | scos |
| Paleta de culori „se buguieste” | fereastra se ancora de roata, in stanga randului, si iesea din panou | ancorata de tot campul |
| „Doar telefon / doar desktop” nu merge | clase Tailwind de ECRAN; editorul arata telefonul intr-un cadru pe ecran lat, deci un bloc „doar telefon” disparea din editor | clase proprii; in editor blocul ramane, estompat, cu eticheta |
| Animatia nu apare | in editor nu rula deloc; pe magazin (gasit de mine) ASCUNDEA blocurile: scriptul le masura cand stateau in containerul ascuns al fluxului | scriptul urmareste blocurile care sosesc; pornirea pe `<main>`, nu pe `<html>`; in editor ruleaza la fiecare schimbare, cu „Reda animatia” |

---

## A treia trecere (25-26.09.2026): cele 6 puncte noi

| Punct | Ce s-a facut | Masurat / probat |
|---|---|---|
| 1. Beneficii | iconite proprii (Biblioteca Media), trei asezari (sus / in stanga / banda), 1-6 coloane, forma si marimea iconitei, carduri cu colturi si umbra, culori, legatura pe fiecare, efecte la cursor, aparitie pe rand | pe demo, `proba-blocuri` |
| 2. Pachete + cos | bloc nou „Pachete” (`resolve-bundles.ts`: doua citiri pe pagina, disponibilitatea cu `disponibilitatePachet`), grila sau cate unul pe rand; „Adauga in cos” pornit la blocurile NOI de produse | productie: 12 pachete active in 3 magazine; 6 blocuri de produse cu butonul pornit, 3 oprite dinadins (raman oprite) |
| 3. Cod personalizat | ⚠ in editor, HTML-ul fara JS se punea NECURATAT in panou (un administrator care intra in contul comerciantului l-ar fi rulat); acum mereu izolat in editor. Cod de widget (cu `<script>`/formular) lipit in HTML: era curatat tacut, acum merge izolat. CSS-ul blocului inchis in bloc. Cadrul: incarcare lenesa, inaltime plafonata | productie: 2 blocuri de cod, fara CSS/script/formular; pe demo widgetul ruleaza, iar `body{}` din bloc nu atinge pagina |
| 4. SEO | cuvant cheie principal, titlu si descriere la distribuire, adresa canonica (si scoasa din sitemap), nofollow; panou „Sugestii SEO” cu scor | `nofollow` nu forteaza `index: true` (proba din `seo.test.ts` a prins prima forma) |
| 5. Integrari | „Newsletter” (Mailchimp/Brevo/Klaviyo, bifa de acord obligatorie si pe server), „Metode de plata” (aceeasi regula ca finalizarea comenzii), „Curierii nostri” (cei porniti la livrare); in paleta, stinse cand integrarea lipseste | pe demo, abonarea s-a scris in „Mesaje” cu acordul |
| 6. Formulare | 5 stiluri de campuri, etichete deasupra sau in camp, 3 marimi, doua coloane cu campuri de jumatate, card, butonul (culori, colturi, latime, aliniere), redirectionare dupa trimitere, bifa de acord la formularul simplu; tipuri noi: alegere unica, bife multiple; tipul campului pe lista alba pe server | |

---

## A patra trecere (26.09.2026): pachete si formulare

| Punct | Ce s-a facut | Masurat / probat |
|---|---|---|
| Pachete „cate unul pe rand” | imaginea la stanga, produsele in grila egala („Contine N produse”), pretul si butonul jos, aliniate | pe demo, `proba-blocuri`, la latime mare |
| Descriere scurta | din descrierea scurta a pachetului sau scrisa in bloc, cel mult 300 de semne (taiata si pe server) | proba in `formulare.test.ts` |
| FOMO | „Cel mai popular”, eticheta proprie, stoc ramas sub prag, „Cumparat de N ori in ultimele 7 zile”, numaratoare pana la o data aleasa | ⚠ numai date reale: nicio cifra generata (proba cere lipsa `Math.random`); vanzarile se citesc doar daca blocul le cere; numaratoarea dispare la termen |
| Formulare: sabloane | 8 (gol, contact, oferta, programare, retur, feedback, eveniment, B2B) | proba: tipuri valide, id-uri unice, in limite |
| Formulare: statistici | in lista (total, 30 de zile, bare pe zile) si in editor | ⚠ fara rata de conversie: afisarile nu se masoara |
| Data + ora, nota, limite | `datetime-local`; nota legata cu `aria-describedby`; 30 / 30 / 50, si pe server | probe pe server |
| Securitate | raspunsul refacut din definitie, verificari pe server, capcana de timp 1,2 s | 7 probe noi |

---

## A cincea trecere (26.09.2026): telefonul

| Ce a spus | Cauza | Reparat |
|---|---|---|
| Efectul „la trecerea cursorului” nu se vede in editor | previzualizarea era `pointer-events-none` | `Previzualizare` in PageBuilder: blocul primeste cursorul, orice clic doar selecteaza blocul (nicio legatura, niciun cos, niciun formular); cadrele raman fara cursor |
| Beneficii „iconita in stanga” / „banda” stricate pe telefon; pachetele si produsele „naspa” pe telefon | cadrul de telefon al editorului are 400px, dar `sm:`/`md:` raspund la FEREASTRA, deci pe telefon se aplica asezarea de desktop | variantele `pg-sm/md/lg/xl` (`stil-comun.css`): pe magazin exact pragurile de ecran, in cadrul de telefon niciodata; 104 clase trecute in blocuri; proba `pagini-mobil.test.ts` cere ca niciun bloc sa nu mai foloseasca `md:` |

Gasite la verificarea bloc cu bloc (pagina demo `casa-lumen/proba-mobil`, noindex, cu fiecare bloc in fiecare asezare):
- beneficii „iconita in stanga” cate doua pe telefon: iconita trece deasupra textului (in ~170px nu incap alaturi);
- blocurile dintr-o coloana flexibila: pe telefon, spatiul unui bloc de pagina (64px intre titlu, text si buton, margine dubla); acum compacte, DOAR pe telefon (desktopul paginilor de azi neatins);
- coloanele „card” fara culoare: alb pe alb, nevazute; acum cu contur;
- FAQ pe doua coloane: pe telefon, intre cele doua jumatati nu era spatiu;
- produse: pretul taiat coboara sub pret pe cardul de ~170px; in carusel cardurile au aceeasi inaltime;
- plati si curieri: siglele, placi egale (doua pe rand pe telefon); cardurile, unul sub altul, cu numele aliniate.

Verificat vizual pe telefon (390px): toate cele 21 de tipuri de blocuri. Pe desktop, grilele pastreaza coloanele (masurat pe pagina).

### Fundalul alb (26.09.2026)

Cerut de el: editorul era gri. Gri era si pe magazin (`var(--color-background)` = `#F9FAFB`, fundalul
implicit al magazinelor), deci doar editorul alb ar fi aratat altceva decat se publica. Acum
`fundalulPaginii` (`src/lib/pages/fundal-pagina.ts`) da ACELASI fundal in editor si pe magazin: fundalul ales
pentru magazin, daca exista (45 din 135 de magazine in productie), altfel alb.

⚠ La unire se schimba vizibil paginile publicate ale magazinelor fara fundal ales: din gri deschis, albe.

Ce se pierdea pe alb, reparat: hero-ul fara imagine (era alb; acum o nuanta de 6% a culorii magazinului),
cutia „boxed” fara contur, umbra sau culoare (acum cu contur), conturul cardului de produs (`gray-100` abia
se vedea; acum `border`). Restul componentelor aveau deja contur, inel sau umbra (verificat in cod, fisier cu
fisier, si pe ecran).

---

## Auditul final (26.09.2026)

Trei cititori in paralel (securitate; pagina publica; panou, formulare, mesaje), fiecare constatare verificata
in cod inainte de reparare, plus probe pe demo (`proba-mobil`, `proba-blocuri`, formular trimis, cos).
Probe noi: `securitate-pagini.test.ts`, `audit-pagini.test.ts`, plus cazuri in `pagini-mobil` si `formulare`.

### Securitate
| Gasit | Reparat |
|---|---|
| ⚠⚠ CRITIC, si IN PRODUCTIE: `sanitizeCss` scotea `</style`, `<!--` intr-o singura trecere, deci `</sty<!--le>` devenea `</style>` si markupul de dupa rula pe originea platformei (a panoului). Masurat in productie: ZERO pagini cu CSS, deci neexploatat | niciun `<` nu mai ramane in CSS (escapare `\3C `); CSS-ul paginii are plafon (50.000) |
| editorul randa HTML-ul din baza necuratat (proprietarul il poate scrie direct prin PostgREST) | `curataHtmlPentruEditor` la incarcare |
| `uploadImage`: fara limita, `bucket`/`folder` numai tipuri TS | lista alba la rulare + 60/min si 600/ora pe utilizator |
| formularele de pe ciorne primeau mesaje; `page_id` nescris verificat | pagina trebuie sa fie a magazinului si publicata |
| numele formularului fara plafon | 120 |
| emailul formularului: adresa aleasa de comerciant, dar pe expeditorul platformei (releu de spam posibil) | HOTARAT DE EL (26.09.2026): pleaca prin SMTP-ul magazinului cand il are, altfel de pe Edinio; fara SMTP numai la adresele lui (magazinul, contul), cu SMTP orice adresa, fara rezerva pe Edinio (`destinatar-formular.ts`) |

### Pagina publica
Harta de peste (`z-[500]`) trecea peste antet si cos (`isolate`); produsele fara stoc aveau buton activ („Stoc
epuizat”), pretul taiat peste un interval; blocul de produse iesea scurt sau gol (se citeau 24, apoi se filtrau;
acum 120) si „recomandate” fara recomandate era gol pe magazin dar plin in editor; doua H1 (textul cu „Titlu mare”;
doua titluri cu „H1”) sau niciunul (H1 ascuns cu titlul paginii); titlu gol = `<h2>` gol; curatarea blocurilor de
doua ori pe cerere (`cache`); date structurate si categorii in paralel; pachetele citeau 200 pentru 6; `page_sections`
intreg in browser (acum slimuit, ca in catalog); pastila goala a numaratorii; sitemapul scotea paginile cu adresa
canonica egala cu a lor; siglele citite de doua ori; formularul: id-uri comune intre doua formulare, `aria-required`,
`aria-invalid`, completare automata, greseli care nu dispareau, texte fara diacritice.

⚠ Ramas: vanzarile pe 7 zile ale pachetelor sunt o numaratoare pe pachet afisat (maxim 12), numai cand blocul le cere.

### Panou (pagini, editor, formulare, mesaje)
Fundal „Imagine” care nu se putea alege; optiunile formularului mancau spatiile si randurile noi; cratima din adresa
paginii noi; o bifa unica cu virgula refuzata (si bifele unite acum cu „; ”); sageata inapoi pierdea modificarile
nesalvate (intreaba acum); adresa schimbata rupea meniul (se muta acum si intrarea); pe telefon setarile paginii nu
se puteau deschide (buton „Pagina”); coloanele din editor ignorau cardul, fundalul, alinierea, telefonul si ordinea
(o singura functie, `asezareColoane`); starea panoului trecea de la un bloc la altul (`key`); campul de exemplu la
tipuri care nu-l folosesc; Mesaje: ora fara fus (acum pe server, ora Romaniei), sursa fiecarui mesaj, filtrul
„Necitite”; statisticile: 30 de zile calendaristice (si peste schimbarea orei), fara plafonul tacut de 1000, cifra =
suma barelor; paleta si „Formular nou” ca dialoguri (Escape, focus); butoane cu nume; campul obligatoriu fara optiuni
nu se mai poate salva; conflict de salvare si la formulare; o linie de pauza lunga si texte fara diacritice.

⚠ Nevazut inca pe ecran in panou: cere autentificarea lui.

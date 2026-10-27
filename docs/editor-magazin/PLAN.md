# Editorul unic al magazinului

Hotarat 24.10.2026: un singur „Editeaza magazinul”, pe modelul Shopify (sabloane, sectiuni,
blocuri in sectiuni, stil global) plus un strat „Avansat” strans implicit. Fara panza libera
(Elementor).

## Stare si reluare (citeste intai)

**Ultima stare, 27.10.2026:** etapele 1, 2 si 3 FACUTE, comise local si PROBATE pe ecran. **Etapa 4a
(blocurile paginii de produs) FACUTA si PROBATA pe ecran (4.6)**, cu acordul lui: „Da, continua. O
sa iti dau la final lista cu toate mentiunile mele”. **4.7, editorul pe tot ecranul („mentiune foarte
importanta” a lui), FACUT si PROBAT** (vezi pasul 4.7). **4b (sabloanele paginii de produs, decizia lui:
„Din editor, pe categorii”) FACUT si PROBAT** (pasii 4b.1-4b.4). **Etapa 4 e incheiata.** **Etapa 5
(paginile proprii in editorul unic) FACUTA si PROBATA in Chrome** (pasii 5.1-5.5, ultimul comit de cod
`0b91caa1`), cu acordul lui („Continua”): editorul de pagini separat (`PageBuilder`) e retras. **Etapa 6
(un singur „Publică” pentru design si continut) FACUTA si PROBATA in Chrome** (pasii 6.1-6.5), cu acordul
lui („Continua”) si decizia lui: „Totul la „Publică””. **Etapa 7 (istoricul versiunilor) FACUTA si PROBATA
in Chrome** (pasii 7.1-7.5, 26-27.10.2026), cu acordul lui („Da, continua”; pentru proba din 27.10:
„Continua”); planul si bifele: „Etapa 7: planul de lucru”. Prima schimbare de schema a proiectului
(tabelul versiunilor), doar pe demo; REGISTRU A o cere in productie INAINTEA push-ului. **Toate cele sapte
etape din „Etapele” sunt facute.** Verificarea finala V1-V6 (27.10) e facuta. **Lista lui de mentiuni a venit pe
27.10 (cinci puncte, citate in „Etapa 8”). Etapa 8 = punctele 1-4, FACUTA si PROBATA in Chrome** (pasii
8.1-8.5, ultimul comit `6a520b67`): previzualizarea pe tot chenarul, arborele fara iconite, fila „Setări” in
editor, scoasa din Setari. **Etapa 9 = punctul 5 (blocuri ca la paginile proprii pe Acasa, Pagina Magazin si
pagina de produs): PLANUL e scris (sectiunea „Etapa 9”, 27.10, dupa „Da” al lui), iar la cele doua intrebari
a raspuns: „Doar „Sub produs”” si „Doar pe /magazin”. Codul porneste cu 9.1.** Dupa ea, inchiderea
(REGISTRU A in productie, push, verificarile din REGISTRU C, capturile si ghidurile din D), DOAR cu acordul
lui. Intrebarea despre
teme a fost pusa si a ramas fara raspuns; ramane
deschisa pentru lista lui de la final. Planul si bifele: sectiunile „Etapa 4: planul de lucru” si
„Etapa 5: planul de lucru”.

Intre 4.5 si 4.6 s-a intercalat o reparatie ceruta de el pe `main` (VetDepo: pret fix la punct si
Sameday Point scos, `122bfbff`, impinsa si in productie); `main` e adus in ramura (`01bd3eae`).

**Proba etapei 4 in Chrome, 25.10.2026**, pe `floraria-mirei` (baza DEMO), prin impersonare, cu
acordul lui, la fel ca la etapele 2 si 3; starea de dinainte pusa la loc si verificata printr-o
singura interogare (amprentele `page_content` si `storefront_design`, ciorna goala, data publicarii,
abonamentul, 0 comenzi noi). Ce merge cap-coada:
- Arborele: blocurile sub „Pagina de produs”, pe zone (Clasic: cumparare, sub produs; Detaliat:
  coloana de cumparare, sub galerie, file, sub produs); lacatul cu motivul scris ca propozitie.
- Sagetile: pretul urcat deasupra titlului se vede pe loc, si pe calculator, si pe telefon.
- Ochiul: „Garanțiile” ascunse dispar din previzualizare; panoul spune „Arată”.
- Clicul in previzualizare deschide panoul blocului (Pretul, Telefon si WhatsApp, Caseta „Detalii
  produs”), cu contur gros; trecerea peste rand din arbore incadreaza blocul in previzualizare.
- Clasic -> Detaliat: ordinea si ochiul se pastreaza pe tip (pretul tot primul, garantiile si
  contorul tot ascunse); Anuleaza readuce Clasic cu ordinea mutata; Renunta goleste ciorna.
Ce a gasit proba:
1. **Doua blocuri cu nume aproape identice**: „Conținutul pachetului” (caseta de langa pret) si
   „Ce conține pachetul” (lista mare de jos) arata aceeasi lista. Caseta se numeste acum „Caseta
   „Pachetul conține””, ca „Caseta „Detalii produs”” din Detaliat. Reparat.
2. **Ochiul lor parea mort**: amandoua apar doar la produsele de tip pachet, deci pe un produs
   obisnuit ochiul nu schimba nimic. Panoul lor spune acum asta si trimite la Produse. Reparat.
3. **Titlul panoului se taia** langa buton („Caseta „Pachetul …””), iar „ascuns în magazin” de la
   coada randului de dedesubt nu se vedea deloc. Acum se rup pe doua randuri. Reparat.
4. Conturul blocului selectat se deseneaza PESTE antetul lipicios cand blocul ajunge sub el la
   derulare (stratul are `z-index` maxim). Comportament din etapa 3, nu regresie: trecut in
   REGISTRU (D), de discutat.

**Proba etapei 3 in Chrome, 25.10.2026**, pe `floraria-mirei` (baza DEMO), prin impersonare, cu
acordul lui (s-a conectat el ca administrator pe localhost; contul de admin din baza demo are parola
lui de demo, nu pe cea din productie). Aceeasi stare de dinainte, pusa la loc si verificata la fel.
Ce merge cap-coada: conturul cu numele sectiunii sub mouse si de pe randul din arbore; clicul in
previzualizare deschide nodul, cu contur gros si eticheta plina; locul gol (Categorii, Galerie,
Despre noi) se vede si se poate apasa; pagina de produs, cosul, comanda si „Pagina Magazin”
(alese temporar ca pagini, apoi Renunta) se aleg din previzualizare; pe „Coșul” cu cos in sertar,
clicul pe banner muta editorul pe „Pagina principală”. Magazinul public: 0 marcaje, 0 locuri goale
(numarate in HTML), iar `/cos` fara semnele de editor redirectioneaza in continuare.
Ce a gasit proba, reparat tot pe 25.10:
1. Ruta „Pagina Magazin” (`pagina-magazin.tsx`) avea aceeasi cursa ca a cosului din etapa 2:
   previzualizarea ajungea inaintea ciornei si era trimisa inapoi pe prima pagina. In editor nu
   mai redirectioneaza. (In etapa 2 reparasem cosul si comanda, dar nu si ruta-sora a catalogului.)
2. Eticheta sectiunii selectate disparea cand sectiunea era derulata pe jumatate (marginea ei de
   sus iesea din ecran); acum sta lipita de marginea de sus a ferestrei.

**Proba etapei 2 in Chrome, 25.10.2026**, pe `floraria-mirei` (baza DEMO). Prima jumatate a cazut:
sesiunea din Chrome-ul lui trecuse pe contul lui de administrator. A doua, cu acordul lui, prin
„Conectare ca utilizator” din panoul de administrare de pe localhost (contul de proba), iesita la
final prin „Iesi din impersonare”. Starea de dinainte: `arhiva/date/floraria-mirei-demo-stare-2026-10-25.json`
(in afara depozitului); pusa la loc si verificata printr-o singura interogare (amprentele
`page_content` si `storefront_design` identice, ciorna goala, 0 comenzi noi, data abonamentului
inapoi pe 12.10). Ce merge cap-coada:
- „Editezi: Pagina de produs” muta previzualizarea, fara pasi in istoricul ferestrei; setarile si
  galeria „Schimba designul” se vad pe loc; Anuleaza / Refa.
- Ochiul aprinde pe loc o sectiune derivata (beneficiile pe scurt), sagetile o muta, ciorna se
  salveaza singura. (Pagina principala din Pagini scoasa temporar, ca Acasa sa fie cea clasica.)
- „Adauga sectiune” cu miniaturi; randul de produse adaugat, cu titlu si produs, salvat, vazut,
  sters cu confirmare. Recenziile: una salvata, sectiunea aprinsa, vazuta in previzualizare.
- Stil: culoarea se vede pe loc, iar dupa salvare in tot magazinul.
- Cosul ales „pagina”: previzualizarea trece pe `/cos`. Publica (ciorna golita), Renunta (istoricul
  curatat), Vizibil / Ascuns cu confirmare, in ambele sensuri.
- Telefonul (cadru de 390 px): bara incape, meniul „...”, previzualizarea la latime de telefon.
- Cele trei rute vechi redirectioneaza.

Ce a gasit proba, reparat tot pe 25.10 (probe noi in `parse.test.ts`):
1. **Randul de produse sters ramanea in design, orfan**: in arbore, fara cos de gunoi
   (`removable: false`), iar la Publica pleca in magazin ca invelis gol. Exista si in productie, cu
   editorul vechi: 2 din 25 de designuri publicate (masurat 25.10, fara efect vizibil acolo).
   Parserul scoate acum randurile fara pereche in `page_content.product_sections`
   („Recomandate” ramane). Un test vechi folosea tocmai randuri fara pereche: le-a primit.
2. **Cosul (si comanda) ales „pagina”**: previzualizarea pleca spre `/cos` inainte ca ciorna sa
   ajunga in baza (1,2 s), iar ruta redirectiona pe ciorna veche inapoi la prima pagina. In editor
   (doar proprietarul, cu semnele de editor) rutele nu mai redirectioneaza.
3. **Telefonul**: „Publica” iesea taiat din bara, Anuleaza / Refa se suprapuneau peste lista de
   pagini; au trecut in meniul „...”, lista se strange. Previzualizarea arata magazinul de calculator
   micsorat, ilizibil: sub 768 px e mereu cea de telefon.
4. **Hidratare**: `aria-describedby` al tragerii din lista de sectiuni diferea intre server si
   browser (dnd-kit numara intr-un contor al modulului); `useId` il face stabil.
5. **Texte**: „ascunsa” langa „ascunsă” in acelasi arbore; „1 produse selectate”; nota de sub
   fonturi fara diacritice; subtitlul galeriilor promitea „previzualizate cu magazinul tau”, desi
   produsele din miniaturi sunt de exemplu (si comentariul din `VariantCard` spunea la fel, fals).

Ramase, nereparate (in `REGISTRU.md`, D): culoarea din Stil se vede pe loc doar unde magazinul
citeste variabilele temei; cosul plutitor si eticheta „Popular” o primesc ca proprietate de la
server si se schimba abia la salvare (etapa 6, cand culoarea intra in design).

**Proba vizuala a etapei 1, facuta 25.10.2026** pe `localhost:3000` (baza DEMO, contul
`onboarding-proba-cf99b5@edinio-demo.test`, magazinul `floraria-mirei`; data abonamentului mutata
o zi si pusa la loc, ca in memoria `proba-in-browser-pe-baza-demo`):
- Setari > General: sloganul si linkul de Instagram (scris fara `https://`) s-au salvat, au ramas
  la reincarcare, linkul a primit `https://`; in magazin: descrierea paginii = sloganul, iconita de
  Instagram, butonul WhatsApp dupa bifa „acelasi numar”. `store_name` a ramas NULL.
- Setari > Formular de comanda: un camp si o extraoptiune de 12,50 lei; in formularul din cos
  apar amandoua, iar bifa duce totalul de la 166,90 la 179,40 lei (comanda NU s-a trimis).
- Setari > Catalog: „Ascunde produsele fara imagini” scoate singurul produs din magazin.
- `/dashboard/editor`: panourile mutate lipsesc; cele trei trimiteri deschid filele din Setari.
- Telefon (cadru de 390 px): General si Formular de comanda fara depasire orizontala.
- Valorile de proba puse la loc in baza DEMO (starea de dinainte, citita intai).

Ce a gasit proba si recitirea codului, reparat tot pe 25.10:
1. Comutatorul „Email” arata OPRIT cand reglajul lipsea, iar magazinul arata campul (implicitul
   lui e pornit, optional). Mostenit din editorul vechi. Acum Setarile citesc ca magazinul; o
   proba aduna fiecare citire a lui `email_field` si cere un singur implicit; ghidul de ajutor
   spunea si el „oprit din start”.
2. `updatePageContent` nu revalida `/dashboard/settings`. Filele Formular si Catalog isi iau
   valorile din pagina cand le redeschizi; azi merge doar fiindca Next reface dupa o actiune
   orice pagina, purtare numita temporara in documentatia lui `revalidatePath`.

⚠ La proba in Chrome: un clic dat imediat dupa incarcare (inainte de hidratare) nu face nimic si
nu da eroare. Dupa fiecare clic se citeste starea (`aria-checked`, baza), nu se presupune.

**Cum se reia:** `git checkout editor-magazin` in `edinio/`, citeste fisierul asta si
`REGISTRU.md`, apoi memoria `editor-magazin-unic`. Nimic nu se impinge, nimic nu atinge productia.

## Etapa 2: planul de lucru (scris 25.10.2026, inainte de cod)

Un singur ecran la `/dashboard/editor`: bara de sus, arborele in stanga, previzualizarea in
dreapta. Gazduieste ce exista: lista de sectiuni si galeria de design-uri (din editorul de design
si din „Design sectiuni”) si panourile de continut (din editorul vechi), fiecare sub nodul din
arbore pe care il regleaza.

### Deciziile etapei (de ce asa)

1. **Doua feluri de salvare, spuse pe fata.** Designul (ce sectiuni apar, in ce ordine, ce
   varianta, setarile de sectiune, stilul) e ciorna, salvata singura, si ajunge la clienti la
   „Publica” din bara de sus; „Anuleaza / Refa” lucreaza pe el. Continutul (texte, imagini, logo,
   culori, fonturi) se salveaza din panoul nodului si e in magazin imediat, ca azi. Motivul:
   continutul sta in `page_content` si magazinul il randeaza pe server, deci nu se poate arata in
   previzualizare inainte de salvare. Un singur „Publica” pentru tot cere continutul mutat in
   design: asta e etapa 6.
2. **Ochiul din arbore e SINGURUL control de vizibilitate.** Sectiunile derivate din continut
   (beneficii pe scurt, prag transport, beneficii, recenzii, galerie, despre, contact, randurile
   de produse) aveau o a doua poarta in componenta, pe comutatorul vechi: ochiul le putea stinge,
   dar nu le putea aprinde. Poarta a doua se scoate (precedent: „Recomandate” si bara de anunt,
   august 2026); `enabled` din design o contine deja, derivat din comutator cat timp ochiul n-a
   spus altceva. Masurat in productie 25.10.2026: 25 de magazine cu design salvat, ZERO cu ochiul
   folosit pe aceste sectiuni, zero randuri oprite in continut, deci niciun magazin nu se schimba.
   Comutatoarele vechi de pornire nu mai apar in editor.
3. **`elibereazaComutatoare` nu se mai cheama din editorul unic.** Exista ca sa impace doua
   controale pentru acelasi lucru, in doua ecrane; aici e unul singur. Chemata la salvarea unui
   text, ar fi sters semnul ochiului si ar fi reaprins o sectiune stinsa anume. Comutatorul
   „Afiseaza continutul peste banner” pleaca si el: varianta hero-ului se alege din galerie.
4. **Dupa o salvare de continut, designul se re-deriva pe client**, cu parserul (functie pura)
   si contextul nou: randuri noi, varianta hero dupa bannere. Fara asta, ciorna din ecran ar fi
   ramas cea derivata din continutul vechi si previzualizarea ar fi aratat altceva decat magazinul.
5. **Previzualizarea vie pe toate paginile editate.** Pagina de produs, cosul si comanda primesc
   protocolul (`esteEditorDeDesign`), ca acasa si pagina Magazin: ciorna proprietarului, mesajele
   din editor, clic pe sectiune.
6. **Rutele vechi redirectioneaza** catre editorul unic: `/dashboard/editor/design`,
   `/dashboard/editor/sectiuni`, `/dashboard/store` (pagina „in curs de dezvoltare”, moarta).
7. **Pagina principala facuta in Pagini:** Acasa arata o nota cu legatura catre pagina; ordinea
   si ce apare se aleg acolo (etapa 5 le aduce in acelasi model). Variantele si setarile
   sectiunilor raman valabile, fiindca pagina le imprumuta din design.
8. **Galeria primeste un editor de imagini.** Sectiunea exista, dar nimeni nu o putea umple (in
   productie: zero magazine cu imagini in galerie).

### Pasii (bifati pe masura ce se fac)

- [x] 2.1 Poarta unica (25.10, proba `poarta-unica.test.ts`, 4/4 mutanti): componentele derivate citesc doar `enabled` din design; lista de randuri
      nu mai filtreaza pe comutatorul vechi; titlul „Toate produsele” din grila se ia din design.
- [x] 2.2 Previzualizarea vie pe pagina de produs, cos si comanda (ciorna + protocol). 25.10,
      `ciorna-proprietarului.ts` + proba ei; cosul si comanda citesc varianta din designul viu.
- [x] 2.3 (25.10, `src/lib/editor-magazin/`: istoric, pagini, derivare, noduri, continut; 20 de probe) Logica fara React: istoricul pentru anuleaza/refa, re-derivarea, adresa previzualizarii
      pe pagina aleasa, nodurile arborelui pe pagina, aprinderea barei de anunt cand lipseste.
- [x] 2.4 Ecranul: bara de sus, arborele, panoul nodului (design + setari + continut),
      galeria de variante peste previzualizare, „Adauga sectiune”. 25.10, `src/components/editor-magazin/`.
- [x] 2.5 Continutul mutat din editorul vechi, pe noduri, plus stilul global si galeria. 25.10,
      `continut/`; probele: nicio cheie veche pierduta, fiecare nod scrie doar cheile lui.
- [x] 2.6 Rutele vechi redirectioneaza; meniul panoului; legatura din Pagini. 25.10; editoarele vechi
      sterse (`StoreEditor`, `StoreDesignEditor`, `SectionDesignBrowser`, `ProductSectionsEditor`).
- [x] 2.7 Porti + proba in Chrome pe demo. 25.10: tot ce e in „Stare si reluare”, plus cinci
      reparatii gasite de proba; porti verzi (tsc, 10.995 de probe, lint pe fisierele atinse, build:ci).

## Etapa 3: planul de lucru (scris 25.10.2026, inainte de cod)

Acordul lui: „Da”, 25.10.2026, dupa raportul etapei 2. Tinta din „Etapele”: clic in
previzualizare, contur la trecerea mouse-ului, selectie la clic.

Ce exista deja (mostenit din editorul de design): sectiunile de pe Acasa si antetul / subsolul au
`data-st-section` (invelis `display: contents`, `Marcata` din `SectionRenderer.tsx`); clicul pe
una trimite `select` si editorul o deschide in panou; editorul trimite `scrollTo`. Ce lipseste:
niciun contur (nici la trecerea mouse-ului, nici pe sectiunea deschisa), pagina de produs,
Magazinul, cosul si comanda n-au marcaj (clicul pe ele nu face nimic), iar o sectiune aprinsa dar
goala nu are nicio cutie, deci nu se poate nici vedea, nici apasa.

### Deciziile etapei (de ce asa)

1. **Conturul se deseneaza in previzualizare**, intr-un strat deasupra paginii, fara clicuri
   (`pointer-events: none`). Cutia se calculeaza din copiii invelisului (care n-are cutie a lui) si
   se reface la derulare, la redimensionare si cand se schimba pagina. Stratul se incarca doar in
   modul editor (`next/dynamic`): vitrina publica nu primeste niciun octet in plus.
2. **Doua contururi.** „Peste”: subtire, cu numele sectiunii, cand mouse-ul e pe ea in
   previzualizare SAU pe randul ei din arbore. „Selectat”: gros, pe nodul deschis in panou.
   Selectia are o singura sursa, editorul; previzualizarea doar deseneaza ce i se spune (mesaj nou,
   `evidentiere`, trimis si dupa fiecare „ready”, ca sa supravietuiasca navigarii).
3. **Fiecare pagina din „Editezi” e clicabila**: pagina de produs, Magazinul, cosul si comanda
   primesc marcajul sectiunii lor, ca Acasa.
4. **Sectiunile aprinse, dar goale, primesc in editor un loc gol cu numele lor** (galerie fara
   imagini, recenzii fara recenzii, prag de transport fara valoare). In magazin nu se schimba
   nimic: locul gol exista doar in invelisul de editor si se ascunde din CSS (`:only-child`) cand
   sectiunea randeaza ceva. Fara efecte si fara masuratori.
5. **Clicul pe o sectiune care nu e pe pagina aleasa muta editorul pe pagina ei.** Exemplu: pe
   „Cosul”, cu cos in sertar, previzualizarea arata prima pagina; clicul pe banner deschide
   „Pagina principala” cu bannerul, in loc sa nu faca nimic.
6. **Blocurile (`data-bloc`) vin in etapa 4**, odata cu blocurile; stratul de contur le va primi
   fara schimbari.
7. Ramane pe mai tarziu, de discutat: sertarul cosului si fereastra comenzii deschise singure in
   previzualizare cand le selectezi; butoane pe sectiunea selectata, direct in previzualizare.

### Pasii (bifati pe masura ce se fac)

- [x] 3.1 (25.10, `contur-editor.ts` + probe) Logica fara React: cutia unei sectiuni din cutiile copiilor, id-ul sectiunii de sub
      mouse, pagina pe care sta o sectiune; mesajul `evidentiere` in protocol; probe.
- [x] 3.2 (25.10, `ConturEditor.tsx`) Stratul de contur in previzualizare, in ambele gazde (`MiniStoreRenderer`,
      `StorePageShell`), incarcat doar in editor.
- [x] 3.3 (25.10, `MarcajSectiune`) Marcajul pe pagina de produs, Magazin, cos si comanda.
- [x] 3.4 (25.10, `LocGol`, `only:`) Locul gol pentru sectiunile aprinse fara continut, doar in editor.
- [x] 3.5 (25.10) Editorul trimite selectia si trecerea peste randurile arborelui; clicul de pe alta
      pagina muta pagina.
- [x] 3.6 Porti + proba in Chrome. 25.10: tot ce e in „Stare si reluare”, plus doua reparatii
      gasite de proba; porti verzi (tsc, 11.006 probe, lint fara erori noi, build:ci).

## Etapa 4: planul de lucru (scris 25.10.2026, inainte de cod)

Tinta din „Etapele”: blocuri in sectiuni, pagina de produs sparta in blocuri cu context comun,
sabloane de produs multiple. Citit in cod inainte: pagina de produs e o singura sectiune cu doua
variante, `ProductPageClassic.tsx` si `ProductPageDetailed.tsx` (cate ~1.400 de randuri). Toata
logica (pretul afisat si cel trimis, variantele, personalizarea, pachetele, ofertele, pixelii,
editarea unei linii din cos) sta in corpul componentei; zona de cumparare e o functie
(`zonaDeCumparare`) cu bucatile intr-o ordine fixa, iar sub ea vin sectiuni de continut (beneficii,
cum functioneaza, descriere, specificatii, intrebari). Detaliat are alta asezare: coloana de
cumparare, un bloc sub galerie (detalii, rezumat, garantii) si file jos.

### Deciziile etapei (de ce asa)

1. **Blocuri doar pe pagina de produs, in etapa asta.** Ea e sectiunea monolitica. Sectiunile de
   pe Acasa primesc blocuri in etapa 6, cand continutul lor intra in design: azi continutul lor
   sta in `page_content`, cate unul pe sectiune, iar blocurile ar fi doar un al doilea strat de
   ordine peste acelasi continut.
2. **Un bloc e o bucata care exista deja pe pagina, cu zona ei fixa.** Fara tipuri noi si fara
   dubluri in etapa asta (fiecare tip o data, id = tip). Comerciantul muta blocurile in interiorul
   zonei, le ascunde pe cele optionale si le regleaza.
3. **Blocurile de bani, de lege si de comanda nu se ascund:** titlul (H1-ul paginii), pretul,
   variantele, stocul (anunta si precomanda), personalizarea (intra in pret), cumpararea (butoanele,
   treptele, notificarea de garantie legala din OUG 18/2026) si ofertele (le conduce ecranul
   Oferte). Se pot muta.
4. **Ochiul e singurul control de vizibilitate si pentru blocuri**, ca in etapa 2. Comutatoarele
   vechi (garantiile, beneficiile, cum functioneaza, intrebarile, estimarea livrarii, contorul de
   vizitatori, eticheta de calitate; in Detaliat: detaliile, rezumatul, treptele, contactul) dau
   valoarea implicita pana cand omul foloseste ochiul (`enabledOverride`, trei stari) si pleaca din
   editor; cheile lor raman citite.
5. **Blocurile sunt ale variantei.** Clasic si Detaliat au zone diferite; la schimbarea variantei,
   ordinea si ochiul se pastreaza pe tip, iar tipurile noi isi iau locul implicit.
6. **Codul de bani nu se muta.** Logica ramane in componenta variantei; doar bucatile de JSX se
   aseaza dupa lista de blocuri. Probe: blocurile obligatorii apar mereu, in ambele variante;
   lista implicita da exact asezarea de azi; nicio bucata nu apare de doua ori.
7. **Previzualizarea:** blocurile primesc marcaj propriu, in interiorul sectiunii; conturul si
   clicul merg pe bloc (mecanismul din etapa 3, extins).
8. **Sabloanele de produs pe categorie sau pe produs vin in 4b**, dupa ce 4a e probat pe ecran.

### Pasii (bifati pe masura ce se fac)

- [x] 4.1 (25.10, `blocuri.ts` + `blocuri.test.ts`, 11 probe) Modelul: `blocks` pe sectiune, registrul blocurilor pe varianta (zone, obligatorii,
      setari), parserul (ordinea salvata, tipurile noi la locul lor, vizibilitatea derivata),
      operatiile de editare (muta, ochi, setari). Probe.
- [x] 4.2 (25.10, harti `bucati` / `jos` + `blocurile-au-bucati.test.ts`) Clasic randat din blocuri (cumparare + jos). Probe: obligatoriile mereu, fara dubluri,
      lista implicita = asezarea de azi.
- [x] 4.3 (25.10; estimarea livrarii ramane a continutului, vezi `DE_CE.livrare`) Detaliat randat din blocuri (cumparare, sub galerie, jos).
- [x] 4.4 (25.10, `ArboreBlocuri`, `PanouBloc`, `ContinutBloc`, noduri `produs_*`) Editorul: blocurile in arbore sub „Pagina de produs” (pe zone, sageti, ochi), panoul
      blocului (setari + continutul lui), comutatoarele dublate scoase.
- [x] 4.5 (25.10, `MarcajBloc`, `selectorMarcaj`; filele Detaliat raman fara marcaj propriu) Previzualizarea: marcaj pe bloc, contur si clic pe bloc.
- [x] 4.6 Porti + proba in Chrome. 25.10: tot ce e in „Stare si reluare”, plus trei reparatii gasite
      de proba (numele casetei pachetului, nota blocurilor de pachet, titlul panoului care se taia).
- [x] 4.7 (25.10, cerut de el, intercalat inainte de 4b) **Editorul pe tot ecranul.** Fara bara
      laterala, bannere, bara de sus si meniul de jos ale panoului (`CadruPanou`, regula in
      `ecran-intreg.ts`; bara de impersonare ramane); „Ieși” in bara editorului, cu intrebare cand
      e continut nesalvat sau design nepublicat („Publică și ieși”). Cu ocazia asta, salvarea
      ciornei trece printr-o coada (`coada-salvarii.ts`): o scriere pe drum, baza citita la plecare,
      golita la iesire, asteptata de Publica si Renunta. **Probat in Chrome pe 25.10** (demo, contul de
      proba, cu acordul lui; starea pusa la loc si verificata): din bara laterala, editorul se deschide
      pe tot ecranul (pagina = fereastra, 855 px, fara bara laterala si fara bara de sus); „Ieși” fara
      modificari duce direct in panou; o modificare de design urmata de „Ieși” la 282 ms (inaintea
      salvarii automate de la 1,2 s) a ajuns in ciorna; textul nesalvat cere „Ieși fără să salvez”, iar
      „Rămân” il pastreaza; Biblioteca Media isi pastreaza cadrul; Media -> Editor pe client, tot ecranul.
      Proba a gasit doua lucruri, reparate: (1) avertisment React „Each child in a list should have a
      unique key” din `CadruPanou` (un element trimis de pe server ca proprietate sosea „lenes”, iar
      marcajul de copil static nu-l mai prindea; fiecare slot sta acum in `Fragment`-ul lui, cu cheie);
      (2) pe telefon (386 px) lista paginilor ajunsese sa arate doar „Pa”: acum arata nume scurte
      („Acasă”, „Produs”...), iar „Vezi” ramane doar cu pictograma sub 420 px.
- [x] 4b Sabloane de produs alternative, pe categorie sau pe produs (plan separat, dupa 4a): vezi mai jos.

## Etapa 4b: planul de lucru (scris 25.10.2026, inainte de cod)

Tinta: mai multe sabloane ale paginii de produs (de exemplu „Tablouri” si „Textile”), fiecare cu
varianta, reglajele si blocurile lui. **Decizia lui (25.10, intrebare cu trei variante): „Din editor,
pe categorii”**: sablonul se face in editor, i se bifeaza categoriile, iar produsele anume intra ca
exceptii; prin ciorna si Publica, fara migratii. (Celelalte doua: alegerea din fisa produsului, ca la
Shopify, cu coloana noua; sau amandoua.)

### Deciziile etapei (de ce asa)

1. **Sabloanele stau in design**: `product.sabloane[]` = { id, nume, page, categorii[], produse[] },
   unde `page` e o sectiune `product_page` intreaga (varianta, reglaje, blocuri). `product.page` de azi
   ramane sablonul „Implicit”, al produselor fara alt sablon, deci un design fara sabloane arata exact
   ca inainte.
2. **Ce sablon primeste un produs**: intai cel care il are ca exceptie, apoi cel al categoriei lui sau
   al celui mai apropiat parinte (o categorie acopera si subcategoriile, inclusiv pe cele facute mai
   tarziu), apoi Implicit. O categorie si un produs stau la cel mult un sablon: parserul pastreaza
   prima aparitie, editorul muta, nu dubleaza.
3. **Plafoane**: 10 sabloane, 300 de categorii si 500 de produse pe sablon. Designul se citeste la
   fiecare pagina; produsele sunt pentru exceptii, nu pentru cataloage intregi.
4. **Alegerea se face pe client, din designul viu** (`ProductPageDinDesign`), ca previzualizarea sa
   schimbe sablonul fara reincarcare. Marcajul sectiunii intra si el acolo, cu id-ul sablonului ales;
   variantele primesc id-ul paginii ca proprietate (azi il citesc din `design.product.page`).
5. **Lantul de categorii** (a produsului si parintii ei) il da ruta, si il citeste doar cand designul
   are sabloane pe categorii sau cand pagina e deschisa in editor. Pe pagina publica a unui magazin
   fara sabloane, nicio interogare in plus.
6. **In editor**: sub „Pagina de produs”, un rand „Șablon” (Implicit, fiecare sablon, „+ Șablon nou”);
   arborele si panourile lucreaza pe sablonul ales. Panoul sablonului: numele, categoriile (arbore cu
   bife), produsele-exceptie (cautare), Șterge. Previzualizarea arata un produs care chiar foloseste
   sablonul; cand nu exista inca niciunul, sablonul se impune prin adresa (`sablon=<id>`, doar in
   modul editor), cu o nota.
7. **Magazinul cu un singur produs nu primeste sabloane**: pagina lui e pagina principala; randul nu
   apare.

### Pasii (bifati pe masura ce se fac)

- [x] 4b.1 (25.10, `sabloane-produs.ts` + 10 probe) Modelul: tipuri, parser (plafoane, dubluri, id-uri unice), `sablonulProdusului`, operatiile
      (adauga, redenumeste, sterge, atribuie categorie / produs), sectiunile sabloanelor in
      `toateSectiunile` / `findSection`. Probe.
- [x] 4b.2 (25.10, `sabloane-in-magazin.test.ts`; categoria produsului e un NUME, deci ruta o cauta dupa nume si urca pe `parent_id`) Magazinul: alegerea in `ProductPageDinDesign` (design viu, produs, lantul de categorii),
      marcajul mutat acolo, id-ul paginii dat variantelor; ruta citeste lantul doar cand trebuie;
      `sablon=` in editor. Probe.
- [x] 4b.3 (25.10, `SelectorSablon`, `PanouSablon`, `produsPentruSablon`; probe in `editor-magazin.test.ts`) Editorul: randul „Șablon”, panoul sablonului, arborele pe sablonul ales, previzualizarea pe
      un produs al sablonului (actiune care gaseste unul). Probe.
- [x] 4b.4 Porti + proba in Chrome. 25.10, pe `floraria-mirei` (demo, contul de proba, cu acordul lui), cu
      date TEMPORARE (magazinul n-are categorii): „Buchete” si sub ea „Trandafiri”, produsul mutat in
      „Trandafiri”; toate sterse la final, starea verificata printr-o singura interogare. Ce merge:
      „Șablon nou” deschide panoul; numele se schimba pe loc; bifata „Buchete”, „Trandafiri” apare „prin
      părinte”; selectorul spune „Folosit de 1 categorie”; varianta Detaliat pe sablon se vede in
      previzualizare (adresa cu `sablon=`, marcajul cu id-ul sablonului, produsul din „Trandafiri”);
      Implicit ramane Clasic. ⚠ Dovada pe server: pagina produsului in modul editor FARA `sablon=` a
      ales singura sablonul (Detaliat, marcajul lui), urcand de la „Trandafiri” la „Buchete”; pagina
      publica a ramas Clasic, fara marcaje. Stergerea cu confirmare readuce Implicit; consola fara
      erori ale aplicatiei. Vazut: o ciorna desfacuta pana la starea publicata ramane in coloana
      (REGISTRU, D).

## Etapa 5: planul de lucru (scris 25.10.2026, inainte de cod; acordul lui: „Continua”)

Tinta din „Etapele”: paginile pe acelasi model, cu un convertor din `custom_pages` (blocurile
editorului de pagini devin blocuri intr-o sectiune „Conținut liber”). Citit in cod inainte: paginile
se fac azi intr-un ecran separat, `PageBuilder` (`/dashboard/pages/[id]/edit`): panza randata in
panou (nu in cadru), ~20 de tipuri de blocuri (`blocks.types.ts`), coloane cu blocuri in ele
(`block-tree.ts`), setarile fiecarui bloc (`BlockSettings`), titlul, adresa, publicarea, SEO si CSS
ale paginii, salvare explicita cu versiune (`updatePage`, garda pe `updated_at`). Pe magazin pagina
se randeaza prin `BlocuriPagina` -> `BlockRenderer` (dispecer pur, folosit si de panza editorului).

### Deciziile etapei (de ce asa)

1. **Paginile se editeaza in editorul unic**, nu intr-un ecran separat: „Editezi” primeste si
   paginile proprii. Previzualizarea e pagina adevarata a magazinului, in cadru, cu antet si subsol,
   ca restul editorului; arborele arata antetul, „Conținut liber” cu blocurile paginii (si cele din
   coloane, sub ele) si subsolul.
2. **Fara migratie: `custom_pages` ramane sursa.** „Conținut liber” e felul in care editorul
   CITESTE `custom_pages.blocks` (convertorul e o derivare la citire, ca `{}` = clasic). Ce se
   salveaza e tot randul paginii: blocurile, titlul, adresa, publicarea, SEO, CSS.
3. **Pagina e CONTINUT, nu design**: se salveaza explicit, direct in magazin, cu aceeasi garda de
   versiune ca azi (`updatePage`). Bara de sus spune „Pagină nesalvată”; „Ieși” si inchiderea
   ferestrei intreaba, ca la continutul de azi. Anuleaza / Refa merg pe pagina cand pagina e cea
   editata (un istoric al ei, `istoric.ts`), pe design in rest.
4. **Previzualizarea vie** fara salvare: editorul trimite cadrului blocurile paginii (mesaj nou in
   protocol), iar pagina, DOAR in modul editor, le randeaza prin acelasi `BlockRenderer`, cu datele
   de previzualizare ale editorului de pagini (produse, pachete, formulare, plati, curieri: le
   trimite tot editorul, o data). Pe magazinul public nu se schimba nimic.
5. **Clic si contur pe blocuri**, prin mecanismul din etapele 3-4: sectiunea `pagina:<id>`, blocurile
   `pagina:<id>/<bloc>`.
6. **Se refoloseste tot ce exista**: setarile blocurilor (`BlockSettings`), operatiile pe arbore
   (`block-tree.ts`), paleta (`BLOCK_PALETTE_ORDER`, `createBlock`, integrarile active), campurile SEO.
   Nimic din modelul blocurilor nu se schimba.
7. **Ecranul vechi se retrage la final**: `/dashboard/pages/[id]/edit` trimite in editor
   (`?pagina=pagina:<id>`), iar lista „Pagini” deschide editorul. Lista paginilor, formularele si
   mesajele raman unde sunt.
8. **Nu intra acum:** sectiuni din tema puse in jurul continutului liber (blocul „Din pagina
   principală” face deja asta), articolele de blog, sabloanele de pagina.

### Pasii (bifati pe masura ce se fac)

- [x] 5.1 (25.10, `pagini.ts`, `pagina-proprie.ts`, protocolul; 4 probe noi) Logica fara React: cheile paginilor proprii in „Editezi”, adresa previzualizarii lor,
      mesajul de protocol cu blocurile, id-urile marcajelor, starea paginii (modificari, salvare cu
      versiune, istoric). Probe.
- [x] 5.2 (25.10, `PaginaVie`, `pagini-in-editor.test.ts`; in editor pagina principala nu mai trimite la radacina) Magazinul: in modul editor, pagina proprie randeaza blocurile primite de la editor, cu
      marcaje pe blocuri; public, neschimbata. Probe.
- [x] 5.3 (25.10, `usePaginaProprie` cu reductorul pur `reductorPagina`, `ArborePagina`, `PanouriPagina`;
      `SetariPagina` si `PaletaBlocuri` scoase din `PageBuilder`, `dateEditorPagina` comuna cu ruta veche,
      actiunea `datePaginaInEditor`; 11 probe noi, 8 din 8 mutatii prinse) Editorul: paginile in „Editezi”, arborele „Conținut liber” (blocuri, coloane, sageti,
      duplicare, stergere, „Adaugă bloc”), panoul blocului (`BlockSettings`), panoul paginii (titlu,
      adresa, publicare, SEO, CSS), salvarea si iesirea. Probe. Spre alta pagina cu pagina nesalvata:
      „Rămân / Renunță la ele / Salvează și treci”; pagina lasata se uita (la intoarcere se citeste din
      nou). Anuleaza / Refa: pe pagina, dar pe design cand panoul arata antetul sau subsolul.
- [x] 5.4 (25.10, `adresaEditoruluiPentruPagina`, `iesireaEditorului`; `PageBuilder` sters; 4 probe noi si
      4 mutate pe editorul unic, 3 din 3 mutatii prinse) Ecranul vechi trimite in editor; lista „Pagini” si „Deschide pagina” (pagina principala)
      duc in editor. REGISTRU. Pastrate din editorul retras: „+” sub orice bloc (in arbore), clicul pe
      video / harta selecteaza blocul (`pg-previzualizare`), blocurile ascunse pe dispozitivul vazut
      raman estompate (`data-editor-device` in `PaginaVie`), „Redă animația”. „Ieși” duce inapoi in
      „Pagini” cand editorul s-a deschis de acolo. Legatura „Deschide pagina” veche ducea la
      `/dashboard/pages/<id>`, ruta inexistenta (doar pe ramura, nicicand in productie).
- [x] 5.5 (25.10, porti verzi la `0b91caa1`: `tsc`, 11080 probe, `lint:prag`, `build:ci`) Porti + proba in Chrome (pe o pagina TEMPORARA a magazinului de proba, stearsa la final).
      Pe `floraria-mirei` (baza DEMO), prin impersonare, la fel ca la etapele 2-4. Pagina „Proba editor 5”
      facuta din „Pagini” > „Pagină nouă” (sablonul „Despre noi”, fara meniu, ciorna), apoi stearsa; starea
      de dinainte pusa la loc si verificata printr-o singura interogare (paginile, amprentele `page_content`,
      `storefront_design`, ciorna goala, meniul, abonamentul, 1 comanda ca inainte, paginile Casa Lumen).
      Ce merge cap-coada:
      - „Creează și editează” deschide editorul pe pagina noua (`?pagina=pagina:<id>&din=pagini`), cu nota
        de ciorna; „Editează” din lista duce la fel; ruta veche `/dashboard/pages/<id>/edit` trimite acolo.
      - Previzualizarea e pagina adevarata (`/floraria-mirei/proba-editor-5`, modul editor), cu antet,
        subsol si marcaje pe continut si pe toate cele 7 blocuri; clicul pe un titlu deschide panoul
        lui, cu contur; textul scris in panou se vede pe loc, inainte de salvare.
      - Animatia aleasa pe un bloc VECHI: blocul se remonteaza, animatia ruleaza (750 ms) si blocul ramane
        vizibil; „Redă animația” remonteaza blocul si o porneste din nou.
      - „+” sub Hero: panoul spune „sub „Hero: Proba editor 5””, butonul ales intra al doilea, nu la coada;
        Anuleaza il scoate, Refa il readuce.
      - Spre „Acasă” cu pagina nesalvata: fereastra „Rămân / Renunță la ele / Salvează și treci”;
        „Rămân” pastreaza tot. „Salvează pagina”: in baza, ordinea si textul blocurilor, animatia,
        versiunea noua; istoricul ramane.
      - Setarile paginii: titlu, adresa si publicare salvate; „Editezi” arata noul titlu fara „(ciornă)”,
        iar previzualizarea trece singura pe adresa noua.
      - „Doar desktop” pe un bloc, pe telefon (390 px): blocul ramane, estompat, cu „Ascuns pe telefon”.
      - Modificat, apoi „Acasă” > „Renunță la ele”, apoi inapoi: pagina vine din nou din baza, fara
        modificarea renuntata (reparatia din 5.3).
      - „Deschide pagina” pe Acasa (magazinul are o pagina proprie ca pagina principala) o deschide in
        editor, fara trimiterea la radacina.
      - „Ieși” duce inapoi in „Pagini”.
      - Pagina publica, pentru vizitator si pentru proprietar fara modul editor: 200, continutul salvat,
        zero marcaje de editor (`data-st-section`, `data-st-bloc`, `data-editor-device`, `pg-previzualizare`).
      - Consola: doar nepotrivirea de hidratare data de o extensie a Chrome-ului (`cz-shortcut-listen`),
        nicio eroare sau avertisment din cod.
      Ce a gasit proba: etichete fara diacritice venite din editorul vechi („Titlu pagina”, „Ce este aceasta
      pagina?”, „Pagina obisnuita”, numele blocurilor din paleta: „Spatiu”, „Harta”, „Intrebari (FAQ)”).
      Scrise in REGISTRU (D), la trecerea de diacritice deja planificata pentru `registry.ts`.

## Etapa 6: planul de lucru (scris 25.10.2026, inainte de cod; decizia lui: „Totul la „Publică””)

Tinta: un singur „Publică” pentru tot ce se regleaza in editor, designul si continutul (texte,
liste, imagini, logo, culoare, fonturi, fundal). Pana la „Publică”, continutul modificat se vede
doar in previzualizare; „Renunță” arunca tot. Ce vad clientii nu se schimba pana atunci.

Citit in cod inainte:
- Continutul sta in `page_content` (cheile din `CHEI_CONTINUT`, scrise doar de editorul unic;
  Setarile scriu alte chei: SEO, modul magazinului, formularul, catalogul) si in `businesses`
  (logo, coperta, culoarea, galeria). `updatePageContent` imbina pe chei si nu valideaza valorile:
  le curata cititorii. `updateBusiness` aplica o lista alba de coloane.
- Magazinul il citeste pe server: rutele incarca `business` si `page_content`, din ele ies
  `buildChromeData` si contextul sectiunilor (care nu primesc props, citesc din context). In
  modul editor, acasa, pagina proprie, produsul, cosul si comanda randeaza deja ciorna de design.
- Ciorna de design: `storefront_design_draft`, salvata prin coada (`coada-salvarii.ts`) cu garda
  de concurenta (`draft-guard.ts`), publicata de `publishDesign`, golita de `discardDesignDraft`.
- Biblioteca Media socoteste „folosit” tot ce apare in randul `store_settings` (`select("*")`),
  deci si ce e in ciorna: o imagine aleasa doar in ciorna nu poate fi stearsa ca nefolosita.

### Deciziile etapei (de ce asa)

1. **Continutul nepublicat sta in ciorna de design**, sub cheia `continut`: `pc` (cheile atinse
   din `page_content`) si `magazin` (logo, coperta, culoare, galerie). Fara migratie si fara
   coloana noua: o singura scriere pentru design si continut, deci o singura garda de
   concurenta, iar „Renunță” (coloana `NULL`) le arunca pe amandoua deodata.
2. **Doar cheile atinse, pe o lista alba**: `continut.pc` primeste numai cheile din
   `CHEI_CONTINUT`, `continut.magazin` numai cele patru coloane, plus un plafon de marime.
   `permalinks` si `pagina_acasa` nu pot intra. La publicare se scriu doar ele, imbinate pe chei
   peste `page_content`, ca azi: ce scriu Setarile intre timp ramane.
3. **Previzualizarea arata continutul din ciorna**: in modul editor (proprietarul, cu semnele de
   editor), rutele pun `continut` peste `page_content` si `business` inainte de orice citire.
   Pentru vizitatori nu se schimba nimic. Dupa ce o modificare de continut ajunge in ciorna,
   previzualizarea se reincarca, ca azi dupa „Salvează”.
4. **Parserul designului primeste contextul cu continutul din ciorna**, peste tot unde se
   citeste ciorna (salvare, garda, rutele in editor, editorul, publicare): altfel un rand de
   produse nou, existent doar in ciorna, ar fi scos din design ca orfan.
5. **„Publică” scrie intai continutul** (`page_content` imbinat pe chei, apoi `businesses`), apoi
   designul, parsat cu continutul nou, si goleste ciorna. Cazut la mijloc: ciorna ramane intreaga,
   iar „Publică” se poate repeta (scrierile de continut sunt idempotente).
6. **Fara „Salvează” pe sectiuni**: panourile scriu in ciorna, ca designul (salvare automata,
   „Anulează / Refă” pe tot). Punctul din arbore inseamna „modificat, nepublicat”. Imaginile
   (logo, favicon, bannere, galerie) se urca in clipa alegerii, ca ciorna sa tina adresa lor.
7. **Raman pe loc**: comutatorul „Vizibil” (magazinul deschis clientilor), paginile proprii
   („Salvează pagina”) si Setarile.
8. **`elibereazaComutatoare` se sterge**: n-o mai cheama nimeni, iar ca actiune de server e un
   capat public care ar fi rescris ciorna fara continut.

### Pasii (bifati pe masura ce se fac)

- [x] 6.1 (25.10, `continut-ciorna.ts`, garda in `draft-guard.ts`; 9 probe; 5 mutatii, toate prinse, una abia dupa o proba noua: garda parsata cu contextul magazinului) Logica fara React: forma lui `continut`, parserul lui (lista alba, plafon), suprapunerea
      peste `page_content`, `business` si contextul parserului, amprenta pentru garda. Probe. Amprenta
      continutului e JSON cu cheile ordonate: `jsonb` isi rearanjeaza cheile, iar valorile din `pc` nu
      trec printr-un parser care sa le refaca ordinea.
- [x] 6.2 (25.10, `store-design.actions.ts`, `publicare-cu-continut.test.ts`; 3 probe, 5 din 5 mutatii prinse; `comutatoare-vechi.ts` sters odata cu singura lui folosire) Serverul: `saveDesignDraft` (context cu continutul, garda pe tot), `publishDesign`
      (continut, apoi design), stergerea lui `elibereazaComutatoare`. Probe. Pana la 6.4 editorul nu
      trimite inca `continut`, deci ciorna si publicarea se poarta exact ca inainte.
- [x] 6.3 (25.10, `ciornaDeRandat` in `ciorna-proprietarului.ts`; 6 rute: acasa, pagina proprie, produs,
      Magazin (si categorie, brand, cautare), cos, comanda, plus miniaturile de sectiune; 4 probe, 6 din 6
      mutatii prinse) Magazinul in modul editor: rutele pun continutul ciornei peste date. Probe, si ca un
      vizitator nu-l vede niciodata. Coloana de ciorna nu se mai cere in niciun rand de setari (pagina
      principala si Magazin o cereau si o taiau inainte de randare): o citeste numai `ciornaDeRandat`,
      numai pentru proprietar in editor. Layoutul magazinului (culoarea bannerului de cookie) nu stie de
      modul editor si ramane pe culoarea publicata.
- [x] 6.4 (25.10, `lib/editor-magazin/ciorna.ts` cu reductorul comun si scrierea cheilor, `useCiornaDesign`,
      `useContinutMagazin` rescris ca fata a ciornei, 21 de bare „Salvează” scoase; 7 probe pure + 4 pe sursa,
      6 din 6 mutatii prinse) Editorul: continutul in ciorna, fara „Salvează” pe sectiuni, istoric comun, imaginile
      urcate la alegere, reincarcarea previzualizarii, bara si iesirea. Probe. Punctul din arbore inseamna
      acum „modificat, nepublicat”; o cheie adusa inapoi la valoarea publicata iese din ciorna. Bara spune
      „Modificări nepublicate” / „Totul e publicat”. Stergerea unui rand de produse intra si ea in ciorna
      (Anuleaza il aduce inapoi; din magazin dispare la „Publică”). Comutatorul „Vizibil” ramane pe loc.
- [x] 6.5 (25.10, REGISTRU `d56a4914`; porti verzi: `tsc`, 11099+ probe, `lint:prag`, `build:ci`) REGISTRU (comportamentul nou, ghidurile de ajutor), porti, proba in Chrome pe magazinul
      de proba: modificat, previzualizat, magazinul public neschimbat pana la „Publică”,
      „Renunță”; starea pusa la loc.
      Pe `floraria-mirei` (baza DEMO), prin impersonare (butonul adevarat), cu `page_content`, designul
      publicat si coloanele de identitate salvate INTREGI inainte si puse la loc dupa (o interogare finala:
      amprentele, data publicarii, ciorna goala, 1 comanda, pagina neatinsa). Ce merge cap-coada:
      - Culoarea principala aleasa: variabilele temei se schimba pe loc; dupa salvarea in ciorna
        previzualizarea se reincarca si TOT se vede in noua culoare, inclusiv cosul plutitor (REGISTRU D il
        avea pana acum „abia dupa salvare”). In baza: `businesses.primary_color` neschimbat, ciorna cu
        `continut.magazin.primary_color`. HTML: vizitatorul si proprietarul fara modul editor vad 49 de
        aparitii ale culorii vechi si 0 ale celei noi; previzualizarea, 33 ale celei noi (una veche ramasa:
        bannerul de cookie din layout, scris in REGISTRU D).
      - Fundalul (`page_content.store_bg_color`) intra in `continut.pc`; Anuleaza il scoate din ciorna
        (cheia adusa la valoarea publicata iese), Refa il readuce.
      - „Publică”: culoarea si fundalul ajung in magazin, restul cheilor din `page_content` (formularul de
        comanda, pagina principala, livrarea) neatinse, ciorna golita; vizitatorul vede noua culoare.
      - „Renunță”: ciorna golita, previzualizarea reincarcata pe publicat.
      - Panoul „Căutare și filtre”: fara „Salvează”; punctul „Modificat, nepublicat” apare in arbore.
      Ce a gasit proba: dupa „Renunță” (si dupa Anuleaza) campul cu codul culorii din Stil arata inca
      culoarea renuntata (copie locala a culorii). Reparat: campul arata ciorna, textul local doar cat e
      scris pe jumatate; proba noua, mutatia prinsa. Vazut in browser dupa reparatie.

## Etapa 7: planul de lucru (scris 26.10.2026, inainte de cod; acordul lui: „Da, continua”)

Tinta din „Etapele”: istoric de versiuni, „revino la ce era ieri”, plasa de siguranta pentru cei care
se tem sa atinga ceva.

Citit in cod si masurat inainte:
- `publishDesign` scrie continutul (`page_content` imbinat pe chei, apoi cele patru coloane din
  `businesses`), apoi designul si data publicarii, si goleste ciorna. Nu pastreaza nimic din ce era:
  un „Publică” gresit nu se mai poate desface.
- Blogul are deja un istoric (`blog_post_revisions`): RLS fara politici, doar `service_role`, un
  plafon de versiuni, revenirea trece prin aceeasi cale ca salvarea, deci nimic nu se pierde.
- Masurat in productie pe 26.10 (doar citire): 148 de magazine; continutul pe care il regleaza
  editorul are cel mult 5,5 KB (p95: 2 KB), designul publicat cel mult 3,1 KB, deci o versiune are sub
  10 KB. 25 de magazine au un design publicat. `primary_color` si `gallery` nu pot fi nule.

### Deciziile etapei (de ce asa)

1. **O versiune = ce a dus un „Publică” in magazin**: designul publicat si continutul editorului
   (cheile din `CHEI_CONTINUT` aflate in `page_content`, plus logo, coperta, culoare, galerie), cu
   data publicarii. Se scrie la fiecare „Publică” reusit. Inaintea primei versiuni a unui magazin se
   pastreaza si starea de dinainte („Cum era înainte”), ca si primul „Publică” sa se poata desface.
2. **Tabel nou, `storefront_design_versions`** (migratie aplicata doar pe demo pana la final;
   REGISTRU A): RLS pornit fara politici, nimic pentru `anon` si `authenticated`, doar `service_role`,
   ca `blog_post_revisions`. Se citeste si se scrie numai din actiunile de server, dupa verificarea
   proprietarului, si numai cu `business_id`-ul magazinului lui. Se sterge odata cu magazinul.
3. **Plafon: ultimele 30 de versiuni pe magazin**; cele mai vechi se sterg la scriere.
4. **„Readu în editor” pune versiunea in CIORNA, nu in magazin**: se vede in previzualizare si ajunge
   la clienti abia la „Publică”, care face la randul lui o versiune noua, deci nimic nu se pierde.
   Pasul intra in Anuleaza / Refa: ce era in ciorna inainte revine cu Anuleaza.
5. **O cheie care lipsea din versiune, dar exista acum, se scoate** (lista `scoase` in continutul
   ciornei). Fara ea, revenirea la „Cum era înainte” ar fi pastrat, de pilda, fundalul ales dupa.
   „Publică” o sterge din `page_content`, iar magazinul cade pe implicitul lui, ca la un magazin care
   n-a atins-o niciodata. Previzualizarea si panourile o arata la fel.
6. **Scrierea versiunii nu poate strica publicarea**: cazuta, „Publică” ramane reusit (magazinul e
   deja schimbat) si caderea ajunge in jurnal. Versiunea poarta exact data publicarii, iar lista scrie
   „În magazin acum” doar pe versiunea cu data din magazin: o versiune lipsa nu poate face lista sa
   minta.
7. **Raman pe dinafara**: paginile proprii („Salvează pagina”), Setarile si comutatorul „Vizibil”, care
   nu trec prin „Publică”. O imagine stearsa intre timp din Biblioteca Media nu revine (lista o spune);
   versiunile nu tin imaginile „folosite”, altfel nimic n-ar mai putea fi sters din biblioteca.
8. **In bara de sus**: butonul „Istoric” (pe telefon, in meniul „...”) deschide lista: data, „În
   magazin acum”, „Readu în editor”. Cu modificari nepublicate in ciorna, intai o intrebare.

### Pasii (bifati pe masura ce se fac)

- [x] 7.1 (26.10, `versiuni.ts` + `versiuni.test.ts`, `scoase` in `continut-ciorna.ts`, pasul `readu` in
      `ciorna.ts`; 14 probe noi, 14 din 14 mutatii prinse) Logica fara React: `scoase` in continutul ciornei (parser, suprapunere, amprenta, scrierea
      cheilor), instantaneul unei versiuni, ciorna facuta dintr-o versiune (diferenta fata de publicat),
      pasul „readu” in reductor (cu istoric), data afisata. Probe.
- [x] 7.2 (26.10, `migrations/2027-01-31-istoricul-publicarilor.sql`, aplicata DOAR pe demo; verificat pe
      rezultat: RLS pornit, 0 politici, `anon` si `authenticated` fara niciun drept; tipurile; `verifica:coloane`
      cere tabelul, deci cade inainte de push pana e aplicata in productie) Migratia (fisier, aplicata pe demo, verificata: RLS, drepturile lui `anon` si
      `authenticated`), tipurile, REGISTRU A.
- [x] 7.3 (26.10, `store-design.actions.ts`: `pastreazaVersiunea`, `listDesignVersions`, `getDesignVersion`;
      `istoricul-publicarilor.test.ts`, 9 probe, 14 din 14 mutatii prinse) Serverul: `publishDesign` scrie versiunea (si starea de dinainte, la prima), plafonul;
      actiunile de listare si de citire, cu proprietarul verificat. Probe.
- [x] 7.4 (26.10, `IstoricVersiuni.tsx`, `readuVersiunea` in `useCiornaDesign`, butonul in `BaraEditor`; 4 probe
      pe sursa, 8 din 8 mutatii prinse; in treacat, meniul de pe telefon spunea inca „Renunță la modificările de
      design”, desi din etapa 6 „Renunță” arunca si continutul) Editorul: butonul „Istoric”, lista, „Readu în editor”. Probe.
- [x] 7.5 (26-27.10; REGISTRU C si D `f3e98ebb`; porti verzi la `f3e98ebb`: `tsc`, 11129 probe, `lint:prag`,
      `build:ci`) REGISTRU (C), porti, proba in Chrome pe magazinul de proba.
      27.10, pe `floraria-mirei` (baza DEMO), prin impersonare (butonul adevarat), cu acordul lui pentru ziua
      respectiva („Continua”, dupa ce s-a conectat ca administrator pe localhost). Starea de dinainte salvata
      intreaga (`page_content`, designul publicat, data publicarii, coloanele de identitate, abonamentul, pagina,
      comenzile; 0 versiuni) si pusa la loc dupa „Ieși din impersonare”: designul brut luat din randul `inainte`,
      apoi randurile de versiuni sterse. O singura interogare a comparat totul: amprentele `page_content` si
      `storefront_design`, data publicarii, ciorna goala, identitatea, 1 comanda, 0 versiuni, pagina neatinsa.
      Ce merge cap-coada:
      - „Istoric” inainte de orice publicare: „Încă nu ai nicio versiune...”.
      - Doua modificari (sectiunea „Căutare și filtre” ascunsa, fundalul verde deschis) si „Publică”: DOUA
        versiuni in baza, `inainte` cu data publicarii de dinainte (27.09; designul brut, cu amprenta celui din
        magazin; fara fundal) si `publicare` cu `created_at` = `storefront_design_pub_at`.
      - Lista: „Azi, 18:06 / Publicare / În magazin acum” (butonul oprit, „E deja ce vezi în editor.”) si
        „27 sept., 19:49 / Cum era magazinul înainte de istoric”.
      - „Readu în editor” pe cea veche: mesajul, previzualizarea fara fundal si cu sectiunea la loc, ciorna cu
        `continut = { pc: {}, scoase: ["store_bg_color"] }`; Anuleaza o scoate („Totul e publicat”), Refa o
        readuce.
      - Cu modificari nepublicate, „Readu în editor” intreaba intai; „Rămân la ele” nu schimba nimic.
      - „Publică” cu versiunea readusa: `store_bg_color` SCOS din `page_content` (amprenta = cea de dinainte de
        proba), sectiunea inapoi, a treia versiune; „În magazin acum” trece pe ea.
      - Telefonul (cadru de 390 px): „...” > „Istoricul publicărilor” deschide aceeasi lista, fara depasire.
      Nimic de reparat. Vazut din nou, stiut din 4b.4 (REGISTRU D): dupa Anuleaza pana la starea publicata,
      coloana de ciorna ramane cu designul identic (fara `continut`); ecranul spune corect „Totul e publicat”.

## Verificarea de dinaintea listei lui (ceruta 27.10.2026)

Cererea lui, dupa etapa 7: „Mai fa tu o verificare inainte pe partea de Buguri, Design, Conflicte,
Responsive, etc... Si dupa iti dau si eu lista mea”. Ramura are 162 de fisiere schimbate fata de `main`
(+14918 / -6705). Fara agenti. Ce e defect clar se repara, cu proba lui; ce e de gust sau de decis intra
in raport, pentru lista lui.

- [x] V1 Conflicte: Git (fata de `origin/main` si fata de `conector-hontrio`, care are si el migratie si
      `database.types.ts`); datele (cheile scrise de Setari fata de lista alba a ciornei; doua scrieri pe
      acelasi rand); legaturile catre rutele vechi.
      27.10: `origin/main` n-a mers mai departe de baza ramurii (`122bfbff`, dupa `git fetch`), deci unirea
      e curata. `conector-hontrio` (3 comituri, pe `aa7b4fde`) atinge si el `dashboard/page.tsx` si
      `database.types.ts` (se imbina singure) si are un conflict, dar cu `main`, nu cu noi
      (`integrari-catalog.test.ts`, la fel si fara ramura asta). Migratiile nu se ciocnesc (30 vs 31).
      Setarile scriu `checkout_config`, `seo`, `store_mode`, `one_product_id` si cele trei chei de
      catalog: niciuna pe lista alba a ciornei, deci „Publică” nu le poate calca. Nicio legatura vie spre
      rutele vechi (doar in teste si comentarii).
- [x] V2 Buguri, pe datele reale (productia, doar citire, 27.10). In loc sa car datele aici, intrebarile
      puse direct bazei:
      - comutatoarele din care se deriva blocurile paginii de produs (`benefits_section`, `faq_section`,
        `how_it_works_section`, `show_quality_badge`, `show_social_proof`, `trust_badges_enabled`) sunt
        TOATE booleene, deci `=== true` din blocuri da la fel ca testul vechi „adevarat”;
      - paginile de produs: 16 Clasic, 9 Detaliat, 123 fara design; 0 blocuri, 0 sabloane;
      - cheile de pe lista alba au un singur tip fiecare (`favicon_url`: text sau `null`);
      - 35 de pagini proprii la 15 magazine, 13 feluri de blocuri, toate cunoscute;
      - sectiunile cu ochi atins (`enabledOverride`): 13 hero, plus „Despre” si „Contact” la un magazin,
        ambele stinse si cu ochiul, si cu comutatorul. Deci scoaterea portilor vechi din componente
        (`show_about`, `show_contact`, `show_gallery`, beneficii, recenzii, banda de incredere, pragul de
        livrare, „Recomandate”) nu aprinde si nu stinge nimic la lansare.
      Fara al doilea server cu `main` (memoria era la 92%, serverul local ocupa 4,3 GB): paginile de produs
      comparate pe linii reale (`schimbari-reale.mjs`, mutarile ignorate). Clasic si Detaliat: doar
      mutari in blocuri si portile de mai sus, mutate in blocuri cu aceleasi conditii.
- [x] V3 Buguri, in cod: actiunile de server schimbate (`async`, autentificare, proprietar, intrari),
      apoi logica din `lib/editor-magazin` si `lib/storefront/design`, apoi componentele cu stare.
      Bine: toate actiunile noi verifica proprietarul; ciorna ajunge doar la proprietar, in editor
      (`esteEditorDeDesign`); `MarcajBloc` / `MarcajSectiune` nu adauga nimic pe magazinul public;
      Setarile scriu doar ce trece prin `pregatesteDateleGenerale`. Gasit si reparat (27.10):
      1. **Modificarile facute cat se publica se pierdeau.** La intoarcere, „Publică” punea pe ecran ciorna
         goala peste ce se schimbase intre timp, iar „Renunță” si Ctrl+Z ramaneau active in timpul ei.
         Acum ciorna e `blocata` cat merg „Publică” / „Renunță” (si in hook, si `inert` pe ecran),
         „Renunță” e oprit atunci, iar „Readu în editor” spune cand pasul n-a intrat.
      2. **„Publică” mergea cat se urca o imagine**: imaginea ajungea in ciorna DUPA publicare, deci nu in
         magazin. Acum „Publică” asteapta, iar bara spune „Se încarcă o imagine...”.
      3. **Numele sablonului ramanea in urma la Anuleaza din bara** (copie locala; urmatoarea tasta il
         scria la loc), acelasi defect ca la codul culorii din 6.5. Campul urmeaza acum designul.
      4. `produsPentruSablon` cadea pe orice altceva decat liste (o actiune primeste orice).
      Probe noi pe sursa, 16 din 16 mutatii prinse.
- [x] V4 Texte: diacritice in panou, „ ” inchise, fara linie lunga, etichetele din `registry.ts`.
      Scanerul (`texte-panou.mjs`, doar textele afisate, nu comentariile), pe randurile adaugate de
      ramura: textele noi din editor sunt corecte. Reparat: trei mesaje din Setari > General fara
      diacritice („nu pare corecta”, „trebuie sa inceapa”, „adresa web”). Neatinse, cu motiv: textele
      magazinului (fara diacritice, regula lui), cuvintele-cheie de cautare din ajutor, etichetele
      retrase din `registry.ts` (nu se mai arata) si textele vechi din `SettingsClient` si de pe prima
      pagina a panoului, mutate doar (datorie de dinainte, in lista lui).
- [x] V5 Responsive si design, in Chrome: editorul la 390 / 768 / 1024 / 1280 / 1920 px, Setarile
      mutate la 390 px, magazinul public (acasa, produs, categorie, cos, pagina proprie) la 390 / 768 px;
      depasirea orizontala masurata; consola fara erori.
      27.10. Magazinul public, ca vizitator (fara sesiune), pe `bijuterii-cris` (demo, abonament valabil):
      8 pagini la 390 si 768 px, 0 px depasire; `/cos` si `/checkout` trimit la prima pagina (sertar);
      pagina de produs pe telefon arata bine; consola doar cu eroarea extensiei. Editorul, prin
      impersonare (acordul lui: „M-am conectat”, dupa cererea de acord), pe `floraria-mirei`: 1920, 1280
      (panou 360 + previzualizare 916, toate cele 12 butoane), 1024 si 768 (panou SAU previzualizare), 390
      (meniul „...”, previzualizarea de telefon): 0 px depasire peste tot, consola fara avertismente React.
      Setarile General, Catalog, Formular de comanda la 390 px: 0 px. Reparatiile, vazute pe ecran:
      numele sablonului revine la „Anulează” si se intoarce la „Refă”; `inert` cat merge „Renunță”
      (~0,65 s) si cat merge „Publică” (~0,9 s), dupa care publicarea a scris corect cele doua versiuni;
      rutele vechi duc in editor; „Pagini” > „Editează” > „Ieși” intoarce in „Pagini”. Starea pusa la loc
      si verificata printr-o singura interogare (amprentele, data, ciorna goala, 1 comanda, 0 versiuni,
      abonamentul, pagina neatinsa). De gust, pentru lista lui: pe tableta (768-1023 px) panoul ia toata
      latimea; la ~768 px starea din bara se taie („Totul e...”); meniul Setarilor e fara diacritice
      (vechi, si „Formular de comanda” le urmeaza); „Renunță” nu cere confirmare, desi nu se desface.
- [x] V6 Porti (`tsc`, probe, `lint:prag`, `build:ci`), raport, comit.
      27.10, la `84080f8f`: `tsc` 0; 11135 probe, 0 cazute, 2 sarite (cele vechi de easySales), din Git
      Bash (din PowerShell cad 3 doar fiindca n-au `grep`); `lint:prag` nu creste (51); `build:ci` 0.
      Raportul i-a fost dat; urmeaza lista lui.

## Etapa 8: lista lui, partea intai (scris 27.10.2026, inainte de cod)

Lista lui, data dupa verificare (27.10):
1. „In bara aia acolo in stanga sa avem o Sectiune de Setari si acolo sa pui sectiunea aia veche cu
   Informatii Generale, Social Media, Tipul de formular, etc...”
2. „Vad ca ai pus la Setari Formularul de comanda, pune l tot aici la Setari cum ti am zis la punctul 1,
   Catalog la fel, si tot ce era acolo”
3. „Vad ca in Preview acolo in dreapta nu e full width pe tot chenarul, trebuie sa fie full width pe tot
   chenarul sa nu avem spatiile alea goale in stanga si in dreapta”
4. „Nu prea imi place acolo cum ai pus acele icons de scut la fiecare sectiune in parte, fa ceva mai Clean”
5. „Vreau sa poti adauga Blocuri si aici exact ca la paginile Custom”

Raspunsurile lui la intrebari (27.10): setarile din editor se salveaza DIRECT („Direct, cu „Salvează””);
raman DOAR in editor („Doar în editor”); blocurile si pe pagina de produs („Și pe pagina de produs”);
arborele FARA iconite („Fără iconițe”). Etapa 8 = punctele 1-4; punctul 5 (blocurile) e etapa 9, cu planul ei.

Citit inainte:
- Previzualizarea: `RamaPreview` randeaza „Calculator” la 1280 px si o centreaza; pe un ecran lat raman
  benzi goale (la o fereastra de 1920 px, ~120 px de fiecare parte).
- Scuturile: `PageIcon` cauta iconitele sectiunilor din `registry.ts` (Megaphone, PanelTop, Image,
  Search...) in setul paginilor proprii (`PAGE_ICONS`), unde lipsesc, si cade pe scut. Un defect, nu o
  alegere; el a ales oricum arborele fara iconite.
- Setarile mutate la etapa 1: `DateleMagazinului` (magazinul, contactul, adresa, butoanele flotante,
  retelele, datele firmei, numerotarea comenzilor; o singura salvare), `FormularComandaSetari`,
  `CatalogSetari`. Scriu doar ce e al lor (`updateGeneralSettings`, `updatePageContent` pe chei), fara
  atingere cu ciorna (V1). Fila „General” din Setari mai are „Contul tău” (numele utilizatorului).
- Trimiteri spre ele: notele din editor (`ContinutNod`, `ContinutBloc`, `ContinutAcasa`), blocul „Rețele”
  din paginile proprii, ~20 de randuri in centrul de ajutor (`setari.ts`, `design-si-pagini.ts`,
  `marketing-si-clienti.ts`).
- In productie niciun cont nu are doua magazine (Setarile luau cel mai VECHI, editorul cel mai NOU).

### Deciziile etapei

1. Previzualizarea „Calculator” ia toata latimea chenarului cand acesta e mai lat de 1280 px; sub 1280 se
   micsoreaza ca pana acum (pragurile CSS raman cele de calculator). Telefonul si tableta raman la latimea lor.
2. Arborele fara iconite: sectiunile, blocurile paginii de produs, blocurile paginilor proprii; raman numele
   si randul mic de sub el. Iconitele raman doar unde se alege un tip nou (galeria „Adaugă secțiune”, paleta).
3. A treia fila, „Setări”, langa „Secțiuni” si „Stil”: o lista ca arborele, cu „Informații generale” (nume,
   slogan, descriere, contact, adresa, butoane flotante), „Social media”, „Datele firmei” (cu numerotarea
   comenzilor), „Formular de comandă”, „Catalog”. Fiecare se deschide in panou, cu „Înapoi” si salvarea lui;
   primele trei impart o singura stare si o singura salvare (ca azi), ca sa nu ramana jumatate nesalvata.
4. Salvarea e DIRECTA, nu prin „Publică” (decizia lui), si fila o spune. Dupa salvare previzualizarea se
   reincarca. Ce e scris si nesalvat intra in avertismentul de la „Ieși”.
5. Din Setari pleaca filele „Formular de comandă” si „Catalog”, iar din „General” cardurile magazinului;
   „General” pastreaza „Contul tău”, plus o trimitere spre editor. Adresele vechi
   (`?sectiune=catalog`, `?sectiune=formular-comanda`) duc in editor, pe setarea ceruta.
6. Notele din editor deschid setarea pe loc, fara navigare; ghidurile si restul trimiterilor spun noul drum:
   „Editează magazinul > Setări > ...”.

### Pasii (bifati pe masura ce se fac)

- [x] 8.1 (27.10, `lib/editor-magazin/previzualizare.ts`: `latimeaRandarii`, folosita de `RamaPreview`; 4 probe)
      Previzualizarea pe toata latimea. Proba.
- [x] 8.2 (27.10: fara `PageIcon` / `IconitaBloc` in `SectionList`, `ArboreSectiuni`, `ArborePagina`; proba pe
      sursa) Arborele fara iconite. Proba.
- [x] 8.3 (27.10: `lib/editor-magazin/setari.ts` cu regulile pure, `setari/useSetariMagazin.ts` cu starea,
      tinuta in `EditorMagazin`, `setari/PanouriSetari.tsx` si `setari/FilaSetari.tsx` pe stilul panoului;
      dupa salvare `reincarcaAcum` + `router.refresh()`; nesalvatul intra in „Ieși” si in `beforeunload`;
      ruta editorului aduce datele si citeste `?fila=setari&setare=...`) Fila „Setări” in editor:
      componentele adaptate panoului ingust, starea comuna, salvarea, reincarcarea, nesalvatul la „Ieși”;
      datele aduse de ruta editorului. Probe.
- [x] 8.4 (27.10: Setarile fara filele „Formular de comandă” si „Catalog” si fara cardurile magazinului;
      „General” pastreaza „Contul tău” si un buton „Deschide setările magazinului”; `?sectiune=catalog` si
      `?sectiune=formular-comanda` redirectioneaza in editor, pe setare; cele trei componente vechi
      sterse; notele din editor si blocul „Rețele” deschid setarea (`TrimitereSetare`, pe loc in editor);
      ghidurile din `setari.ts`, `design-si-pagini.ts`, `marketing-si-clienti.ts`, `marketplace.ts` si nota
      Trendyol spun noul drum; lista capturilor regenerata) Setarile din panou fara ele (General cu
      „Contul tău” si trimiterea), adresele vechi spre editor, notele si ghidurile. Probe.
      Mutanti: 39/39 prinsi (scapasera intai 3, toti pe starea din hook: catalogul si formularul lipsa din
      „nesalvate”, `setSalvat` scos; acoperiti cu o proba pe compunerea fiecarei salvari). Proba pe note
      cerea „macar una” pe fiecare setare; acum cere FIECARE nota spre o setare mutata, pe numele ei.
- [x] 8.5 (27.10: REGISTRU C si D; porti verzi: tsc, 11.154 probe / 0 cazute, lint:prag 51 = pragul, build:ci;
      proba in Chrome pe `floraria-mirei`, contul de proba `9360c5a3`, prin impersonare, pe acordul zilei) REGISTRU,
      porti, proba in Chrome pe magazinul de proba. Vazut pe ecran: `?sectiune=catalog` din Setari deschide editorul pe
      „Catalog”; comutatorul schimbat aprinde punctul din lista si „Ieși” intreaba; „Salvează” scrie DOAR cele trei
      chei (restul `page_content` neatins, nicio ciorna, bara ramane „Totul e publicat”); telefonul salvat apare
      in antetul previzualizarii; „Cod discount” scrie `hidden_fields: []`, restul formularului pastrat; nota din
      „Finalizarea comenzii” deschide formularul pe loc; Setari > General = „Contul tău” + butonul spre editor;
      „Calculator” randat la 1518 px = latimea chenarului; arborele fara iconite; la 390 si 768 px filele si
      panourile incap, fara depasire. GASIT si reparat: butonul „Deschide setările magazinului” n-avea contur
      (`buttonVariants` fara `cn`: `border-transparent` din baza batea conturul variantei; `<Button>` trece prin
      `cn`). Pus la loc: telefonul, `page_content`, `features` (salvarea generala scrie explicit butoanele
      flotante, cu aceleasi valori ca implicitele), data abonamentului; verificat cu o singura comparatie.

## Etapa 9: blocuri ca la paginile proprii (scris 27.10.2026, inainte de cod)

Punctul 5 din lista lui: „Vreau sa poti adauga Blocuri si aici exact ca la paginile Custom”. La intrebare
(27.10): „Și pe pagina de produs”. Deci: pe pagina principala, pe Pagina Magazin si pe pagina de produs.
Inceput dupa „Da” al lui (27.10), cu planul intai.

Citit inainte:
- **Blocurile paginilor proprii:** 22 de tipuri (`lib/pages/blocks.types.ts`), operatiile pe arbore in
  `block-tree.ts` (coloane cu blocuri in ele), panoul `BlockSettings`, paleta `PaletaBlocuri`. In editorul unic
  (etapa 5): `ArborePagina` si `PanouriPagina`, legate de o pagina din `custom_pages` (`usePaginaProprie`,
  salvare cu „Salvează pagina”). Datele panourilor (produse, categorii, formulare, pachete, integrari, legaturi,
  randuri de produse) le aduce `dateEditorPagina`, tot pe o pagina anume.
- **Randarea lor:** pe magazin, pe SERVER (`BlocuriPagina`: interogari pentru produse, pachete, formulare,
  integrari), dupa `prepareBlocksForPublic` (granita de incredere: textul prin lista alba, codul cu JS in cadru
  izolat, `raw` ignorat). Pagina principala proprie le trimite randului din client ca „sloturi”
  (`FurnizorSloturiBlocuri` / `SlotBlocuri`, sectiunea `rich_blocks`, care exista doar la citire, nu in catalog).
  In editor, `PaginaVie` le randeaza in client, pe loc, din mesajul editorului, cu datele de previzualizare.
- **Designul:** pagina principala e o LISTA de sectiuni (`design.home`); Pagina Magazin (`shop.page`) si pagina
  de produs (`product.page`, plus `product.sabloane[].page`) sunt cate O sectiune. Pagina de produs are blocuri
  fixe pe zone (`blocuri.ts`): fiecare tip o data, fara reglaje; `parseBlocuri` arunca orice altceva. Parserul
  pastreaza din `settings` doar campurile inregistrate ale sectiunii. Designul trece prin ciorna si „Publică”,
  cu Anuleaza / Refa si istoric (etapele 6-7); plafon 200 KB (`MAX_DESIGN_BYTES`).
- **Formularele:** contactul simplu si newsletterul isi cauta blocul in `custom_pages`, dupa `pageId` +
  `blockId` (`submitPageForm`, `aboneazaNewsletter`); puse in design ar raspunde „Formularul nu mai există pe
  pagină”. Contactul legat de un formular din „Formulare” (`formId`) nu are nevoie de pagina.
- **Salvarea paginilor:** `gateRawBlocks` (semnul `raw` doar pentru admin) si plafon 400 KB; la incarcarea in
  editor, `curataHtmlPentruEditor` (un `<img onerror>` scris direct in baza ar fi rulat pe originea panoului,
  inclusiv la un admin care intra prin impersonare).
- **Productia (doar citire, 27.10):** 25 de magazine cu design (cel mai mare 3,1 KB); 35 de pagini proprii
  (blocurile: cel mai mare 31 KB, 95% sub 9 KB, mediana 2,3 KB); 4 blocuri de contact / newsletter; o
  trimitere in ultimele 30 de zile.
- Biblioteca Media citeste tot randul `store_settings` (`fetchCatalog`), deci pozele din blocurile puse in design
  se socotesc folosite. Cu o pagina proprie ca pagina principala, „Acasă” e chiar pagina aceea (nota din arbore).

### Deciziile etapei (propuse 27.10; cele doua intrebari le-a hotarat el, vezi 2 si 3)

1. **Un tip nou de sectiune, „Conținut liber” (`continut_liber`), pe pagina principala.** Se adauga din „Adaugă
   secțiune”, de cate ori e nevoie; se muta, se ascunde, se duplica si se sterge ca orice sectiune. Blocurile lui
   sunt chiar blocurile paginilor proprii (toate, fara „Din pagina principală”), tinute in design. Deci intra in
   ciorna si ajung la clienti la „Publică”, cu Anuleaza / Refa si istoric, ca restul editorului (decizia din etapa 6).
2. **Pe pagina de produs: „Conținut liber” in zona „Sub produs”**, la Clasic si la Detaliat, de cate ori e nevoie
   („+ Adaugă conținut liber” sub zona). Sta in pagina sablonului, deci fiecare sablon are continutul lui.
   **Raspunsul lui (27.10): „Doar „Sub produs””**: coloana de cumparare (pretul, variantele, comanda) ramane neatinsa.
3. **Pe Pagina Magazin: doua zone, „Deasupra produselor” si „Sub produse”**, cu „Conținut liber”.
   **Raspunsul lui (27.10): „Doar pe /magazin”**: paginile de categorie, brand si cautare raman cu descrierile lor.
4. **In arbore, ca la o pagina proprie:** „Conținut liber” se deschide in blocurile lui (plus sub bloc, sageti,
   duplica, sterge, coloane cu „Adaugă în coloană”); clicul deschide `BlockSettings`, „Adaugă bloc” deschide
   `PaletaBlocuri` (blocurile de integrare doar cand integrarea e activa). Aceleasi piese ca la paginile proprii,
   desprinse de `custom_pages` ca sa lucreze pe orice lista de blocuri: un bloc se regleaza exact la fel.
5. **Previzualizarea pe loc, fara salvare:** mesajul de design duce deja sectiunile; in modul editor, magazinul
   randeaza blocurile in client (`BlockRenderer`, ca `PaginaVie`), cu datele de previzualizare trimise o data.
   Clicul in previzualizare alege blocul in arbore; mouse-ul pe rand il incadreaza.
6. **Pe magazin, pe server:** `BlocuriPagina` + `prepareBlocksForPublic`, ca la paginile proprii, trimise ca
   sloturi pe pagina principala, pe ruta produsului si pe Pagina Magazin. Fonturile si animatiile ca la pagini.
   Fara H1 din blocuri: pagina are deja titlul ei (hero-ul, numele produsului, titlul catalogului).
7. **Formularele merg si din design:** contactul simplu si newsletterul isi cauta blocul in designul PUBLICAT
   (niciodata in ciorna), dupa id. Trimiterea se scrie fara pagina, cu locul ei („Pagina principală”, „Pagina
   Magazin”, „Pagina de produs”), care apare in „Mesaje”. Id-urile blocurilor raman unice in tot designul
   (duplicarea unei sectiuni le reface), altfel un formular ar raspunde in numele altuia.
8. **Siguranta si plafoanele:** la salvarea cioarnei si la „Publică”, aceeasi poarta `raw` ca la pagini
   (`gateRawBlocks`); parserul lasa doar tipurile cunoscute si o adancime marginita; la incarcarea in editor,
   `curataHtmlPentruEditor`. Plafonul designului ramane 200 KB (cea mai mare pagina proprie de azi are 31 KB), cu
   mesaj care spune ca e de la continut.
9. **Datele panourilor:** partea de magazin din `dateEditorPagina` (produse, categorii, formulare, pachete,
   integrari, legaturi, randuri de produse) se desprinde intr-o citire a magazinului, ceruta o data, cand se
   deschide primul „Conținut liber”. Paginile proprii o folosesc si ele, deci nu exista doua copii.
10. Cu o pagina proprie ca pagina principala, „Conținut liber” nu se ofera pe „Acasă” (pagina aceea are deja
    blocuri; nota din arbore duce la ea).
11. Fara migratii. Un magazin care nu adauga nimic ramane identic (designul fara tipul nou se citeste la fel).

### Pasii (bifati pe masura ce se fac)

- [ ] 9.1 Modelul: tipul `continut_liber` (catalog, galerie cu miniatura pe blocuri de exemplu), blocurile lui
      curatate la citire (tipuri cunoscute, coloane, adancime, numar), tipul repetabil in zona „Sub produs” si
      zonele Paginii Magazin; operatiile (adauga, duplica cu id-uri noi, sterge, muta). Probe pe functii pure.
- [ ] 9.2 Salvarea si formularele: poarta `raw` si plafonul la ciorna si la „Publică”; contactul si newsletterul
      cautate in designul publicat, cu locul in „Mesaje”. Probe si mutanti.
- [ ] 9.3 Magazinul: sloturile randate pe server pe pagina principala, pe produs (pe sablon) si pe Pagina
      Magazin; fonturi, animatii, fara H1. Probe; verificat pe magazinul demo.
- [ ] 9.4 Editorul: arborele si panourile pe orice lista de blocuri, intrarile „Adaugă”, datele magazinului,
      previzualizarea pe loc si clicul. Probe.
- [ ] 9.5 Ghidul din centrul de ajutor, REGISTRU (C si D), porti, proba in Chrome pe magazinul de proba (cele trei
      pagini, un sablon de produs, un formular trimis din design, „Publică”, „Renunță”, istoricul), totul pus la loc.

## Deciziile proprietarului

- 24.10.2026: „Mergem pe stilul celor de la Shopify plus un strat avansat.”
- 24.10.2026: tot pe o ramura separata, local, productia neatinsa pana la final.
- 24.10.2026: „Incepe cu etapa 1, le luam pe rand pana finalizam tot.”
- **INTREBARE DESCHISA:** teme intregi („alege un stil de magazin” la inceput, care aseaza toate
  sectiunile deodata) sau doar sectiuni alese una cate una? Pusa pe 25.10, inainte de etapa 4;
  fara raspuns inca, ramasa pentru lista lui de la final.
- 25.10.2026, „mentiune foarte importanta”: „cand esti aici la Editeaza magazinul nu trebuie sa
  mai apara nici Sidebar, nici Topbar, sa fie intreaga pagina asta cu editarea ca sa fie mult
  loc”. Facut in 4.7: editorul ia tot ecranul, se iese cu „Ieși” din bara lui.
- 25.10.2026, la intrebarea pentru 4b (de unde se alege sablonul unui produs): „Din editor, pe
  categorii”. Produsele anume intra ca exceptii, tot din editor.
- 25.10.2026, la intrebarea pentru etapa 6 (cand ajunge continutul la clienti): „Totul la
  „Publică””. Un singur buton, ca la Shopify; paginile din „Pagini” raman cu „Salvează pagina”.
- 27.10.2026, lista lui de la final (cinci puncte, in „Etapa 8”), si raspunsurile la intrebari: setarile
  in editor, salvate direct, DOAR acolo; blocuri ca la paginile proprii si pe pagina de produs; arborele
  fara iconite; previzualizarea pe toata latimea.
- 27.10.2026, la planul etapei 9 („Da”, apoi raspunsurile): „Conținut liber” pe Pagina Magazin „Doar pe /magazin”;
  pe pagina de produs „Doar „Sub produs””.

## De ce Shopify si nu Elementor

- Elementor (panza libera, orice element oriunde) e facut pentru designeri. Comerciantii fac cu el
  magazine stricate pe telefon, lente, cu logica de comert (pret, variante, cos) fragila, si
  tichete de suport „mi s-a stricat pagina”.
- Shopify (Online Store 2.0): pagina -> sectiuni -> blocuri in sectiuni, plus setari globale de
  tema. Libertate mare, dar intre margini: telefonul nu se poate strica, spatierile sunt pe o
  scara, pretul ramane legat de logica. E modelul pe care comerciantii il stiu deja.
- „Absolut tot customizabil” si „foarte simplu” se bat cap in cap daca stau pe acelasi nivel. Se
  impaca pe STRATURI, fiecare ascuns pana e nevoie de el:
  1. Tema / stil global: culori, fonturi, butoane, colturi (exista: `StoreStyle`).
  2. Sectiuni: adaugi, ordonezi, ascunzi, alegi un design (variantele devin puncte de pornire).
  3. Blocuri in sectiune: titlu, text, buton, imagine, pret; muti, ascunzi, setezi.
  4. „Avansat”, strans implicit: spatieri, fundal, animatii, ascuns pe mobil, CSS/HTML.
  90% din oameni raman la 1-2.

## Ce NU facem

- Pozitionare libera prin tragere.
- Layout de telefon editat separat: telefonul se face singur, cel mult „ascuns pe mobil”.
- Checkoutul editabil vizual: doar culori si cateva texte. Acolo sunt banii, TVA-ul, rambursul.
- Setari de business in editorul vizual (etapa 1 le-a scos). ⚠ Etapa 8 (27.10, cererea lui) a adus
  datele magazinului, formularul de comanda si catalogul inapoi in editor, dar intr-o fila a lor,
  „Setări”, salvate direct cu „Salvează”, nu prin „Publică”, si nu in arborele vizual.

## Interfata tinta (etapa 2)

- **Bara de sus:** „Editezi: Pagina de produs ▾” (alegi pagina), desktop / telefon, anuleaza /
  refa, Salveaza / Publica, starea publicarii (comutatorul „Publicare” de azi ajunge aici).
- **Stanga:** arborele de sectiuni si blocuri, „+ Adauga sectiune” (galerie cu miniaturi, exista
  `VariantCard`). La clic pe un element, setarile lui intra in acelasi panou.
- **Dreapta:** previzualizarea live (exista `RamaPreview` + protocolul `postMessage`).
- Mai tarziu: clic pe element in previzualizare il selecteaza in arbore (etapa 3); istoric de
  versiuni, „revino la ce era ieri” (etapa 7), plasa de siguranta pentru cei care se tem sa
  atinga ceva.

## Riscurile

1. E cel mai mare proiect de interfata de pana acum: o unificare de modele de date, nu un ecran.
2. Magazinele existente: modelul nou se DERIVA la citire din cel vechi (ca `{}` = clasic azi),
   deci nicio migrare de date si nicio schimbare vizuala la lansare.
3. Viteza vitrinei: sectiunile raman randate pe server, blocurile fara JS pe vitrina.
4. Pagina de produs pe blocuri: personalizarea cu pret pe suprafata (`CampuriPersonalizare`,
   `usePersonalizare`) ramane UN bloc legat de logica; vezi memoriile despre pretul autoritar.

## Repere tehnice pentru etapele 2-4 (citite in cod pe 24.10.2026)

- `components/editor/StoreEditor.tsx`: editorul vechi. Panouri ramase: Identitate vizuala,
  Pagina produs, Pagina principala, Sectiuni produse, Publicare. Trimite DOAR cheile atinse
  (`cheiAtinse` + `salveazaPanou`, `components/editor/chei-atinse.ts`); comutatoarele vechi scot
  semnul din design prin `elibereazaComutatoare` (`lib/storefront/design/comutatoare-vechi.ts`).
  Previzualizare: `RamaPreview` + `suprafete-preview.ts`, doar `?preview=1`, navigabila.
- `components/store-editor/StoreDesignEditor.tsx` (`/dashboard/editor/design`): ciorna in
  `storefront_design_draft`, publicare in `storefront_design`; protocolul cu iframe-ul in
  `lib/storefront/design/preview-protocol.ts` (`?preview=1&editor=design`, marcheaza sectiunile,
  blocheaza clicurile, doar pentru proprietar). De aici porneste clicul pe element din etapa 3.
- `components/store-editor/SectionDesignBrowser.tsx` (`/dashboard/editor/sectiuni`): galeria de
  variante cu miniaturi vii.
- `lib/storefront/design/registry.ts` (sectiuni, variante, campuri cu `showIf`, implicite),
  `parse.ts` (derivarea din `page_content`), `types.ts` (`enabled` / `enabledOverride`, trei stari).
- Paginile: `components/pages/PageBuilder.tsx`, `BlockSettings.tsx`, `lib/pages/blocks.types.ts`,
  tabela `custom_pages`.
- Meniul panoului: `lib/navigatie-panou.ts` (sursa unica, proba `navigatia-nu-divergeaza`).
  Lista de activare din panou trimite la `/dashboard/editor` pentru „Personalizeaza” si „Publica”.

## Regulile de lucru

- Ramura Git **`editor-magazin`**, DOAR LOCAL. Nu se impinge pe GitHub pana la final: o ramura
  noua impinsa primeste preview Vercel, iar preview-urile (in afara de `redesign-dashboard`) au
  cheile bazei de PRODUCTIE.
- `npm run dev` scrie in baza DEMO `krycmubsiojipwslxrka` (`.env.development.local`).
  Productia (`rtefdpioqmowkdiybwrr`) nu se atinge: nici migratii, nici variabile, nici push.
- Fiecare schimbare de schema, variabila noua sau pas de la final se scrie IN CLIPA aceea in
  `REGISTRU.md` din acelasi dosar.
- La final: porti (tsc, test, build, lint:prag, tipuri-db, baseline, coloane), migratiile in
  ordine, apoi unirea in `main` si push, doar cu acordul proprietarului.

## Ce exista azi (inventar)

Trei modele de date si patru ecrane pentru acelasi lucru:

| Ecran | Ruta | Unde scrie | Componenta |
|---|---|---|---|
| Editeaza magazinul | `/dashboard/editor` | `store_settings.page_content` + coloane din `businesses` | `components/editor/StoreEditor.tsx` (2.380 randuri) |
| Design sectiuni (catalog) | `/dashboard/editor/sectiuni` | `storefront_design_draft` | `components/store-editor/SectionDesignBrowser.tsx` |
| Editor design cu preview | `/dashboard/editor/design` | `storefront_design_draft` -> `storefront_design` | `components/store-editor/StoreDesignEditor.tsx` (iframe + `postMessage`) |
| Pagini | `/dashboard/pages` | tabela `custom_pages` (blocuri) | `components/pages/PageBuilder.tsx`, tipuri in `lib/pages/blocks.types.ts` |

Registrul sectiunilor: `lib/storefront/design/registry.ts` (antet, anunt, subsol, 14 tipuri de
sectiuni pe acasa, `product_page`, `shop_page`, card de produs, cos, checkout; ~160 de variante).
Stilul global: `StoreStyle` -> variabile CSS `--st-*` (`lib/storefront/design/css-vars.ts`).

### Panourile din „Editeaza magazinul”, clasificate

D = design (merge in editorul nou) · C = continut (devine bloc/setare de sectiune) ·
S = setare de business (se muta in Setari, nu e design)

| Panou | Ce contine | Unde ajunge |
|---|---|---|
| Informatii generale | nume, slogan, descriere, telefon, WhatsApp, email | S (Setari > Magazin); sloganul/descrierea se pot afisa prin blocuri |
| Identitate vizuala | logo, favicon, culoare, fundal, fonturi, marime logo, bannere hero, efect buton | D (stil global + sectiunea Hero) |
| Social media | linkuri | S, afisate de blocul „Social” din subsol |
| Pagina produs | insigne de incredere, beneficii, „cum functioneaza”, FAQ, recenzii, zoom, livrare estimata, bara lipicioasa, interval de pret, insigna „Nou” | C: blocuri ale sablonului Produs |
| Pagina principala | bara de anunt, ordinea produselor, sortare, filtre, beneficii, recenzii, FAQ, insigne subsol, ascunderi de produse | D/C pentru sectiuni; regulile de catalog (ascunde fara poze/stoc, categorii goale, sortarea implicita) = S (Setari > Catalog) |
| Sectiuni produse | `product_sections` (sectiuni pe produs/categorie) | C: blocuri ale sablonului Produs, cu conditie pe categorie |
| Formular de comanda | campuri proprii, extraoptiuni cu pret, campuri ascunse, email, cod postal, firma, cod discount | **S** (Setari > Comanda). Atinge banii: NU intra in editorul vizual |
| Publicare | magazin publicat/nepublicat, adresa | bara de sus a editorului nou |

### Ce face pagina de produs „needitabila”

`product_page` e o singura sectiune (variante `classic` / `detailed` + comutatoare), fiindca
galeria, varianta aleasa si pretul impart starea. Se rezolva cu un context de produs la nivelul
sablonului; blocurile il citesc.

## Modelul tinta

```
Tema (StoreStyle: culori, fonturi, butoane, colturi, spatieri)
Antet / Subsol (globale)
Sablon: Acasa | Produs (+ sabloane alternative pe categorie/produs) | Catalog | Pagina | Articol | Cos
  Sectiune (din registru; varianta = punct de pornire)
    Bloc (titlu, text, buton, imagine, pret, galerie, variante, ...)
      Setari de baza  +  „Avansat” (spatieri, fundal, animatie, ascuns pe mobil, CSS)
```

Needitabil vizual: checkoutul (doar culori si cateva texte), calculele de pret, TVA, ramburs.

## Etapele

1. **Inventar + mutarea setarilor de business in Setari** (Comanda, Catalog, Magazin, Social).
   FACUT 24.10.2026: Setari > General (magazinul, contactul, adresa, butoanele flotante,
   retelele, datele firmei, un singur buton), Setari > Formular de comanda, Setari > Catalog.
   Editorul are trimiteri spre ele. Fara migratii. Detalii si ce se verifica: `REGISTRU.md`.
   ⚠ 27.10.2026, etapa 8: la cererea lui s-au mutat inapoi, in editor, fila „Setări” (vezi „Etapa 8”).
2. **Un singur ecran**: `/dashboard/editor` cu bara de sus (alegi pagina, desktop/mobil,
   anuleaza/refa, Salveaza/Publica), stanga arborele, dreapta previzualizarea. La inceput
   gazduieste editoarele existente. FACUT si PROBAT 25.10.2026 (planul si bifele mai sus).
3. **Click in previzualizare**: `data-sectiune` / `data-bloc`, contur la hover, selectie la clic.
   FACUT si PROBAT 25.10.2026 pentru sectiuni (planul si bifele mai sus); `data-bloc` vine cu etapa 4.
4. **Blocuri in sectiuni**; pagina de produs sparta in blocuri cu context comun; sabloane de
   produs multiple.
5. **Paginile** pe acelasi model; convertor din `custom_pages` (blocurile PageBuilder devin
   blocuri intr-o sectiune „Continut liber”).
6. **Retragerea `page_content`** ca sursa de design. Pana atunci parserul deriva modelul nou din
   cel vechi la citire (ca `{}` = clasic azi): zero migrare de date la lansare.
7. Istoric de versiuni (revino la o publicare anterioara). FACUT si PROBAT 26-27.10.2026 (planul si
   bifele mai sus).

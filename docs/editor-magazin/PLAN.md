# Editorul unic al magazinului

Hotarat 24.10.2026: un singur „Editeaza magazinul”, pe modelul Shopify (sabloane, sectiuni,
blocuri in sectiuni, stil global) plus un strat „Avansat” strans implicit. Fara panza libera
(Elementor).

## Stare si reluare (citeste intai)

**Ultima stare, 25.10.2026:** etapele 1, 2 si 3 FACUTE, comise local si PROBATE pe ecran. **Etapa 4a
(blocurile paginii de produs) FACUTA si PROBATA pe ecran (4.6)**, cu acordul lui: „Da, continua. O
sa iti dau la final lista cu toate mentiunile mele”. **4.7, editorul pe tot ecranul („mentiune foarte
importanta” a lui), FACUT si PROBAT** (vezi pasul 4.7). **Urmeaza 4b** (sabloane de produs pe categorie
sau pe produs), cu plan separat scris inainte de cod. Intrebarea despre teme a fost pusa si a ramas
fara raspuns; etapa 4 nu depinde de ea, deci ramane deschisa pentru lista lui de la final. Planul si
bifele: sectiunea „Etapa 4: planul de lucru”.

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
- [ ] 4b Sabloane de produs alternative, pe categorie sau pe produs (plan separat, dupa 4a): vezi mai jos.

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
- [ ] 4b.3 Editorul: randul „Șablon”, panoul sablonului, arborele pe sablonul ales, previzualizarea pe
      un produs al sablonului (actiune care gaseste unul). Probe.
- [ ] 4b.4 Porti + proba in Chrome.

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
- Setari de business in editorul vizual (etapa 1 le-a scos).

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
7. Istoric de versiuni (revino la o publicare anterioara).

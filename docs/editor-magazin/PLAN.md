# Editorul unic al magazinului

Hotarat 24.10.2026: un singur „Editeaza magazinul”, pe modelul Shopify (sabloane, sectiuni,
blocuri in sectiuni, stil global) plus un strat „Avansat” strans implicit. Fara panza libera
(Elementor).

## Stare si reluare (citeste intai)

**Ultima stare, 28.10.2026:** etapele 1, 2 si 3 FACUTE, comise local si PROBATE pe ecran. **Etapa 4a
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
pagina de produs, „Conținut liber”), FACUTA si PROBATA** (pasii 9.1-9.5, 27-28.10, cu raspunsurile lui: „Doar
„Sub produs”” si „Doar pe /magazin”; proba in Chrome pe acordul zilei de 27.10, sablonul verificat pe server).
**Toata lista lui (punctele 1-5) e facuta.** **Inchiderea a pornit 28.10, cu acordul lui („Da”): pasul 5, ghidurile
din centrul de ajutor, FACUT** (G.1-G.4, sectiunea „Inchiderea, pasul 5”); raman 5 capturi, de facut de el (REGISTRU D).
Decizia lui: „nu dai push ca mai avem ceva de facut”, deci **nici migratia din REGISTRU A, nici push-ul, pana spune el**.
Apoi: contorul de vizitatori masurat (etapa noua) si temele intregi, „dupa ce terminam de verificat tot ce am facut
acum” (raspunsurile lui din 28.10, in „Deciziile proprietarului”). Planul si bifele: sectiunile „Etapa 4: planul de
lucru” si „Etapa 5: planul de lucru”. **A doua verificare (W1-W6, ceruta 28.10: „O verificare si sa iti spun
mentiunile mele”) FACUTA**, cu o reparatie (bara de sus pe tableta, W5). **Mentiunile lui au venit pe 28.10** (doua:
„+” in previzualizare, subsolul customizabil complet; raspunsurile in „Mentiunile lui din 28.10”): **etapa 10 („+”)
FACUTA si PROBATA in Chrome** (pasii 10.1-10.4); **etapa 11 (subsolul pe coloane-bloc) FACUTA si PROBATA in Chrome**
(pasii 11.1-11.4, acordul lui: „Da”, apoi „Da, fă proba acum”). Ambele mentiuni sunt facute, raportul trimis.
**Etapa 12 (contorul de vizitatori masurat, robotii scosi si din Statistici) FACUTA si PROBATA in Chrome, 28.10, seara**
(pasii 12.1-12.4), la „Hai sa continuam de unde am ramas”: planul, masuratorile si cele doua raspunsuri ale lui in „Etapa
12”; la proba s-a gasit si s-a reparat previzualizarea paginii de produs, care nu arata continutul din ciorna.
**Mentiunile lui din 28.10, seara (cinci), impartite in etapele 13-15** (sectiunea „Mentiunile lui din 28.10, seara”):
**etapa 13 FACUTA si PROBATA** (blocul pus cu „+” numit si deschis direct, animatiile in editor, „Șterge”, linkul
bannerului cu sugestii), raportul trimis; **etapa 14 (fonturile pe sectiune, aceleasi 33 si in Stil) FACUTA si PROBATA**
(pasii 14.1-14.4), raportul trimis; **etapa 15 (tipul de checkout in Setări > Comanda) FACUTA si PROBATA** (pasii
15.1-15.4), raportul trimis; urmeaza temele, cu acordul lui. Intre timp `main` a primit
reparatia eMAG `dba33c22`, adusa in ramura prin `28b1cd9c`. Tot fara push si fara migratie, pana spune el (inaintea push-ului: suita intreaga si `build:ci`).
**Temele (etapele 16-20, 28-29.10) FACUTE si PROBATE**, cu acordul lui la fiecare (sectiunea „Temele: prima tema,
„Jupiter””): aspectul Jupiter (16), pagina „Teme” cu aplicarea prin Istoric (17), datele demo cu limita planului (18),
demo-ul pe `jupiter.edinio.com` fara comenzi (19), setul demo din materialul lui (20, `cbcb1e77`). Raportul etapei 20
trimis 29.10, seara. Intrebarea despre cele 6 raioane fara produse a primit raspuns pe 30.10: raman, cu „0 produse” pe
placile de pe prima pagina (20.5, facut si probat). `build:ci` a trecut si pe `cbcb1e77` (30.10, dupa caderea VS Code; la
etapa 20 nu rulase, serverul de dezvoltare era pornit). **Etapa 21 (patru mentiuni dupa demo: golul de langa cautare, „Despre
noi”, pozele mari de pe pagina de produs, subsolul premium fara newsletter) FACUTA si PROBATA**, 30.10. **Etapa 22 (faviconul
demo-ului, butoanele magazinului cu mana, hoverul cardului) FACUTA si PROBATA**, 30.10.
Productia demo-ului: REGISTRU „E”, doar dupa push, cu acordul lui.

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
8. **Siguranta si plafoanele:** semnul `raw` nu intra deloc in design (il scoate parserul, care e si validarea de
   la salvare si de la „Publică”; facut asa la 9.2, in locul portii pe rol de admin); parserul lasa doar tipurile
   cunoscute si o adancime marginita; la incarcarea in editor, `curataHtmlPentruEditor`; la client nu pleaca
   blocurile din design (9.3). Plafonul designului ramane 200 KB (cea mai mare pagina proprie de azi are 31 KB),
   cu mesaj care spune ca e de la continut.
9. **Datele panourilor:** partea de magazin din `dateEditorPagina` (produse, categorii, formulare, pachete,
   integrari, legaturi, randuri de produse) se desprinde intr-o citire a magazinului, ceruta o data, cand se
   deschide primul „Conținut liber”. Paginile proprii o folosesc si ele, deci nu exista doua copii.
10. Cu o pagina proprie ca pagina principala, „Conținut liber” nu se ofera pe „Acasă” (pagina aceea are deja
    blocuri; nota din arbore duce la ea).
11. Fara migratii. Un magazin care nu adauga nimic ramane identic (designul fara tipul nou se citeste la fel).

### Pasii (bifati pe masura ce se fac)

- [x] 9.1 (27.10: `lib/storefront/design/continut-liber.ts` cu forma blocurilor, `parseBlocuriLibere` stabila si
      idempotenta, plafon 80 de blocuri si 10 continuturi pe sectiune; `continut_liber` in catalog, `full`; in
      `blocuri.ts` tipul `repetabil` sub produs, la Clasic si Detaliat, si schema Paginii Magazin cu `continut_sus`
      / `continut_jos`; `adaugaContinut`, `duplicaContinut`, `stergeContinut`; in `edit.ts` `CaleContinut`,
      `blocuriLaCale`, `schimbaBlocuriLaCale`, duplicarea sectiunii cu id-uri noi. Magazinele de dinainte citesc
      acelasi design: Pagina Magazin fara continut ramane fara cheia `blocks`. 17 probe noi, mutanti 26/26.
      Gasit la probe: fara cheia `blocks`, `schimbaBlocurile` refuza primul continut pe Pagina Magazin, iar
      `completeazaBlocurileSectiunii` scria `blocks: []`; amandoua reparate. Proba „bucatile zonei” cere acum
      doar bucatile fixe; randarea continutului e `test.todo` pana la 9.3. Miniatura din galerie ramane la 9.4.)
      Modelul: tipul `continut_liber` (catalog, galerie cu miniatura pe blocuri de exemplu), blocurile lui
      curatate la citire (tipuri cunoscute, coloane, adancime, numar), tipul repetabil in zona „Sub produs” si
      zonele Paginii Magazin; operatiile (adauga, duplica cu id-uri noi, sterge, muta). Probe pe functii pure.
- [x] 9.2 (27.10: semnul `raw` al codului personalizat nu intra deloc in design: `parseBlocuriLibere` il scoate, iar
      parserul e chiar validarea de la salvare si de la „Publică”, deci nu mai trebuie o poarta pe rol de admin
      (randarea oricum nu-l mai citeste). Plafonul de 200 KB ramane, cu mesaj care trimite la „Conținut liber”.
      Formularele: componentele trimit calea containerului (`caleDesign`, `caleInText`), iar `submitPageForm` si
      `aboneazaNewsletter` cauta blocul in designul PUBLICAT (`blocDinMagazinPublicat`, niciodata ciorna), numai
      daca se vede in magazin (`blocDinMagazin`: sectiunea aprinsa, fara pagina principala proprie si fara modul cu
      un produs; continutul aprins sub produs; Pagina Magazin cu pagina ei); trimiterea se scrie fara pagina, cu
      locul, iar „Mesaje” il arata. 9 probe noi, mutanti 22/22.) Salvarea si formularele: poarta `raw` si plafonul
      la ciorna si la „Publică”; contactul si newsletterul cautate in designul publicat, cu locul in „Mesaje”.
      Probe si mutanti.
- [x] 9.3 (27.10: `sloturi-pe-server.tsx` cu `slotBlocuri` (aceeasi invelitoare pentru pagina principala proprie si
      pentru „Conținut liber”: fonturi, animatii, interogari) si `sloturiContinutLiber` (blocurile prin
      `prepareBlocksForPublic`, fara H1, cu calea pentru formulare); sloturile pe pagina principala, pe produs
      (sablonul ales pe server; si la magazinul cu un produs) si doar pe `/magazin`; in client `ContinutLiber`
      (slotul, sau in editor blocurile venite NUMAI prin mesajul editorului, cu datele cerute o data:
      `cereDateBlocuri` / `dateBlocuri`), zonele Paginii Magazin in `ShopPageSection`, continutul de sub produs in
      Clasic si Detaliat (`test.todo` de la 9.1 devenit proba). VERIFICAT pe demo cu `curl` (continut pus temporar
      in designul publicat al `floraria-mirei`, pus la loc, amprentele egale): fiecare pagina isi randeaza continutul,
      formularul poarta calea, `<img onerror>` din text iese curatat. GASIT la verificare si reparat: fiecare pagina
      ducea la client (RSC) TOT designul, cu blocurile tuturor paginilor, necuratate, pe doua drumuri: designul
      rezolvat (`resolveDesign` da acum designul fara blocuri, `faraBlocuriLibere`, si lista lor separat, doar pentru
      server) si coloana bruta din randul de setari (`faraDesignulBrut`, pe pagina principala, produs, Magazin).
      Probe noi, mutanti 30/30.) Magazinul: sloturile randate pe server pe pagina principala, pe produs (pe sablon)
      si pe Pagina Magazin; fonturi, animatii, fara H1. Probe; verificat pe magazinul demo.
- [x] 9.4 (27.10: `ListaBlocuri` (randurile blocurilor, desprinse din `ArborePagina`, aceleasi la pagini si la
      continut), `PanouBlocComun` (setarile unui bloc pe orice lista), `PanouContinutLiber` (blocurile, „Adaugă
      bloc”, ochiul, duplica / sterge pentru continutul de sub produs si de pe Magazin); in `EditorMagazin`
      containerul deschis (`caleLiber`), blocul si tinta legate de cheia containerului, totul prin ciorna
      (`schimbaBlocuriLaCale`); datele magazinului desprinse din `dateEditorPagina` (`DateBlocuri`,
      `incarcaDateBlocuri`, o singura citire), cerute o data (`dateBlocuriInEditor`) si trimise in cadru;
      clicul din previzualizare desfacut de `alegereDinClic`; zonele cu „Adaugă conținut liber” si goale; galeria
      fara continut cand pagina principala e una proprie, cu miniatura pe blocuri de exemplu; blocurile curatate
      pentru editor la incarcare si la versiunea readusa (`curataContinutulPentruEditor`). 13 probe, mutanti
      28/28. Lint: 8 erori React Compiler aparute in `EditorMagazin` (un apel liber in randare, `caleInText`),
      reparate cu `useMemo`, pragul ramane 51.) Editorul: arborele si panourile pe orice lista de blocuri, intrarile
      „Adaugă”, datele magazinului, previzualizarea pe loc si clicul. Probe.
- [x] 9.5 (27-28.10: ghidul `cum-adaugi-continut-liber-in-magazin` (421 de ghiduri) si REGISTRU C si D (`904ad91f`);
      porti verzi dupa reparatii: tsc, 11.201 probe / 0 cazute, lint:prag 51 = pragul, build:ci; proba in Chrome pe
      `floraria-mirei`, contul de proba `9360c5a3`, prin impersonare, pe acordul zilei de 27.10) Ghidul, REGISTRU,
      porti, proba in Chrome. Vazut pe ecran: galeria arata „Conținut liber” cu miniatura; pus pe pagina principala
      (titlu, text, formular de contact), sub produs si deasupra produselor pe Pagina Magazin (pe varianta „Filtre în
      bara laterală”), totul in ciorna, cu Anuleaza / Refa pe bloc; „Publică” („Totul e publicat”, versiunea in
      istoric); in magazin fiecare pagina isi arata DOAR continutul ei, continutul de sub produs inaintea subsolului,
      fara designul brut in HTML; formularul trimis din continut a scris mesajul fara `page_id`, cu locul, iar
      „Mesaje” il arata („Formular de contact · Pagina principală”); `/cautare` fara continutul Paginii Magazin;
      continutul ascuns si publicat: nimic in HTML (nici textul, nici id-ul blocului), iar formularul ramas deschis in
      magazin a fost refuzat (niciun mesaj nou); „Readu în editor” si „Renunță”; la 390 si 768 px magazinul si
      editorul fara depasire. GASIT la proba si reparat: (1) dupa primul bloc pus intr-un continut, fiecare salvare
      a ciornei cadea cu „Designul a fost modificat in alta fila”: garda compara cu `JSON.stringify`, iar `jsonb`
      rearanjeaza cheile blocurilor, a caror ordine parserul n-o reface; acum `jsonCanonic`; (2) paleta continutului
      spunea „La sfârșitul paginii”, acum „La sfârșitul conținutului”; (3) textul `sr-only` al lacatului din arbore,
      fara parinte pozitionat, lungea documentul cu ~280 px, iar editorul pe tot ecranul se derula cu bara de sus cu
      tot; acum `relative`. GASIT la recitirea de dupa caderea editorului (28.10) si reparat: aceeasi ordine a cheilor
      in „are modificari?” (`useCiornaDesign`) si in amprenta cioarnei (`readu`): dupa un „Publică”, „Readu în
      editor” pe versiunea din magazin arata „modificari nepublicate” fara niciuna si adauga un pas gol la Anuleaza;
      acum `amprentaDesignului`, canonica (masurat: 0,67 ms pe un design de 72 KB, fata de 0,10; amprenta celui
      publicat se tine aparte). Mutanti 8/8. Sablonul de produs, verificat pe server cu `curl` (designul publicat
      pus temporar, facut cu operatiile editorului): sablonul cu produsul ca exceptie isi arata continutul, iar cel
      din „Implicit” lipseste si din datele RSC; fara atribuire, invers; pagina principala, niciunul. Pus la loc:
      designul (din versiunea `inainte`), `page_content` (cu `pagina_acasa`), versiunile, mesajul de proba, data
      abonamentului; verificat cu o singura comparatie. Caderea editorului a prins refacerea nepornita: cererea
      expirase („Invalid or expired requestState”), deci nimic nu se pusese la loc pana la reluare.)

## Inchiderea, pasul 5: ghidurile din centrul de ajutor (scris 28.10.2026, inainte de text)

Pasul 5 din „Ordinea de la final” (REGISTRU): capturile si textele de ajutor din tabelul D. Decizia lui (28.10):
„Inainte de push dar dupa ce termini, nu dai push ca mai avem ceva de facut”. Deci la capat: raport, fara push si
fara migratia din REGISTRU A.

Metoda, ca la auditul din 19.08 (`lib/website/ajutor.ts`): fiecare denumire citata se ia din codul editorului unic
(`components/editor-magazin/`, `components/store-editor/`, `lib/storefront/design/registry.ts` si `blocuri.ts`,
`lib/editor-magazin/noduri.ts`), nu din memorie; regulile lui de scriere (fara liniuta lunga, emoji, semne de
exclamare, pasi scurti, denumirile exacte, limitele spuse direct). Slug-urile raman (sunt adresele publice si
indexate); titlul se poate schimba. Ghidurile noi primesc slug nou. Capturi noi doar dupa regula din `ajutor.ts`
(A: tinta fara nume; B: orientarea, una pe grup; C: forma e informatia); le face el, dupa reteta din
`docs/ajutor/CAPTURI-AJUTOR.md`, deci in pagina raman substituenti pana atunci.

Inventarul (84 de ghiduri in „Design și pagini”, citite toate pe 28.10):
- **Raman** (scrise la etapa 8 sau neatinse de editor): datele de baza, adresa, butoanele flotante, social media,
  formularul de comanda (3), Biblioteca Media (fara un ghid), meniul, formularele, mesajele (fara doua detalii).
- **De rescris drumul** (trimit la „Design magazin” > Identitate vizuala / Pagina produs / Pagina magazin /
  Publicare, la „Design secțiuni”, la „Publică în magazin” sau la „Salvează” pe sectiuni): logo, favicon, marimea
  logo-ului, bannerele, textul peste banner (acum varianta „Imagine cu text peste”), culoarea principala, bara de
  anunt, fundalul, beneficiile / pasii / intrebarile / estimarea livrarii / efectul butonului (acum blocuri ale
  paginii de produs), zoom-ul si etichetele, creditul Edinio (acum in Subsol), beneficiile si garantiile de pe
  magazin (sectiunile „Beneficii” si „Beneficii pe scurt”), recomandatele si pragul, recenziile, bara de cos /
  eticheta „Nou” / intervalul de pret (Coșul si Stil > Cardul de produs), randurile de produse, publicarea
  magazinului (butonul „Vizibil” / „Ascuns” din bara de sus), salvarea, ordinea sectiunilor; toata grupa
  „Secțiuni” (galeria „Schimbă designul”, „Publică”, numele noi: Antet, Subsol, Banner principal).
- **Garantiile de pe pagina de produs** (decizia lui: „Rămân neafișate”): ghidul care le edita devine cel despre
  blocul „Garanțiile” (ochiul lui), cu textele fixe spuse direct.
- **Paginile** (constructorul vechi, retras la etapa 5): crearea, editarea si publicarea, blocurile (adaugare,
  mutare, coloane), SEO-ul, plus primul si ultimul pas din ghidurile fiecarui bloc („Salvează pagina”).
- **Noi:** cum e impartit editorul (orientarea, cu captura de grup), istoricul publicarilor (etapa 7, lipsa din
  REGISTRU D), sabloanele paginii de produs (4b), bucatile paginii de produs (4a: zone, ochi, lacat, sageti).
- **In alte categorii:** „Primii pasi” (unde se schimba culoarea si antetul) si „Produse” (randul „Recomandate”).
- **Gasit la inventar, in editor:** nota randului „Recomandate” spune „marcate „Popular””, dar in Produse semnul se
  numeste „Recomandat” („Popular” e eticheta din magazin). Se repara, cu proba.

### Pasii (bifati pe masura ce se fac)

- [x] G.1 (28.10: 33 de ghiduri citite fata de cod, 24 rescrise; noi: `cum-e-impartit-editorul-magazinului` (cu
      captura de orientare a grupului), `cum-muti-si-ascunzi-bucatile-paginii-de-produs`,
      `cum-readuci-o-versiune-publicata`; 424 de ghiduri. Garantiile: ghidul spune textele fixe si ochiul blocului.
      GASIT la citirea codului si reparat in editor: (1) la designul Detaliat comutatorul estimarii livrarii nu se
      putea atinge (blocul lui exista doar la Clasic, desi `blocuri.ts` spunea ca asta trebuie evitat); acum il are si
      panoul casetei „Detalii produs”, cu nodul `produs_livrare`; (2) nota antetului „Elegant, cu mesaj derulant”
      trimitea la „Design magazin”, scos; (3) nota randului „Recomandate” numea eticheta din magazin („Popular”) in
      locul semnului din Produse („Recomandat”). Probe, mutanti 5/5. Proba pe ecran a reparatiei (1): ramane, cere
      impersonare.) Grupa „Design magazin” si ghidurile noi ale ei (orientarea, istoricul, bucatile paginii de
      produs), nota „Recomandate” din editor.
- [x] G.2 (28.10: 11 ghiduri rescrise pe galeria „Schimbă designul” si pe „Publică”, cu numele noi (Antet, Subsol,
      Banner principal); numarul de design-uri verificat pe registru; nou: `cum-folosesti-sabloane-pentru-pagina-de-produs`
      (425 de ghiduri). Pagina de produs: doar reglajele ramase (firimiturile, „Adaugă în coș”, miniaturile, randurile
      rezumatului), restul trimis la blocuri. In editor: mesajele „modificat în altă filă” si „Nu există modificări de
      publicat.” au primit diacriticele, cum le citeaza ghidurile, cu proba. Vazut: optiunea „Ca în Editează
      magazinul” de la sortarea Paginii Magazin trimite la o sortare implicita fara control in editor (nici editorul
      vechi nu-l avea): REGISTRU D.) Grupa „Secțiuni”.
- [x] G.3 (28.10: paginile pe editorul unic: crearea, editarea si „Salvează pagina”, „Setările paginii”, blocurile
      (randul cu „+”, sageti, „⧉”, cos; coloanele; lista „Adaugă un bloc”, cu cele 18 blocuri si grupul integrarilor),
      Anulează / Refă pe pagina (raman si dupa salvare, verificat in reductor), ultimul pas din ghidurile fiecarui bloc;
      „Mesaje” cu locul formularelor din magazin; Biblioteca Media (unde e butonul); „Primii pasi” (culoarea, antetul)
      si „Produse” (randul „Recomandate”). Formularul din previzualizare tot scrie „Previzualizare”: verificat.)
      „Bibliotecă media” si „Pagini și formulare”; „Primii pasi” si „Produse”.
- [x] G.4 (28.10, facut: fiecare citat „...” din categorie cautat in sursa, fara diacritice si fara ghilimele (1084;
      toate cele scrise acum exista in cod; negasite doar compuneri din cod si etichetele „de altadata”, citate
      anume); probele centrului de ajutor 42/42 si ale editorului; 425 in `ajutor.ts`; capturile: 5 de facut, doua vechi
      (ecranele scoase) mutate in `docs/ajutor/capturi-scoase/`; REGISTRU C si D. Porti: tsc 0, `lint:prag` = pragul;
      suita intreaga, prima data oprita de sistem (memorie putina) dupa 1245 de probe, reluata cu acordul lui („Da”):
      11.202 trec, 0 cad, 2 sarite; `build:ci` trece.)
      Recitirea tuturor ghidurilor atinse fata de cod (fiecare denumire citata cautata in sursa), probele
      centrului de ajutor, numarul din `ajutor.ts`, lista capturilor (`npm run capturi -- --lista`), REGISTRU D,
      porti, raport. Fara push.

## A doua verificare, inaintea mentiunilor lui (ceruta 28.10.2026)

La „Ce vrei să mai facem înainte de push?”, raspunsul lui: „O verificare si sa iti spun mentiunile mele” (si „Da”
pentru suita intreaga si build). Aceeasi forma ca V1-V6, pe ce s-a schimbat de la `84080f8f` (etapele 8 si 9,
ghidurile): 93 de fisiere, 67 fara documente, probe si ghiduri; trei fisiere de actiuni de server
(`editor-pagini.actions.ts`, `page.actions.ts`, `store-design.actions.ts`). Fara agenti. Ce e defect clar se repara,
cu proba lui; ce e de gust intra in raport, pentru mentiunile lui.

- [x] W1 (28.10: `origin/main` tot la `122bfbff`, baza ramurii, deci unirea e curata; ce scrie fila „Setări”
      (coloanele firmei si ale contactului, retelele, butoanele flotante, `checkout_config`, cele trei chei de catalog) nu
      e pe lista alba a ciornei, deci „Publică” nu le poate calca; in PRODUCTIE `page_form_submissions.page_id` si
      `block_id` primesc `null`, fara constrangeri sau declansatoare in afara cheilor straine.) Conflicte: `origin/main` fata de baza ramurii; datele (ce scriu Setarile din editor fata de lista alba a
      ciornei; formularele din „Conținut liber” fata de schema `page_form_submissions` din PRODUCTIE).
- [x] W2 (28.10, productia: 25 de designuri, 16 `classic` si 9 `detailed`; 0 blocuri, 0 sabloane, 0 „Conținut
      liber”, 0 `continut` in design, deci lansarea nu schimba nimic la magazinele de azi; cel mai mare design 3,1 KB;
      3 cioarne vechi, fara `continut`, versiunea 1, citite de editor ca pana acum. 6 din cele 9 magazine Detaliat au
      estimarea livrarii pornita: fara reparatia de la G.1, dupa push n-ar fi putut-o opri din editor.) Buguri pe datele reale (productia, doar citire): designurile si continutul de azi fata de parserul nou
      (blocuri, sabloane, `delivery_estimate` la Detaliat), coloanele pe care se sprijina codul nou.
- [x] W3 (28.10: `dateBlocuriInEditor` verifica proprietarul (`id` + `user_id`, clientul cu RLS); `submitPageForm` si
      `aboneazaNewsletter` cauta blocul din „Conținut liber” in designul PUBLICAT si vizibil, nu in cerere, iar fara
      pagina, cale si formular nu scriu nimic; `getDesignVersion` curata blocurile pentru editor; ce pleaca la client,
      verificat cu `curl` la G (fara designul brut, fara continutul altor pagini). Nimic de reparat.) Buguri in cod: cele trei fisiere de actiuni (autentificare, proprietar, intrari), apoi ce pleaca la client
      (`resolveDesign`, sloturile, `curataContinutulPentruEditor`), apoi componentele cu stare noi.
- [x] W4 (28.10: scanerul de la V4, pe randurile adaugate in 64 de fisiere: doar chei tehnice, „salvezi” (corect fara
      diacritice) si textul de exemplu al magazinului, fara diacritice dupa regula lui. Nimic de reparat.) Texte: diacritice, ghilimele, fara linie lunga, pe randurile adaugate in panou de la `84080f8f`.
- [x] W5 (28.10, cu acordul lui pentru impersonare, pe `floraria-mirei` din baza DEMO: la 390, 768, 1024, 1280 si
      1920 px fila „Setări” (Informații generale, Formular de comandă), „Conținut liber”, caseta „Detalii produs” la
      Detaliat (comutatorul estimarii scrie in ciorna `continut.pc.delivery_estimate`) si cele 4 zone ale paginii de
      produs, fara nimic peste margine. **Gasit si reparat: intre 640 si ~990 px „Publică” iesea din ecran** (23 px pe
      768, de tot pe 800-850 px), fiindca grupul din dreapta, cu `min-w-0`, se strangea sub butoanele lui; un titlu lung
      de pagina proprie impingea la fel bara, la orice latime. Acum, sub 1024 px, istoricul, „Reîncarcă”, „Deschide
      magazinul”, „Vizibil” si „Renunță” stau in meniul „...”, ca pe telefon, iar starea („Modificări nepublicate”)
      apare de la 1024 px (sub atat ajungea la 0 px oricum). Grupul din dreapta nu se mai strange, se strange lista
      paginilor. Masurat de la 356 la 1440 px, si cu un titlu de 70 de caractere: „Publică” mereu in ecran. Proba noua
      prinde bara veche (`editor-magazin.test.ts`). Magazinul public (prima pagina, produsul, „Magazin”) la 390 si 768:
      nimic peste margine. „Renunță” a golit ciorna; baza demo pusa la loc, la fel pe fiecare camp din fisa de
      dinainte (doar `last_sign_in_at`, mutat de impersonare). Doua lucruri care NU sunt defecte: editorul cazut la
      768 era cheia „start”, pusa de scriptul meu in lista (omul alege doar din optiuni, iar adresa trece prin
      `paginaCeruta`), deci masuratorile de dinainte la 768 si 1280 fusesera pe pagina de eroare si s-au refacut;
      previzualizarea ramasa ascunsa la 1024 era fereastra Chrome din fundal (ResizeObserver nu ruleaza fara cadre;
      dupa o captura s-a micsorat corect).) Ecranul, in Chrome (cere conectarea lui pe localhost si acordul pentru impersonare): fila „Setări”,
      „Conținut liber”, caseta „Detalii produs” la Detaliat, la 390 / 768 / 1280 / 1920 px; magazinul public.
- [x] W6 (28.10: aceleasi ca la G.4, fiindca de atunci s-au schimbat doar documente: tsc 0, `lint:prag` = pragul,
      11.202 de probe / 0 cazute, `build:ci` trece.) Porti: suita intreaga si `build:ci` (tsc si `lint:prag` trecute la G.4), raport, comit.

## Mentiunile lui din 28.10 (dupa a doua verificare)

1. „Acolo in preview in dreapta sa fie un PLUS gen sa adaugi Bloc Nou”
2. „Footer-ul sa fie si el customizabil complet, acum nu poti customiza foarte multe chestii”

Raspunsurile lui la intrebari (28.10): „+” **„Între secțiuni”** (pe marginea elementului de sub mouse; pe telefon, pe cel
atins); pe pagina principala **„Secțiuni și blocuri”** (blocul ales intra singur intr-un „Conținut liber” pus acolo);
subsolul **„Pe coloane-bloc”** (coloane adaugate, mutate, ascunse, sterse: Logo si text, Linkuri, Text, Contact,
Newsletter, Imagine; culorile, retelele, „Înapoi sus”, copyright; blocul legal mereu jos). Etapa 10 = „+”, etapa 11 =
subsolul, una dupa alta, cu raport intre ele.

## Etapa 10: „+” in previzualizare (scris 28.10.2026, inainte de cod)

Citit inainte:
- Previzualizarea deseneaza doua contururi (`ConturEditor`): „peste” (mouse-ul sau randul din arbore) si „selectat”
  (panoul deschis), intr-un strat fara clicuri (`pointer-events: none`), in `body`, incarcat doar in editor. Clicurile
  le opreste TOATE `useDesignPreview` (captura pe `document`, `stopPropagation`), ca previzualizarea sa nu navigheze:
  un buton pus in strat nu-si primeste niciodata clicul prin React, deci clicul lui se citeste tot acolo.
- Adaugarea de azi: „Adaugă secțiune” din arbore deschide `GalerieAdauga` peste previzualizare; `addSection` pune
  sectiunea noua inaintea catalogului (fara pozitie). Randul de produse se face in continut (`product_sections`), iar
  ordinea randurilor intre ele o da continutul pana muta omul ceva (`ordineAtinsa`). Blocurile unei pagini proprii si
  ale unui „Conținut liber” se adauga din panoul „Adaugă un bloc” (`PanouAdaugaBloc` + `PaletaBlocuri`), cu o tinta
  (`TintaBloc`: index in lista sau in coloana, plus `dupa` pentru capul panoului). Un „Conținut liber” nou intr-o zona a
  paginii de produs / Paginii Magazin: `adaugaContinut` (stie deja `dupa`).
- Marcajele din previzualizare: sectiunile `data-st-section`, blocurile `data-st-bloc` = `<sectiune>/<bloc>` (pagina
  proprie `pagina:<id>/<bloc>`, continutul de pe Acasa `<sectiune>/<bloc>`, sub produs si pe Magazin
  `<pagina>/<continut>/<bloc>`), inclusiv blocurile din coloane.

### Deciziile etapei

1. **„+” sta pe elementul de sub mouse si pe cel selectat** (ecranul tactil n-are „peste”): un buton rotund pe marginea
   de jos („Adaugă dedesubt”) si, doar pe primul element din lista lui, si pe marginea de sus („Adaugă deasupra”), ca sa
   se poata pune ceva si in capul paginii. Mouse-ul dus pe buton pastreaza conturul (altfel butonul ar fi disparut sub
   cursor); clicul pe el nu alege sectiunea de dedesubt.
2. **Unde se ofera il decide editorul**, nu previzualizarea: o lista de puncte (id + daca are si „deasupra”), calculata
   pur din design si pagina, trimisa odata cu evidentierea:
   - Acasa (fara pagina proprie ca pagina principala si fara modul cu un singur produs): sectiunile paginii si blocurile
     din „Conținut liber”-urile ei;
   - pagina proprie: blocurile ei;
   - pagina de produs: bucatile zonei „Sub produs”, „Conținut liber”-urile si blocurile lor, plus sectiunea insasi (jos);
   - Pagina Magazin: sectiunea (sus = „Deasupra produselor”, jos = „Sub produse”), „Conținut liber”-urile si blocurile lor;
   - antetul, subsolul (coloanele lui vin in etapa 11), bara de anunt, cosul si comanda: nimic.
3. **Ce deschide „+”** (functie pura, din id si margine):
   - pe o sectiune de pe Acasa: galeria „Adaugă” peste previzualizare, cu doua grupuri, „Blocuri” (lista de la paginile
     proprii) si „Secțiuni” (miniaturile de azi), si locul scris sus („Se adaugă sub „Banner principal””). Sectiunea
     aleasa intra acolo; blocul ales intra intr-un „Conținut liber” nou, pus acolo, deschis in panou pe bloc. „Adaugă
     secțiune” din arbore deschide aceeasi galerie, cu ambele grupuri, la locul de azi (inaintea catalogului);
   - pe un bloc al unei pagini proprii sau al unui „Conținut liber”, ori pe un „Conținut liber” al paginii de produs /
     Paginii Magazin: panoul „Adaugă un bloc”, cu locul („sub „Titlu: ...””), ca „+”-ul din arbore; blocul intra langa
     cel ales (si in coloana lui), respectiv la capatul continutului;
   - pe o bucata fixa din „Sub produs” sau pe marginea paginii de produs / Paginii Magazin: tot „Adaugă un bloc”, dar
     blocul intra intr-un „Conținut liber” nou, pus acolo (plafonul de 10 pe pagina ramane, cu mesaj).
   Pe telefon editorul trece singur pe panou cand alegerea se face acolo.
4. **Totul ca pana acum, doar cu locul ales**: designul prin ciorna (Anulează / Refă, „Publică”), pagina proprie prin
   „Salvează pagina”. Randul de produse intra in continut si se muta la locul ales, intr-un singur pas la Anulează;
   ordinea randurilor intre ele urmeaza regula sagetilor (`ordineAtinsa` doar cand se schimba).
5. **Magazinul public nu primeste nimic**: butonul e in stratul de contur, iar mesajul nou exista doar intre editor si
   cadrul lui.

### Pasii (bifati pe masura ce se fac)

- [x] 10.1 (28.10: `lib/editor-magazin/adaugare.ts` cu `puncteDeAdaugare`, `ceAdaugaPlusul`, `tintaLangaBloc`,
      `sectiuneNoua`, `continutNou`; `TintaBloc` mutat acolo; `addSection(design, kind, loc)` si `mutaSectiuneaLa` in
      `edit.ts`; `adaugaContinut(..., loc, initiale)`; in protocol `PunctAdaugare`, `adauga`, `plusulDeSub`; 18 probe.)
      Logica fara React: punctele de adaugare pe pagina, ce deschide un „+”, `addSection` cu loc, „deasupra” la
      `adaugaContinut`, tinta langa un bloc din arbore (si in coloana), mesajele noi in protocol. Probe.
- [x] 10.2 (28.10: doua butoane in `ConturEditor`, in afara stratului `aria-hidden`, singurele cu clicuri; „+” pe
      elementul de sub mouse, altfel pe cel selectat; clicul citit primul in `useDesignPreview`.) Previzualizarea: „+”
      in `ConturEditor` (jos, si sus pe primul; pe „peste” si pe „selectat”; mouse-ul pe el pastreaza conturul), clicul
      citit in `useDesignPreview`. Probe pe sursa.
- [x] 10.3 (28.10: `deschideAdaugarea` in `EditorMagazin`; galeria „Adaugă un bloc sau o secțiune” cu `PaletaBlocuri`
      sus si locul in cap, deschisa la fel si din arbore; panoul „Adaugă un bloc” pentru continutul nou (`locText`);
      randul de produse mutat sub aceeasi cheie de istoric (`seteaza(..., cheieAnume)`); 3 probe pe sursa, doua probe
      vechi de la 9.4 aduse la forma noua; mutanti 25/25, unul scapase intai (conditia `if (plus)`), proba stransa.)
      Editorul: mesajul „adauga”, galeria cu loc si cu grupul „Blocuri”, panoul „Adaugă un bloc” cu tinta, continutul
      nou cu primul bloc, randul de produse la loc, telefonul. Probe.
- [x] 10.4 (28.10: REGISTRU C si D, patru ghiduri, porti (tsc 0, lint pe fisiere 0, 565 de probe ale editorului,
      designului, ajutorului si paginilor), proba in Chrome cu acordul lui („Da, fă proba acum”), pe `floraria-mirei` din
      baza DEMO, prin impersonare.) REGISTRU (C), ghidurile din centrul de ajutor, porti, proba in Chrome (cere acordul lui
      pentru impersonare).
      Vazut pe ecran: pe pagina proprie, „+” sus si jos pe Hero (primul bloc), „+” de jos deschide „Adaugă un bloc” cu
      „sub „Hero: Pagina principala test””, fara sa aleaga Hero; „Titlu” intra chiar sub Hero, Anulează il scoate („Pagina
      e salvată.”). Pe Acasa (cu pagina principala proprie scoasa TEMPORAR din `page_content.pagina_acasa`, ca la proba
      etapei 2): „+” sus si jos pe „Banner principal”; galeria „Adaugă un bloc sau o secțiune” cu „Se adaugă sub „Banner
      principal”.”; „Titlu” a facut un „Conținut liber” chiar sub banner, deschis pe bloc; „+” de sub titlu: „sub „Titlu: Un
      titlu de sectiune””, „Text” in acelasi continut; „Rând de produse” din „+” de sub „Căutare și filtre” a intrat chiar
      acolo, Anulează l-a scos dintr-o apasare, Refă l-a readus la loc; „+” de sus: „Se adaugă deasupra „Banner
      principal”.”. Pe pagina de produs (bucatile de sub produs sunt goale la produsul de proba, deci fara „+”): „+” de pe
      marginea paginii, „la sfârșitul zonei „Sub produs””, „Text” intr-un continut nou, inaintea subsolului. La 390 px
      (editorul intr-un cadru de telefon): „+” pe banner, galeria in doua coloane, 0 px peste margine. Magazinul public
      (prima pagina, produsul): 200, fara `data-st-adauga`, fara marcaje, fara ciorna. Consola: doar extensia
      (`cz-shortcut-listen`, „Receiving end does not exist”). Pe Acasa cu pagina principala proprie, „+” nu apare (cum
      scrie in plan): in productie un singur magazin din 148 are asa ceva (REGISTRU D). GASIT si reparat: in galeria lata
      blocurile stateau cate trei pe rand, carduri cat o treime de ecran, iar sectiunile cadeau mult sub ele; acum sase pe
      rand de la 1024 px (`PaletaBlocuri lata`). Pus la loc: ciorna prin „Renunță”, apoi, dupa „Ieși din impersonare”,
      `pagina_acasa` si data abonamentului; o singura comparatie: firma, designul, `page_content`, setarile (randul
      intreg), data publicarii, ciorna goala, 0 versiuni, 0 mesaje, 1 comanda, pagina neatinsa (doar `last_sign_in_at`
      al contului de proba, mutat de impersonare).

## Etapa 11: subsolul pe coloane-bloc (scris 28.10.2026, inainte de cod; acordul lui: „Da”)

Mentiunea lui: „Footer-ul sa fie si el customizabil complet, acum nu poti customiza foarte multe chestii”; raspunsul la
intrebare: „Pe coloane-bloc” (coloane adaugate, mutate, ascunse, sterse: Logo si text, Linkuri, Text, Contact,
Newsletter, Imagine; culorile, retelele, „Înapoi sus”, copyright; blocul legal mereu jos).

Citit inainte:
- Subsolul are trei designuri (`dark` si `columns` = acelasi `FooterColumns`, inchis / deschis; `centered`) si un singur
  reglaj, „Arata sloganul sub logo” (`showTagline`). In panou, la „Conținut”: marimea logo-ului (`footer_logo_size`),
  creditul Edinio (doar pe planurile platite), insignele proprii („Autorizații și certificări”).
- `FooterColumns`: identitatea (logo, slogan, retelele), „Magazin” (Toate produsele + primele 6 categorii), „Informatii”
  (paginile si linkurile din meniu), „Contact” (telefon, WhatsApp, email, oras); pe telefon coloanele se pliaza.
  `FooterCentered`: logo mare (link spre prima pagina), slogan, paginile pe un rand, contactul fara oras, retelele,
  „Inapoi sus”. Dupa ele, in toate: blocul legal (`FooterLegal`: datele firmei, retragerea, garantia legala,
  politicile, cookie-urile, ANPC, insignele proprii, Netopia) si randul de copyright cu creditul (`FooterCredit`).
- Culorile: `footerBg` / `footerText` exista in `StoreStyle` (doar pentru designul inchis) dar n-au niciun control.
  Partea legala are albul scris direct la tonul inchis (`FooterLegal`, `CompanyIdentity`, `NetopiaBadge`).
- Categoriile pentru subsol se citesc pe pagini doar cand varianta o cere (`needsCategories`, `loadSearchCategories`).
- Mecanismul blocurilor (etapa 4): schema pe varianta (`blocuri.ts`), arborele cu sageti si ochi (`ArboreBlocuri`),
  marcajele in previzualizare (`MarcajBloc`), clicul. Setarile se curata prin `sanitizeSettings` din `parse.ts` (doar
  pentru sectiuni). Newsletterul scrie in „Mesaje” si trimite la Mailchimp / Brevo / Klaviyo cand sunt conectate;
  blocul il cauta serverul in designul PUBLICAT (`blocDinMagazinPublicat`), nu in cerere. Linkurile din blocuri se
  aleg cu `CampLink` (pagini, categorii, produse) si se tin relative la magazin (`resolveHref`).
- In productie (28.10, doar citire): 123 de magazine fara design salvat (deci subsolul clasic, inchis), 9 `dark`, 9
  `centered`, 7 `columns`; niciunul cu sloganul pornit, niciunul cu blocuri in subsol. Deci si centratul trebuie sa
  ramana identic.

### Deciziile etapei

1. **Coloanele sunt blocuri ale subsolului**, in design (ciorna, „Publică”, Anulează / Refă, istoric), pe schema
   `blocuri.ts`: o zona, „Coloane”, cu tipuri care se pot pune de mai multe ori, fiecare cu reglajele lui:
   „Logo și text” (logo, sloganul sau un text al lui, retelele sub el), „Linkuri” (titlu; categoriile, paginile din
   meniu sau linkuri alese de el), „Text” (titlu, text), „Contact” (titlu; telefon, WhatsApp, email, oras, fiecare cu
   comutatorul lui), „Newsletter” (titlu, text, butonul), „Imagine” (imagine, link, latime), „Rețele sociale” (titlu).
   Logo, Contact, Newsletter si Retelele cel mult o data; cel mult 8 coloane.
2. **Magazinele de azi arata la fel**: un subsol fara coloane salvate primeste la citire coloanele de azi, cu id-uri
   fixe (pe coloane: Logo si text, „Magazin”, „Informatii”, „Contact”; pe centrat: logo, paginile, contactul fara oras,
   retelele), cu sloganul dupa `showTagline`. O lista golita anume ramane goala. Probe: HTML-ul subsolului de azi
   fata de cel nou, pe magazine de proba, si citirea idempotenta.
3. **Reglajele intregului subsol** (panoul lui): „Înapoi sus”, textul de langa „©” (gol = numele magazinului),
   culoarea fundalului si a textului (goale = cele ale designului; doar fundalul ales = text alb sau negru, dupa
   contrast). Partea legala trece pe variabile, cu albul ca valoare implicita, ca sa urmeze culorile.
4. **Blocul legal si randul de copyright raman mereu jos**, nu sunt coloane si nu se ascund (OUG 18/2026, ANPC,
   politicile); creditul Edinio ramane pe regula de azi.
5. **In editor**: sub „Subsol”, coloanele, cu sageti si ochi, si „+ Adaugă coloană” (lista tipurilor; cele unice deja
   puse apar stinse). Clicul pe o coloana (in arbore sau in previzualizare) ii deschide panoul: reglajele ei, „Duplică”,
   „Șterge coloana”. „+” din previzualizare (etapa 10) merge si pe coloanele subsolului, pe orice pagina.
6. **Newsletterul** se adauga doar cand e conectat un furnizor (ca blocul de pe pagini); serverul cauta coloana in
   subsolul PUBLICAT, aprinsa, iar mesajul apare in „Mesaje” cu locul „Subsol”.
7. **Categoriile se citesc pe pagina cand o coloana „Linkuri” arata categorii**, nu dupa design: pe centrat cu o astfel
   de coloana, altfel ar fi ramas goala.
8. Fara migratii; textele coloanelor sunt text simplu (fara HTML), linkurile trec prin aceeasi curatare ca restul.

### Pasii (bifati pe masura ce se fac)

- [x] 11.1 (28.10: `curatare.ts` (curatarea mutata neschimbata, 267/267 probe ale designului dupa mutare); in
      `blocuri.ts` tipurile de coloana (`coloana`: campuri, unica, implicite), schemele subsolului cu `implicite` si
      `maxBlocuri`, citirea si completarea coloanelor, `adaugaColoana` / `duplicaColoana` / `stergeColoana` /
      `setariColoana`; subsolul trece prin `cuBlocuri` (lista goala ramane), designul clasic are coloanele; in registru
      `campuriSubsol` (`showTagline` retras, `inapoiSus`, `copyright`, `fundal`, `culoareText`), fara `needsCategories`
      la subsol; `subsol.ts` (`coloaneSubsol`, `subsolCereCategorii`, `inapoiSusPornit`, `textCopyright`,
      `sablonColoane`, `culoriSubsol`, `etichetaColoanei`); `loadSearchCategories` dupa coloane; „+” pe coloanele
      subsolului (`coloana-subsol`). 13 probe noi in `subsol.test.ts` si una in `adaugare.test.ts`; trei probe vechi
      aduse la subsolul cu blocuri. Gasit la probe: designul clasic nu e idempotent la recitire, de dinainte (titlul
      randului „Recomandate”), nu tine de subsol.)
      Logica fara React: curatarea campurilor mutata din `parse.ts` intr-un modul comun; schema coloanelor
      (tipuri, campuri, unice, plafon), coloanele implicite pe design, citirea (lipsa = implicite, gol = gol),
      operatiile (adauga la loc, duplica, sterge, reglaje), reglajele subsolului in registru, categoriile cerute,
      „+” pe coloane. Probe.
- [x] 11.2 (28.10: `FooterColumns` si `FooterCentered` randate din `coloaneVazute`, cate un `MarcajBloc` pe coloana;
      piesele comune in `subsol-coloane.tsx` (linkurile dupa sursa, imaginea, newsletterul, mesajul de gol DOAR in
      editor); culorile ca variabile pe radacina, partea legala pe tonul deschis cand sunt culori alese; `FooterCredit`
      cu textul de langa ©; dispecerul trimite sectiunea intreaga; miniatura designului activ arata coloanele omului;
      `blocDinMagazin` gaseste newsletterul din subsolul publicat, cu locul „Subsol”. HTML-ul subsolului inainte si
      dupa, de pe serverul local (scriptul din scratchpad `subsol-html.mjs`): 6 magazine demo, prima pagina si miniatura
      fiecarui design, 22 de subsoluri, toate identice dupa doua normalizari cunoscute: grila (`md:grid-cols-[1.4fr_1fr_1fr_1.2fr]`
      a devenit aceeasi latime printr-o variabila) si id-urile React (`useId`, dupa pozitia in arbore). Doua prime
      pagini n-au subsol in niciuna, fiindca abonamentul lor e expirat pe demo. 3 probe noi.)
      Magazinul: subsolul randat din coloane (pe coloane si centrat), marcajele in editor, culorile, „Înapoi sus”,
      copyright, newsletterul (componenta si serverul). Probe; HTML-ul de azi fata de cel nou.
- [x] 11.3 (28.10: `PanouColoanaSubsol.tsx` cu panoul coloanei (reglajele pe tip, linkurile alese cu `CampLink`,
      imaginea din Biblioteca Media, „Ascunde”, „Duplică”, „Șterge coloana”) si lista `PanouAdaugaColoana` (cele unice
      deja puse si newsletterul fara furnizor, oprite, cu motivul); coloanele sub „Subsol” in arbore (`ArboreBlocuri`,
      cu „Adaugă coloană”); in `EditorMagazin` cererea de coloana noua (din arbore sau din „+”), inchisa odata cu
      celelalte panouri de adaugare, datele blocurilor cerute la deschidere; culoarea care poate lipsi are „Implicită”
      in `SectionSettings`. 3 probe pe sursa; mutanti 28/28 pe toata etapa 11.)
      Editorul: coloanele in arbore, panoul coloanei, lista „Adaugă coloană”, culorile cu „Implicită”, „+” pe
      coloane. Probe.
- [x] 11.4 (28.10: ghidul `cum-reglezi-footerul-magazinului` rescris pe coloane, nota „+” din ghidul editorului,
      REGISTRU C si D; suita intreaga 11.245 / 0 cazute / 2 sarite; proba in Chrome cu acordul lui („Da, fă proba
      acum”; s-a reconectat el ca admin, iesirea din impersonarea de la etapa 10 il deconectase), pe `floraria-mirei`
      din baza DEMO, doar in ciorna.) REGISTRU, ghidurile, porti, proba in Chrome (cere acordul lui pentru impersonare).
      Vazut pe ecran: sub „Subsol”, coloanele designului centrat (Logo si text, Linkuri, Contact, Retele sociale) si
      „Adaugă coloană”; in previzualizare coloanele goale apar DOAR in editor, cu un mesaj; panoul „Contact” (orasul
      oprit, ca la centratul de azi; magazinul n-are oras, deci nimic de aratat); lista „Adaugă o coloană” cu cele unice
      oprite („E deja în subsol.”) si newsletterul oprit (fara furnizor); „Text” adaugat la capat, textul vazut pe loc;
      clicul pe o coloana in previzualizare ii deschide panoul; „Alese de mine”, un link cu sugestiile (pagina proprie),
      salvat relativ si randat cu adresa magazinului; culoarea de fundal (textul trecut singur pe alb, partea legala
      lizibila) si „Implicită” inapoi exact la design; „Înapoi sus” oprit; textul de langa „©”; designul schimbat pe
      „Închis, pe coloane” si „Deschis, pe coloane”: aceleasi coloane, una langa alta (`1.4fr 1fr 1.2fr 1fr 1.4fr`); „+”
      de sub „Contact”: „după „Contact””, „Imagine” intrata chiar acolo; la 390 px coloanele una sub alta, cele cu titlu
      pliate, 0 px peste margine; magazinul public: subsolul publicat, fara nimic din ciorna, fara marcaje.
      GASIT si reparat: (1) „+” centrat pe marginea de jos acoperea mijlocul unui rand scund (subsolul centrat), iar clicul
      dat ca sa-l aleaga deschidea lista de adaugare: acum butonul sta in afara elementului, lipit de margine (intra 4 px);
      (2) la schimbarea designului se pierdeau textul de langa „©” si culorile: `updateSection` pastra doar cheile cu
      valoare implicita, acum si campurile declarate de varianta noua (proba noua, mutatia prinsa); (3) patratul unei
      culori nealese se vedea negru: acum estompat cat e „Implicită”. Pus la loc: ciorna prin „Renunță”, data
      abonamentului; o singura comparatie, totul egal (firma, designul, `page_content`, setarile, data publicarii, ciorna
      goala, 0 versiuni, 0 mesaje, 1 comanda, pagina neatinsa).

## Etapa 12: contorul de vizitatori masurat (scris 28.10.2026, inainte de cod)

Hotarat la inchidere: „Îl facem real (etapă nouă)”. Pornita pe 28.10, seara, la „Hai sa continuam de unde am ramas”,
dupa reparatia eMAG de pe `main` (`dba33c22`, adusa in ramura prin `28b1cd9c`).

**Ce e azi.** Blocul „Contorul de vizitatori” scrie „{n} persoane se uita acum”, cu `n = 18 + (hash(id) % 10)`: fix pe
produs, intre 18 si 27, fara nicio masuratoare. Aprins la 9 magazine (din 148). Clasic il arata doar pe calculator.

**Ce s-a masurat in productie (28.10, ultimele 24 de ore, doar citire).**
- 11.750 de vederi de produs. **Aproape jumatate sunt roboti**: 64 de „vizitatori” cu peste 30 de produse vazute in 24 de
  ore au facut 5.602 vederi (unul singur, 902). Scrierea nu ii opreste: `seMasoaraVizita` scoate proprietarul, gazdele de
  test si santinela, dar nu si crawlerele. Deci si Statistici ii numara.
- Fara ei (pragul de 30, doar pentru masuratoare), 6.144 de vederi. Altii pe acelasi produs in ultimele **15 minute**:
  0 la 95%, 1 la 2,6%, 2+ la 2,4%. In ultimele **24 de ore**: doar el la 43,7% din vederi, 2-4 la 49%, 5-19 la 5,2%,
  20+ la 1,9%, maxim 118.

### Deciziile etapei

1. **Ce numara, il alege comerciantul** (raspunsul lui: „Alege comerciantul”): in panoul blocului, „Acum” (ultimele 15
   minute) sau „Ultimele 24 de ore”, **implicit 24 de ore**. Cheia `social_proof_window` (`"now"` / `"day"`) in
   `page_content`, nodul nou `produs_dovada`, ca efectul butonului: trece prin ciorna si ajunge la clienti la „Publică”.
2. **Robotii nu se mai scriu deloc** (raspunsul lui: „Și din Statistici”): `esteRobot(userAgent)` in `seMasoaraVizita`,
   deci si vizitele, vederile de produs, cosul si inceputul comenzii. Un browser fara user-agent e tot robot. Randurile
   vechi raman (o stergere e o hotarare a lui); contorul se uita oricum doar la ultimele 24 de ore. In Statistici se
   spune ca robotii nu intra in cifre, fiindca dupa push vederile de produs scad cam la jumatate.
3. **Se numara oameni DISTINCTI, fara cel care se uita.** `visitor_id` e dispersia zilei (IP, browser, magazin, sare
   zilnica), deci la fereastra de 24 de ore acelasi om poate avea doua: cel de azi si cel de ieri. Se scot amandoua ale
   cererii de fata (sarea de ieri se citeste o data pe zi si se tine minte, ca cea de azi). Altfel cine s-a uitat aseara
   s-ar fi vazut pe sine: „1 persoana a vazut produsul”.
4. **Numarul se calculeaza pe server, la randare**, nu in browser: pagina de produs e oricum dinamica (`headers()`,
   `after`), iar o pastila care apare dupa o cerere din browser ar fi impins pretul si butoanele in jos. O singura
   citire pentru ambele ferestre (vederile produsului din ultimele 24 de ore, cel mult 2.000), facuta DOAR cand blocul
   e vizibil in sablonul ales sau in editor. Fara index nou: `(business_id, created_at)` exista, iar cel mai mare
   magazin are ~10.000 de evenimente pe zi.
5. **Zero inseamna ca pastila nu apare.** In previzualizarea editorului, cand nu e nimeni, se arata un exemplu, ca
   blocul sa poata fi vazut si ales; panoul spune ca e un exemplu.
6. **Textul**, fara diacritice ca restul paginii de produs, cu pluralul romanesc: „1 persoana se uita acum” / „3
   persoane se uita acum” / „20 de persoane se uita acum”; „1 persoana a vazut produsul in ultimele 24 de ore” / „3
   persoane au vazut...” / „20 de persoane au vazut...”.

### Pasii (bifati pe masura ce se fac)

- [x] 12.1 (28.10: `esteRobot` in `vizita-de-masurat.ts`, chemat din `seMasoaraVizita`, deci din toate cele patru
      locuri care scriu vizite; `(?<!cu)bot` ca CUBOT sa ramana om, iar browserele din aplicatii (FBAN, Instagram,
      BytedanceWebview, GSA) raman oameni; fara user-agent = program, deci proba veche care il numara s-a schimbat, cu
      motivul. 29 de roboti si 13 oameni reali in probe. Nota `ROBOTII_NU_INTRA` la „Vizitatori” si „Afisari de pagina”.)
      Robotii: `esteRobot` si `seMasoaraVizita`, probe pe user-agenti reali (crawlere, previzualizari de linkuri,
      unelte; browsere pe telefon si calculator care NU sunt roboti); nota din Statistici.
- [x] 12.2 (28.10: `idVizitator` in `identitate.ts`, singura formula, folosita si de `identitateAnalitica`;
      `vizitatoriiCererii` (sarea de azi prin functie, cea de ieri citita din `analitice_sare`, tinute minte); `privitori.ts`
      (`numaraPrivitorii` pur, `privitoriiProdusului` cu o citire, `null` la orice piedica); `contor-vizitatori.ts`
      (fereastra, numarul cu exemplul DOAR in editor si miniatura, textul cu pluralul); in `pagina-produs.tsx` numaratoarea
      cand blocul se vede in sablonul ales sau in editor; pastila si invelisul ei lipsesc la zero, in ambele variante;
      `hashSir` scos. 10 probe noi in `contor-masurat.test.ts`, doua vechi aduse la regula noua; mutanti 13/13.)
      Numaratoarea: identitatea cererii (azi si ieri) scoasa din `identitateAnalitica` fara a doua copie,
      numararea pura (ferestrele, distincti, fara cel de fata) si citirea; pe pagina de produs, cand blocul se vede;
      pastila cu textul si pluralul, ascunsa la zero, exemplul din editor. Probe.
- [x] 12.3 (28.10: `social_proof_window` in `continut.ts` (implicit `day`) si in tipul paginii de produs; nodul
      `produs_dovada` in `noduri.ts` (`felBloc("dovada")`), deci cheia intra singura in ciorna (`CHEI_PC_CIORNA`); in
      `ContinutBloc` alegerea „Ultimele 24 de ore” / „Acum” si nota noua, cu exemplul spus.)
      Editorul: `social_proof_window`, nodul `produs_dovada`, alegerea din panoul blocului si nota noua. Probe.
- [x] 12.4 (28.10: ghidul `cum-pornesti-elementele-de-pe-pagina-produsului` (pasul si detaliul contorului), REGISTRU C
      si D; suita intreaga 11.270 / 0 cazute / 2 sarite inaintea reparatiei de la proba; proba in Chrome cu acordul lui
      („Da, fă proba acum”), pe demo.)
      Ghidul, REGISTRU (D rezolvat, C), porti, proba in Chrome pe demo (cere acordul lui pentru impersonare;
      vederi de proba scrise in `site_analytics` pe demo si sterse la final).
      Vazut pe ecran, pagina PUBLICA a magazinului demo `casa-lumen` (Detaliat, contorul aprins in designul publicat),
      fara cont: fara nicio vedere, pastila lipseste; cu vederile de proba (un om cu trei vederi, altii la 10 minute, 5
      ore, 20 de ore, unul la 30 de ore) „4 persoane au vazut produsul in ultimele 24 de ore”; cu „now” scris in continut,
      „2 persoane se uita acum”; produsul fara vederi, fara pastila; la 390 px (cadru de 390 px in aceeasi fila) pastila
      „Acum” pe un rand, cea de 24 de ore pe doua, in margini, 0 px peste. Editorul, prin impersonarea contului de test
      `floraria-mirei` (Clasic, contorul ascuns): ochiul aprins in ciorna, panoul cu „Ce numără” („Ultimele 24 de ore”
      ales din start, „Acum”) si nota; previzualizarea cu numarul real la singular, „1 persoana a vazut produsul in
      ultimele 24 de ore”. In Statistici, nota noua in explicatia „Vizitatori”.
      GASIT si reparat: (1) in editor, pagina de produs primea `page_content` PUBLICAT, nu cel cu ciorna: ruta il
      calcula (`pcCuCiorna`) dar ii dadea componentei randul din baza, deci beneficiile, intrebarile, pasii, livrarea,
      efectul butonului si acum fereastra contorului nu se vedeau in previzualizare pana la „Publică” (de la etapa 6;
      pagina principala le punea peste). Dupa reparatie, „Acum” arata exemplul („3 persoane se uita acum”, nimeni in 15
      minute), iar „Ultimele 24 de ore” iar numarul real, cu reincarcarea singura a previzualizarii. O proba noua pe
      sursa. Pus la loc: ciorna prin „Renunță” (pastila disparuta din previzualizare), vederile de proba sterse (9),
      cheia din `casa-lumen` scoasa, data abonamentului; o singura comparatie, totul egal (analitica 2.708 / 1.646 / 0,
      `page_content` si designul contului de test, ciorna goala, 0 versiuni). Raman: `updated_at` al contului de test si
      sarea zilei de azi in `analitice_sare` pe demo (creata de citirea contorului; aceeasi functie o creeaza in productie
      la prima vizita a zilei). Iesirea din impersonare l-a deconectat. Erorile din consola: doar extensii (ColorZilla pe
      `<body>`, un mesaj de extensie).

## Mentiunile lui din 28.10, seara (dupa etapa 12)

Cuvintele lui:
1. „Pe prima pagina de exemplu am dat pe + si am adaugat un buton iar in stanga acolo scrie Continut Liber, nu ar
   trebuie mai bine sa fie direct elementul in cazul nostru Buton in loc de Continut liber? Iar la buton cand apas sa i
   fac setari si ii dau de exemplu o animatie, nu vad animatia la buton cand selectez diferite animatii”
2. „La elemente de exemplu la Randurile de produse sau in header sau in Hero nu putem face sa se poata selecta orice
   font? Sa avem mai multa libertate de personalizare, pentru ca cineva poate vrea un anume font la o anumita sectiune”
3. „Cand apas pe o sectiune acolo apare doar Ascunde, vreau sa apara si Sterge”
4. „Trebuie sa vedem ce facem si cum orgnaizam tipul de Checkout ca sa nu se incurce utilizatorul, practic trebuie sa
   il facem cumva din Setari de aici sa selecteze tipul de Checkout, Standard cu sau Formular de comanda. Tu ce zici?
   Ce solutii ai?”
5. „Acolo la Banner principal la imaginile bannerelor unde pui link sa putem selecta si o pagina interna din magazin
   fara sa mai fie nevoit sa puna URL sau sa selecteze o anumita categorie, sau un anumit produs”

Raspunsurile lui la intrebari (toate trei pe varianta recomandata): blocul pus cu „+” „Numele lui, deschis direct”;
fonturile „Cele 36 găzduite de noi” (lista are 33; in intrebare scrisesem 36, numarat gresit); checkout-ul „În Setări >
Comanda”.

Ce s-a gasit in cod inainte de plan: (1) un „+” pe Acasa pune blocul intr-o sectiune `continut_liber` noua, iar
arborele scrie eticheta TIPULUI („Conținut liber”); in editor, `ContinutLiber` deseneaza blocurile din designul viu, deci
ocoleste slotul de pe server, singurul care aducea `SCRIPT_ANIMATII` + `PornesteAnimatiile`: animatia de intrare nu
avea cine s-o porneasca (miscarea redusa e oprita la el, masurat). (2) Stilul are 8 fonturi (`FONT_OPTIONS`), paginile
proprii 33 (`FONTURI_PAGINA`, gazduite prin `next/font`, `preload: false`). (3) Panoul sectiunii (`PanouNod`) are doar
„Ascunde”; arborele sterge cu `removeSection` prin ciorna (se poate anula). (4) Tipul de checkout e VARIANTA de design a
sectiunii `checkout` (`classic` = „Formular în fereastră”, `page_two_col` = „Pagină separată”), aleasa din „Schimbă
designul”; campurile si optiunile extra stau in Setari > Formular de comandă; „Comandă acum” de pe produs deschide
oricum formularul in fereastra. (5) Linkul bannerului e un `input` simplu (`ContinutAcasa.tsx`); campul cu sugestii
(`CampLink` + `FurnizorLegaturi`) exista din etapa 11.

Impartite in trei etape, una cate una, cu raport dupa fiecare: 13 (mentiunile 1, 3, 5), 14 (2), 15 (4).

## Etapa 13: blocul pus cu „+”, animatia, „Șterge”, linkurile bannerului (scris 28.10.2026, inainte de cod)

### Deciziile etapei

1. **Un „Conținut liber” se numeste dupa blocurile lui**, in arbore si in capul panoului: „Buton”, „Buton, Text”, peste
   doua „Buton, Text și încă 2”; dedesubt, mic, „Conținut liber”. Gol: „Conținut liber”, ca azi.
2. **Cu un singur bloc, clicul il deschide direct** (din arbore si din „Înapoi”-ul lui): panoul butonului, nu lista
   containerului. „Înapoi” din el duce inapoi in arbore, iar in panou sta „Adaugă alt bloc aici”, care deschide lista
   de adaugare a containerului, dupa el. Cu doua sau mai multe, ca azi (lista, apoi blocul).
3. **Animatiile pornesc si in editor**: `ContinutLiber`, pe ramura din editor, pune `PornesteAnimatiile` langa
   blocuri, ca slotul de pe server; cheia de animatie remonteaza blocul, iar observatorul il prinde. Efectele butonului
   (`fx-*`, CSS) se verifica pe ecran.
4. **„Șterge” in panoul sectiunii**, langa „Ascunde”, numai unde arborele are cosul (aceeasi regula, `removable`):
   `removeSection` prin ciorna, se poate anula din bara de sus; dupa stergere se intoarce in arbore, cu un mesaj.
5. **Linkul bannerului cu sugestii** (`CampLink`): paginile magazinului, paginile proprii, categoriile si produsele;
   se poate scrie mai departe orice adresa. Datele vin din acelasi incarcator ca la subsol.

### Pasii (bifati pe masura ce se fac)

- [x] 13.1 (28.10: `numeleContinutului` si `blocUnic` in `continut-liber.ts`; randul din `SectionList` si capul lui
      `PanouContinutLiber` dupa blocuri, „Conținut liber” / „Gol” dedesubt; `selecteaza` deschide direct blocul unic;
      `unBlocPeAcasa`: „Înapoi” in arbore, paleta se intoarce la bloc, „Adaugă alt bloc aici” (`actiuneSus` in
      `PanouBlocComun`, tinta `tintaLangaBloc(..., "jos")`) si „Șterge” langa el.)
      Numele „Conținut liber” dupa blocuri (functie pura + probe), in arbore si in panou; deschiderea directa
      cu un singur bloc, „Înapoi” in arbore, „Adaugă alt bloc aici”.
- [x] 13.2 (28.10: `<PornesteAnimatiile />` langa `BlockRenderer` in ramura de editor a lui `ContinutLiber`; „Șterge” in
      `PanouNod` (`poateFiStearsa` = regula arborelui, `removeSection` prin ciorna, inapoi in arbore, mesaj) si in
      panoul containerului de pe Acasa (`stergeContinutulDeschis`, comun cu blocul deschis direct).)
      Animatiile in editor (`PornesteAnimatiile` in `ContinutLiber`); „Șterge” in `PanouNod`.
- [x] 13.3 (28.10: `CampLink` in `ContinutHero`, `FurnizorLegaturi` in jurul lui `PanouNod`, datele cerute cand e deschis
      Hero (`heroDeschis`); `HeroBanners` rezolva deja linkurile relative cu `resolveHref`. Ghidurile bannerelor,
      continutului liber si al sectiunilor. 7 probe in `etapa-13.test.ts`, una veche (9) adusa la forma noua; mutanti 8/8.)
      Linkul bannerului cu `CampLink`, datele incarcate cand e deschis Hero.
- [x] 13.4 (28.10: ghidurile (bannerele, continutul liber, sectiunile), REGISTRU C; suita intreaga 11.278 / 0 cazute /
      2 sarite, `build:ci` trece; proba in Chrome cu acordul lui („Da, fă proba acum”), pe `floraria-mirei` din demo, doar
      in ciorna.) Ghidurile, REGISTRU, porti, proba in Chrome (cere acordul lui pentru impersonare).
      Vazut pe ecran, pe Acasa clasica (`pagina_acasa` scoasa temporar): „+” de sub „Banner principal”, „Buton” din
      galerie: panoul s-a deschis direct pe buton, cu „Adaugă alt bloc aici” si „Șterge”; „Înapoi” in arbore, unde randul
      scrie „Buton”, cu „Conținut liber” dedesubt; clicul pe rand il deschide iar direct. Efectul „Puls”: `fx-pulse`,
      `edinio-fx-pulse` ruland (toate 11 efecte au reguli CSS). Animatia „Se mărește”: `data-anim-in`, radacina pornita,
      `edinio-anim-zoom-in` in desfasurare; „Urcă” se reia de la inceput (28 px). Bannerul (pus temporar in `page_content`:
      Biblioteca Media a contului e goala, iar incarcarea locala n-are cheile de stocare): „Linkul bannerului 1
      (opțional)” cu paginile de sistem si paginile proprii; „bu” a gasit produsul, salvat relativ
      `/product/buchet-de-trandafiri-rosii`, in previzualizare `/floraria-mirei/product/...`. „Șterge” in panoul
      sectiunii a scos bannerul din arbore si din previzualizare, „Anulează” l-a adus inapoi; „Șterge” din panoul
      butonului a scos continutul, cu mesajul lui.
      GASIT si reparat: cu „Ascunde” si „Șterge” pe randul titlului, „Banner principal” iesea „Banner p...”: actiunile
      stau acum pe randul lor, sub titlu. Pus la loc: ciorna prin „Renunță”, `pagina_acasa`, bannerele goale, data
      abonamentului; o singura comparatie, totul egal (`page_content` si designul dupa amprenta, ciorna goala, 0
      versiuni, analitica). Iesirea din impersonare l-a deconectat.

## Etapa 14: fonturile pe sectiune (scris 28.10.2026, inainte de cod; acordul lui: „Da”)

Hotarat (raspunsul lui): fonturile gazduite de noi, separat pentru titluri si pentru text, pe orice sectiune, implicit
„Ca în Stil”; aceleasi si in fila Stil, pentru tot magazinul (azi 8). Sunt 33 (17 moderne, 9 clasice, 4 de impact, 3
scrise de mana), nu 36 cum scrisesem in intrebare: numarat gresit, gasit la proba.

Ce e azi, citit in cod: fontul magazinului se pune pe radacina vitrinei (`StorefrontThemeScope`): `--st-font-heading`,
`--st-font-body` si, cand e ales altul decat Geist, `--font-app` / `--font-app-heading`, pe care le citesc utilitarele
Tailwind si regula titlurilor (`stil-comun.css`: `--font-heading: var(--font-app-heading, var(--font-app, Geist))`).
Deci un invelis poate suprascrie fontul oriunde in pagina. Stilul alege din 8 (`FONT_KEYS`, `fontSetup` in `fonts.ts`),
paginile proprii din 33 (`FONTURI_PAGINA`, clasele in `fonturi-incarcate.ts`, care refoloseste cele 7 instante ale
magazinului), cu alegatorul `AlegeFont` (pe familii, fiecare nume in fontul lui). Fiecare sectiune a paginii principale,
plus antetul, subsolul si bara de anunt, trece prin `Marcata` (`SectionRenderer`).

### Deciziile etapei

1. **Fontul magazinului din 34**: Geist plus cele 33. `FontKey = "geist" | CheieFont`, `FONT_KEYS` derivat din
   `FONTURI_PAGINA` (o singura lista). `fontSetup` se muta langa clasele tuturor fonturilor (`fonturi-incarcate.ts`);
   pentru cele 8 de azi da EXACT aceleasi clase si stive, deci vitrinele de azi nu se schimba. In Stil, alegatorul
   devine `AlegeFont` (implicit „Geist (implicit)”): grila de carduri cu 34 de fonturi, de doua ori, ar fi un perete.
2. **Fontul pe sectiune**: doua campuri comune, `fontTitluri` si `fontText`, pe sectiunile cu `scope` „home” si
   „chrome” (16 tipuri). Curatate la citire impreuna cu campurile variantelor si pastrate la schimbarea designului
   (`updateSection`). Lipsa = „Ca în Stil”.
3. **Cum ajung pe ecran**: in `Marcata`, cand sectiunea are un font ales, un invelis `display: contents` cu clasa
   fontului si variabilele: titlurile in `--st-font-heading` / `--font-app-heading`, textul in `--st-font-body` /
   `--font-app` / `font-family`. Cand e ales doar textul, titlurile se tin pe fontul magazinului
   (`--font-app-heading: var(--st-font-heading)`), altfel l-ar urma pe text. Fara font ales, niciun element in plus.
4. **In editor**: grupul „Fonturi” in panoul sectiunii, cu „Fontul titlurilor” si „Fontul textului” (`AlegeFont`,
   „Ca în Stil”), prin ciorna: se vede pe loc in previzualizare si ajunge la clienti la „Publică”.

### Pasii (bifati pe masura ce se fac)

- [x] 14.1 (28.10: `FontKey = "geist" | CheieFont`, `FONT_KEYS` derivat din `FONTURI_PAGINA`; `fontSetup` mutat in
      `fonturi-incarcate.ts` (Geist fara clasa, restul prin `clasaFont` + `stivaFont`), `fonts.ts` pastreaza cele 7
      instante; Stil cu doua `AlegeFont` („Geist (implicit)”, scris anume); `AlegeFonturi.tsx` si `font-options.ts`
      scoase, nimeni altcineva nu le folosea. CSS-ul fonturilor era deja pe paginile magazinului (66 KB in dezvoltare).)
      Fontul magazinului din 34: `FontKey`/`FONT_KEYS`, `fontSetup` mutat, Stil cu `AlegeFont`. Probe: cele 8 de
      azi dau aceleasi clase si stive, unul nou ajunge in stil.
- [x] 14.2 (28.10: `fonturi-sectiune.ts` (`CAMPURI_FONT_SECTIUNE`, `areFonturiProprii`, `fontulSectiunii`,
      `stilFontSectiune`); in `parseSection` campurile comune pe „home” si „chrome”, in `updateSection` cheile lor
      printre cele declarate; invelisul `contents` in `Marcata`, IN AFARA marcajului (altfel ascundea `LocGol`).)
      Fontul pe sectiune: campurile comune (citire, schimbarea designului), `stilFontSectiune` pur, invelisul in
      `Marcata`. Probe.
- [x] 14.3 (28.10: grupul „Fonturi” in `PanouNod`, doua `AlegeFont` cu „Ca în Stil”, prin ciorna; „Ca în Stil” scoate
      cheia. Ghidul nou `cum-alegi-fonturile-magazinului` (426 de ghiduri). 10 probe in `fonturi-sectiune.test.ts`;
      mutanti 7/7.) Editorul: grupul „Fonturi” in `PanouNod`. Probe.
- [x] 14.4 (28.10: ghidul nou din 14.3, plus „La antet” dupa proba; celelalte ghiduri nu descriau alegatorul vechi;
      REGISTRU C; suita intreaga 11.288 / 0 cazute / 2 sarite si `build:ci` trec pe `c20bf662`; proba in Chrome cu
      acordul lui („Da, fă proba acum”), pe `floraria-mirei` din demo, doar in ciorna.) Ghidurile, REGISTRU, porti,
      proba in Chrome (cere acordul lui pentru impersonare).
      Vazut pe ecran: „Fontul titlurilor” Bebas Neue pe „Banner principal” a schimbat doar titlul bannerului; „Fontul
      textului” Caveat pe „Antet” a schimbat meniul si numele magazinului, restul paginii neatins. „Schimbă designul” pe
      banner: fontul a ramas (`fontTitluri` in ciorna, pe noul design). In Stil, „Font titluri” Lora: titlurile restului
      magazinului pe Lora, iar bannerul a ramas pe Bebas si meniul pe Caveat (fontul sectiunii castiga). Listele: pe
      familii, fiecare nume in fontul lui, 33 de fonturi plus „Ca în Stil” / „Geist (implicit)”.
      GASIT: (1) lista are 33 de fonturi, nu 36 cum scrisesem in intrebare si in comentarii; corectat peste tot (codul,
      ghidul, planul), raspunsul lui ramane citat asa cum l-a dat. (2) Numele magazinului din antet urmeaza „Fontul
      textului”: e text, ca si in Stil, deci e corect; spus in ghid („La antet”). Pus la loc: ciorna prin „Renunță”; o
      singura comparatie, totul egal (`page_content` si designul dupa amprenta, ciorna goala, 0 versiuni, data
      abonamentului, analitica). Iesirea din impersonare l-a deconectat.

## Etapa 15: Setări > Comanda, tipul de checkout (scris 28.10.2026, inainte de cod; acordul lui: „Da”)

Hotarat (raspunsul lui): un singur loc, „Comanda”, in fila Setari: sus tipul („Formular de comandă, în fereastră” sau
„Standard, pagină de finalizare”), dedesubt campurile formularului si optiunile extra; se salveaza direct, ca restul
setarilor; pagina „Finalizarea comenzii” din editor arata tipul ales si trimite acolo.

Ce e azi, citit in cod: tipul e VARIANTA de design a sectiunii `checkout` (`classic` = fereastra, `page_two_col` =
pagina, `surface: "page"`), aleasa din „Schimbă designul (2)” pe pagina „Finalizarea comenzii”. Raspunsul „pagina sau
fereastra” il da un singur loc, `checkoutOnPage(design)` (`commerce.ts`), citit de rutele `/checkout` si `/cos`, de
`MiniStoreRenderer`, `StoreCartPanels`, de editor (`adresaPrevizualizarii`, `notaPaginii`) si de lista din „Pagini”.
Campurile formularului stau in Setari > „Formular de comandă” (`page_content.checkout_config`, salvat direct cu
`updatePageContent`; singurul care scrie cheia). „Comandă acum” de pe pagina produsului deschide formularul produsului
(`OrderModal`) la ambele tipuri. In productie (citit 28.10): 9 magazine pe pagina, 139 in fereastra; nicio ciorna cu alt
tip decat cel publicat.

### Deciziile etapei

1. **Tipul se tine in `page_content.checkout_config.tip`** („fereastra” sau „pagina”), langa campurile formularului: se
   salveaza direct, cu acelasi buton, si nu-l ating nici „Publică”, nici istoricul versiunilor (nu e in design). Lipsa =
   ca azi, designul decide, deci magazinele de azi nu se schimba.
2. **Se aplica la CITIRE, ca pagina principala proprie** (`aplicaTipulComenzii`, langa `aplicaPaginaAcasa`): in
   `resolveDesign` (toate rutele magazinului), in lista din „Pagini” si in editor (designul trimis previzualizarii, adresa
   ei, nota). Varianta sectiunii `checkout` se schimba doar cand nu se potriveste cu tipul (fereastra: prima varianta de
   fereastra; pagina: prima de pagina), deci un design de pagina ales ramane. `checkoutOnPage` ramane singurul raspuns.
3. **„Comanda” in fila Setări** (fostul „Formular de comandă”; cheia `formular` ramane, pentru adresele vechi): sus
   „Tipul de checkout”, doua carduri, „Formular de comandă, în fereastră” si „Standard, pagină de finalizare”; dedesubt
   campurile si optiunile extra, ca azi. Fara tip salvat, panoul porneste pe tipul designului publicat.
4. **Pagina „Finalizarea comenzii” din editor**: sus in arbore, tipul ales si „Schimbă tipul în Setări”, care deschide
   „Comanda”; la fereastra, nota spune de ce previzualizarea arata pagina principala. In panoul sectiunii, la fel, iar
   „Schimbă designul” dispare (galeria arata chiar cele doua tipuri: al doilea loc de ales acelasi lucru). Design-urile
   se numara pe tipul ales (azi unul pe fiecare).
5. **„Pagini” > „Finalizare comanda”**: butonul duce la Setări > Comanda („Alege tipul”), nu la galerie.
6. **„Comandă acum”** de pe pagina produsului ramane formularul produsului, la ambele tipuri; se spune in panou si in
   ghid. Daca vrea ca la „Standard” sa duca la pagina de finalizare, e o etapa separata (calea banilor: personalizarea,
   treptele de cantitate). Intrebare pentru el, in raport.

### Pasii (bifati pe masura ce se fac)

- [x] 15.1 (28.10: `tip-comanda.ts`: `tipComandaDinPageContent`, `tipulComenzii`, `tipulVariantei`, `aplicaTipulComenzii`
      (varianta se schimba doar la nepotrivire, restul designului acelasi obiect), `varianteDeAles`; in `resolveDesign`,
      dupa `aplicaPaginaAcasa`; `tip` in tipul `checkout_config`, iar `formularDinPageContent` lasa sa cada o valoare
      stricata.) `tip-comanda.ts` (pur): citirea tipului, tipul unui design, `aplicaTipulComenzii`; in `resolveDesign`;
      `tip` in `checkout_config` (tipul si citirea formularului). Probe.
- [x] 15.2 (28.10: „Comanda” in lista, aceeasi cheie `formular`; grupul „Tipul de checkout” sus, doua carduri, cu nota
      despre „Comandă acum”; `formularDeLucru` pune tipul implicit (`tipComandaImplicit` = al designului publicat, din
      ruta editorului), `tipSalvat` din ce e salvat; salvarea trimite tot doar `checkout_config`.) Setări: „Comanda”,
      cardurile tipului, salvarea cu formularul; implicitul din designul publicat. Probe.
- [x] 15.3 (28.10: `designViu` in `EditorMagazin` (designul trimis, adresa previzualizarii, nodurile, galeria), ciorna
      neatinsa; `CasetaTipComanda` in arbore pe „Finalizarea comenzii” si in panoul sectiunii, cu „Schimbă tipul în
      Setări”; `numarVariante` si `DesignGallery` prin `varianteDeAles`; nota din `ContinutNod`; „Pagini” cu tipul aplicat
      si „Alege tipul”; ghidurile (tipul de checkout rescris, trimiterile la „Formular de comandă” devenite „Comanda”) si
      cardul din Setari. 13 probe in `tip-comanda.test.ts`; mutanti 12/12.) Editorul: previzualizarea, adresa si nota cu
      tipul salvat; caseta tipului in arbore si in panoul sectiunii, fara „Schimbă designul”; lista din „Pagini”. Probe.
- [x] 15.4 (28.10: ghidurile in 15.3; REGISTRU C; suita intreaga 11.301 / 0 cazute / 2 sarite si `build:ci` trec pe
      `ddfb3145`; proba in Chrome cu acordul lui („Da, fă proba acum”), pe `floraria-mirei` din demo.) Ghidurile, REGISTRU,
      porti, proba in Chrome (cere acordul lui pentru impersonare).
      Vazut pe ecran: Setări > „Comanda” pornita pe „Formular de comandă, în fereastră” (designul publicat `classic`);
      „Standard, pagină de finalizare” + „Salvează”: in baza doar `checkout_config.tip = "pagina"`, designul cu aceeasi
      amprenta, nicio ciorna, bara de sus tot „Totul e publicat”. Pe „Finalizarea comenzii”: caseta cu tipul si „Schimbă
      tipul în Setări” (deschide „Comanda”), previzualizarea pe pagina de finalizare, panoul sectiunii fara „Schimbă
      designul”. In magazin, „Finalizează comanda” din cos a dus la `/checkout`; „Pagini” a aratat „PAGINA” si „Alege
      tipul”. Inapoi pe fereastra: previzualizarea pe pagina principala, cu nota; `/checkout` trimite la prima pagina;
      cosul deschide fereastra.
      GASIT si reparat: randul „Finalizarea comenzii” din arbore scria designul din ciorna („Formular in fereastra”) sub
      caseta „Standard”; arborele citeste acum designul cu tipul aplicat (proba noua, mutant prins). Eroarea de hidratare
      din consola vine din extensia Chrome-ului lui (`cz-shortcut-listen` pe `<body>`). Pus la loc: iesirea din
      impersonare (l-a deconectat), `checkout_config` de dinainte, data abonamentului; o singura comparatie, totul egal
      (`page_content` si designul dupa amprenta, ciorna goala, 0 versiuni, analitica, comenzile, fara `tip`).

## Temele: prima tema, „Jupiter” (scris 28.10.2026, seara, inainte de cod)

Cerut de el (28.10.2026, dupa etapa 15), cuvant cu cuvant: „Da, hai sa facem sectiunea de Teme dar sa fii atent aici
pentru ca nu vreau sa stricam absolut deloc Design-ul magazinelor care sunt active acum, tema asta sa fie optionala
pentru cine vrea sa o aplice si cand o aplica sa se aplice direct pe magazinul lui practcic. Incepem cu prima tema, vreau
sa dam denumiri de Planete la temele astea. Pentru prima tema vreau sa te inspiri de aici: https://www.dedeman.ro/ Vreau
sa fie aproape 1 la 1 ca in exemplul atasat de mine. Vreau sa punem pe subdomenii si previzualizare live ca sa vada cum
arata tema cu continut in ea practic. Iar cand o selecteaza sa oferim optiunea de Importare date demo in caz ca vrea.”

Raspunsurile lui (toate pe varianta recomandata): numele „Jupiter”; locul „Pagină nouă „Teme””; aplicarea „Direct în
magazin, cu Istoric”; datele demo „Adaugă, marcate demo”.

Ce e azi, citit in cod: la inscriere se alege un „stil” (`onboarding/aspect.ts`), adica o pereche antet + subsol; teme
intregi nu exista. Cardul de produs are o singura varianta (`classic`, `ProductCard.tsx`). Antetul „Magazin mare, cu
categorii” (`HeaderMarket`) are deja trei randuri. Fonturile paginilor (33) n-au Open Sans si Sofia Sans. Istoricul
(etapa 7) tine versiuni cu originea „publicare” sau „inainte”. Domeniile proprii se rescriu in `proxy.ts` spre `/{slug}`;
`*.edinio.com` e gazda platformei. Baza demo foloseste poze Unsplash legate (222 de adrese). Nu exista lista de favorite
si nici recenzii pe produs.

Ce am vazut pe dedeman.ro (28.10, in Chrome): bara albastra subtire sus (#215196: localitatea, Magazine, Cariere,
Intrebari frecvente); randul cu logo, cautarea lata cu buton portocaliu (#FF882D), Favorite, Contul meu, Cos; randul cu
butonul portocaliu „Categorii produse” (meniu pe doua niveluri, cu iconite, si un card de promotie) si linkuri. Pagina
principala: carusel de bannere-imagine cu paginare in segmente + doua carduri gri (titlu, text, imagine); „Categorii”:
placi gri pe 4 coloane, imagine, nume cu sageata portocalie, numarul de produse; randuri de produse in carusel cu sageti,
pe fond gri; „Recomandari”: patru placi cu imagine rotunda, titlu si „Descopera ofertele ›”; „Recomandari pe
categorii”: file (activa albastra) + carusel. Cardul: insigna rosie „SUPER PREȚ”, inima, stele, titlu pe trei randuri,
pretul vechi taiat „lei/bucată”, pretul mare rosu cu zecimalele mici, buton albastru „Adaugă în coș” cu patratul
portocaliu al cosului. Subsolul: bara albastra „Înapoi sus”, newsletter cu buton portocaliu si aplicatiile, cinci coloane
de linkuri pe gri, „Servicii și facilități” cu iconite, jos copyright, ANPC si retelele. Textul Open Sans 14 px #333,
titlurile Sofia Sans 24 px. Pagina de categorie: firimituri, titlu cu numarul, placile subcategoriilor, descriere, filtre
in stanga, sortarea sus, grila pe 4. Pagina de produs: titlu lat sus, cod, galerie cu miniaturi in stanga, pret mare,
cantitate si butonul albastru.

⚠ Ce NU se copiaza: logo-ul, numele, mascota, pozele si textele Dedeman (sunt ale lor). Se fac aproape 1 la 1 structura,
asezarea, culorile, fonturile (libere, Google Fonts) si comportamentul; magazinul demo are nume si continut propriu.

### Deciziile

1. **O tema = un design intreg** (sectiunile, variantele, setarile si stilul: culori, fonturi, colturi), plus, la
   cerere, datele demo. Variantele noi intra in registry ca oricare alta, deci se pot alege si una cate una din editor.
2. **Numele sunt planete**; prima e Jupiter. Demo-ul ei sta pe `jupiter.edinio.com` (local: `jupiter.localhost:3000`),
   un magazin adevarat (`tema-jupiter`), cu date demo.
3. **Magazinele de azi nu se ating**: nicio varianta implicita nu se schimba, nimic nu se aplica singur.
4. **Aplicarea, direct** (raspunsul lui): designul publicat de acum (si ciorna, daca exista) intra in Istoric, cu o
   origine noua, „tema”; designul publicat devine al temei, ciorna se goleste. Produsele, textele (`page_content`),
   setarile si domeniul nu se ating. Pe pagina „Teme”, „Pune la loc designul de dinainte”, intr-un clic.
5. **Datele demo** (raspunsul lui): se ADAUGA langa ce are (categorii, produse, bannere, cardurile temei), marcate:
   produsele cu `external_id` `tema-demo:jupiter:<cheie>`, restul tinute in `page_content.date_demo`. „Șterge datele
   demo” scoate exact ce s-a adaugat; nimic al lui nu se sterge sau se suprascrie. Daca magazinul e public, avertisment:
   produsele demo se vad pana le stergi.
6. **Pozele demo**: Unsplash (licenta libera), legate, ca in baza demo de azi; nimic de pe dedeman.ro.
7. **Fonturile Open Sans (text) si Sofia Sans (titluri)** intra in lista (33 → 35), gazduite ca celelalte.
8. **Lasate pentru o intrebare dupa etapa 16**: inima si „Favorite” (nu exista lista de favorite), stelele (nu exista
   recenzii pe produs), iconita de cautare dupa poza, „Alege-ți localitatea” (fara sens la un magazin mic).

### Etapele (una cate una, cu raport dupa fiecare)

- **Etapa 16: aspectul Jupiter**, pe magazinul demo local `tema-jupiter`.
  - [x] 16.1 (28.10: `lib/teme/jupiter/date-demo.ts` (12 raioane, 27 subcategorii, 58 de produse, 4 bannere, 2 carduri,
        4 placi; poze Unsplash cautate in Chrome, legate); `lib/teme/import-demo.ts`: importul pe bucati pure, fara
        marketplace-uri, cu proiectia catalogului si urma in `page_content.date_demo`; `lib/teme/teme.ts`; scriptul
        `scripts/teme/seamana-demo.ts` (refuza productia). In baza demo: contul tehnic `teme@edinio-demo.test` (parola
        aleatoare, ca in seed) si magazinul `tema-jupiter`; importul: 39 de categorii, 58 de produse proiectate, 4 bannere;
        repetat, 0/0/0. 8 probe in `teme/import-demo.test.ts`.) Setul de date demo Jupiter, in cod (categorii pe doua
        niveluri, produse cu poze Unsplash, bannere, carduri, placi), si magazinul `tema-jupiter` in baza demo.
  - [x] 16.2 (28.10: Open Sans si Sofia Sans in lista (35), cifra din ghid legata de lista printr-o proba; container nou
        `xwide` (100rem, cat pagina modelului); antetul `hipermarket` (bara de sus 40 px, cautarea de 56 px cu butonul de
        accent, bara de navigare lipita sus la derulare, meniul de categorii pe doua niveluri cu fundal intunecat, Escape);
        subsolul `hipermarket` (bara „Înapoi sus”, newsletterul in banda lui cu campul si butonul lipite, coloanele pe gri
        prin `ColoanaSubsol` exportata din `FooterColumns`, nu copiata); `teme/jupiter/design.ts` (stilul, antetul,
        subsolul, pagina Magazin cu filtre); scriptul aplica si designul. Vazut pe magazinul demo, langa dedeman.ro: aceleasi
        proportii. GASIT: titlul newsletterului (63 de caractere) se taia la 60, la citire; scurtat, plus o proba ca textele
        temei incap in campuri. 7 probe in `teme/jupiter/design.test.ts`; mutanti 6/6.) Stilul (fonturile noi, culorile) si
        antetul „Hipermarket” (bara albastra, cautarea cu buton portocaliu, contul, cosul, „Categorii produse” cu meniul pe
        doua niveluri), plus subsolul cu „Înapoi sus”, newsletter, coloane, servicii.
  - [x] 16.3 (28.10: bannerul `carduri` (`BannerSlider` refolosit, paginare in segmente, doua carduri in reglaje);
        categoriile `placi` (numarul de produse din catalogul din pagina, urcat pe parinti; fara numar la catalogul pe
        server); cardul `jupiter` (logica mutata in `useDateCardProdus`, comuna cu cel clasic; „Super preț”, pretul mare,
        butonul cu patratul cosului), ales in `StoreProductCard` pentru toate suprafetele; randul de produse cu reglajul
        `banda` (gri pe tot ecranul printr-o umbra decupata, 5 carduri, sageti albe); tipul nou „Plăci de recomandare”
        (`placi_promo`, imagine pe cerc, adaugabil ca orice sectiune, in afara galeriei); pagina principala urmeaza latimea
        din stil (`--st-container`, 72rem = implicitul celor 148 de magazine din productie, deci nimic schimbat la ele);
        importul adauga si randurile demo „Oferte de sezon” si „Alegeri populare”; designul compune pagina in ordinea
        modelului, restul sectiunilor magazinului dupa. Vazut pe magazinul demo, si pe telefon (390 px, fara depasire;
        placile de categorii trecute pe doua coloane). 10 probe in `pagina-principala.test.ts`, plus importul; mutanti 11/11
        (cel cu bucla prins prin blocare; scriptul de mutanti are acum limita de timp). AMANAT: randul pe file de categorii
        (cere produse pe categorie aduse de pe server la cataloagele mari).) Pagina principala: bannerul cu carusel si doua
        carduri, placile de categorii cu numarul de produse, cardul de produs Jupiter, caruselul cu sageti, randul pe file de
        categorii, placile de recomandari.
  - [x] 16.4 (28.10: pagina Magazin cu filtre in stanga primeste reglajul `placiSubcategorii` (placile subcategoriilor sub
        titlu, cu `PlacaCategorie` scoasa din `CategoryNavPlaci`, nu copiata; numarul pe orice categorie,
        `produsePeCategorie`); pagina de produs „Detaliat” urmeaza latimea din stil (6 containere; 72rem implicit) si e a
        temei; subcategoriile demo primesc poza primului lor produs (si in baza demo, 27). Designul temei primeste si
        designul de acum al magazinului ca baza (pentru etapa 17): sectiunile, blocurile de sub produs si coloanele alese
        de el raman; GASIT de proba: parserul scrie si coloanele implicite, deci „alese” se judeca fata de implicite. Cosul
        ramane sertarul clasic, in culorile temei. 6 probe in `pagini.test.ts`; mutanti 9/9.) Paginile de categorie si de
        produs, cosul: variantele existente, reglate pe tema si pe cardul ei.
  - [x] 16.5 (29.10, `73ae4141` + proba din editor, cu acordul lui („Da, fă proba acum”), pe `floraria-mirei` din baza
        DEMO, impersonat: bannerul trecut pe „Bannere cu două carduri alăturate”, „Adaugă card” pana la 2/2 (butonul
        dispare), sagetile oprite la capete, mutarea si „×” urmate de previzualizare pe loc, linkul ales din sugestii
        (`/magazin` → `/floraria-mirei/magazin`), ciorna scrisa in baza; „Plăci de recomandare” din „Adaugă secțiune”, cu
        panoul deschis singur, placa in previzualizare, „Descopera ofertele ›” doar cu link. Pagina principala proprie a
        magazinului scoasa pe moment, ca bannerul din design sa se vada; „Renunță”, iesirea din impersonare, apoi totul
        pus la loc si comparat: planul, designul, `page_content` (aceeasi amprenta), fara ciorna, istoric gol, 0 comenzi
        noi; `updated_at` si `last_sign_in_at` al contului de test raman mutate. Inainte: ghidurile (antetul
        cu 9 design-uri, subsolul cu 4, bannerul cu 4 si cardurile lui, subcategoriile pe placi ale Paginii Magazin, banda
        gri a randurilor, „Adaugă secțiune”; nou `cum-adaugi-placi-de-recomandare`, 427 de ghiduri; citatele cautate in
        sursa; centrul de ajutor 42/42). GASITE si reparate: (1) vitrina Jupiter scria cu diacritice („Adaugă în coș”,
        „Caută”, „Coș”), iar etichetele noi din panou fara: intoarse dupa regula lui, cu proba; (2) panoul n-avea control
        pentru campurile-lista (`repeater` cadea pe `default: return null`), deci „Cardurile din dreapta” si „Plăcile” le
        putea pune doar tema: acum `ListaRepetor` („Adaugă card”, sageti, „×”, linkul cu `CampLink`), plus o proba ca
        orice tip de camp din registru are control; (3) cardul Jupiter ignora „Categoria pe card”: acum o arata deasupra
        titlului, iar demo-ul o tine stinsa (`setariDemo`). In Chrome pe `tema-jupiter`: textele noi si linia de
        categorie (pornita pe moment pe demo, stinsa la loc). Porti: suita 11.337 / 0 / 2 sarite, `build:ci` trece, tsc 0,
        eslint 0 pe fisierele atinse; mutanti 9/9.) Ghiduri, porti, proba in Chrome langa dedeman.ro (cere acordul lui
        pentru impersonare, daca e nevoie).
  - [x] 16.6 (29.10, facut: `category_nav` si `product_card` in galerie, cu inaltimile miniaturilor masurate la 1280 px
        (220/400 si 500/570); randul „Design” scos din panoul sectiunii in `RandDesign`, folosit si de fila „Stil”;
        miniatura cardului prin `StoreProductCard` cu `varianta`; proba noua: orice sectiune cu doua design-uri sau mai
        multe e in galerie, afara de randul de produse. Ghiduri: nou `cum-alegi-cum-arata-categoriile` (428), designul
        cardului in ghidul cardului, „Cardul de produs” in „Schimbă designul”. Miniaturile vazute pe ruta publica (cele
        patru, fara cont). Porti: suita 11.339 / 0 / 2 sarite, `build:ci` trece, eslint 0; mutanti 6/6. Panoul din editor:
        la proba etapei 17.)
        (cerut de el la raportul etapei 16, 29.10: „Da, și din panou”; scris inainte de cod) Placile de categorii
        si cardul Jupiter alegibile si fara tema. `category_nav` si `product_card` intra in galerie (`inCatalog`, cu
        `previewHeight` pe fiecare varianta). „Categorii” primeste „Schimbă designul (2)” in panoul ei, ca orice
        sectiune. Cardul n-are rand in arbore: in fila „Stil”, la „Cardul de produs”, un rand „Design” cu „Schimbă
        designul (2)” deschide aceeasi galerie. Miniatura cardului: patru produse demo prin `StoreProductCard`, cu
        varianta ceruta (aceeasi alegere a componentei ca in magazin, nu o a doua). Ghiduri (categoriile, cardul,
        „Schimbă designul”), probe, porti; miniaturile vazute pe ruta publica de previzualizare, panoul cu acordul lui.
- **Etapa 17: pagina „Teme”** (cardul lui Jupiter, „Vezi demo”, „Aplică tema”), aplicarea cu Istoric si „Pune la loc”.
  Scris 29.10, inainte de cod (acordul lui: „Da, etapa 17”).
  - De tinut minte (vazut la 16.5): coloana „Newsletter” a temei intra la aplicare doar cu furnizor conectat (Mailchimp,
    Brevo sau Klaviyo), cum cere si panoul; altfel subsolul primeste celelalte coloane. Reglajele lui din `page_content`
    raman ale lui (`setariDemo`, fara categoria pe card, e doar al magazinului demo).
  - ⚠ **Gasit inainte de cod (29.10): stilul din design CASTIGA peste fila „Stil”** (`resolveStyle`: „Designul castiga”).
    Daca tema isi pune culoarea principala, fundalul si fonturile in `design.style`, dupa aplicare culoarea si fonturile
    alese din „Stil” n-ar mai face nimic. Masurat in productie (doar citire): 0 din 148 de magazine au culori sau fonturi
    in design; toate le tin in identitate (`businesses.primary_color`, `page_content`). Deci tema le scrie TOT ACOLO, iar in
    `design.style` raman doar ce „Stil” nu regleaza (accentul, suprafata, textul, colturile, latimea, cardurile).
    Identitatea scrisa intra in versiunea din Istoric (`continut`: cheile editorului si culoarea), deci „Pune la loc” o
    readuce. Magazinul demo se face la fel.
  - Facut 29.10 (17.1-17.5): identitatea in `IDENTITATE_JUPITER`, scrisa ca un continut de ciorna (`continutIdentitate`),
    deci prin „Publică” si in Istoric; demo-ul refacut asa, arata la fel (albastrul, portocaliul, Sofia Sans, Open Sans,
    acum din identitate). Originile `tema` si `ciorna` in migratia neimpinsa si pe demo, cu etichetele lor in Istoric.
    `aplicaTema` si `puneLaLocDesignulDeDinainte` trec AMANDOUA prin `publishDesign` (o singura cale de publicare); taierea
    versiunilor vechi scoasa in `taieVersiunileVechi`, comuna. Coloana „Newsletter” a temei doar cu furnizor. Proba de
    dus-intors: dupa „Aplică” si „Pune la loc”, `page_content`, culoarea si designul revin EXACT. Pagina
    `/dashboard/editor/teme` (in meniu, langa „Editorul”): miniatura vie a demo-ului, „Vezi demo”, ferestrele cu ce se
    intampla, `useLucru`, data in fusul Romaniei. Ghiduri: `cum-aplici-o-tema`, `cum-pui-la-loc-designul-de-dinainte-de-tema`
    (430). Gasit la porti si reparat: actiunile revalidau `/dashboard/teme`, iar pagina sta la `/dashboard/editor/teme`
    (acum cu proba); lista actiunilor exportate (fiecare verifica proprietarul intai) are si cele trei noi. Porti: suita
    11.352 / 0 / 2 sarite, `build:ci` trece (cu ruta noua), tsc 0, eslint 0; mutanti 12/12. RAMAS: 17.6, proba in Chrome
    (impersonare, cu acordul lui; sesiunea lui de admin pe localhost s-a inchis la iesirea din impersonarea de la 16.5,
    deci se reconecteaza el).
  - 17.1 Identitatea temei (`Tema.identitate`: culoarea, fundalul, fontul titlurilor si al textului), scoasa din
    `STIL_JUPITER`; scriptul demo o scrie in identitate. Proba: dupa aplicare, culoarea si fonturile alese din „Stil”
    schimba magazinul.
  - 17.2 Istoricul: originea noua „tema” (ce era in magazin inainte de aplicare) si „ciorna” (ciorna nepublicata de
    atunci, ca nimic sa nu se piarda), in migratia inca neimpinsa (REGISTRU A) si aplicata pe demo; etichetele lor in
    „Istoricul publicărilor”.
  - 17.3 Actiunile: `aplicaTema(cheie)` (proprietarul; versiunile de dinainte; designul temei peste designul lui, cu
    sectiunile, blocurile si coloanele lui; identitatea; publicat direct, ciorna golita; versiunea publicata; semnul
    `tema_aplicata` in `page_content`; revalidarea magazinului) si `puneLaLocDesignulDeDinainte()` (versiunea „tema”
    cea mai noua, design si identitate, publicata direct; ce s-a schimbat dupa ramane in Istoric). Bucatile pure in
    `lib/teme/aplicare.ts`, cu probe.
  - 17.4 Pagina `/dashboard/teme` (in meniu langa „Editează magazinul”): cardul Jupiter (numele, descrierea, o miniatura
    a demo-ului), „Vezi demo” (local `/tema-jupiter`; subdomeniul la 19), „Aplică tema” cu fereastra care spune ce se
    intampla (designul inlocuit, cel vechi pastrat in Istoric, produsele si textele neatinse), apoi „Tema e în
    magazin”, „Deschide editorul” si „Pune la loc designul de dinainte”.
  - 17.5 Ghiduri („Cum aplici o temă”, „Cum pui la loc designul de dinainte”), REGISTRU, porti.
  - [x] 17.6 Proba in Chrome pe magazinul de test din baza demo (impersonare, cu acordul lui): aplicarea, magazinul,
    Istoricul, „Stil” dupa aplicare, „Pune la loc”; totul pus la loc si comparat.
    (29.10, cu acordul lui, el reconectat ca admin, apoi impersonat `floraria-mirei`, cu o ciorna mica pusa in baza:
    pagina „Teme” cu demo-ul viu (`/tema-jupiter`, scara 0,33), fereastra cu ciorna si „vizibil”; „Aplică tema”:
    antetul si subsolul „hipermarket”, coloanele FARA newsletter (fara furnizor), cardul Jupiter, albastrul, fundalul si
    fonturile in identitate, ciorna golita (si nepublicata), Istoricul `tema` / `ciorna` / `publicare`, pagina principala
    proprie neatinsa; magazinul public cu tema si cosul plutitor albastru. In editor: „Categorii” si „Stil > Cardul de
    produs” cu „Schimbă designul (2)” si galeria cardului (16.6); o culoare aleasa din „Stil” schimba previzualizarea
    (17.1 dovedit). Cu ciorna, „Pune la loc” oprit, cu nota; dupa „Renunță”, „Pune la loc” a readus EXACT `page_content`
    (aceeasi amprenta), culoarea mov, antetul centrat, cardul clasic. GASIT si reparat: caseta „Pune la loc” ramanea dupa
    readucere; acum pagina intreaba Istoricul doar cat e o tema aplicata. Datele puse la loc din tabelul de rezerva
    `privat.proba_17_inainte` (sters), versiunile probei sterse; comparat: designul, ciorna, `page_content`, publicarea,
    culoarea, planul, Istoricul gol, 0 comenzi noi; mutate raman `updated_at` si ultima conectare a contului de test.
    ⚠ Iesirea din impersonare l-a deconectat iar pe localhost.)
  - Intrebare pusa lui la raportul etapei 16: placile de categorii si cardul Jupiter le pune acum doar tema
    („Categorii” si „Card de produs” nu sunt in galeria „Schimbă designul”). Le facem alegibile si in panou?
    **Raspunsul lui (29.10): „Da, și din panou”**: se face ca 16.6, inaintea paginii „Teme”.
- **Etapa 18: „Importă datele demo”** la aplicare si „Șterge datele demo”. Scris 29.10, inainte de cod (acordul lui:
  „Da, etapa 18”, dupa proba 17.6).
  - ⚠⚠ **Intai, inainte de orice import pe un magazin real: produsele demo NU pleaca din magazin.** Fluxurile si
    sincronizarile citesc toate produsele magazinului: Google Merchant (si cronul lui), Meta, TikTok, Pepita, eMAG,
    Trendyol, About You, easySales, plus sitemapul si cautarea Google. Importul nu pune nimic in coada marketplace-urilor,
    dar un cron le-ar lua oricum. 18.1 = inventarul tuturor celor care citesc `products` spre afara si excluderea dupa
    `source = 'tema-demo'`, cu o proba care cade la un cititor nou fara excludere; paginile produselor demo, `noindex`.
  - [x] 18.1 FACUT (29.10): `lib/teme/produse-demo.ts` (sursa, `esteProdusDemo`, `caInactivDacaEDemo`,
    `FARA_PRODUSE_DEMO`). Portile: Google Merchant (cronul: ca un inactiv; „sincronizează tot” si numaratoarea, fara
    demo), catalogul Meta (fluxul si trei citiri din panou), Pepita (fluxul, includerea in masa), sitemapul, email
    marketing (ca un inactiv: scos de la furnizor), OLX (cronul, trimiterea pe loc), Trendyol (ca un inactiv; in lot,
    „Produs demo: rămâne doar în magazin.”), About You (ca un inactiv), eMAG (`citesteProdusul`), easySales (motivul nou
    „demo”, blocheaza), pagina produsului demo `noindex`. Probe pe sursa pe fiecare poarta, plus numaratoarea citirilor
    de produse din canale (o citire noua o face sa cada). Filtrul probat prin clientul real pe demo: 58 -> 0 la
    `tema-jupiter`, produsul fara sursa ramane, si cu un al doilea `.or` in cerere (se aduna ca SI). ⚠ In productie
    (citire): 1.009 produse din 7.701 au `source` NULL; un `neq` simplu le-ar fi scos din fluxuri si din sitemap. 0 demo.
    Mutanti 12/12. Lasat: listele din panoul canalelor (eMAG, OLX, Trendyol, About You, Pepita) inca le arata; trimiterea
    le sare (REGISTRU D). GASIT la porti: 46 de probe cazute. (1) Bazele false din probe (fluxul Pepita, includerea in
    masa, sitemapul, ruta Meta) nu stiau `.or`: invatate, cu semantica SQL (NULL nu e „diferit de” nimic), plus o proba
    de comportament in fluxul Pepita (demo-ul nu intra, cel fara sursa intra); mutantul care pierde produsele fara sursa
    e prins de trei probe. (2) La About You `PRODUCT_FIELDS` e lista campurilor TRIMISE, pe care o asculta declansatorul
    din baza: sursa scoasa de acolo si citita aparte, doar la poarta (`PRODUCT_FIELDS_CU_SURSA`). Porti: suita 11.357 / 0
    / 2 sarite, `build:ci` trece.
  - [x] Defect vechi gasit de eslint la portile 18.1, reparat aparte (29.10, `9c8cdfc4`): cautarea din alegatorul de
    produse al feedurilor Meta scapa `%` si `_` cu sirul literal „${c}” (backslash-dolar intr-un sir sablon), deci
    „50%” nu gasea nimic. Acum trece prin `escapeLike`, ca la Clienti. Proba pe functie si pe sursa; mutantul (codul
    vechi pus la loc) cade. Porti: suita 11.358 / 0 / 2 sarite, tsc, eslint, `build:ci`. REGISTRU C.
  - 18.2 La „Aplică tema”, o bifa „Importă și datele demo” (produse, categorii, bannere, randuri, cardurile si placile
    temei), cu ce inseamna: se ADAUGA langa ale lui, marcate; daca magazinul e public, clientii le vad pana le sterge.
    De verificat: limita de produse a planului (azi nu gasesc una in cod).
  - 18.3 Ordinea: versiunile de dinainte (ca la 17), apoi importul (`importaDateleDemo`, cu radacina catalogului
    magazinului), apoi tema publicata CU datele (`date`: cardurile, placile, mesajul barii de sus). „Pune la loc” readuce
    bannerele si randurile de dinainte (sunt chei ale editorului), dar produsele si categoriile demo raman pana la
    „Șterge datele demo”; spus in fereastra si in ghid.
  - 18.4 „Șterge datele demo”, pe pagina „Teme”, cand exista urma (`page_content.date_demo`): produsele cu sursa demo,
    categoriile create de import (doar daca n-au alte produse), bannerele si randurile adaugate (dupa urma), iar
    cardurile si placile temei care au ramas cu continutul demo (prin `publishDesign`). Fereastra spune cate sunt.
  - 18.5 Ghiduri, REGISTRU, porti; proba in Chrome pe magazinul de test (cu acordul lui), cu tot pus la loc.
  - [x] 18.2-18.4 FACUTE (29.10), inainte de proba:
    - 18.2: bifa „Importă și datele demo” in fereastra „Aplică tema”, OPRITA la fiecare deschidere; spune ce adauga
      (58 de produse cu cele 39 de categorii ale lor, 4 bannere, 2 randuri, textele temei), ca nu pleaca in canale, ca intra in
      limita planului, iar cu magazinul vizibil, ca produsele demo se pot COMANDA pana le sterge. Limita GASITA:
      `PLAN_PRODUCT_LIMITS` (gratuit 10, Basic 500, Premium 2500, Ultra fara), pe CONT, ca la adaugarea de mana; se
      numara doar produsele temei care lipsesc (importul repetat nu e oprit). `lib/teme/limita-demo.ts`; un plan necitit
      = eroare, nu „gratuit”. Fara loc, bifa e oprita, cu motivul („Datele demo adaugă 58 de produse, iar planul tău
      permite 10 produse (ai deja 3).”). ⚠ Deci un cont GRATUIT nu poate importa datele Jupiter (58 > 10): intrebare
      pentru el la raport.
    - 18.3: `aplicaTema(businessId, cheie, cuDateDemo?)`: limita (inaintea oricarei scrieri), Istoricul, importul (cu
      radacina catalogului: `/${permalinks.magazin}`, `radacinaCatalogTemei`), magazinul RECITIT (randurile noi intra in
      design prin `parseStoreDesign`), tema publicata cu `date`. GASIT si reparat: (1) tema GOLEA cardurile bannerului
      LUI si ii INLOCUIA placile de recomandare, iar cu datele demo ii suprascria mesajul barii de sus; acum ale lui
      raman, cele demo intra doar in locul gol (ca importul); (2) `scrieSemnulTemei` (17) scria peste o citire cazuta:
      `page_content` ar fi devenit `{ tema_aplicata }`, adica tot magazinul gol de texte; acum `scrieCheiaTemei` nu
      scrie fara citire; (3) importul trecea categoriile in urma abia la sfarsit: o cadere la mijloc lasa categorii pe
      care stergerea nu le mai gasea; acum id-urile se aleg inainte si urma se scrie INAINTEA categoriilor.
    - 18.4: `stergeDateleDemo`: nu peste o ciorna; bannerele, randurile si textele demo ramase neschimbate
      (`Tema.faraTexteleDemo`, dupa titlu SI poza) prin „Publică” (deci in Istoric), doar cand e ceva de scos;
      produsele prin `bulkProductAction` (retragerile eMAG/OLX, pachetele, sincronizarile, proiectia); categoriile din
      urma ramase goale, intrebate nume cu nume (o lista `in` s-ar fi oprit la 1000 de randuri), fara un parinte cu un
      copil care ramane (`parent_id` e `on delete cascade`, verificat pe demo); urma LA URMA (o cadere se reia). Caseta
      pe pagina „Teme” cat sunt date demo; fereastra „Pune la loc” spune ca produsele si categoriile demo raman.
    - Ghiduri: `cum-aplici-o-tema` (bifa, datele demo, limita), `cum-pui-la-loc-designul-de-dinainte-de-tema` (cu
      datele demo) si unul nou, `cum-stergi-datele-demo-ale-temei` (431 de ghiduri). Probe noi: `limita-demo`,
      `stergere-demo`, `date-demo-in-design`, ordinea importului pe o baza falsa (si cu o cadere la subcategorii);
      mutanti 15/15. Porti: suita 11.386 / 0 / 2 sarite, tsc, eslint, `build:ci`.
  - [x] 18.5 PROBATA in Chrome (29.10, cu acordul lui, impersonare pe `floraria-mirei`, baza demo):
    - planul gratuit: bifa oprita, „Datele demo adaugă 58 de produse, iar planul tău permite 10 produse (ai deja 1).”;
    - Basic (mutat pe demo): bifa oprita la deschidere, cu urmarile (58 din 500; „le pot comanda”); aplicata: 58 de
      produse demo active, 39 de categorii (toate in urma), 4 bannere cu linkuri pe `/magazin`, 2 randuri, cardurile si
      placile demo, mesajul „Livrare in toata tara” (n-avea unul), Istoricul `tema` + `publicare`; magazinul arata ca
      demo-ul; pagina unui produs demo: 200, `noindex, follow`;
    - „Pune la loc”: fereastra spune ca produsele si categoriile raman; `page_content` IDENTIC cu cel de dinainte (fara
      urma), culoarea si antetul lui inapoi; produsele, categoriile si urma raman; caseta „Șterge datele demo” ramane;
    - „Șterge datele demo”: doar produsul lui, 0 categorii, urma scoasa, `page_content` identic, nimic de publicat;
    - runda a doua, cu produsul LUI mutat in „Scule electrice” (subcategorie demo): „Scule electrice” si parintele ei,
      „Scule și unelte”, AU RAMAS (cascada ocolita), celelalte 37 sterse; cardurile, placile, mesajul, bannerele si
      randurile demo scoase, tema ramasa aplicata; vitrina fara nimic demo.
    - Pus la loc din rezervele `privat.proba_18_*` (sterse): randurile intregi din `store_settings`, `businesses`,
      `users_profile` si produsul lui, IDENTICE (fara `updated_at`); 0 categorii, 0 versiuni, 1 comanda (cea veche);
      maturare pe toate tabelele cu `business_id`: 0 randuri noi. Observat: scrierea prin vederea `store_settings`
      recripteaza cheile curierilor (alt nonce, aceeasi valoare la decriptare, verificat); puse la loc si ele.
      Ramase mutate: `updated_at` si marcajul de proiectie al produsului lui (de la punerea la loc).
- **Etapa 19: subdomeniul** (`jupiter.edinio.com`, local `jupiter.localhost`) si „Vezi demo”; in REGISTRU, ce trebuie la
  push: DNS, domeniul in Vercel, magazinul demo in productie. Scris 29.10, inainte de cod (acordul lui: „Da, etapa 19”).
  - Ce e azi, citit in cod: orice `*.edinio.com` e gazda PLATFORMEI (`platform-hosts.ts`), deci `jupiter.edinio.com` ar
    servi chiar site-ul de prezentare; `jupiter.localhost` nu e a platformei si ar cadea pe cautarea domeniilor proprii
    (404). Vitrina scrie adresele fara slug doar pe domeniul propriu (`esteDomeniulPropriu`, 11 pagini, acelasi tipar
    `basePath`); aceeasi functie hotaraste si indexarea, contul de client si Search Console. Magazinul demo are doar
    ramburs: un vizitator ar putea plasa o comanda, iar emailul de confirmare ar pleca la adresa scrisa de el. Slugul
    `tema-jupiter` nu e rezervat (0 magazine `tema-%` in productie, 29.10). `next dev` refuza resursele de dezvoltare
    cerute de pe alta gazda decat `localhost` (`allowedDevOrigins`).
  - 19.1 `lib/teme/gazde-demo.ts` (fara dependente): subdomeniul fiecarei teme si magazinul lui. In `proxy.ts`, inaintea
    domeniilor proprii: `<cheie>.edinio.com` si `<cheie>.localhost` se rescriu spre `/<slugDemo>`, cu
    `X-Robots-Tag: noindex`; `robots.txt` = „Disallow: /”, fara sitemap; o adresa veche cu slugul in fata se redirecteaza
    fara el. `adreseFaraSlug(host, magazin)` in cele 11 pagini, DOAR pentru adrese: indexarea, contul de client si
    Search Console raman pe `esteDomeniulPropriu` (demo-ul nu e domeniul nimanui). `allowedDevOrigins: ["*.localhost"]`.
    „Vezi demo” duce pe subdomeniu (local `http://jupiter.localhost:3000`, pe o gazda de desfasurare pe `/tema-jupiter`);
    miniatura ramane pe aceeasi origine (`X-Frame-Options: SAMEORIGIN` n-ar lasa cadrul de pe alta).
  - 19.2 Magazinul demo nu ia comenzi: semnul `magazin_demo` in `setariDemo` (scris de script in `page_content`), iar
    `placeOrder` si `placeCartOrder` refuza, inaintea oricarei rezervari, cu „Acesta e un magazin demo: poti incerca tot,
    dar comenzile sunt oprite.” (fara diacritice: e text de vitrina). Cosul abandonat nu se strange
    (`abandoned_cart_enabled` ramane oprit; verificat). Slugurile `tema-*` rezervate la crearea unui magazin.
  - 19.3 Productia, pregatita, NU rulata: fisierul SQL al magazinului demo (contul tehnic, profilul Ultra, magazinul,
    setarile; idempotent, dupa tiparul din `demo-seed`), scriptul de umplere acceptand productia doar cu un semn anume;
    in REGISTRU: CNAME `jupiter` → Vercel, domeniul in proiect, SQL-ul si scriptul cu acordul lui, verificarile.
  - 19.4 Ghiduri, probe, porti; proba in Chrome pe `jupiter.localhost:3000` (magazinul demo e public: fara impersonare).
  - [x] 19.1-19.3 FACUTE (29.10, `0867f3dc`): ca in plan. In plus: `jupiter.edinio.com.strain.ro` si `constructor.edinio.com`
    nu sunt subdomenii de tema (un `Map`, gazda potrivita intreaga); taietura slugului dupa segmentul BRUT. SQL-ul probat pe
    demo pe toate trei ramurile (cont si magazin noi, apoi „exista deja”, apoi slugul altui cont, oprit, cu tot blocul
    intors), proba stearsa; scriptul rulat pe demo a scris semnul `magazin_demo` (doar la `tema-jupiter`). Probe noi pe
    proxy-ul adevarat (5) si pe reguli (10); mutanti 16/16. Porti: suita 11.401 / 0 / 2 sarite, tsc, lint sub prag,
    `build:ci`.
  - [x] 19.4 PROBATA (29.10): `jupiter.localhost:3000` serveste magazinul demo, hidratat (46/46 butoane), cu 48 de
    linkuri spre produse fara slug si 0 cu `/tema-jupiter`; `noindex` in antet si in pagina; `robots.txt` „Disallow: /”;
    `sitemap.xml` 404; `/tema-jupiter/magazin` -> 308 `/magazin`. Comanda din formularul produsului SI cea din cos
    (sertarul cosului, fiindca designul n-are pagina de cos) refuzate cu mesajul, 0 comenzi, 0 cosuri, 0 clienti; ultima
    comanda din baza ramane cea din 29.09. GASIT: mesajul avea diacritice, desi e text de vitrina; scos, cu proba.
    Pagina „Teme” n-a fost deschisa in Chrome (sesiunea lui de pe localhost s-a inchis la iesirea din impersonare, 18.5):
    „Vezi demo” si miniatura sunt probate pe sursa si pe functie.

- **Etapa 20: setul demo Jupiter cu datele LUI** (cerut 29.10, dupa etapa 19, cuvant cu cuvant: „Bun, dar acest Demo
  trebuie sa aiba datele Demo pe care ti le dau eu. Iti dau eu cateva bannerele, cateva produse, un logo, etc...”).
  Raspunsurile lui: setul „Doar ale tale” (cel de azi, 58 de produse Unsplash in 12 raioane, iese intreg; raioanele si
  randurile se potrivesc pe ce da el) si importul „Tot, ca în demo” (comerciantul care bifeaza primeste produsele,
  categoriile SI bannerele lui). Materialul vine in `C:\Users\iorda\Desktop\EDINIOV2\demo-jupiter` (logo, `bannere/`,
  `produse/`, tabelul produselor; optional pozele raioanelor, cele 2 carduri, cele 4 placi).
  - [x] 20.1 (29.10, materialul lui: 3 bannere PNG ~2000 x 800, 12 poze de raioane PNG 1254 cu transparenta, sigla SVG,
    10 produse SVG cu PNG inauntru si NUMELE in numele fisierului; fara tabel, deci fara preturi si texte; cererea lui:
    „Redenumeste le tu cum trebuie si optimizeaza-le la maxim sa nu consume resurse”). `scripts/teme/imagini-jupiter.mjs`
    (pastrat, se reia la material nou): din ~35 MB, 32 de fisiere WebP, 864 KB, in `public/teme/jupiter/` (bannere,
    categorii, placi, carduri, produse, `logo.webp`), fiecare la marimea locului lui (incarcatorul trece neatinse
    adresele care nu sunt din depozit, deci marimea fisierului e ce descarca oricine): bannere 1600 x 748, raioane 320,
    placi rotunde 480 (obiectul intreg in cerc), carduri 432 x 336, produse 800, sigla inalta de 120 (3,8 KB, din 345).
    GASIT pe drum: obiectele raioanelor aveau opacitatea 253 din 255 (usor stravezii) si ceata de alfa in jur, intinsa la
    loc; sigla avea zgomot de culoare (35 KB fara pierderi), redusa la 16 culori. ⚠ Bannerele lui sunt 2,33-2,65:1, iar
    slotul temei 2,14:1 (si 2:1 pe telefon): centrate, `object-cover` taia textul bannerelor 1 si 3. Taiate din partea cu
    fotografia (la 3 pleaca o parte din galeata), iar slotul din `HeroCuCarduri` e acum 2,14:1 pe orice ecran.
  - [x] 20.2 `DATE_DEMO_JUPITER` rescris: cele 12 raioane in ordinea lui, 8 subcategorii, cele 10 produse cu numele lui
    („/” pus la loc unde fisierul avea „_”), preturi si descrieri scrise de mine (5 la oferta = randul „Oferte de sezon”,
    5 in „Alegeri populare”), 3 bannere, 2 carduri si 4 placi din pozele raioanelor. Adrese RELATIVE (`/teme/jupiter/...`):
    fisierele statice ocolesc proxy-ul, deci se vad pe orice gazda; in datele structurate ale produsului (JSON-LD) se
    intregesc pe originea paginii (`pozaIntreaga`), OG le intregea deja. Sigla doar a magazinului demo (`Tema.siglaDemo`).
  - [x] 20.3 `lib/teme/golire-demo.ts` + scriptul de umplere: INTAI golirea (produsele demo, toate categoriile,
    cheile scrise de import din `page_content`), apoi importul; refuza fara sa stearga nimic pe un slug care nu e `tema-*`,
    pe un magazin cu un produs care nu e demo si pe setari necitite. Probe: setul (poze pe disc, plafoane de marime,
    niciuna nefolosita, raportul bannerelor, „Oferte” doar cu reduceri), golirea pe baza falsa, cheile importului legate
    de golire, JSON-LD; 12 mutanti, toti prinsi. Rulat pe demo: scoase 58 de produse si 39 de categorii, puse 20 de
    categorii, 10 produse, 3 bannere, 2 randuri; proiectia 10, coada 0.
  - [x] 20.4 Proba in Chrome pe demo (`jupiter.localhost:3000`): sigla, bannerele intregi (cutia 2,14 = poza 2,139), cele
    6 raioane cu produse pe placi (cele 6 goale se ascund singure), randurile, placile rotunde, pagina de produs, toate
    cele 26 de poze 200 `image/webp` cu `immutable`, 735 KB pe prima pagina; pe 390 px (cadru, fereastra era acoperita)
    bannerul 2,14, fara depasire. ⚠ Meniul „Categorii produse” arata toate cele 12 raioane (arborele intreg, ca „Toate
    categoriile” din „market”), iar cele 6 fara produse duc la „Niciun produs disponibil”: de intrebat ce vrea.
  - [x] 20.5 (30.10, raspunsul lui la intrebarea de la 20.4: „Lasa le asa si treci 0 produse la categoriile alea”, apoi,
    la „unde?”, „Pe plăci”): placile „Categorii” de pe prima pagina arata toate raioanele, cele goale cu „0 produse”;
    meniul „Categorii produse” nu se schimba. Regula sta in `placiDeCategorii` (`categorii-numarate.ts`): un raion gol
    apare DOAR cand numarul se poate scrie langa el; cu „Arată câte produse are fiecare categorie” stins si pe catalogul
    de pe server (400+ produse) raman cele cu produse, ca o placa goala fara numar ar fi un drum infundat nedeclarat.
    ⚠ Regula e a variantei „placi”, nu doar a demo-ului: orice magazin cu Jupiter o are, iar comerciantul o opreste cu
    comutatorul (demo-ul trebuie sa arate ce primeste el). Niciun magazin real nu are inca varianta.
    GASIT pe drum: numarul venea din lista INTREAGA de produse; cat timp placa aparea doar la raioanele cu produse vizibile
    nu se vedea, dar cu toate radacinile un raion cu produse ascunse (fara imagine, fara stoc) ar fi scris „3 produse” si
    ar fi dus la o pagina goala. Acum `visibleProducts`, si la placile subcategoriilor (acolo o subcategorie goala scrie si
    ea „0 produse”). Lista cu raioanele goale e `rootCategoryItemsToate`, taiata de `categoriiVizibile`, deci categoriile
    ascunse din Produse > Categorii nu apar. Ghidul „Cum alegi cum arată categoriile” spunea ca la o categorie fara produse
    numarul nu se arata: rescris, iar comutatorul are acum un rand de ajutor. Miniatura din galerie „Schimbă designul”
    are categorii de exemplu din care doar 3 din 6 au produse de exemplu: acolo un 0 ar fi aratat designul ca pe un magazin
    gol, deci ramane fara numar, ca pana acum (doar acolo lipseste `rootCategoryItemsToate`, proba fixeaza asta).
    15 mutanti (5 pe regula, 10 pe apelanti si pe sursa listei), toti prinsi. Proba in Chrome pe `jupiter.localhost:3000`: 12 placi in ordinea lui, numerele identice
    cu baza (3, 0, 0, 0, 1, 0, 0, 0, 1, 2, 1, 2), meniul tot cu 12 randuri, fara numere; pe 390 px doua coloane, fara
    depasire; consola fara erori de hidratare. Doar prin probe, nu pe ecran: comutatorul stins si produsele ascunse.
    Lasat asa: pagina raionului scrie „0 din 10 produse” (numaratorul comun al paginii de catalog, fata de tot magazinul,
    la toate magazinele: „3 din 10 produse” pe un raion cu produse). Porti: suita 11.411 / 0 (2 sarite), tsc, `lint:prag`
    neschimbat (51 de erori vechi, niciuna in fisierele atinse), `build:ci`.
  - ⚠ De spus la livrare: bannerele intra si in magazinele comerciantilor (raspunsul lui), deci fara numele sau oferte
    anume ale magazinului demo pe ele; pozele si logo-ul ale lui sau libere de drepturi (demo-ul e public). Produsele lui
    sunt marci reale (Philips, Vileda, Erbauer), cu pozele lor, si pleaca la import in magazinele comerciantilor.

- **Etapa 21: mentiunile lui dupa demo-ul Jupiter** (30.10, cuvant cu cuvant: „E foarte ok pana acum dar am cateva mentiuni:
  1. Acolo langa search e mult prea mult spatiu gol, mai adauga ceva elemente sau restructureaza cumva 2. Scoate sectiunea
  aia cu Despre noi 3. Pe pagina produsului pozele apar extrem de mari 4. Fa tot footer ul mult mai premium si zona aia de
  newsletter scoate o”). Totul in varianta temei sau in reglaje noi cu implicitul de azi: niciun magazin real nu se schimba.
  - [x] 21.1 Antetul (`HeaderHipermarket`): cautarea avea `max-w-[56rem]`, iar langa ea ramaneau 390 px goi la 1920 (doar
    „Cos”, fara cont si fara WhatsApp pe demo). Acum cautarea ia tot randul (1049 px la 1920, 467 la 1024), iar telefonul a
    urcat din bara de navigare langa ea, pe doua randuri, ca si cosul („Cosul meu” / „0 produse”). Reglajul a devenit „Arată
    telefonul lângă căutare”. Bara de navigare ar fi ramas goala: demo-ul primeste meniul lui (`MENIU_DEMO_JUPITER`, in
    `setariDemo`: „Toate produsele” si cele 6 raioane cu produse); la aplicare, meniul comerciantului ramane al lui.
  - [x] 21.2 „Despre noi” stins de tema (`enabled` si `enabledOverride` pe `false`): ramane in lista, cu textul neatins, si
    se aprinde din ochi. ⚠ `enabledOverride` e VALOAREA aleasa, nu un „atins”: cu `true`, parserul o reaprindea; a prins-o
    proba. Decizia e pe tema, nu doar pe demo, deci si la un comerciant care il avea aprins (scrisa in ghid); inlocuieste
    regula de la 16.3 („nu dispare din vedere”).
  - [x] 21.3 Pagina de produs: pe pagina lata a temei (100rem) galeria patrata ajungea la 1086 x 1086, peste fereastra de 855
    si de 1,5 ori cat fisierul, deci neclara. La 72rem, unde sta orice magazin, are ~690 px, deci defectul e al temei: reglaj
    nou pe „Detaliat”, `galleryHeight` („Înălțimea galeriei”: „Pătrată” implicit, „Cât ecranul”), pus de tema si pe sabloanele
    lui „Detaliat”. Compact: inaltimea `clamp(26rem, calc(100vh - 18rem), 40rem)` doar pe calculator, panou ALB (mai lat decat
    poza, pe gri se vedea patratul fotografiei) si coloana de cumparare de 33rem de la `xl` (titlul pe doua randuri, nu trei).
    Masurat la 1920 x 855: panou 976 x 567, se termina la 840, deci produsul se vede intreg fara derulare.
  - [x] 21.4 Subsolul (`FooterHipermarket`) rescris: fundal inchis scos din culoarea principala (`color-mix`, deci urmeaza
    „Stil”), linia de accent sus, „Înapoi sus” buton rotund in colt, banda de beneficii, sigla pe placa alba (pe fundal inchis
    sigla Jupiter nu s-ar citi), titluri cu linie scurta de accent, banda legala mai inchisa. Beneficiile sunt insignele
    MAGAZINULUI (`store_trust_badges`, ca „Beneficii pe scurt”), nu texte ale temei: sunt promisiuni ale lui, le schimba din
    panoul lor si le stinge cu „Arată beneficiile deasupra coloanelor”. Coloanele temei: identitatea (sigla, sloganul,
    retelele), raioanele, comenzile, informatiile, suportul. Newsletterul a iesit din tema si din varianta (`cuNewsletter`,
    `areFurnizorNewsletter`, proprietatea `lipit` si citirea integrarilor din `aplicaTema` sterse); un „Newsletter” pus de
    om ramane o coloana ca oricare alta. Demo-ul are slogan (`Tema.sloganDemo`). Eticheta: „Hipermarket, închis, cu beneficii”.
    GASITE pe drum: „Cosul meu” din subsol ducea la prima pagina (designul are cosul in sertar, `/cos` -> 307), inlocuit cu
    „Produse la reducere” (`?sale=1`, din radacina magazinului); o coloana fara continut isi tinea pista in grila si lasa
    dreapta goala (acum pistele se fac din ce se deseneaza: `grid-flow-col auto-cols-fr`); „Edinio” era albastru pe albastru
    (`FooterCredit` primeste `culoareEdinio`, doar aici).
  - [x] 21.5 Probe: `mentiuni-21.test.ts` (13), 25 de mutanti pe tema, antet, pagina de produs, subsol si demo, toti prinsi.
    Demo-ul reumplut pe baza demo. In Chrome pe `jupiter.localhost:3000`: fara „Despre noi”, fara campuri in subsol, fara
    depasire la 390 si 1024. Lasat asa: coloana „Raioane” din subsol arata pe paginile fara catalog primele 6 radacini, si
    cele goale (arborele din chrome, la toate subsolurile), iar pe prima pagina doar cele cu produse.

- **Etapa 22: alte doua mentiuni** (30.10, cuvant cu cuvant: „E ok dar am niste mentiuni: 1. Favicon nu se vede bine 2. Daca
  tin hover pe butonul de Adauga in cos de la produs nu apare ca si cum ar fi buton”).
  - [x] 22.1 Faviconul: demo-ul n-avea unul, deci magazinul cadea pe sigla (`favicon_url || logo_url`), lata de 4,7 ori cat
    e de inalta, adica o linie in cei 16 px ai tabului. Acum `public/teme/jupiter/favicon.png`, facut de
    `imagini-jupiter.mjs` din sigla lui: doar simbolul (ce sta dupa ultima coloana transparenta), 192 x 192, cu inelul taiat
    13% pe fiecare parte, ca planeta sa umple patratul; intreg, ramanea o bila de 9 px la 16. PNG, nu WebP (Safari), transparent,
    4,9 KB. Pus prin `setariDemo`, deci doar pe demo; comerciantii isi pastreaza faviconul lor. ⚠ La PNG cu paleta,
    `colours` peste 16 n-are efect (ramaneau 255 de culori si 16 KB): reducerea o da `quality` (70).
  - [x] 22.2 Butonul: `cursor: default` (Tailwind 4 lasa asa orice `<button>`), deci pe card mana de pe poza si titlu disparea
    fix pe buton, iar hoverul era `opacity-95`, invizibil. Regula in `stil-comun.css`, stratul de baza: `[data-store-theme]
    button:not(:disabled)` si `[role="button"]` au mana. ⚠ E singura schimbare care ajunge la TOATE magazinele: doar cursorul,
    fara nimic pe asezare (spus in raport, REGISTRU C); 64 de fisiere cu butoane in vitrina si doar 14 `cursor-pointer` scrise
    de mana, deci o regula, nu 50 de clase. Cardul Jupiter (doar tema): sub mouse se intuneca (`brightness 0.88`) cu umbra, la
    apasare si mai mult, doar cand e activ. Pagina de produs ramane cu `hover:opacity-90` (comuna cu magazinele pe „Detaliat”),
    acum cu mana.
  - [x] 22.3 Probe: `mentiuni-22.test.ts` (5: fisierul, cat umple simbolul, ordinea favicon/sigla, regula CSS, hoverul
    cardului), 8 mutanti, toti prinsi. In Chrome, cu mouse-ul real: mana pe card si pe pagina, „Comanda acum” si cantitatea tot
    cu mana, „-” `not-allowed` la 1, filtrul 0.88 sub mouse; `<link rel="icon">` spre PNG, 200 `image/png`. Tabul in sine nu
    intra in capturi, deci faviconul e verificat pe fisier, marit la 16, 32 si 48 px, pe fond deschis si inchis.

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
- 28.10.2026, la inchidere („Da”, apoi raspunsurile la intrebari): ghidurile din centrul de ajutor „Inainte de push
  dar dupa ce termini, nu dai push ca mai avem ceva de facut” (deci nici migratia din REGISTRU A, pana spune el);
  garantiile de pe pagina de produs „Rămân neafișate”; contorul de vizitatori „Îl facem real (etapă nouă)”; temele:
  „Facem si teme noi dar asta dupa ce terminam de verificat tot ce am facut acum”.
- 28.10.2026, mentiunile lui dupa a doua verificare: „+” in previzualizare („Între secțiuni”; pe Acasa „Secțiuni și
  blocuri”) si subsolul „Pe coloane-bloc” (vezi „Mentiunile lui din 28.10”).
- 28.10.2026, seara, la etapa 12 (contorul masurat): ce numara „Alege comerciantul” („Acum” sau „Ultimele 24 de ore”,
  implicit 24 de ore); robotii „Și din Statistici” (nu se mai scriu deloc).
- 28.10.2026, seara, mentiunile de dupa etapa 12 (vezi „Mentiunile lui din 28.10, seara”): blocul pus cu „+” „Numele lui,
  deschis direct”; fonturile „Cele 36 găzduite de noi” (sunt 33, numarate gresit in intrebare); checkout-ul „În Setări >
  Comanda”.
- 28.10.2026, seara, temele (vezi „Temele: prima tema, „Jupiter””): prima „Jupiter”, dupa dedeman.ro, „aproape 1 la 1”;
  pagina noua „Teme”; aplicarea „Direct în magazin, cu Istoric”; datele demo „Adaugă, marcate demo”; demo pe subdomenii.
- 29.10.2026, la inceputul etapei 18 (inventarul: orice produs activ pleaca singur in catalogul Meta, sitemap, Pepita,
  email marketing, iar la editare intra in cozile Google Merchant, eMAG, OLX, Trendyol, About You): produsele demo „Le
  opresc la toate canalele” (fiecare canal le sare, ca pe produsele inactive; paginile lor `noindex`, in afara sitemapului).
- 29.10.2026, la raportul etapei 16: proba din editor a listelor noi „Da, fă proba acum” (cu impersonare, pe demo);
  placile de categorii si cardul Jupiter „Da, și din panou” (16.6); „Comandă acum” la „Standard” „Rămâne formularul
  produsului” (intrebarea din etapa 15, inchisa); „Da, etapa 17”.
- 29.10.2026, dupa 18.2-18.4: limita de produse la datele demo „Rămâne limita” (produsele demo se numara ca oricare
  altele; pe planul gratuit, 58 > 10, bifa e oprita, cu motivul; altfel cele 58 ar fi putut deveni produse reale peste
  limita); proba 18.5 „Da, fă proba acum” (cu impersonare si planul mutat pe Basic pe demo, pus la loc).

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

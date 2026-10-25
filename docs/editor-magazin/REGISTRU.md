# Registrul editorului unic

Tot ce productia NU are inca. Se scrie in clipa schimbarii, nu la final.

## Ordinea de la final
1. Porti: `tsc`, `npm test`, `npm run build`, `lint:prag --check`, `tipuri-db`, `schema-baseline.sh --check`, `coloane-cerute-exista`.
2. Migratiile din tabelul A, in ordine (aditive inainte de push, revocari/stergeri dupa).
3. Baseline regenerat in acelasi commit.
4. Variabilele din tabelul B in Vercel (Production) inainte de push.
5. Capturile din tabelul D refacute pe ecranele finale.
6. Unire `editor-magazin` -> `main`, push, verificare productie + CI (tabelul C).

## A. Migratii
| nr | fisier | ce face | demo | productie |
|---|---|---|---|---|
| - | - | etapa 1 nu are migratii: datele au ramas in aceleasi coloane si chei | - | - |

## B. Variabile de mediu noi
| cheie | de ce | pusa in Vercel |
|---|---|---|
| - | etapa 1 nu are variabile noi | - |

## C. Ce se verifica dupa push
- Magazine reale fara design atins (`storefront_design = {}`): arata la fel ca inainte.
- Un magazin cu design salvat: arata la fel ca inainte.
- **Etapa 1 (Setari):**
  - Setari > General se deschide si salveaza (magazinul, contactul, retelele, datele firmei, formatul comenzii, un singur buton).
  - Setari > Formular de comanda: un camp suplimentar si o extraoptiune salvate apar in formularul magazinului; extraoptiunea se aduna la total.
  - Setari > Catalog: „Ascunde produsele fara stoc” scoate produsele din lista magazinului.
  - Dupa o salvare in Formular de comanda sau in Catalog: alta fila, apoi inapoi; valorile salvate raman pe ecran (`updatePageContent` revalideaza si `/dashboard/settings` din 25.10).
  - „Editeaza magazinul” nu mai are Informatii generale, Social media, Formular de comanda si cele trei comutatoare de catalog; are trimiterile spre Setari.
- **Schimbari de comportament de etapa 1, de urmarit dupa push:**
  - Bifa „Am WhatsApp pe acelasi numar” spune acum ce e in baza. In editorul vechi pornea bifata si cand `whatsapp` era NULL, iar prima salvare scria telefonul acolo (si aprindea butonul flotant).
  - `store_name` gol ramane NULL (editorul vechi scria in el `business_name` la prima salvare).
  - Linkurile sociale: doar http(s), `https://` pus singur cand lipseste.
  - Extraoptiunile si campurile suplimentare fara eticheta nu se mai pot salva.
  - `order_number_format` primeste doar `sequential` sau `random`.
  - Comutatorul „Email” din Formular de comanda arata PORNIT cand reglajul lipseste, fiindca asa il citeste magazinul (campul apare, optional). Editorul vechi il arata oprit, iar clientii vedeau campul. Doar afisarea s-a schimbat: datele raman cum erau pana cand omul salveaza o alegere. Ghidul `cum-arati-codul-de-discount-si-emailul` spune acum la fel.
- **Etapa 2 (editorul unic):**
  - `/dashboard/editor` deschide editorul unic; `/dashboard/editor/design`, `/dashboard/editor/sectiuni` si `/dashboard/store` redirectioneaza acolo. Meniul are „Editorul” si „Biblioteca Media”.
  - Pe fiecare pagina din „Editezi” previzualizarea arata pagina ceruta, in modul editor (ciorna, clic pe sectiune).
  - O schimbare de design (varianta, setare, ochi, ordine) se vede pe loc, „Anuleaza” o desface, „Publica” o duce in magazin.
  - O salvare de continut (de exemplu textul recenziilor) ajunge in magazin imediat si reincarca previzualizarea.
  - „Pagini de sistem” > „Alege designul” deschide editorul pe pagina potrivita.
- **Schimbari de comportament de etapa 2, de urmarit dupa push:**
  - Banda de incredere, pragul de transport, beneficiile, recenziile, galeria, despre si contactul nu mai verifica comutatorul vechi: ochiul din editor le poate si aprinde. Masurat 25.10: niciun magazin din productie nu se schimba (zero ochi folositi pe ele).
  - Lista randurilor de produse nu mai filtreaza dupa `enabled` din continut (zero randuri oprite in productie la 25.10).
  - Pagina de produs, cosul si comanda randeaza ciorna proprietarului cand sunt deschise in editor (`?preview=1&editor=design`).
  - Comutatorul „Afiseaza continutul peste banner” nu mai exista: varianta hero-ului se alege din galerie. Magazinele raman pe varianta derivata pana aleg alta.
  - Sectiunea „Galerie” are acum editor de imagini (`businesses.gallery`).
  - Etichetele sectiunilor din registru au diacritice si nume noi: „Antet”, „Subsol”, „Banner principal”, „Coș”, „Finalizarea comenzii”.
  - **Randurile de produse fara pereche in continut ies din design la citire** (`parse.ts`, 25.10). Un rand sters din continut ramanea in designul salvat ca orfan: in magazin randa un invelis gol, in editor un rand fara cos de gunoi. Se intampla si in productie, cu editorul vechi: masurat 25.10, 2 din 25 de designuri publicate au cate un rand orfan, ciornele niciunul (SELECT pe `storefront_design->'home'`: `product_row` cu `mode` diferit de `featured`, al carui `sectionRef`/`id` nu e in `page_content.product_sections`). Vizual nu se schimba nimic: `CustomProductRow` intorcea deja `null` pentru ele. Dupa push: aceeasi numaratoare; designurile lor isi pierd orfanul la prima salvare.
  - Rutele `/cos` si `/checkout` nu mai redirectioneaza spre prima pagina cand le deschide proprietarul in editor (`?preview=1&editor=design`) si designul citit e pe sertar / fereastra: previzualizarea ajunge acolo inaintea ciornei. Pentru clienti, redirectarea ramane.
  - Pe ecrane sub 768 px, previzualizarea din editor e mereu cea de telefon; Anuleaza / Refa stau in meniul „...”.
- **Etapa 3 (clic in previzualizare):**
  - In editor: conturul cu numele sectiunii sub mouse si de pe randul din arbore; clicul deschide nodul, cu contur gros; pagina de produs, Magazinul, cosul si comanda se aleg si ele din previzualizare.
  - Magazinul public, deschis normal (fara `?preview=1&editor=design`): niciun `data-st-section` si niciun text „e goală, deci nu apare în magazin” in HTML (masurat pe demo 25.10: 0 si 0); stratul `ConturEditor` nu se descarca.
- **Schimbari de comportament de etapa 3, de urmarit dupa push:**
  - Paginile de produs, Magazin, cos si comanda poarta marcajul de sectiune in modul editor (doar proprietarul, cu semnele de editor), ca Acasa.
  - Sectiunile aprinse dar goale au in editor un loc gol cu numele lor; in magazin nu se schimba nimic.
  - Ruta „Pagina Magazin” (`pagina-magazin.tsx`) nu mai redirectioneaza spre prima pagina in modul editor cand designul citit nu are pagina de catalog, din acelasi motiv ca `/cos` si `/checkout` in etapa 2. Pentru clienti, redirectarea ramane.
- **Etapa 4 (blocurile paginii de produs):**
  - In editor, sub „Pagina de produs”: blocurile pe zone (Clasic: cumparare, sub produs; Detaliat: cumparare, sub galerie, file, sub produs); sagetile le muta, ochiul le ascunde pe cele optionale, lacatul arata de ce celelalte nu se ascund; clic pe bloc deschide panoul lui, si in arbore, si in previzualizare.
  - O pagina de produs a unui magazin care n-a atins blocurile arata exact ca inainte: lista implicita e asezarea de dinainte, iar vizibilitatea vine din comutatoarele vechi. De comparat, pe un magazin cu beneficii si intrebari aprinse, pagina publica inainte si dupa push.
- **Schimbari de comportament de etapa 4, de urmarit dupa push:**
  - `storefront_design.product.page.blocks` apare in designurile salvate din editorul nou; designurile de dinainte il primesc la citire (parserul completeaza lista).
  - Comutatoarele vechi `trust_badges_enabled`, `show_social_proof`, `show_quality_badge`, `benefits_section.enabled`, `how_it_works_section.enabled`, `faq_section.enabled` si reglajele Detaliat `showDetails`, `showSpecsSummary`, `showTiers`, `showContact` nu mai apar in editor si nu le mai citesc componentele paginii; le citeste doar schema blocurilor, ca vizibilitate implicita. Masurat in productie 25.10 (din 148 de magazine): beneficii aprinse 4, pasi 6, intrebari 5, contor 9, eticheta de calitate 14, garantii stinse 1.
  - Estimarea livrarii ramane comutator de continut (`delivery_estimate.enabled`, aprinsa la 24 de magazine): o citeste si Detaliat, unde e un rand din „Detalii produs”. Blocul ei din Clasic se muta, dar n-are ochi.

## D. Capturi si texte de ajutor
- De refacut la final: `public/capturi/ajutor/design-si-pagini/cum-completezi-informatiile-generale-editor-design.webp` (cardul „Magazinul” din Setari > General). Fisierul vechi arata panoul scos din editor si a fost sters; ghidul arata substituentul pana atunci. Lista: `npm run capturi -- --lista`.
- Grupul „Design magazin” din centrul de ajutor se rescrie INTREG la final: descrie editorul vechi, care se inlocuieste in etapele 2-6. Exemplu de text deja invechit: `cum-functioneaza-butonul-salveaza` spune ca butoanele scriu tot `page_content`, dar editorul salveaza de mult doar cheile atinse.
- Etapa 2: grupul „Design magazin” descrie trei ecrane care nu mai exista („Design magazin”, „Ordinea sectiunilor”, „Design sectiuni”) si comutatoarele scoase. Exemplu: ghidul paginilor de sistem spune ca „Alege designul” duce in „Design sectiuni”. Se rescrie la final, odata cu restul grupului.
- Etichetele variantelor si ale campurilor din registru (`registry.ts`) sunt inca fara diacritice; in editorul unic apar langa texte cu diacritice. De facut o trecere separata, cu probele care le citesc.
- Culoarea aleasa in Stil se vede pe loc in previzualizare doar unde magazinul citeste variabilele temei. Cosul plutitor si eticheta „Popular” de pe card o primesc ca proprietate de la server (`business.primary_color`) si se schimba abia dupa „Salveaza” (vazut la proba din 25.10). De rezolvat in etapa 6, cand culoarea trece in design.
- **De decis (etapa 4): garantiile de pe pagina de produs.** Editorul vechi edita patru carduri (`trust_badges`), dar nicio varianta a paginii nu le afiseaza: Clasic si Detaliat au textele scrise in cod. Masurat 25.10: 44 de magazine le au salvate, 6 cu texte schimbate de comerciant (deci au scris ceva ce clientii nu vad). Editorul nou nu le mai ofera; datele raman in baza. Variante: le afisam (pagina se schimba pentru toate cele 44) sau le stergem.
- **De decis (etapa 4): contorul de vizitatori** afiseaza un numar nemasurat, fix pe produs (18-27); aprins la 9 magazine. Editorul nou o spune in panoul blocului. Ramane, sau iese?
- `ProductForm` (galeria de imagini a produsului) foloseste tot dnd-kit fara `id` stabil, deci poate avea aceeasi nepotrivire de hidratare reparata in lista de sectiuni (`SectionList`, `useId`). In afara editorului, neatins.
- Ghidurile mutate in Setari (formularul de comanda, catalogul, datele magazinului, retelele) stau inca in categoria „Design si pagini”. Daca se muta in „Setari”, se schimba adresa (`/ajutor/<categorie>/<ghid>`), deci trebuie redirectari.

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
| - | - | etapele 1-6 nu au migratii: datele au ramas in aceleasi coloane si chei | - | - |
| 1 | `migrations/2027-01-31-istoricul-publicarilor.sql` | Tabelul `storefront_design_versions` (etapa 7, istoricul publicarilor): o versiune la fiecare „Publică”, plus starea de dinainte la prima. RLS fara politici, niciun drept pentru `anon` si `authenticated`, doar `service_role` (verificarea e chiar in migratie). `on delete cascade` de la `businesses`. | **DA, 26.10.2026.** Verificat pe rezultat: RLS pornit, 0 politici, `anon` si `authenticated` fara niciun drept, `service_role` scrie si citeste. | **NU.** Aditiva: se aplica INAINTEA push-ului. Fara ea, „Publică” merge, dar istoricul ramane gol si fiecare publicare scrie o eroare in jurnal. `npm run verifica:coloane` cade pe tabelul asta pana e aplicata (anume). Apoi baseline-ul regenerat in acelasi commit. |

## B. Variabile de mediu noi
| cheie | de ce | pusa in Vercel |
|---|---|---|
| - | etapa 1 nu are variabile noi | - |

## C. Ce se verifica dupa push
- Magazine reale fara design atins (`storefront_design = {}`): arata la fel ca inainte.
- Un magazin cu design salvat: arata la fel ca inainte.
- **Etapa 1 (Setari):** ⚠ INLOCUITA de etapa 8 (27.10): ecranele de mai jos stau acum in editor, fila
  „Setări” (vezi blocul „Etapa 8” mai jos). Regulile de salvare au ramas aceleasi; se verifica acolo.
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
- **Sabloanele paginii de produs (4b, decizia lui: din editor, pe categorii):**
  - `storefront_design.product.sabloane[]` apare doar in designurile care au sabloane; celelalte raman identice la citire (cheia lipseste). Dupa push: zero designuri cu `sabloane` pana nu face cineva unul (SELECT pe `storefront_design->'product' ? 'sabloane'`).
  - Pagina de produs alege sablonul pe client, din designul viu (`ProductPageDinDesign`), iar marcajul sectiunii sta acolo. Ruta produsului citeste categoriile (id, nume, parinte) DOAR cand designul are sabloane pe categorii sau in editor: pe un magazin fara sabloane, nicio interogare in plus. De comparat dupa push: timpul paginii de produs inainte si dupa, pe un magazin fara sabloane.
  - ⚠ Produsul isi tine categoria dupa NUME (`products.category`); sabloanele tin id-ul categoriei. O categorie redenumita fara ca produsele sa fie mutate ar lasa produsele pe Implicit (la fel ca filtrul de catalog, care merge tot pe nume).
  - In editor, adresa previzualizarii paginii de produs poarta `sablon=<id>` cand designul are sabloane; ruta il citeste numai in modul editor.
  - Actiune noua: `produsPentruSablon` (`editor-sabloane.actions.ts`), cu verificarea proprietarului.
- **Editorul pe tot ecranul (4.7, cerut de el pe 25.10):**
  - Pe `/dashboard/editor` nu mai apar bara laterala, bara de sus, bannerele de abonament (proba, gratie, plata restanta) si meniul de jos de pe telefon; ramane doar bara de impersonare. Biblioteca Media (`/dashboard/editor/media`) isi pastreaza cadrul. Dupa push: se intra din meniu in editor, se iese cu „Ieși”, iar orice alta pagina a panoului arata ca inainte.
  - Layoutul panoului (`src/app/(dashboard)/layout.tsx`) trece toate barele prin `CadruPanou` (client, dupa adresa). Pe orice alta pagina structura e aceeasi ca inainte.
  - Salvarea ciornei de design trece prin `coada-salvarii.ts`: scrierile nu se mai intrec (baza se citeste cand pleaca scrierea), iesirea din editor trimite pe loc modificarea programata, iar Publica / Renunta asteapta scrierea de pe drum. De urmarit dupa push: niciun „modificat in alta fila” la editare obisnuita.
- **Etapa 5 (paginile proprii in editorul unic):**
  - Pagini > Toate paginile > „Editează” si „Pagină nouă” deschid editorul unic pe pagina (`/dashboard/editor?pagina=pagina:<id>&din=pagini`); „Ieși” duce inapoi in „Pagini”. Adresa veche `/dashboard/pages/<id>/edit` trimite acolo (semne de carte, istoricul browserului). Editorul de pagini separat (`PageBuilder`) nu mai exista.
  - In editor, o pagina proprie: arborele „Conținut liber” (blocuri si coloane, „+” sub orice bloc, sageti, duplicare, stergere), panoul blocului (aceleasi setari ca inainte), „Setările paginii” (titlu, adresa, publicare, SEO, CSS), „Salvează pagina”. Previzualizarea e pagina adevarata, cu antetul si subsolul magazinului, si arata modificarile inainte de salvare.
  - De comparat dupa push, pe o pagina reala: pagina publica arata la fel ca inainte (pentru clienti ruta n-a schimbat nimic: `PaginaVie` se pune doar in modul editor).
- **Schimbari de comportament de etapa 5, de urmarit dupa push:**
  - Pagina se salveaza ca inainte (`updatePage`, cu garda de versiune), dar Anuleaza / Refa au acum istoric si pe pagina; pe design trec cand panoul arata antetul sau subsolul.
  - Spre alta pagina, cu pagina nesalvata: fereastra „Rămân / Renunță la ele / Salvează și treci”. Editorul vechi intreba doar la sageata „Înapoi”.
  - In previzualizare, pe pagina aleasa ca pagina principala, ruta paginii nu mai trimite la radacina in modul editor (altfel previzualizarea s-ar fi pierdut). Pentru clienti, redirectarea ramane.
  - Datele editorului (`dateEditorPagina`, cu verificarea proprietarului) le cere si actiunea noua `datePaginaInEditor`; nu mai aduc fundalul paginii (previzualizarea e chiar pagina).
  - Animatiile: in previzualizare un bloc se remonteaza la orice schimbare a animatiei (`cheieAnimatie`), deci animatia ruleaza pe loc; „Redă animația” merge si aici.
- **Etapa 6 (un singur „Publică”, decizia lui: „Totul la „Publică””):**
  - In editor, textele, listele, imaginile, logo-ul, culoarea, fonturile si fundalul NU mai ajung in magazin la salvare: intra in ciorna (`storefront_design_draft`, sub cheia `continut`, doar cheile schimbate) si ajung la clienti la „Publică”, odata cu designul. „Renunță” le arunca pe toate. Butoanele „Salvează” de pe sectiuni nu mai exista.
  - De verificat dupa push, pe un magazin real: un text schimbat in editor se vede in previzualizare, NU si in magazinul deschis normal; dupa „Publică” se vede si acolo; un alt text schimbat, apoi „Renunță”, dispare si din previzualizare.
  - Comutatorul „Vizibil” (magazinul deschis clientilor), paginile din „Pagini” („Salvează pagina”) si Setarile raman pe loc, ca inainte.
- **Schimbari de comportament de etapa 6, de urmarit dupa push:**
  - ⚠ Comercianti obisnuiti cu „Salvează = in magazin”: o modificare de continut ramane in ciorna pana la „Publică”. Bara arata „Modificări nepublicate”, iar „Ieși” intreaba. Cioarnele existente la push (doar design, fara `continut`) se poarta exact ca inainte.
  - „Publică” scrie intai continutul (`page_content` imbinat pe chei, apoi `logo_url`, `cover_url`, `primary_color`, `gallery` in `businesses`), apoi designul. Cazut la mijloc, ciorna ramane si „Publică” se poate repeta.
  - Paginile magazinului nu mai cer coloana de ciorna in randul de setari (pagina principala si Magazin o cereau si o taiau inainte de randare): o citeste numai `ciornaDeRandat`, numai pentru proprietar in editor.
  - `elibereazaComutatoare` (actiune de server) si `comutatoare-vechi.ts` sunt sterse: n-o mai chema nimeni din etapa 2.
  - Imaginile alese in editor se urca pe loc; cele renuntate raman in Biblioteca Media (ca si cele inlocuite pana acum), de unde se pot sterge. Cat sunt in ciorna, biblioteca le socoteste folosite (randul `store_settings` intreg intra in numaratoare).
- **Etapa 7 (istoricul publicarilor, „revino la ce era ieri”):**
  - ⚠ INAINTE de push: migratia 1 din tabelul A. Fara ea, „Publică” merge, dar istoricul ramane gol si fiecare publicare scrie `publishDesign.versiune` in jurnal.
  - Fiecare „Publică” reusit pastreaza o versiune in `storefront_design_versions` (designul publicat si continutul editorului), cu `created_at` = `storefront_design_pub_at`. La prima publicare a unui magazin dupa push se pastreaza DOUA: ce era in magazin inainte (`origine = 'inainte'`, cu data publicarii de dinainte, cand exista) si ce s-a publicat. Se pastreaza ultimele 30 pe magazin.
  - De verificat dupa push, pe un magazin real (cu acordul lui): un „Publică”, apoi `select origine, created_at from storefront_design_versions where business_id = …` arata cele doua randuri, iar `created_at` al publicarii = `storefront_design_pub_at`. In editor, „Istoric” arata „În magazin acum” pe ea.
  - „Readu în editor” pune versiunea in CIORNA: o vezi in previzualizare, magazinul deschis normal ramane neschimbat, Anuleaza o scoate. La „Publică”, cheile pe care versiunea nu le avea se SCOT din `page_content` (magazinul cade pe implicit); ce au scris Setarile ramane.
  - Drepturile, pe productie, dupa migratie: `has_table_privilege('anon' / 'authenticated', 'public.storefront_design_versions', …)` = fals pe tot; 0 politici; RLS pornit. Si prin aplicatie: cu cheia publica, o cerere pe tabel e refuzata.
  - Raman pe dinafara, spus si in fereastra istoricului: paginile din „Pagini”, Setarile, comutatorul „Vizibil”. O imagine stearsa intre timp din Biblioteca Media nu revine (versiunile NU o tin „folosita”).
- **Etapa 8 (lista lui din 27.10: setarile in editor, previzualizarea lata, arborele fara iconite):**
  - Editorul are a treia fila, „Setări”: „Informații generale”, „Social media”, „Datele firmei” (cu numerotarea comenzilor), „Formular de comandă”, „Catalog”. Primele trei au o singura stare si se salveaza impreuna (`updateGeneralSettings`, ca in Setari); formularul si catalogul, fiecare cu butonul lui (`updatePageContent`, doar cheile lor). Totul DIRECT in magazin, nu prin „Publică” (decizia lui); panoul o spune.
  - De verificat dupa push, pe un magazin real (cu acordul lui): un camp schimbat la „Informații generale”, apoi „Salvează”: previzualizarea il arata, magazinul deschis normal la fel, fara „Publică”; bara editorului NU arata „Modificări nepublicate” din cauza lui.
  - Formularul: un camp suplimentar si o extraoptiune salvate din editor apar in formularul magazinului; extraoptiunea se aduna la total. Catalogul: „Ascunde produsele fără stoc” le scoate din lista magazinului.
  - Setari > General: doar „Contul tău” si butonul „Deschide setările magazinului”. Setarile nu mai au filele „Formular de comandă” si „Catalog”; `/dashboard/settings?sectiune=catalog` si `?sectiune=formular-comanda` (semne de carte, ghiduri vechi) duc in editor, pe setarea lor.
  - Cu o setare scrisa si nesalvata: „Ieși” intreaba, iar inchiderea ferestrei avertizeaza. Lista din fila arata un punct langa setarea nesalvata.
  - Notele din editor („Setări > Informații generale”, „Setări > Catalog”, „Setări > Formular de comandă”) deschid setarea pe loc; blocul „Rețele” din paginile proprii trimite la „Social media”.
  - Previzualizarea „Calculator” ia toata latimea chenarului (peste 1280 px); telefonul si tableta raman la latimea lor. Arborele de sectiuni si blocuri e fara iconite.
- **Schimbari de comportament de etapa 8, de urmarit dupa push:**
  - ⚠ Comerciantii care au invatat Setari > General / Formular de comandă / Catalog dupa etapa 1 nu le mai gasesc acolo: cardul „Datele magazinului” din General ii trimite in editor. Si invers fata de restul editorului: aici „Salvează” scrie direct, fara „Publică”.
  - Dupa o salvare din fila „Setări”, editorul cere din nou datele de pe server (`router.refresh()`): ciorna si pagina deschisa raman, previzualizarea se reincarca.

## D. Capturi si texte de ajutor
- Etapa 7: centrul de ajutor nu are inca un ghid pentru istoricul publicarilor („Istoric” din bara editorului, „Readu în editor”, ce intra si ce nu). Se scrie la rescrierea grupului „Design magazin” de la final, cu captura lui.
- De refacut la final: `public/capturi/ajutor/design-si-pagini/cum-completezi-informatiile-generale-editor-design.webp`, din etapa 8 panoul „Informații generale” din fila „Setări” a editorului (pana la etapa 8: cardul „Magazinul” din Setari > General). Ghidul arata substituentul pana atunci. Lista: `npm run capturi -- --lista`.
- Etapa 8: ghidurile care trimiteau la Setari > General / Formular de comandă / Catalog spun acum „Editează magazinul, fila Setări, ...” (`setari.ts`, `design-si-pagini.ts`, `marketing-si-clienti.ts`, `marketplace.ts`, plus nota Trendyol din panou). Niciunul dintre ele nu are captura cu ecranele scoase (verificat 27.10). Textul juridic din `lib/website/gdpr.ts` („Setări → Profil / Setări → Magazin”) e al documentului de confidentialitate si NU s-a atins.
- Grupul „Design magazin” din centrul de ajutor se rescrie INTREG la final: descrie editorul vechi, care se inlocuieste in etapele 2-6. Exemplu de text deja invechit: `cum-functioneaza-butonul-salveaza` spune ca butoanele scriu tot `page_content`, dar editorul salveaza de mult doar cheile atinse.
- Etapa 2: grupul „Design magazin” descrie trei ecrane care nu mai exista („Design magazin”, „Ordinea sectiunilor”, „Design sectiuni”) si comutatoarele scoase. Exemplu: ghidul paginilor de sistem spune ca „Alege designul” duce in „Design sectiuni”. Se rescrie la final, odata cu restul grupului.
- Etapa 6: ghidurile care spun „apasa Salveaza” in sectiunile editorului (de pilda `cum-functioneaza-butonul-salveaza`) descriu acum un buton care nu mai exista: continutul ajunge la clienti la „Publică”. Intra in rescrierea grupului „Design magazin” de la final.
- Etapa 6: in previzualizarea editorului, culoarea bannerului de cookie (pusa de layoutul magazinului, care nu stie de modul editor) ramane cea publicata pana la „Publică”. Restul paginii urmeaza culoarea din ciorna.
- Etapa 5: ghidurile paginilor din „Design si pagini” (`ajutor-categorii/design-si-pagini.ts`: cum adaugi un bloc, cum muti blocurile, coloanele, harta) descriu editorul de pagini retras: plusul rotund dintre blocuri, bara de pe bloc (Sus, Jos, Duplică, Setări, Șterge), tabul „Bloc” din dreapta, sertarul de pe telefon. Se rescriu la final, cu capturile lor (`cum-adaugi-o-harta-in-pagina.webp` si celelalte din `public/capturi/ajutor/design-si-pagini/`), odata cu restul grupului.
- Etichetele variantelor si ale campurilor din registru (`registry.ts`) sunt inca fara diacritice; in editorul unic apar langa texte cu diacritice. De facut o trecere separata, cu probele care le citesc. Vazut la proba 5.5, in aceeasi trecere: etichetele venite din editorul de pagini (`SetariPagina`: „Titlu pagina”, „Ce este aceasta pagina?”; `TIPURI_PAGINA_PROPRIE`: „Pagina obisnuita”; `BLOCK_META`: „Spatiu”, „Harta”, „Intrebari (FAQ)” si celelalte), care se vad si in „Pagină nouă”.
- Culoarea aleasa in Stil se vede pe loc in previzualizare doar unde magazinul citeste variabilele temei. Cosul plutitor si eticheta „Popular” de pe card o primesc ca proprietate de la server (`business.primary_color`) si se schimba abia dupa „Salveaza” (vazut la proba din 25.10). De rezolvat in etapa 6, cand culoarea trece in design.
- **De decis (etapa 4): garantiile de pe pagina de produs.** Editorul vechi edita patru carduri (`trust_badges`), dar nicio varianta a paginii nu le afiseaza: Clasic si Detaliat au textele scrise in cod. Masurat 25.10: 44 de magazine le au salvate, 6 cu texte schimbate de comerciant (deci au scris ceva ce clientii nu vad). Editorul nou nu le mai ofera; datele raman in baza. Variante: le afisam (pagina se schimba pentru toate cele 44) sau le stergem.
- **De discutat (vazut la proba 4.6): conturul blocului selectat trece peste antetul lipicios.** Cand
  blocul selectat ajunge sub antet la derulare, conturul si eticheta lui se deseneaza peste antet
  (stratul din `ConturEditor` are `z-index` maxim, ca sa stea peste orice sectiune). Pozitia e
  corecta, doar ca antetul ar trebui sa-l acopere. O limita de sus luata din antet trebuie sa
  ocoleasca sertarul cosului si antetul selectat chiar el; de facut cu proba ei, nu in treacat.
- **Vazut la proba 4b.4: o ciorna desfacuta pana la starea publicata ramane in coloana.** Cand comerciantul
  anuleaza manual tot ce schimbase, ecranul arata „Designul e publicat” si butonul Renunta dispare, dar
  `storefront_design_draft` pastreaza o ciorna identica cu ce e publicat (salvarea automata o scrie). Nu
  strica nimic (designul e acelasi), dar coloana nu mai e `NULL`. Golirea automata ar trebui sa treaca prin
  garda de concurenta: un `discard` simplu ar sterge si ciorna altei file. Existenta inca de la etapa 2.
- **De decis (etapa 4): contorul de vizitatori** afiseaza un numar nemasurat, fix pe produs (18-27); aprins la 9 magazine. Editorul nou o spune in panoul blocului. Ramane, sau iese?
- `ProductForm` (galeria de imagini a produsului) foloseste tot dnd-kit fara `id` stabil, deci poate avea aceeasi nepotrivire de hidratare reparata in lista de sectiuni (`SectionList`, `useId`). In afara editorului, neatins.
- ~~Ghidurile mutate in Setari (formularul de comanda, catalogul, datele magazinului, retelele) stau inca in categoria „Design si pagini”.~~ Rezolvat de etapa 8: setarile s-au intors in editor, deci ghidurile lor stau iar langa el. Invers, cele din categoria „Setări” despre datele firmei, ANAF si numerotarea comenzilor descriu acum fila „Setări” a editorului; titlul categoriei ramane potrivit. O mutare intre categorii schimba adresa (`/ajutor/<categorie>/<ghid>`) si cere redirectari.

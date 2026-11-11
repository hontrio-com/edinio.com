# Registrul editorului unic

Tot ce productia NU are inca. Se scrie in clipa schimbarii, nu la final.

## Ordinea de la final
1. Porti: `tsc`, `npm test`, `npm run build`, `lint:prag --check`, `tipuri-db`, `schema-baseline.sh --check`, `coloane-cerute-exista`.
2. Migratiile din tabelul A, in ordine (aditive inainte de push, revocari/stergeri dupa).
3. Baseline regenerat in acelasi commit.
4. Variabilele din tabelul B in Vercel (Production) inainte de push.
5. Capturile din tabelul D refacute pe ecranele finale.
6. Unire `editor-magazin` -> `main`, push, verificare productie + CI (tabelul C).
7. Magazinele demo ale celor 30 de teme (etapa 19 si 24, vezi „E. Demo-ul temelor”), cu acordul lui: domeniul cu stea,
   contul tehnic si magazinele, umplerea. Pe pagina „Teme”, „Vezi demo” si „Previzualizare” merg abia dupa pasul asta
   (captura de pe card e fisier static din 08.11, deci se vede oricum).
Pas cu pas, cu comenzile, pentru ziua lansarii: sectiunea „F”.

## A. Migratii
| nr | fisier | ce face | demo | productie |
|---|---|---|---|---|
| - | - | etapele 1-6 nu au migratii: datele au ramas in aceleasi coloane si chei | - | - |
| 1 | `migrations/2027-02-01-istoricul-publicarilor.sql` | Tabelul `storefront_design_versions` (etapa 7, istoricul publicarilor): o versiune la fiecare „Publică”, plus starea de dinainte la prima. RLS fara politici, niciun drept pentru `anon` si `authenticated`, doar `service_role` (verificarea e chiar in migratie). `on delete cascade` de la `businesses`. | **DA, 26.10.2026.** Verificat pe rezultat: RLS pornit, 0 politici, `anon` si `authenticated` fara niciun drept, `service_role` scrie si citeste. **29.10.2026 (etapa 17), in acelasi fisier, inainte de push:** originile `tema` si `ciorna` in constrangere; pe demo constrangerea refacuta (`alter ... drop/add`), verificata cu `pg_get_constraintdef`. Pe o baza noua tabelul se creeaza direct cu ele. | **NU.** Aditiva: se aplica INAINTEA push-ului. Fara ea, „Publică” merge, dar istoricul ramane gol si fiecare publicare scrie o eroare in jurnal. `npm run verifica:coloane` cade pe tabelul asta pana e aplicata (anume). Apoi baseline-ul regenerat in acelasi commit. |

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
- **Etapa 9 („Conținut liber”: blocurile paginilor proprii in magazin; deciziile lui: „Și pe pagina de produs”, „Doar „Sub produs””, „Doar pe /magazin”):**
  - Pe pagina principala, sectiunea „Conținut liber” (din „Adaugă secțiune”, de cate ori e nevoie); sub produs, in zona „Sub produs”, pe fiecare sablon; pe Pagina Magazin, deasupra si sub produse, doar pe `/magazin`. Blocurile stau in design (`settings.blocuri`), deci trec prin ciorna, „Publică” si istoric, ca restul editorului. Fara migratii.
  - De verificat dupa push, pe un magazin real (cu acordul lui): un continut in fiecare loc, „Publică”, apoi magazinul deschis normal il arata; o categorie si o cautare NU arata continutul Paginii Magazin; un formular de contact pus intr-un continut se trimite din magazin, iar mesajul apare in Pagini > Mesaje cu locul lui („Pagina principală” etc.); un continut ascuns nu primeste mesaje.
  - ⚠ Tot atunci: dupa primul bloc pus intr-un continut, mai multe modificari la rand se salveaza fara „Designul a fost modificat in alta fila” (proba 9.5 a prins exact asta: garda compara pe ordinea cheilor din `jsonb`), iar „Readu în editor” pe versiunea din magazin lasa bara pe „Totul e publicat”.
  - Cu o pagina din „Pagini” ca pagina principala, „Conținut liber” nu se ofera la „Adaugă secțiune” (blocurile se pun in pagina aceea).
- **Schimbari de comportament de etapa 9, de urmarit dupa push:**
  - ⚠ Paginile magazinului nu mai trimit in HTML coloana bruta `storefront_design` (din randul de setari, pe pagina principala, produs, Magazin si in miniaturile din galerie), iar designul trimis la client vine fara blocurile „Conținut liber” (`faraBlocuriLibere` in `resolveDesign`); blocurile se randeaza pe server, in sloturi. Verificat in sursa: nicio componenta de client nu citea coloana. De urmarit: nimic din magazin nu se schimba vizual pe magazinele fara continut.
  - Pagina principala aleasa din „Pagini” isi randeaza grupurile de blocuri prin aceeasi functie ca „Conținut liber” (`slotBlocuri`); clasele de font se pun acum pe grup, din fonturile lui, nu din toate ale paginii (acelasi rezultat vizual).
  - Datele editorului pentru o pagina proprie (`dateEditorPagina`) se citesc acum prin `incarcaDateBlocuri`, comuna cu „Conținut liber”: de verificat ca editarea unei pagini proprii merge ca inainte (produsele alese de mana, formularele, legaturile).
  - Mesajele trimise dintr-un continut se scriu fara `page_id`, cu `data.loc`; serverul cauta blocul doar in designul PUBLICAT si doar daca se vede in magazin.
  - Codul personalizat dintr-un continut nu poate purta semnul `raw` (parserul il scoate); se randeaza izolat, ca pe paginile proprii.
  - Nou la ghiduri (28.10): la designul Detaliat, panoul casetei „Detalii produs” are comutatorul „Arată estimarea livrării” (pana acum il avea doar blocul „Estimarea livrării” de la Clasic, deci la Detaliat nu se putea porni sau opri). De verificat dupa push: un magazin cu Detaliat porneste estimarea de acolo, iar randul estimarii (cu eticheta scrisa acolo) apare in caseta.
  - Mesajele editorului „Designul a fost modificat în altă filă...” si „Nu există modificări de publicat.” au acum diacritice.
  - ⚠ Bara de sus a editorului, reparata la a doua verificare (W5, 28.10): intre 640 si ~990 px „Publică” iesea din ecran (de tot pe 800-850 px). Sub 1024 px istoricul, „Reîncarcă”, „Deschide magazinul”, „Vizibil” si „Renunță” stau acum in meniul „...” (ca pe telefon), iar starea „Modificări nepublicate” apare de la 1024 px. De verificat dupa push, pe o tableta sau intr-o fereastra ingusta: „Publică” se vede si se apasa; din meniu merg toate cinci.
- **Etapa 10 („+” in previzualizare; mentiunea lui din 28.10, raspunsurile: „Între secțiuni”, pe Acasa „Secțiuni și blocuri”):**
  - In previzualizare, pe elementul de sub mouse (pe telefon, pe cel atins) apare „+” pe marginea de jos; la primul din lista lui (capul paginii, al zonei, al coloanei) si pe cea de sus. Pe Acasa deschide galeria „Adaugă un bloc sau o secțiune” cu locul scris sus; blocul ales intra intr-un „Conținut liber” nou, acolo. Pe paginile proprii si in continuturi deschide „Adaugă un bloc” langa blocul ales; sub produs si pe Pagina Magazin, blocul intra intr-un continut nou, acolo. Antetul, subsolul, cosul si comanda n-au „+”.
  - „Adaugă secțiune” din arbore deschide aceeasi galerie, cu blocurile sus; ce se alege de acolo intra tot inaintea catalogului.
  - Totul prin ciorna (Anulează / Refă, „Publică”); paginile proprii prin „Salvează pagina”. Randul de produse adaugat din „+” vine la locul ales intr-un singur pas la Anulează; daca trece peste alt rand, ordinea randurilor devine a omului (`ordineAtinsa`, regula sagetilor).
  - De verificat dupa push, pe un magazin real (cu acordul lui): „+” pe o sectiune de pe Acasa, un bloc „Titlu” ales din galerie, „Publică”: magazinul deschis normal arata titlul chiar sub sectiunea aleasa; un bloc adaugat cu „+” intr-o pagina proprie, „Salvează pagina”, apare la locul lui. Magazinul public nu are butoane „+” (stratul de contur se incarca doar in editor).
- **Etapa 11 (subsolul pe coloane-bloc; mentiunea lui din 28.10, raspunsul: „Pe coloane-bloc”):**
  - Subsolul e facut din coloane (blocuri in design, `chrome.footer.blocks`): Logo si text, Linkuri, Text, Contact,
    Newsletter, Imagine, Retele sociale; cel mult 8, cele unice o data. In editor: sub „Subsol” in arbore, cu sageti,
    ochi, „Adaugă coloană”, panoul fiecareia; „+” din previzualizare si pe coloane. Reglajele subsolului: „Înapoi sus”,
    textul de langa ©, culoarea fundalului si a textului (cu „Implicită”). Totul prin ciorna si „Publică”. Fara migratii.
  - ⚠ Magazinele de azi: un subsol fara coloane salvate primeste la citire coloanele de dinainte (pe coloane:
    identitatea, „Magazin”, „Informatii”, „Contact”; centrat: logo-ul, paginile, contactul fara oras, retelele), cu
    acelasi HTML (verificat pe 22 de pagini demo, doar grila scrisa altfel, cu aceleasi latimi). In productie (28.10):
    123 fara design salvat, 9 `dark`, 9 `centered`, 7 `columns`, niciunul cu sloganul pornit. De verificat dupa push: 2-3
    magazine reale (unul pe fiecare design) au subsolul neschimbat, pe calculator si pe telefon.
  - Categoriile pentru subsol se citesc pe pagina dupa coloane (o coloana „Linkuri” cu categorii), nu dupa design: ca
    inainte la toate magazinele de azi.
  - Newsletterul din subsol: abonarea cauta coloana in subsolul PUBLICAT, aprinsa (`blocDinMagazin`); mesajul are locul
    „Subsol”. De verificat dupa push, pe un magazin cu Mailchimp / Brevo / Klaviyo (cu acordul lui): o abonare din subsol
    apare in Pagini > Mesaje si la furnizor; o coloana ascunsa nu primeste nimic.
  - Partea legala (datele firmei, retragerea, garantia legala, politicile, ANPC, insignele, Netopia) si randul de
    copyright raman sub coloane pe orice design; cu culori alese, partea legala trece pe tonul care le citeste.
  - Gasite la proba (28.10) si reparate: „+” din previzualizare sta acum in afara elementului, lipit de margine (pe un
    rand scund il acoperea, iar clicul de alegere deschidea lista de adaugare: se vede si la blocurile mici de pe
    pagini); la schimbarea designului unei sectiuni raman si campurile declarate de varianta noua fara valoare implicita
    (`updateSection`; la subsol se pierdeau textul de langa „©” si culorile). De verificat dupa push: o alegere din
    „Schimbă designul” la un antet sau la o sectiune cu reglaje text pastreaza textele pe care varianta noua le are.
- **Schimbari de comportament de etapa 8, de urmarit dupa push:**
  - ⚠ Comerciantii care au invatat Setari > General / Formular de comandă / Catalog dupa etapa 1 nu le mai gasesc acolo: cardul „Datele magazinului” din General ii trimite in editor. Si invers fata de restul editorului: aici „Salvează” scrie direct, fara „Publică”.
  - Dupa o salvare din fila „Setări”, editorul cere din nou datele de pe server (`router.refresh()`): ciorna si pagina deschisa raman, previzualizarea se reincarca.
- **Etapa 12 (contorul de vizitatori masurat, fara roboti), de verificat dupa push:**
  - Magazinele cu contorul aprins (9 din 148 pe 25.10): pastila arata oameni masurati, „... au vazut produsul in
    ultimele 24 de ore” din start, sau lipseste cand nu e nimeni. ⚠ In primele 24 de ore poate numara si roboti scrisi
    INAINTE de push; ies singuri din fereastra.
  - ⚠ **Statistici scad de la push, si e corect:** robotii nu se mai scriu (pe 28.10 erau aproape jumatate din vederile
    de produs). Vizitatorii, afisarile si vederile de produs scad; o comparatie cu o perioada de dinainte arata scaderea.
    Nota din cartonasele „Vizitatori” si „Afisari de pagina” o spune. Randurile vechi raman (stergerea lor, daca se
    vrea, e o hotarare a lui).
  - Magazinul cu un singur produs (pagina principala e chiar pagina produsului) nu scrie `product_view`, deci acolo
    contorul nu apare deloc. De discutat daca se vrea.
- **Etapa 13 (mentiunile din 28.10, seara: 1, 3, 5), de verificat dupa push:** pe un magazin cu pagina principala
  clasica, un bloc pus cu „+” apare in arbore cu numele lui („Buton”) si se deschide direct; animatia aleasa se vede si
  in previzualizare; „Ascunde” si „Șterge” stau sub titlul panoului unei sectiuni; linkul bannerului are sugestii, iar
  un produs ales duce, pe domeniul propriu, la `/product/<slug>` fara prefixul magazinului.
  - Gasit la proba 12.4 si reparat: in editor, pagina de produs arata acum continutul din ciorna (beneficiile,
    intrebarile, pasii, livrarea, efectul butonului, fereastra contorului); pana atunci il arata pe cel publicat pana la
    „Publică”. De verificat dupa push: o schimbare de text in „Beneficiile” paginii de produs se vede in previzualizare
    inainte de „Publică”, iar magazinul public ramane pe cel publicat.
- **Etapa 14 (fonturile pe sectiune, mentiunea 2 din 28.10, seara), de verificat dupa push:**
  - Magazinele de azi arata la fel: cele 8 fonturi de dinainte au aceleasi clase si stive (proba), Geist ramane
    implicit, iar o sectiune fara font ales nu primeste niciun element in plus.
  - In Stil, „Font titluri” si „Font text” deschid lista pe familii (Geist plus 33, fiecare nume in fontul lui), nu
    grila de carduri de dinainte.
  - Pe o sectiune a paginii principale (de exemplu „Banner principal”), grupul „Fonturi” schimba doar sectiunea, pe loc
    in previzualizare, iar la clienti dupa „Publică”; „Ca în Stil” il scoate. Pe antet, „Fontul textului” schimba si
    numele magazinului si meniul (sunt text).
  - Fisierele unui font se descarca doar unde e folosit (`preload: false`); CSS-ul fonturilor era deja pe paginile
    magazinului, deci greutatea paginii nu creste.
- **Etapa 15 (tipul de checkout in Setări > Comanda, mentiunea 4 din 28.10, seara), de verificat dupa push:**
  - Magazinele de azi raman pe tipul lor (28.10: 9 pe pagina, 139 in fereastra). Niciunul n-are inca
    `checkout_config.tip`, deci designul decide pana la prima salvare din „Comanda”, care scrie tipul de pe ecran
    (pornit pe cel de azi).
  - In editor, Setări > „Comanda”: tipul schimbat si salvat ajunge in magazin pe loc, fara „Publică”: butonul din cos
    duce la `/checkout` sau deschide fereastra, iar `/checkout` la tipul „în fereastră” trimite la prima pagina.
  - Pagina „Finalizarea comenzii” din editor arata tipul si „Schimbă tipul în Setări”; „Schimbă designul” nu mai apare la
    ea. „Pagini” > „Finalizare comanda”: insigna urmeaza tipul salvat, „Alege tipul” deschide Setări > Comanda.
  - Linkul din emailul de cos abandonat urmeaza tipul salvat (`/checkout?code=...` la pagina, fereastra la celalalt).
  - ⚠ „Comandă acum” de pe pagina produsului deschide formularul produsului la ambele tipuri, ca inainte; spus in panou
    si in ghid. Hotarat de el (29.10): „Rămâne formularul produsului”.
- **Etapa 16 (tema Jupiter, doar aspectul: nicio tema nu se aplica inca; fara migratii), de verificat dupa push:**
  - Magazinele de azi arata la fel. Pagina principala si pagina de produs „Detaliat” urmeaza acum latimea din Stil
    (`--st-container`), cu 72rem implicit, cat era `max-w-6xl`. Cardul clasic ia aceleasi date prin `useDateCardProdus`
    (aceleasi texte, preturi, „de la”).
  - Galeriile din editor au variantele noi: antetul „Hipermarket, cu meniu de categorii” (9 design-uri), subsolul
    „Hipermarket, închis, cu beneficii” (4), bannerul „Bannere cu două carduri alăturate” (4). „Plăci de
    recomandare” apare la „Adaugă secțiune”. Randul de produse are „Pe bandă gri, cu titlu mare”, iar Pagina Magazin cu
    filtre in stanga are „Arată subcategoriile pe plăci, sub titlu”.
  - In panou, „Cardurile din dreapta” si „Plăcile” se completeaza (controlul de lista, nou in 16.5: „Adaugă card” /
    „Adaugă placă”, sagetile, „×”, linkul cu sugestii) si se vad in magazin dupa „Publică”.
  - 16.6: „Categorii” are „Schimbă designul (2)” („Butoane rotunde” / „Plăci cu imagine și număr de produse”), iar
    fila „Stil”, la „Cardul de produs”, are „Schimbă designul (2)” („Clasic” / „Hipermarket, cu prețul mare”). Magazinele
    de azi raman pe „Butoane rotunde” si „Clasic”: nimic nu se schimba pana nu aleg ei.
  - Fonturile Open Sans si Sofia Sans sunt in lista (35 de familii, plus Geist).
  - Textele noi din vitrina sunt fara diacritice, ca restul magazinului („Adauga in cos”, „Cauta”, „Cos”, „Inapoi sus”);
    etichetele noi din panou sunt cu diacritice.
  - Magazinul demo `tema-jupiter` si contul tehnic `teme@edinio-demo.test` exista DOAR in baza demo. In productie se fac
    la etapa 19 (scriptul `scripts/teme/seamana-demo.ts`, care refuza productia pana atunci), cu acordul lui.
- **Etapa 17 (pagina „Teme”, aplicarea direct in magazin, cu Istoric), de verificat dupa push:**
  - ⚠⚠ Migratia 1 din tabelul A (cu originile `tema` si `ciorna`) INAINTEA codului: fara ea, „Aplică tema” cade la
    scrierea Istoricului si nu aplica nimic (asa e facuta: fara versiunea de dinainte, nu se aplica).
  - ⚠⚠ Pagina „Teme” cere magazinul demo in productie (etapa 19): fara el, „Vezi demo” si „Previzualizare” dau 404. Din
    08.11 cardul arata o captura statica (`public/teme-capturi/`), nu miniatura vie, deci poza se vede oricum.
  - Magazinele de azi nu se schimba pana nu apasa cineva „Aplică tema”.
  - Editează magazinul > Teme: cardul Jupiter, „Vezi demo”, „Aplică tema” (fereastra spune ce se schimba si ce
    ramane); dupa aplicare „În magazin”, „Deschide editorul” si „Pune la loc designul de dinainte”.
  - Istoricul arata „Înainte de aplicarea temei” si, cand era o ciorna, „Ciorna nepublicată de dinainte de temă”.
  - Dupa aplicare, culoarea si fonturile alese din fila „Stil” schimba magazinul (identitatea temei sta acolo, nu in
    design, 17.1). „Pune la loc” readuce designul, culoarea, fundalul si fonturile de dinainte.
- **Etapa 18.1 (produsele demo nu pleaca din magazin), de verificat dupa push:**
  - ⚠⚠ Nimic nu se schimba pentru produsele de azi: filtrul pastreaza produsele FARA sursa (1.009 din 7.701 in productie,
    29.10) si pe cele cu alta sursa. Dupa push: fluxul Meta, sitemapul unui magazin, fluxul Pepita si Google Merchant
    au acelasi numar de produse ca inainte (de comparat pe 2-3 magazine cu fiecare canal).
  - Produsele demo (abia dupa etapa 18.2, la un magazin care le importa): lipsesc din fluxuri, sitemap si cozi; pagina
    lor are `noindex`; in easySales apar blocate cu „Produs demo din temă: rămâne doar în magazin.”.
- **Etapa 18.2-18.4 („Importă și datele demo”, „Șterge datele demo”), de verificat dupa push:**
  - ⚠⚠ Din 08.11 comutatorul porneste PORNIT (cerut de el; pana atunci oprit): cine apasa „Aplică tema” fara sa-l opreasca
    primeste si datele demo, iar pe un magazin vizibil clientii le vad si le pot comanda (fereastra o spune). Oprit, „Aplică
    tema” face exact ce facea la 17. Nimic nu se aplica singur, fara „Aplică tema”.
  - Pe un cont cu planul plin: comutatorul e oprit si stins, cu motivul; dupa „Aplică tema”, mesajul e „Tema ... e în
    magazin.”, FARA „cu datele demo” (reparat la recitirea din 09.11: mesajul se lua dupa bifa, nu dupa ce a plecat).
  - Pe un cont de test cu plan Basic: „Aplică tema” cu bifa adauga 10 produse demo (setul lui, etapa 20), 20 de
    categorii, 3 bannere, 2 randuri si textele temei; produsele lipsesc din fluxuri (Google, Meta, Pepita) si din sitemap;
    „Șterge datele demo” le scoate pe toate, iar categoriile in care s-a pus un produs al lui raman.
  - Pe un cont gratuit: cu macar un produs al lui, bifa e oprita, cu motivul (10 produse demo nu mai incap in 10); pe
    unul gol, incap exact (10 din 10), deci importul merge, iar contul ajunge la limita.
  - Un magazin cu cardurile bannerului sau placile de recomandare completate de el le pastreaza dupa aplicarea temei.
- **Etapa 20 (setul demo Jupiter cu materialul lui, 29.10), de verificat dupa push:**
  - Pozele temei sunt fisiere statice (`public/teme/jupiter/`, 33 de fisiere, 869 KB), deci pleaca odata cu codul; nimic
    de urcat in depozit. Dupa push: `https://www.edinio.com/teme/jupiter/logo.webp` si o poza de produs dau 200
    `image/webp`, cu `Cache-Control: public, max-age=31536000, immutable`; pe domeniul propriu al unui magazin, aceeasi
    cale da tot 200 (fisierele statice ocolesc rescrierea spre magazin).
  - ⚠⚠ Nimic nu se schimba la magazinele de azi: datele structurate ale produsului (JSON-LD) intregesc DOAR adresele de
    poza care incep cu „/” (ale datelor demo); pozele din depozit sunt deja intregi. De comparat `image` din JSON-LD pe
    2-3 produse ale unui magazin real, inainte si dupa: identic.
  - Bannerul temei Jupiter (varianta „carduri”) are 2,14:1 si pe telefon (era 2:1). Nu e inca la niciun magazin real.
  - Placile „Categorii” (varianta „placi”, 30.10): pe `jupiter.edinio.com` toate cele 12 raioane, cele 6 fara produse cu
    „0 produse”; meniul „Categorii produse” fara numere. Cu „Arată câte produse are fiecare categorie” stins raman doar
    cele cu produse. Regula e a variantei: orice magazin care aplica Jupiter o are. Nu e inca la niciun magazin real.
- **Etapa 21 (mentiunile dupa demo-ul Jupiter, 30.10), de verificat dupa push:**
  - Pe `jupiter.edinio.com`: cautarea pe tot randul, cu telefonul si „Cosul meu” langa ea; fara „Despre noi”; pagina de
    produs cu fotografia intreaga in fereastra; subsolul inchis, cu beneficiile, fara newsletter.
  - ⚠⚠ Nimic nu se schimba la magazinele de azi: galeria „Cât ecranul” e reglaj nou cu implicitul „Pătrată”, doar tema il
    pune, iar subsolul si antetul sunt variantele temei, pe care nu le are inca nimeni. De comparat pagina de produs a unui
    magazin real pe „Detaliat” (9 in productie, 29.10), inainte si dupa: identica.
  - O tema aplicata stinge „Despre noi” (textul ramane, se aprinde din ochi), iar un „Newsletter” pus de comerciant in subsol
    ramane o coloana obisnuita. Beneficiile din subsol sunt insignele lui („Beneficii pe scurt”).
- **Etapa 22 (30.10), de verificat dupa push:**
  - ⚠ Singura schimbare din temele care ajunge la TOATE magazinele: in `stil-comun.css`, orice buton activ din vitrina are
    mana (`[data-store-theme] button:not(:disabled)`). Doar cursorul, fara nimic pe asezare. Dupa push, pe un magazin real:
    mana pe „Adauga in cos” si in cos, sageata interzisa pe butoanele oprite.
  - Pe `jupiter.edinio.com`, in tab, planeta din sigla (`/teme/jupiter/favicon.png`). Magazinele reale raman cu faviconul lor.
- **Mentiunile din 08.11 si recitirea din 09.11, de verificat dupa push:**
  - ⚠ La TOATE conturile, in bara laterala: clicul pe „Editează magazinul” deschide lista (Editor, Teme, Biblioteca
    Media), nu mai duce direct in editor. Ghidurile spun tot „Intră în Editează magazinul...”: „Editor” e primul din lista.
  - Clic dreapta in previzualizarea editorului, pe un magazin real, doar in ciorna (fara „Publică”, la sfarsit „Renunță”):
    pe o sectiune de pe Acasa, Editează / Mută mai sus / Mută mai jos / Duplică / Ascunde / Șterge; pe antet, doar
    Editează; dupa Șterge, mesajul „Șters.” cu „Anulează”, care o aduce inapoi.
  - ⚠ Un „Conținut liber” de pe Acasa care are DOAR un bloc Coloane: „Șterge” pe un text din coloana (din meniul de clic
    dreapta si din panoul deschis cu clic) scoate doar textul; sectiunea si coloanele raman (reparat 09.11; inainte pleca
    tot continutul). „Șterge” pe Coloane insele scoate tot continutul, ca pana acum.
  - Pagina „Teme”: grila, cardurile cu captura care se deruleaza la mouse, fereastra „Aplică tema” pe doua coloane, cu
    comutatorul datelor demo pornit (vezi etapa 18.2-18.4). Sigla temei Marte: 40 px in antet (iesea 290 px lata).
- **Subdomeniile edinio.com (10.11.2026, odata cu domeniul cu stea al temelor), de verificat dupa push:** orice
  subdomeniu care nu e al unei teme se muta pe www cu 308, cu tot cu cale si interogare (`https://app.edinio.com/preturi?x=1`
  -> `https://www.edinio.com/preturi?x=1`); `ajutor.edinio.com` la fel, ca pana acum; `www` si subdomeniile temelor raman pe
  loc. Inainte de domeniul cu stea, subdomeniile nelegate raspund `DEPLOYMENT_NOT_FOUND` de la Vercel (masurat 10.11: `app`,
  `blog`, `cdn`, `magazin`, `panou`), deci regula lucreaza abia dupa el.
- **Proba completa de dinaintea lansarii (10-11.11.2026): doua defecte vechi reparate si o confirmare, de verificat dupa push:**
  - ⚠⚠ Poarta MFA (`src/lib/auth/poarta-mfa.ts`) citeste doar cookie-ul de sesiune AL PROIECTULUI (`sb-<ref>-auth-token`,
    cu `<ref>` din adresa Supabase), nu orice `sb-*-auth-token`. Defect EXISTENT si in productie: cu un cookie Supabase
    strain pe aceeasi gazda (domeniul propriu al unui magazin, ramas de la site-ul de dinainte; sau localhost langa alt
    proiect), `sub`-ul strain nu era in `users_profile`, deci ORICE actiune de server primea 403, inclusiv comanda din cos,
    fara mesaj. Dupa push: conectarea si MFA (un cont cu MFA pornit, fara cod = tot refuzat), o comanda din cos.
  - ⚠⚠ Onboarding dupa plata: `updateSession` nu mai trimite cu 307 spre `/dashboard` o ACTIUNE de server (POST cu
    `next-action`) facuta pe `/onboarding` dupa ce onboardingul s-a terminat; iar pe pagina de plan, o cadere a verificarii
    pentru conversie (`verificaPlataOnboarding`) nu mai opreste drumul spre panou. Defect EXISTENT si in productie: omul
    care tocmai platise vedea „A apărut o eroare. Încearcă din nou.” si planurile din nou, desi magazinul era creat (risc de
    plata dubla). Probat cap-coada pe demo (cont nou, „plata”, panou in 5,9 s, fara eroare). Dupa push: la primul cont nou
    platitor, omul ajunge in panou fara mesaj de eroare.
  - Editorul: „Renunță” (din bara si din meniul „...”) intreaba intai: „Renunți la modificările nepublicate?” cu „Rămân” /
    „Renunță la ele” (pasul arunca ciorna intreaga si pasii Anuleaza / Refa, fara drum inapoi). Ghidul „Renunță” spune la fel.
    Dupa push: un text schimbat, „Renunță” > „Rămân” = ramane; „Renunță” > „Renunță la ele” = dispare.
- **Defect vechi reparat pe ramura (29.10, `9c8cdfc4`), de verificat dupa push:** in alegatorul de produse al unui
  feed Meta (Marketing > Meta, „Adaugă produse”), cautarea dupa un nume cu `%` sau `_` (de pilda „50%”) nu gasea
  nimic, fiindca scaparea dadea sirul literal „${c}”. Dupa push: cautarea „50%” gaseste produsele cu „50%” in nume,
  iar o cautare obisnuita gaseste ca inainte.

## D. Capturi si texte de ajutor
- **Etapa 16 (29.10): ghidurile** `cum-reglezi-headerul-magazinului` (9 design-uri, „Hipermarket, cu meniu de categorii”),
  `cum-reglezi-footerul-magazinului` (al patrulea design), `cum-reglezi-sectiunea-hero` (4 design-uri, cardurile),
  `cum-configurezi-pagina-magazin` (subcategoriile pe placi), `cum-adaugi-sectiuni-de-produse` (banda gri),
  `cum-asezi-ordinea-sectiunilor` si unul nou, `cum-adaugi-placi-de-recomandare` (427 de ghiduri). Fara capturi noi.
  16.6: `cum-alegi-cum-arata-categoriile` (nou, 428 de ghiduri), designul cardului in `cum-reglezi-comportamentele-magazinului`
  (titlul: „Cum reglezi cardul de produs, ...”), unde se alege cardul in `cum-schimbi-designul-unei-sectiuni`.
  Etapa 17: noi `cum-aplici-o-tema` si `cum-pui-la-loc-designul-de-dinainte-de-tema` (430 de ghiduri); etichetele temelor
  in `cum-readuci-o-versiune-publicata`. Fara capturi noi.
  Etapa 18: bifa „Importă și datele demo” si limita planului in `cum-aplici-o-tema`, datele demo in
  `cum-pui-la-loc-designul-de-dinainte-de-tema`, nou `cum-stergi-datele-demo-ale-temei` (431 de ghiduri). Fara capturi noi.
  Etapa 20.5-21: `cum-alegi-cum-arata-categoriile` („0 produse”), `cum-reglezi-headerul-magazinului` (randul cu cautarea, reglajul
  telefonului), subsolul „Hipermarket, închis, cu beneficii”, „Înălțimea galeriei” la Detaliat, „Despre noi” in `cum-aplici-o-tema`. Fara capturi noi.
  Mentiunile din 08.11 (scrise la recitirea din 09.11): `cum-aplici-o-tema` (comutatorul pornit de la inceput, „Previzualizare”
  si poza de pe card), clicul dreapta in `cum-asezi-ordinea-sectiunilor`, `cum-muti-duplici-sau-stergi-un-bloc` si
  `cum-adaugi-continut-liber-in-magazin`. Fara capturi noi.
- **De facut (vazut la 18.1): listele din panoul canalelor** (eMAG, OLX, Trendyol, About You, Pepita) inca arata
  produsele demo printre cele de ales; trimiterea le sare (ca pe un inactiv), deci nimic nu pleaca, dar omul le poate
  bifa degeaba. De scos din liste cand e cazul (Meta si Google le scot deja).
- **De facut (vazut la 16.5): „Link buton” al antetului „Rotunjit, cu butoane colorate”** e tot text simplu, fara
  sugestiile (paginile, categoriile, produsele) pe care le au bannerele si, din 16.5, linkurile din listele panoului.
  Tipul `link` din `SectionSettings` trecut pe `CampLink`, cu `help` sub el; cu proba lui.
- **FACUT 28.10.2026, ghidurile (inchiderea, pasul 5; PLAN, „Inchiderea, pasul 5”):** toata categoria „Design și pagini” (84 de ghiduri citite fata de cod, rescrise cele care descriau „Design magazin”, „Design secțiuni”, „Ordinea secțiunilor”, „Salvează” pe sectiuni si constructorul de pagini retras), plus trimiterile din „Primii pași” si „Produse”. Noi: cum e impartit editorul, bucatile paginii de produs, istoricul publicarilor, sabloanele de produs (425 de ghiduri). Fiecare citat din categorie cautat in sursa (1084): toate cele scrise acum exista in cod. Ghidul „Conținut liber” ramane fara captura, dupa regula din `ajutor.ts` (cuvintele ajung).
- **Capturi de facut** (5, lista vie: `npm run capturi -- --lista`, reteta: `docs/ajutor/CAPTURI-AJUTOR.md`): `cum-e-impartit-editorul-magazinului` (orientarea grupului: bara de sus, filele, previzualizarea), `cum-completezi-informatiile-generale-editor-design` (panoul „Informații generale” din fila „Setări”), `cum-schimbi-designul-unei-sectiuni` (galeria „Schimbă designul”, cu „Activ” si „Alege”), `cum-adaugi-blocul-beneficii` (selectorul de pictograme din panoul blocului) si cea veche de la eMAG. Doua dintre ele aratau ecranele scoase („Design secțiuni BETA”, constructorul de pagini): mutate in `docs/ajutor/capturi-scoase/`, ca `npm run capturi` sa nu le lege la loc; pana la cele noi, ghidurile arata substituentul.
- Etapa 11 (28.10): ghidul `cum-reglezi-footerul-magazinului` (adresa ramane) rescris pe coloane: „Cum personalizezi
  subsolul magazinului”; nota despre „+” din `cum-e-impartit-editorul-magazinului` spune si de coloanele subsolului.
  Fara capturi noi. De discutat: in editor, o coloana „Linkuri” cu categorii pusa pe subsolul CENTRAT arata categoriile
  abia dupa o reincarcare a previzualizarii (lista lor se citeste pe server, dupa designul de la incarcare); in magazin,
  dupa „Publică”, apar corect.
- Etapa 10, de discutat: cu o pagina din „Pagini” ca pagina principala, pe „Acasă” „+” nu apare (previzualizarea arata
  pagina aceea, iar blocurile ei se editeaza in pagina, deschisa cu „Deschide pagina” sau cu un clic pe ea). In productie
  (28.10, doar citire): 1 magazin din 148. Daca il vrea si acolo: „+” ar deschide pagina si panoul „Adaugă un bloc” deodata.
- Etapa 10 (28.10): „+” din previzualizare e spus in `cum-e-impartit-editorul-magazinului` (detaliul nou), `cum-asezi-ordinea-sectiunilor` (pasul si galeria „Adaugă un bloc sau o secțiune”), `cum-adaugi-continut-liber-in-magazin` (detaliul „Direct din previzualizare”) si `cum-adaugi-un-bloc-in-pagina` (pasul si „deasupra”). Fara capturi noi: cuvintele ajung (regula din `ajutor.ts`).
- Etapa 8: ghidurile care trimiteau la Setari > General / Formular de comandă / Catalog spun acum „Editează magazinul, fila Setări, ...” (`setari.ts`, `design-si-pagini.ts`, `marketing-si-clienti.ts`, `marketplace.ts`, plus nota Trendyol din panou). Niciunul dintre ele nu are captura cu ecranele scoase (verificat 27.10). Textul juridic din `lib/website/gdpr.ts` („Setări → Profil / Setări → Magazin”) e al documentului de confidentialitate si NU s-a atins.
- Etapa 6: in previzualizarea editorului, culoarea bannerului de cookie (pusa de layoutul magazinului, care nu stie de modul editor) ramane cea publicata pana la „Publică”. Restul paginii urmeaza culoarea din ciorna.
- Etichetele variantelor si ale campurilor din registru (`registry.ts`) sunt inca fara diacritice; in editorul unic apar langa texte cu diacritice. De facut o trecere separata, cu probele care le citesc. Vazut la proba 5.5, in aceeasi trecere: etichetele venite din editorul de pagini (`SetariPagina`: „Titlu pagina”, „Ce este aceasta pagina?”; `TIPURI_PAGINA_PROPRIE`: „Pagina obisnuita”; `BLOCK_META`: „Spatiu”, „Harta”, „Intrebari (FAQ)” si celelalte), care se vad si in „Pagină nouă”.
- Culoarea aleasa in Stil se vede pe loc in previzualizare doar unde magazinul citeste variabilele temei. Cosul plutitor si eticheta „Popular” de pe card o primesc ca proprietate de la server (`business.primary_color`) si se schimba abia dupa „Salveaza” (vazut la proba din 25.10). De rezolvat in etapa 6, cand culoarea trece in design.
- **Hotarat 28.10 (el: „Rămân neafișate”): garantiile de pe pagina de produs.** Editorul vechi edita patru carduri (`trust_badges`), dar nicio varianta a paginii nu le afiseaza: Clasic si Detaliat au textele scrise in cod. Masurat 25.10: 44 de magazine le au salvate, 6 cu texte schimbate de comerciant (deci au scris ceva ce clientii nu vad). Editorul nou nu le mai ofera; datele raman in baza. Raman neafisate, iar datele raman in baza; ghidul spune textele fixe si ochiul blocului „Garanțiile”.
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
- ~~**Hotarat 28.10 (el: „Îl facem real (etapă nouă)”): contorul de vizitatori** afiseaza un numar nemasurat, fix pe produs (18-27); aprins la 9 magazine. Editorul nou o spune in panoul blocului. Devine un numar masurat intr-o etapa noua, dupa verificarea a ce s-a facut acum; pana atunci ghidul spune deschis ca nu e masurat.~~ **REZOLVAT de etapa 12 (28.10):** numara oameni distincti, fara cel care se uita si fara roboti, in fereastra aleasa de comerciant (ultimele 24 de ore din start, sau „Acum”); ghidul `cum-pornesti-elementele-de-pe-pagina-produsului` spune asa.
- **De discutat (vazut la proba 9.5): previzualizarea nu sare la blocul nou.** Dupa „Adaugă bloc” intr-un „Conținut liber”,
  blocul apare in arbore si i se deschide panoul, dar previzualizarea ramane unde era; continutul de sub produs, de
  pilda, trebuie derulat de mana. La fel se poarta paginile proprii (etapa 5), deci nu e o regresie.
- Vazut la verificarea sablonului (9.5, 28.10): pe pagina de produs, designul rezolvat trimis la client poarta lista
  sabloanelor (numele, produsele, categoriile, paginile lor; fara blocurile „Conținut liber”), din etapa 4b. Nimic
  secret (produsele si categoriile sunt publice, numele e doar o eticheta), dar sunt ~1,9 KB pe sablon, deci cel mult
  ~19 KB la plafonul de 10. Pe pagina principala nu pleaca. De taiat la nevoie (doar sablonul ales), cu proba ei.
- **Vazut la ghiduri (28.10): randurile de produse nu se deosebesc in arbore.** Fiecare apare ca „Rând de produse”, cu „Grila” sau „Carusel” dedesubt, fara titlul lui (titlul sta in `page_content`, nu in design); cu doua-trei randuri, il gasesti doar deschizandu-le. Ghidurile o spun asa. De discutat: titlul randului in arbore.
- **Vazut la ghiduri (28.10): „Ca în Editează magazinul” la sortarea Paginii Magazin** trimite la `sort_options.default_sort`, pe care nu-l mai regleaza nimic (nici editorul vechi nu avea control pentru el; la aproape toate magazinele e „cele mai noi”). Ghidul spune „de obicei cele mai noi primele”. De discutat: alta eticheta sau un control.
- Si selectorul Bibliotecii Media are etichetele fara diacritice („Adauga (1)”, „Anuleaza”, „Niciun fisier...”), ca registrul de mai sus; ghidurile le citeaza cu diacritice, ca in tot centrul de ajutor. Aceeasi trecere separata.
- `ProductForm` (galeria de imagini a produsului) foloseste tot dnd-kit fara `id` stabil, deci poate avea aceeasi nepotrivire de hidratare reparata in lista de sectiuni (`SectionList`, `useId`). In afara editorului, neatins.
- ~~Ghidurile mutate in Setari (formularul de comanda, catalogul, datele magazinului, retelele) stau inca in categoria „Design si pagini”.~~ Rezolvat de etapa 8: setarile s-au intors in editor, deci ghidurile lor stau iar langa el. Invers, cele din categoria „Setări” despre datele firmei, ANAF si numerotarea comenzilor descriu acum fila „Setări” a editorului; titlul categoriei ramane potrivit. O mutare intre categorii schimba adresa (`/ajutor/<categorie>/<ghid>`) si cere redirectari.

## E. Demo-ul temelor (etapa 19), LA PUSH, cu acordul lui
**Hotarat de el pe 10.11.2026, pentru lansare:**
- **Subdomeniile: unul cu stea**, `*.edinio.com`, adaugat in Vercel (proiectul aplicatiei > Settings > Domains). DNS-ul
  domeniului e chiar al lui Vercel (`ns1/ns2.vercel-dns.com`), deci nu se scrie nicio inregistrare: masurat 10.11, orice
  subdomeniu rezolva deja spre Vercel, iar cele nelegate raspund `DEPLOYMENT_NOT_FOUND`. `jupiter` si `ajutor` sunt legate
  pe nume si raman asa. In cod, orice alt subdomeniu se muta pe www (`proxy.ts`, tabelul C), ca sa nu serveasca site-ul a
  doua oara.
- **Contactul din subsolul demo-urilor ramane fictiv** (`<tema>@edinio-demo.test`, `0700 000 000`, „Strada Exemplului 1”):
  se vede ca e demonstrativ, iar comenzile sunt oprite oricum.

Magazinul demo al temei Jupiter (`tema-jupiter`) exista DOAR in baza demo. In productie nu exista nimic din el: pana la
pasii de mai jos, pe pagina „Teme” „Vezi demo” si „Previzualizare” dau 404 (captura de pe card se vede: e fisier static, din 08.11).
- **29.10.2026: pasii 1 si 2 FACUTI de el** („Am adaugat subdomeniul jupiter.edinio.com”). Masurat atunci: DNS spre
  Vercel, certificat valid, dar productia (fara codul etapei 19) serveste pe subdomeniu TOT site-ul de prezentare:
  `/`, `/preturi`, `/login` cu 200, „index, follow”, `robots.txt` „Allow: /”; canonicalul duce la `www.edinio.com`.
  Ramane asa pana la push (raspunsul lui: „Îl las așa până la push”). ⚠ Pasii 3 si 4 abia DUPA push: productia de azi n-are poarta comenzilor (19.2), deci un
  magazin demo facut inainte ar lua comenzi adevarate pe `www.edinio.com/tema-jupiter`. Dupa push si inainte de 3-4,
  subdomeniul raspunde 404 (rescrie spre un magazin care inca nu exista): pasii 3-4 imediat dupa ce s-a terminat
  desfasurarea.
1. **DNS:** inregistrarea `jupiter` (CNAME) catre Vercel, la furnizorul domeniului `edinio.com` (valoarea o da Vercel la
   pasul 2, de regula `cname.vercel-dns.com`).
2. **Vercel:** proiectul aplicatiei > Settings > Domains > Add `jupiter.edinio.com` (fara redirectare), pana apare
   „Valid Configuration” si certificatul.
3. **Contul tehnic si magazinul:** `scripts/teme/magazinul-demo.sql`, rulat o singura data pe productie (idempotent; nu
   sterge nimic; se opreste daca slugul `tema-jupiter` ar fi al altui cont). Inainte, de hotarat de el: emailul si
   telefonul afisate in subsolul demo-ului (azi `jupiter@edinio-demo.test`, `0700 000 000`). Verificarea e in coada
   fisierului: magazinul publicat, fara domeniu propriu, plan Ultra pana in 2099, setarile.
4. **Umplerea:** `scripts/teme/seamana-demo.ts jupiter --productie`, cu cheile productiei in mediu (doar pentru rularea
   asta). Intai goleste magazinul demo (prima oara nu gaseste nimic; refuza un magazin cu produse care nu sunt demo),
   apoi scrie 20 de categorii, 10 produse demo (sursa `tema-demo`, deci in afara canalelor, etapa 18.1), 3 bannere,
   2 randuri, sigla, designul temei si semnul `magazin_demo` (fara comenzi, etapa 19.2). Se poate rula din nou oricand
   se schimba setul (etapa 20).
5. **Verificari:** `https://jupiter.edinio.com` arata magazinul demo, adresele fara `/tema-jupiter`, antetul
   `X-Robots-Tag: noindex, follow`; `/robots.txt` = „Disallow: /”; `/sitemap.xml` = 404; o comanda (din cos si din
   formularul produsului) e refuzata cu „Acesta e un magazin demo: poti incerca tot, dar comenzile sunt oprite.”, fara
   rand nou in `orders`; pe pagina „Teme”, „Vezi demo” si „Previzualizare” deschid `jupiter.edinio.com`.

**Temele 2-30 (etapa 24, pe loturi), tot la push, cu acordul lui.** Lotul 1 (08.11.2026): `mercur`, `venus`, `terra`,
`marte`. Aceiasi pasi ca la Jupiter, pe cheia fiecarei teme:
1-2. **Subdomeniile** `mercur`, `venus`, `terra`, `marte` (si cele din loturile urmatoare, `CHEI_TEME` din
   `src/lib/teme/gazde-demo.ts`): cate un CNAME si un domeniu in Vercel pe tema, SAU unul singur cu stea (`*.edinio.com`),
   de hotarat de el (cu stea, orice subdomeniu raspunde: cele care nu sunt teme dau pagina platformei, ca azi).
3. **Magazinele:** `scripts/teme/magazinele-demo-teme.sql`, DUPA `magazinul-demo.sql` (are nevoie de contul tehnic).
   Idempotent, nu sterge nimic, se opreste pe un slug `tema-*` al altui cont. Verificarea e in coada fisierului.
4. **Umplerea:** `scripts/teme/seamana-demo.ts <cheie> --productie` pentru fiecare tema. Pozele sunt in `public/teme/<cheie>/`
   (pleaca odata cu codul), deci nu se urca nimic separat.
5. **Verificari:** ca la Jupiter, pe fiecare subdomeniu.
**Loturile 2-7 (08.11.2026, noaptea): TOATE cele 29.** `CHEI_TEME` are acum 30 de chei (Jupiter + 29), SQL-ul are 29 de
randuri, iar umplerea se ruleaza pe rand: `mercur venus terra marte saturn uranus neptun sirius vega altair rigel polaris
antares arcturus aldebaran capella deneb spica procyon canopus regulus bellatrix betelgeuse achernar mira alnilam mintaka
electra maia`, fiecare cu `--productie`. Cu subdomeniile una cate una sunt 29 de CNAME-uri si 29 de domenii Vercel: cu
stea (`*.edinio.com`) e unul singur, de hotarat de el. Pe baza demo toate 29 sunt create si umplute (verificat: 30 de
magazine `tema-*`).
~~Miniaturile vii de pe pagina „Teme”: cadrele sunt `loading="lazy"` (se incarca doar la vedere), iar pagina citeste acum
locul pentru datele demo o singura data pentru toate temele (nu de 30 de ori). Proba pe ecran cu 30 de teme: incarcarea
ramane acceptabila; o captura statica in locul cadrului ramane o idee, nu o nevoie.~~ **Inlocuite pe 08.11 (cerut de el)
de capturi statice:** `public/teme-capturi/<cheie>.webp` (30 de fisiere, 720 px lat), facute de
`scripts/teme/capturi-teme.mjs` din serverul local; dupa ce se schimba aspectul unei teme, scriptul se ruleaza din nou.
Pagina citeste tot o singura data locul pentru datele demo. Dupa push: `https://www.edinio.com/teme-capturi/jupiter.webp`
= 200 `image/webp`.

## F. Ziua lansarii (hotarata de el pe 10.11.2026: „Vreau ca maine sa il lansam”)
**Starea din 10.11, seara, pe ramura:** porti verzi (tsc, `lint:prag --check`, `npm test` 11.488 / 0 cazute / 2 sarite,
`verifica-tipuri-db --check`, `build:ci`); `schema-baseline.sh --check` = productia; `verifica:coloane` pe productie: lipseste
DOAR `storefront_design_versions` (migratia 1, anume). `main` (`ec9cec9c`) e deja in ramura. Copie de siguranta:
`arhiva/editor-magazin-2026-11-10.bundle` (`main` + ramura la `de3465be`, verificata).

Fiecare pas cu acordul lui, in ordinea asta:
0. `git fetch`. Daca `main` a primit ceva: merge `main` in ramura, apoi suita si `build:ci` din nou.
1. **Migratia 1** pe productie (`apply_migration` pe `rtefdpioqmowkdiybwrr`, numele `istoricul_publicarilor`, continutul
   fisierului). Verificarea e chiar in migratie: cade daca RLS, politicile sau drepturile nu sunt cum trebuie. Apoi
   `node --env-file=.env.local scripts/tests/coloane-cerute-exista.mjs` = nimic lipsa.
2. **Schema din Git:** `bash scripts/schema-baseline.sh` (regenereaza), apoi `--check` si
   `node scripts/verifica-tipuri-db.mjs --check`; commit pe ramura. Fara el, CI cade la „schema din Git = productie”.
3. **Push:** in `edinio-main`, `git merge --ff-only editor-magazin`, apoi `git push origin main` (fereastra GCM „Select an
   account” poate astepta dupa el).
4. **Verificari:** desfasurarea READY in Vercel, CI verde. Apoi tabelul C, intai ce atinge toate magazinele: un magazin fara
   design salvat si unul cu design (acasa, produs, subsol; calculator si telefon), eSAFE si VetDepo (cataloagele mari),
   editorul pe contul lui (o schimbare in ciorna, apoi „Renunță”), panoul (Setari, Produse), subdomeniile (tabelul C).
5. **Demo-urile (E):** `*.edinio.com` in Vercel > Domains; `scripts/teme/magazinul-demo.sql`, apoi
   `scripts/teme/magazinele-demo-teme.sql` (`execute_sql` pe productie; verificarile din coada fisierelor); umplerea, pe
   rand, pentru cele 30 de chei din `CHEI_TEME`:
   `node --env-file=.env.local --conditions=react-server --import ./scripts/tests/register.mjs scripts/teme/seamana-demo.ts <cheie> --productie`.
   Apoi E.5 pe 2-3 subdomenii (si o comanda refuzata) si pagina „Teme” cu „Vezi demo”.
- **Plasa:** o problema in magazine dupa push -> Vercel > Deployments > desfasurarea de dinainte > „Instant Rollback” (cam
  un minut). Migratia doar adauga un tabel, deci codul vechi merge si cu ea: nu se desface.

**11.11.2026: LANSAT** (acordul lui: „Gata, poti da push la tot, lansam update ul. Dupa lansare, verifici toate magazinele
active sa nu se strice ceva la ele.”). Toti pasii de mai sus, in ordine:
- **0.** `main` neschimbat (`ec9cec9c`, deja in ramura). Turul actualizarii comis inainte (`52d382f4`). Porti verzi:
  tsc, `lint:prag --check`, tipurile DB, `npm test` 11.543 / 0 cazute / 2 sarite, `build:ci`. Copie de siguranta:
  `arhiva/editor-magazin-2026-11-11.bundle` (`main` + ramura, verificata).
- **1.** Migratia 1 aplicata in productie (`istoricul_publicarilor`); verificata pe rezultat: RLS pornit, 0 politici, niciun
  drept pentru `anon` si `authenticated`, `service_role` scrie si citeste, originile temelor in constrangere.
  `coloane-cerute-exista`: 432 / 432.
- **2.** Schema din Git regenerata si comisa (`1439acce`): `--check` egal cu productia, tipurile fara deriva.
- **3.** `main` dus prin fast-forward la `1439acce` si impins (~15:58 ora RO). Vercel: „Deployment has completed”, productia
  servea codul nou la ~200 s dupa push. CI: 4 / 4 verde.
- **4.** TOATE magazinele publicate (79: 18 active, 61 suspendate) fotografiate INAINTE de push si DUPA (Playwright, cu
  pixelii tertilor si semnalul de analitice blocate, deci fara vizite in statisticile lor): 179 de pagini (acasa si produs
  pe calculator si telefon, Magazin, o categorie, cosul). Niciun cod HTTP schimbat, nicio eroare JS noua, nicio depasire
  orizontala, aceleasi legaturi de produs si aceleasi butoane de comanda; cele 61 suspendate arata tot „indisponibil”.
  Diferentele vizuale, toate din etapele ramurii: pe telefon textele beneficiilor nu se mai taie si randurile subsolului
  sunt mai inalte; butonul bannerului de cookie-uri are contrast citibil; contorul de vizitatori e cel masurat (⚠ in
  primele 24 de ore numara si vederile scrise INAINTE de push, cu roboti: la eSAFE „339 ... in ultimele 24 de ore” pe un
  produs, ultima vedere la 15:53); ⚠ **pagina de produs Detaliat pe coloane 6/5** (`0eb6baa3`, 08.11, „galeria iesea de
  700-800 px pe temele late”), care a ajuns si la magazinele de azi si NU fusese scrisa aici: la 72rem galeria are ~602 px
  in loc de ~688, coloana de cumparare ~502 in loc de 416 (eSAFE, VetDepo, MNY Aroma, Suporti-Numar, Tiara, Insula
  Bucuriei). Nimic stricat; de hotarat de el daca ramane. Problema DE DINAINTE (si inainte de push): la Cleanixo, primul
  produs din prima pagina duce la 404.
- **5.** `*.edinio.com` adaugat de el in Vercel. `magazinul-demo.sql` si `magazinele-demo-teme.sql` rulate in productie
  (declansatoarele recitite: niciun email, niciun apel extern): 30 de magazine `tema-*` pe contul tehnic, publicate, fara
  domeniu. Umplute toate 30 (`seamana-demo.ts <cheie> --productie`): 331 de produse demo, toate cu sursa `tema-demo`,
  comenzile oprite pe 30 / 30, 0 comenzi. Verificat: 30 / 30 subdomenii 200 cu `noindex, follow` si numele magazinului,
  fara `/tema-` in legaturi; `robots.txt` „Disallow: /”, sitemap 404; orice alt subdomeniu (`app`, `blog`, `ajutor`, unul
  inventat) 308 spre `www`, cu cale si interogare.
- **Dupa lansare:** santinela a scris la 16:17 o alarma CRITICA, „feedul Facebook e GOL” pe `tema-vega` si `tema-venus`:
  falsa, demo-urile n-au feed dinadins. Reparat in acelasi commit cu insemnarea asta: `magazineVii` scoate magazinele demo
  (slugul `tema-*` SAU semnul `magazin_demo`) inaintea ambelor liste (`esteRandDeMagazinDemo`, proba in `gazde-demo.test.ts`).
  `error_logs` dupa push, in rest: doar avertismentele care se repeta de dinainte (eMAG, DPD, Netopia).

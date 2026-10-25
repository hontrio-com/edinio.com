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

## D. Capturi si texte de ajutor
- De refacut la final: `public/capturi/ajutor/design-si-pagini/cum-completezi-informatiile-generale-editor-design.webp` (cardul „Magazinul” din Setari > General). Fisierul vechi arata panoul scos din editor si a fost sters; ghidul arata substituentul pana atunci. Lista: `npm run capturi -- --lista`.
- Grupul „Design magazin” din centrul de ajutor se rescrie INTREG la final: descrie editorul vechi, care se inlocuieste in etapele 2-6. Exemplu de text deja invechit: `cum-functioneaza-butonul-salveaza` spune ca butoanele scriu tot `page_content`, dar editorul salveaza de mult doar cheile atinse.
- Etapa 2: grupul „Design magazin” descrie trei ecrane care nu mai exista („Design magazin”, „Ordinea sectiunilor”, „Design sectiuni”) si comutatoarele scoase. Exemplu: ghidul paginilor de sistem spune ca „Alege designul” duce in „Design sectiuni”. Se rescrie la final, odata cu restul grupului.
- Etichetele variantelor si ale campurilor din registru (`registry.ts`) sunt inca fara diacritice; in editorul unic apar langa texte cu diacritice. De facut o trecere separata, cu probele care le citesc.
- Ghidurile mutate in Setari (formularul de comanda, catalogul, datele magazinului, retelele) stau inca in categoria „Design si pagini”. Daca se muta in „Setari”, se schimba adresa (`/ajutor/<categorie>/<ghid>`), deci trebuie redirectari.

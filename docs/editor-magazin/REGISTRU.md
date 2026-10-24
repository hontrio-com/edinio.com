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
  - Setari > Catalog: „Ascunde produsele fara stoc" scoate produsele din lista magazinului.
  - „Editeaza magazinul" nu mai are Informatii generale, Social media, Formular de comanda si cele trei comutatoare de catalog; are trimiterile spre Setari.
- **Schimbari de comportament de etapa 1, de urmarit dupa push:**
  - Bifa „Am WhatsApp pe acelasi numar" spune acum ce e in baza. In editorul vechi pornea bifata si cand `whatsapp` era NULL, iar prima salvare scria telefonul acolo (si aprindea butonul flotant).
  - `store_name` gol ramane NULL (editorul vechi scria in el `business_name` la prima salvare).
  - Linkurile sociale: doar http(s), `https://` pus singur cand lipseste.
  - Extraoptiunile si campurile suplimentare fara eticheta nu se mai pot salva.
  - `order_number_format` primeste doar `sequential` sau `random`.

## D. Capturi si texte de ajutor
- De refacut la final: `public/capturi/ajutor/design-si-pagini/cum-completezi-informatiile-generale-editor-design.webp` (cardul „Magazinul" din Setari > General). Fisierul vechi arata panoul scos din editor si a fost sters; ghidul arata substituentul pana atunci. Lista: `npm run capturi -- --lista`.
- Grupul „Design magazin" din centrul de ajutor se rescrie INTREG la final: descrie editorul vechi, care se inlocuieste in etapele 2-6. Exemplu de text deja invechit: `cum-functioneaza-butonul-salveaza` spune ca butoanele scriu tot `page_content`, dar editorul salveaza de mult doar cheile atinse.
- Ghidurile mutate in Setari (formularul de comanda, catalogul, datele magazinului, retelele) stau inca in categoria „Design si pagini". Daca se muta in „Setari", se schimba adresa (`/ajutor/<categorie>/<ghid>`), deci trebuie redirectari.

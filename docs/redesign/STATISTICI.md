# Refacerea paginii Statistici

Cerere din 20.09.2026, unsprezece puncte. Nu e o serie de retusuri: primele patru au aceeasi
radacina, si anume ca **nu se masoara sesiuni**. Fisierul asta e planul si jurnalul lucrarii;
se bifeaza pe masura ce se face, ca sa se vada mereu unde am ramas.

## Ce masuram azi, exact

`site_analytics` are un singur fel de eveniment, `visit`, scris la **fiecare randare** a paginii
de magazin sau de catalog. Fara sesiune, fara vizitator, fara cale, fara produs. Masurat pe baza
demo: 2.020 de randuri, toate `visit`, toate cu `metadata` gol.

De aici vin, in lant:

- **„Vizitatori activi" numara afisari**, nu oameni. Cine reincarca pagina de cinci ori e numarat
  de cinci ori.
- **„Rata de conversie" imparte comenzi la afisari.** La 100 de oameni care vad in medie 4 pagini
  si 5 care comanda, adevarul e 5%, iar cifra aratata e 1,25%.
- **Nu exista palnie** (produs vazut, adaugat in cos, checkout inceput, comanda), fiindca
  evenimentele astea nu se scriu nicaieri.
- **Nu exista venit pe sursa**, fiindca atribuirea nu se leaga de nimic care sa ajunga pe comanda.

## Etapele, in ordinea in care se pot proba

### Etapa A - masuratoarea (radacina punctelor 1, 2 si a jumatate din 4)

- [x] **A1.** `site_analytics` capata `session_id`, `visitor_id`, `path`, `product_id`.
- [x] **A2.** Identitate **fara cookie**: sesiunea si vizitatorul se deduc dintr-o amprenta
      trecuta prin functie de dispersie, cu sare care se schimba zilnic.
      ⚠ Fara cookie dinadins: unul de analitica ar fi cerut acordul din bannerul de cookie-uri,
      iar proprietarul a hotarat ca in panou nu se pune banner. Sarea zilnica face amprenta
      nereversibila si o si expira singura.
- [x] **A3.** Datele demo capata sesiuni, ca ecranele sa poata fi judecate: 2.022 de randuri
      grupate in 734 de sesiuni (2,75 pagini pe sesiune), plus 39 de evenimente `purchase`
      legate de comenzile existente, ca rata de conversie sa aiba ce arata.
- [x] **A4.** Evenimente noi din vitrina: `product_view` (pagina de produs), `begin_checkout`
      (pagina de checkout), `purchase` (la plasarea comenzii, pe server) si `add_to_cart`
      (singurul care nu se poate masura de pe server: cosul e stare de browser, deci trece
      printr-o ruta proprie, `POST /api/analitice/eveniment`).
      ⚠ Ruta primeste NUMAI `add_to_cart`: un `purchase` scris din browser ar fi insemnat ca
      oricine isi poate desena rata de conversie pe care o vrea.

### Etapa B - cifrele

⚠ **DESCOPERIT PE DRUM, SI SCHIMBA ETAPA ASTA:** randurile brute din `site_analytics` se
**sterg dupa 8 zile** (`curata_analitice_brute`); peste ele supravietuieste doar
`business_daily_stats`, care numara evenimente pe (zi, fel, dispozitiv, sursa). Sesiunile NU se
pot socoti din el: „cate sesiuni" nu se aduna din „cate afisari".

Deci, inainte de orice cifra pe 30 sau 90 de zile, sesiunile trebuie **stranse zilnic**, cu
`count(distinct session_id)`, in tabele noi. Altfel pagina ar arata corect o saptamana si ar
scadea la zero in a noua zi - exact felul de defect care se vede abia peste doua luni.

- [x] **B0.** Tabele noi de agregat zilnic: pe magazin (vizitatori, sesiuni, afisari, sesiuni cu
      comanda) si pe sursa/dispozitiv (sesiuni, sesiuni cu comanda). Umplute de acelasi cron
      care strange zilele, INAINTE de stergerea randurilor brute. Facut: `analitice_zilnic` si
      `analitice_zilnic_sursa`, umplute din `agregeaza_analitice()`, deci ordinea „intai aduni,
      apoi stergi" ramane cea garantata de cronul de acum. Verificat pe demo cu o interogare de
      control scrisa altfel: 735 de sesiuni, 16 cu comanda, aceleasi cifre ca din randurile brute.
- [x] **B1.** `trafic_panou`: vizitatori, sesiuni, afisari, sesiuni cu comanda, plus perioada
      precedenta si seria pe zile. Citeste agregatul pentru zilele incheiate si randurile brute
      pentru ziua de azi. Verificat pe demo cu o interogare de control: 432 de sesiuni, aceleasi
      ca din randurile brute; conversia adevarata iese 1,39%.
      ⚠ „Vizitatori" inseamna vizitatori PE ZI, insumati: amprenta se schimba in fiecare noapte,
      deci cine revine maine se numara din nou. E pretul masurarii fara cookie, si scrie in tooltip.
- [x] **B2.** `comenzi_pe_judet`: aceeasi fereastra ca graficul de vanzari, filtru pe canal, si
      trei masuri deodata (comenzi, vanzari, valoare medie). Verificat: 34 de judete pe 30 de zile
      si 18 pe 7 zile, adica harta chiar raspunde la perioada - pana acum arata acelasi lucru mereu.
- [x] **B3.** `trafic_pe_sursa`: sesiuni si sesiuni cu comanda, pe sursa si dispozitiv.
      ⚠ Comenzile vin din sesiunile cu `purchase`, nu din `orders`: numarate din `orders`, fiecare
      sursa ar fi primit toate comenzile, fiindca acolo nu scrie din ce sursa a venit omul.

### Etapa C - pagina

- [x] **C1.** Antet si filtre comune: perioada (azi, ieri, 7, 30, 90, luna, an, personalizat),
      canal de vanzare, comparatie, export.
- [~] **C2.** File: Prezentare (gata), Trafic (gata), Live (gata). „Vanzari" se adauga
      odata cu tabelele ei; pana atunci n-ar fi decat un titlu gol.
- [x] **C3.** Toate cardurile cu aceeasi forma: valoare, crestere, valoarea perioadei
      precedente, explicatie in tooltip.
      ⚠ **Exact cardul de pe panoul principal** (cerere din 20.09.2026): se scoate `StatCard`
      din pagina panoului intr-o componenta comuna si se foloseste si aici. Doua carduri
      desenate separat ar fi divergit la prima retusare, exact ca cele doua meniuri.
- [ ] **C4.** Randul duplicat de jos iese; in locul lui: clienti noi, clienti recurenti,
      produse vandute, rata de anulare.
- [ ] **C5.** Grafic cu masura la alegere si granulatie dupa lungimea perioadei.
- [ ] **C6.** Fila Vanzari: produse, categorii, canale, statusuri, vanzari brute/nete.
- [x] **C7.** Fila Trafic: surse cu venit, dispozitive cu conversie, palnie.
      ⚠ **Venitul se pune in dreptul PRIMEI surse a sesiunii**, nu a sursei evenimentului de
      cumparare. Altfel, cine intra din Google si se intoarce din Facebook ca sa cumpere ar fi
      dat intreaga comanda amandurora, iar suma coloanei „Vanzari" ar fi depasit vanzarile
      magazinului - un tabel care se contrazice cu cardul de deasupra lui.
      ⚠ **Pragurile palniei nu sunt neaparat in scadere** si scrie asta sub ele: in cos se
      poate adauga si din grila magazinului, fara pagina produsului. Un „sub 100%" acolo nu e
      un defect de masurare.
- [x] **C8.** Fila Live: „vizitatori activi" numara acum OAMENI distincti, nu afisari; s-au
      adaugat cosuri, checkout-uri si comenzi din ultima jumatate de ora; fluxul spune ce s-a
      intamplat („Un produs a fost adaugat in cos"), nu doar „Vizita via Facebook"; harta a
      plecat de aici in Prezentare, unde filtrul chiar o misca; scrie „12 evenimente".
- [ ] **C9.** Export CSV.
- [ ] **C10.** Stari fara date scrise pe intelesul omului; harta folosibila cu degetul si cu
      tastatura.

## Hotarari luate pe drum

**Sesiunea tine 30 de minute de inactivitate**, ca peste tot. Vizitatorul se numara **pe zi**:
fara cookie, „acelasi om maine" nu se poate sti, si nici nu vrem sa se poata.

**Amprenta nu se pastreaza nicaieri.** In rand ajung doar `session_id` si `visitor_id`, care
sunt rezultatul functiei de dispersie. Sarea zilei se sterge dupa 7 zile, deci nici cu baza in
mana nu se mai poate afla de la ce adresa IP a venit cineva saptamana trecuta.

**Cifrele vechi raman cum sunt.** Randurile de dinainte n-au sesiune, deci vizitatorii unici si
conversia adevarata incep de la data punerii in functiune. Ecranul o va spune, in loc sa arate o
crestere inexistenta.

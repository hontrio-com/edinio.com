# Compari.ro: feedul de produse

Scris pe 23.11.2026. Cererea proprietarului: *„Si pentru eSafe vreau sa imi faci un Feed special pentru compari”*.

Compari.ro e comparator de preturi: trimite vizitatori in magazinul comerciantului si isi ia lista de produse
dintr-un fisier tinut pe site-ul magazinului, pe care il descarca zilnic la 17:00.

## Surse (citite pe 23.11.2026)

* `https://www.compari.ro/static/feed-requirements.html` („Formate de FEED”): campurile obligatorii si recomandate,
  formatele pentru `delivery_time` si `delivery_cost`, unde se salveaza adresa feedului.
* `https://www.compari.ro/static/feed-modification.html`: ce campuri nu se schimba dupa listare.
* Lista completa a campurilor optionale e in Centrul lor de clienti (`compari.ro/admin/#feed-format`), in spatele
  autentificarii: NU a fost citita. De aceea feedul scrie numai campurile din paginile publice de mai sus.

## Ce se serveste

`{adresa magazinului}/compari.xml` (de exemplu `https://esafe.ro/compari.xml`), pentru orice magazin publicat, fara
nicio configurare. Ruta: `src/app/(public)/[slug]/compari.xml/route.ts`; generatorul, pur: `src/lib/compari/feed.ts`;
citirile din baza, aceleasi pentru ruta si pentru panou: `src/lib/compari/server.ts`.

In panou: Integrari > Marketplace > Compari.ro (`dashboard/features/compari`). Pagina da adresa feedului, pasii din
Centrul de clienti Compari, ce anunta feedul in numele comerciantului (pret, termen, cost de livrare) si cate produse
pleaca, cate sunt epuizate si cate raman afara, cu motivul si legatura fiecaruia (`rezumatulFeeduluiCompari`, prin
actiunea `rezumatulFeeduluiCompariAlMeu`). Nu are comutator: feedul exista pentru orice magazin publicat, ca la
catalogul Meta. Ghidul din Ajutor: `marketplace/cum-listezi-produsele-in-compari`.

| Element | De unde vine |
| --- | --- |
| `identifier` | id-ul produsului. Nu SKU-ul: pe acela comerciantul il poate rescrie, iar Compari cere un identificator care nu se schimba |
| `manufacturer` | marca produsului (`page_sections.google.brand`), altfel numele magazinului |
| `name` | numele produsului, cel mult 100 de caractere, taiat la hotar de cuvant |
| `category` | calea intreaga din arborele de categorii, „Parinte > Copil” |
| `product_url` | pagina produsului, pe adresa magazinului, cu prefixul din Permalink-uri |
| `price` | pretul BRUT: cel mai mic pret la care produsul se poate cumpara (`getProductPriceRange`), cu TVA adaugat cand magazinul tine preturile fara TVA (`pretBrut`) |
| `productnumber` | codul producatorului (`google.mpn`), altfel SKU-ul |
| `ean_code` | codul de bare al produsului, numai daca trece cifra de control |
| `image_url` | prima poza; WebP si AVIF pleaca drept JPEG, ca in catalogul Meta |
| `description` | text simplu, cel mult 4.000 de caractere |
| `delivery_time` | „NO” la produsul epuizat; altfel capatul de sus al termenului din Setari > Livrare; lipseste cand comerciantul nu a declarat un termen si la precomenzi |
| `delivery_cost` | tariful de livrare, brut; „gratuit” de la pragul de transport gratuit; lipseste cand tariful nu e scris, cand livrarea e oprita si la produsul epuizat |

## Hotarari

* **Un produs, un rand.** Marimile si culorile nu pleaca separat: comparatorul asaza magazinele pe produs.
* **Produsul epuizat ramane in feed, cu „NO”.** Compari il ascunde singur; scos din lista, la intoarcerea in stoc ar
  fi tratat ca produs nou (3-7 zile lucratoare, dupa pagina lor).
* **Raman afara:** produsele fara poza, fara categorie, fara pret si cele al caror pret din catalog nu e pretul platit
  (personalizare cu pret). O singura hotarare, `motivulLipseiDinCompari`, pe care o poate citi si un ecran.
* **Transportul gratuit se scrie „gratuit”, nu „0”:** pagina lor trece `0` la formate gresite.
* **Numele elementelor** sunt numai forme scrise la ei: `product_url`, `image_url` (formatul lor vechi),
  `delivery_time`, `delivery_cost` (exemplele din pagina), `ean_code`, `productnumber` (`<Ean_Code>`,
  `<ProductNumber>`). Pagina lor scrie acelasi camp si `<DeliveryCost>`, si `<delivery_cost>`, deci literele mari nu conteaza.
* **O citire cazuta raspunde 503, nu un feed gol:** un `<products></products>` cu 200 ar spune ca magazinul nu mai
  vinde nimic.

## Masurat

* Mostra cu datele reale eSAFE (citite public, generata cu chiar codul din depozit): 3.941 de produse active, 3.707 in
  feed, 234 lasate afara (fara poza), 519 epuizate („NO”), 21 cu livrare gratuita, 4,60 MB, XML bine format, niciun
  camp obligatoriu gol, identificatori unici. Exemplu: „400 Long”, 97,29 lei fara TVA in magazin, 117,72 in feed.
* Ruta, pe serverul local cu baza demo: 200, `application/xml`, 60 de produse; magazin inexistent: 404.
* Feedul Meta al aceluiasi magazin are 111 MB necomprimat si raspunde in 7 secunde, deci marimea nu e o piedica.

## Ce NU face inca

* **Pagina din panou nu a fost vazuta cu o sesiune adevarata** inainte de livrare: e scrisa din aceleasi piese ca
  pagina catalogului Meta si pazita de probe, dar prima deschidere reala e a proprietarului.
* **`Attributes`** (caracteristicile produsului) si celelalte campuri optionale: formatul lor exact e in Centrul de
  clienti, necitit.
* **Dovada de la Compari:** feedul nu a fost inca incarcat in contul unui comerciant; primul raport de procesare al lor
  e proba adevarata a numelor de elemente.

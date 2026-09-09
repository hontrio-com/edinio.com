# Documentația oficială Pepita, păstrată în repo

## ⚠ CITEȘTE ÎNTÂI: fișierul din care s-a pornit era VECHI, și eu am construit un argument pe el

Pe 08.09.2026 un audit extern a susținut că API-ul Pepita are `package_label` (eticheta PDF în
Base64), `gls_parcellocker` și `gls_xxl`. Am verificat în copia descărcată în aceeași zi, n-am găsit
niciuna dintre ele, și am scris aici, negru pe alb, că **„niciuna dintre cele trei nu apare în
documentație"**.

**Afirmația aceea era falsă. Auditorul avea dreptate pe toate trei.**

Ce s-a întâmplat: copia pe care am salvat-o **nu era fișierul lor**. Metadatele o spun fără drept
de apel:

| | copia veche | fișierul oficial |
|---|---|---|
| autor | *(gol)* | `Pepita` |
| producer | `Skia/PDF m135 Google Docs Renderer` | `Microsoft Word 2019` |
| creat | *(gol)* | `2025-08-04 14:01` |
| pagini | 3 | 4 |
| octeți | 133.874 | 208.575 |

Adică o **reimprimare prin Google Docs a unei versiuni anterioare**, nu documentul servit azi de ei.
De aceea a putut fi descărcată pe 08.09.2026 și totuși să fie învechită, iar căutarea cu `grep` să
dea onest zero potriviri.

⚠ **Lecția, ca să nu se repete:** o copie locală nu e o dovadă decât dacă știi **de unde** a venit.
Verifică metadatele PDF-ului (`author`, `producer`, `creationDate`) și păstrează **URL-ul** de la
care a fost luat. O căutare cu `grep` într-un fișier greșit dă un răspuns curat și fals, iar un
răspuns curat și fals e mai rău decât „nu știu": pe el se poate clădi un refuz.

## De unde se ia versiunea oficială

Pagina lor: <https://sellercenter.pepita.com/en/pepita-api-automatic-order-forwarding/>

PDF-urile, cu link direct (verificate 08.09.2026, HTTP 200, `application/pdf`):

- engleză: <https://sellercenter.pepita.com/wp-content/uploads/2025/02/Automatic-order-forwarding-via-API-call-4.pdf>
- maghiară: <https://sellercenter.pepita.com/wp-content/uploads/2025/02/Automatikus-rendeles-tovabbitas-API-hivason-keresztul-4.pdf>

## Ce e fiecare fișier

| Fișier | Ce e |
|---|---|
| `order-forwarding-2026-09-08-OFICIAL.pdf` | **Documentul lor, cel actual.** Descărcat de la URL-ul de mai sus. md5 `1049dee40aacf7215c0ceb12c08fb761` |
| `order-forwarding-2026-09-08-OFICIAL.txt` | Textul extras din el, ca să se poată căuta cu `grep` |
| `order-forwarding-2026-09-08.pdf` | ⚠ **Copia VECHE**, reimprimarea Google Docs. Se păstrează dinadins: diferența dintre ele e chiar lucrul care ne-a costat |
| `order-forwarding-2026-09-08.txt` | Textul ei |
| `xml-format-2026-09-08.txt` | Pagina lor despre formatul feedului XML (`Pepita.hu - XML ismertető`), în maghiară |

Când se descarcă o versiune nouă, se adaugă **cu data ei și cu URL-ul scris aici**, nu se
suprascrie cea veche.

## Cele TREI deosebiri, și numai trei

Comparate cuvânt cu cuvânt (similaritate 0,9843), cele două versiuni diferă exact prin ce reclama
auditul, și prin nimic altceva:

1. **`gls_parcelshop` a fost ÎNLOCUIT cu `gls_parcellocker`**, pe aceeași poziție și cu aceeași
   descriere („GLS parcel box delivery"). ⚠ Nu adăugat pe lângă: **înlocuit**. Deci lista actuală
   are **cinci** valori, nu șase, iar `gls_parcelshop` nu mai apare nicăieri în documentația lor.
   Numele maghiar confirmă ce era de la început: `csomagautomata`, adică automat de colet.
2. **`gls_xxl` a fost adăugat**: „Delivery via GLS XXL courier".
3. **`package_label` a fost adăugat**, și în definiția câmpurilor, și în exemplul JSON:

   > `"package_label": Base64 encoded content of the pdf package label`

   Maghiară: `"package_label": A pdf csomagcímke base64-be kódolt tartalma`.

## Lista actuală de `delivery_mod`, verbatim

```
- shipping: The default value for an order
- gls: Delivery via GLS courier
- gls_parcellocker: GLS parcel box delivery
- gls_xxl: Delivery via GLS XXL courier
- mpl: Delivery via MPL courier
```

⚠ Codul nostru le trata deja corect pe toate, fiindcă `esteLivrarePepita` se uită la **prefixul
`gls`**, nu la o listă închisă. Hotărârea aceea, luată din prudență când credeam că documentele se
contrazic, s-a dovedit singurul lucru care ne-a scutit de un defect real. `gls_parcelshop` rămâne
recunoscut, pentru comenzile vechi.

## Ce mai spun, în punctele care ne-au costat

- **`shipping_county`**: „only for Romanian orders". De aceea județul se cere doar la comenzile
  românești, iar lipsa lui pe alte piețe nu e o abatere.
- **`sku`**: „stock-keeping unit code of the product (given by the partner)". Deci codul se
  întoarce așa cum l-am dat noi. Pe asta se sprijină potrivirea comenzii, și tot de aceea feedul
  ține minte în `pepita_articole` ce a trimis.
- **`<Variations>` este OPȚIONAL.** Aplatizarea (fiecare combinație = un `<Product>` cu `<Id>`
  propriu) e permisă de documentația lor.
- **⚠ Și, în același paragraf:** „Ha egy termék egyszer variációsként lett átadva, azon
  változtatni nem szabad" — dacă un produs a fost predat o dată ca variațional, nu are voie să fie
  schimbat. Adică trecerea de la aplatizat la `<Variations>` nu e o hotărâre care se poate lua de
  două ori.
- ⚠ **Și de aceea nu promitem „Resend order" ca resincronizare.** Suntem pregătiți: dacă sarcina
  vine schimbată, rescriem destinatarul (`improspateazaDestinatarul`) și înlocuim eticheta când
  amprenta ei diferă (`pastreazaEticheta`). Dar asta e partea **noastră**. Pe ecran, mesajul îi
  spune comerciantului doar să corecteze la ei — nu că apăsând un buton se va sincroniza sigur.
  Un sfat care se poate să nu se țină e mai rău decât lipsa lui.
- **Răspunsul așteptat de ei** are `isError`, `responseCode` și un mesaj. Nu descrie niciun
  protocol de reîncercare: „Resend order" e un buton apăsat de om în panoul lor.
- ⚠ **Nicio limită de dimensiune** a corpului cererii nu e documentată, în nicio limbă. Nu scriu
  cât de mare poate fi `package_label`. Plafonul nostru e deci o alegere a noastră, și trebuie să
  fie destul de larg cât să încapă o etichetă, fiindcă o comandă respinsă cu 413 nu se reîncearcă
  singură.

## GTIN: trei documente ale lor, trei răspunsuri (recitit 09.09.2026)

Un audit a cerut ca produsul fără EAN să fie **oprit** din feed, citând termenii contractuali
(„the XML must contain … GTIN"). Am recitit atunci sursele. Nu spun același lucru:

| Sursa | Ce spune despre GTIN | Guvernează feedul? |
| --- | --- | --- |
| [Specificația XML](https://pepita.hu/partners/xml-format?lang=en) — cea după care e scris chiar feedul nostru | `<StructuredId>` (UPC/EAN/ISBN) = **„Ajánlott" / Recommended**, cu nota „amennyiben van, erősen ajánlott megadni". `<ProductNumber>` (MPN) tot **Recommended** | **Da** |
| [Seller Center — Feed and API connections](https://sellercenter.pepita.com/en/feed-and-api-connections/) | Obligatoriu **„(in specific categories)"** | **Da** |
| [Seller Center — Product listing and editing](https://sellercenter.pepita.com/en/product-listing-and-editing/) | Îl pune între câmpurile obligatorii ale încărcării **manuale**, iar mai jos, la importul din Excel, îl marchează **„(Optional)"** | Nu — e despre încărcarea manuală, și se contrazice singură |

**Hotărârea:** lipsa EAN-ului rămâne **avertisment**, nu eroare. Cele două documente care chiar
guvernează un feed XML spun amândouă că nu e obligatoriu peste tot; ridicat la eroare, un produs
fără cod de bare ar **dispărea tăcut** din feed, iar produsele fără EAN sunt legitime și multe
(manufactură, pachete, marcă proprie).

⚠ Ce s-a făcut în schimb: panoul **numără** produsele fără EAN (`RezumatProduse.faraEan`), ca
expunerea să se vadă. Un avertisment care se poate număra e altceva decât unul pierdut într-o
listă de mii de rânduri.

⚠ **Dacă Pepita confirmă în scris** că GTIN-ul e obligatoriu pentru fiecare ofertă din România,
hotărârea se schimbă — și atunci se schimbă deliberat. Proba care o apără e în
`src/lib/pepita/articole.test.ts` și trebuie să cadă odată cu ea.


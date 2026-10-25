# Editorul unic al magazinului

Hotarat 24.10.2026: un singur „Editeaza magazinul", pe modelul Shopify (sabloane, sectiuni,
blocuri in sectiuni, stil global) plus un strat „Avansat" strans implicit. Fara panza libera
(Elementor).

## Stare si reluare (citeste intai)

**Ultima stare, 25.10.2026:** etapa 1 facuta, comisa local si PROBATA pe ecran. Urmeaza
**etapa 2**, dupa acordul proprietarului (el vrea etapele luate pe rand, cu oprire intre ele).

**Proba vizuala a etapei 1, facuta 25.10.2026** pe `localhost:3000` (baza DEMO, contul
`onboarding-proba-cf99b5@edinio-demo.test`, magazinul `floraria-mirei`; data abonamentului mutata
o zi si pusa la loc, ca in memoria `proba-in-browser-pe-baza-demo`):
- Setari > General: sloganul si linkul de Instagram (scris fara `https://`) s-au salvat, au ramas
  la reincarcare, linkul a primit `https://`; in magazin: descrierea paginii = sloganul, iconita de
  Instagram, butonul WhatsApp dupa bifa „acelasi numar". `store_name` a ramas NULL.
- Setari > Formular de comanda: un camp si o extraoptiune de 12,50 lei; in formularul din cos
  apar amandoua, iar bifa duce totalul de la 166,90 la 179,40 lei (comanda NU s-a trimis).
- Setari > Catalog: „Ascunde produsele fara imagini" scoate singurul produs din magazin.
- `/dashboard/editor`: panourile mutate lipsesc; cele trei trimiteri deschid filele din Setari.
- Telefon (cadru de 390 px): General si Formular de comanda fara depasire orizontala.
- Valorile de proba puse la loc in baza DEMO (starea de dinainte, citita intai).

Ce a gasit proba si recitirea codului, reparat tot pe 25.10:
1. Comutatorul „Email" arata OPRIT cand reglajul lipsea, iar magazinul arata campul (implicitul
   lui e pornit, optional). Mostenit din editorul vechi. Acum Setarile citesc ca magazinul; o
   proba aduna fiecare citire a lui `email_field` si cere un singur implicit; ghidul de ajutor
   spunea si el „oprit din start".
2. `updatePageContent` nu revalida `/dashboard/settings`. Filele Formular si Catalog isi iau
   valorile din pagina cand le redeschizi; azi merge doar fiindca Next reface dupa o actiune
   orice pagina, purtare numita temporara in documentatia lui `revalidatePath`.

⚠ La proba in Chrome: un clic dat imediat dupa incarcare (inainte de hidratare) nu face nimic si
nu da eroare. Dupa fiecare clic se citeste starea (`aria-checked`, baza), nu se presupune.

**Cum se reia:** `git checkout editor-magazin` in `edinio/`, citeste fisierul asta si
`REGISTRU.md`, apoi memoria `editor-magazin-unic`. Nimic nu se impinge, nimic nu atinge productia.

## Deciziile proprietarului

- 24.10.2026: „Mergem pe stilul celor de la Shopify plus un strat avansat."
- 24.10.2026: tot pe o ramura separata, local, productia neatinsa pana la final.
- 24.10.2026: „Incepe cu etapa 1, le luam pe rand pana finalizam tot."
- **INTREBARE DESCHISA, nepusa inca la vot:** teme intregi („alege un stil de magazin" la
  inceput, care aseaza toate sectiunile deodata) sau doar sectiuni alese una cate una? De pus
  inainte de etapa 4.

## De ce Shopify si nu Elementor

- Elementor (panza libera, orice element oriunde) e facut pentru designeri. Comerciantii fac cu el
  magazine stricate pe telefon, lente, cu logica de comert (pret, variante, cos) fragila, si
  tichete de suport „mi s-a stricat pagina".
- Shopify (Online Store 2.0): pagina -> sectiuni -> blocuri in sectiuni, plus setari globale de
  tema. Libertate mare, dar intre margini: telefonul nu se poate strica, spatierile sunt pe o
  scara, pretul ramane legat de logica. E modelul pe care comerciantii il stiu deja.
- „Absolut tot customizabil" si „foarte simplu" se bat cap in cap daca stau pe acelasi nivel. Se
  impaca pe STRATURI, fiecare ascuns pana e nevoie de el:
  1. Tema / stil global: culori, fonturi, butoane, colturi (exista: `StoreStyle`).
  2. Sectiuni: adaugi, ordonezi, ascunzi, alegi un design (variantele devin puncte de pornire).
  3. Blocuri in sectiune: titlu, text, buton, imagine, pret; muti, ascunzi, setezi.
  4. „Avansat", strans implicit: spatieri, fundal, animatii, ascuns pe mobil, CSS/HTML.
  90% din oameni raman la 1-2.

## Ce NU facem

- Pozitionare libera prin tragere.
- Layout de telefon editat separat: telefonul se face singur, cel mult „ascuns pe mobil".
- Checkoutul editabil vizual: doar culori si cateva texte. Acolo sunt banii, TVA-ul, rambursul.
- Setari de business in editorul vizual (etapa 1 le-a scos).

## Interfata tinta (etapa 2)

- **Bara de sus:** „Editezi: Pagina de produs ▾" (alegi pagina), desktop / telefon, anuleaza /
  refa, Salveaza / Publica, starea publicarii (comutatorul „Publicare" de azi ajunge aici).
- **Stanga:** arborele de sectiuni si blocuri, „+ Adauga sectiune" (galerie cu miniaturi, exista
  `VariantCard`). La clic pe un element, setarile lui intra in acelasi panou.
- **Dreapta:** previzualizarea live (exista `RamaPreview` + protocolul `postMessage`).
- Mai tarziu: clic pe element in previzualizare il selecteaza in arbore (etapa 3); istoric de
  versiuni, „revino la ce era ieri" (etapa 7), plasa de siguranta pentru cei care se tem sa
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
  Lista de activare din panou trimite la `/dashboard/editor` pentru „Personalizeaza" si „Publica".

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

### Panourile din „Editeaza magazinul", clasificate

D = design (merge in editorul nou) · C = continut (devine bloc/setare de sectiune) ·
S = setare de business (se muta in Setari, nu e design)

| Panou | Ce contine | Unde ajunge |
|---|---|---|
| Informatii generale | nume, slogan, descriere, telefon, WhatsApp, email | S (Setari > Magazin); sloganul/descrierea se pot afisa prin blocuri |
| Identitate vizuala | logo, favicon, culoare, fundal, fonturi, marime logo, bannere hero, efect buton | D (stil global + sectiunea Hero) |
| Social media | linkuri | S, afisate de blocul „Social" din subsol |
| Pagina produs | insigne de incredere, beneficii, „cum functioneaza", FAQ, recenzii, zoom, livrare estimata, bara lipicioasa, interval de pret, insigna „Nou" | C: blocuri ale sablonului Produs |
| Pagina principala | bara de anunt, ordinea produselor, sortare, filtre, beneficii, recenzii, FAQ, insigne subsol, ascunderi de produse | D/C pentru sectiuni; regulile de catalog (ascunde fara poze/stoc, categorii goale, sortarea implicita) = S (Setari > Catalog) |
| Sectiuni produse | `product_sections` (sectiuni pe produs/categorie) | C: blocuri ale sablonului Produs, cu conditie pe categorie |
| Formular de comanda | campuri proprii, extraoptiuni cu pret, campuri ascunse, email, cod postal, firma, cod discount | **S** (Setari > Comanda). Atinge banii: NU intra in editorul vizual |
| Publicare | magazin publicat/nepublicat, adresa | bara de sus a editorului nou |

### Ce face pagina de produs „needitabila"

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
      Setari de baza  +  „Avansat" (spatieri, fundal, animatie, ascuns pe mobil, CSS)
```

Needitabil vizual: checkoutul (doar culori si cateva texte), calculele de pret, TVA, ramburs.

## Etapele

1. **Inventar + mutarea setarilor de business in Setari** (Comanda, Catalog, Magazin, Social).
   FACUT 24.10.2026: Setari > General (magazinul, contactul, adresa, butoanele flotante,
   retelele, datele firmei, un singur buton), Setari > Formular de comanda, Setari > Catalog.
   Editorul are trimiteri spre ele. Fara migratii. Detalii si ce se verifica: `REGISTRU.md`.
2. **Un singur ecran**: `/dashboard/editor` cu bara de sus (alegi pagina, desktop/mobil,
   anuleaza/refa, Salveaza/Publica), stanga arborele, dreapta previzualizarea. La inceput
   gazduieste editoarele existente.
3. **Click in previzualizare**: `data-sectiune` / `data-bloc`, contur la hover, selectie la clic.
4. **Blocuri in sectiuni**; pagina de produs sparta in blocuri cu context comun; sabloane de
   produs multiple.
5. **Paginile** pe acelasi model; convertor din `custom_pages` (blocurile PageBuilder devin
   blocuri intr-o sectiune „Continut liber").
6. **Retragerea `page_content`** ca sursa de design. Pana atunci parserul deriva modelul nou din
   cel vechi la citire (ca `{}` = clasic azi): zero migrare de date la lansare.
7. Istoric de versiuni (revino la o publicare anterioara).

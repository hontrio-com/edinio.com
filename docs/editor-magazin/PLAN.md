# Editorul unic al magazinului

Hotarat 24.10.2026: un singur „Editeaza magazinul", pe modelul Shopify (sabloane, sectiuni,
blocuri in sectiuni, stil global) plus un strat „Avansat" strans implicit. Fara panza libera
(Elementor).

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

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

/*
  Paza unei sectiuni (19.11.2026, auditul temelor): o sectiune care arunca la randare nu mai darama pagina magazinului.
  De ce exista si de ce e facuta asa: `PazaSectiune.tsx`.

  Granita insasi se probeaza in browser (o cadere injectata intr-o sectiune, pe build): `node --test` nu poate importa
  JSX. Aici se apara CABLAJUL, adica lucrurile care se pot strica in tacere la o refacere:
   - o sectiune randata in afara pazei (prima cadere ar lua iar toata pagina);
   - `notFound()` / `redirect()` inghitite de paza (un produs sters ar arata „Pagina nu s-a putut afisa” in loc de 404);
   - un `<Suspense>` pus in jurul sectiunilor (React 19 scoate din fluxul paginii granitele mari si le dezvaluie printr-un
     script: bannerul si grila de produse ar ajunge pe ecran pe alt drum, la toate magazinele).
*/

const cod = (cale: string) => readFileSync(cale, "utf8").replace(/\r\n/g, "\n");
const faraComentarii = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const PAZA = "src/components/storefront/PazaSectiune.tsx";

test("⚠⚠ fiecare sectiune a paginii, antetul si subsolul se randeaza in paza lor", () => {
  const s = cod("src/components/storefront/SectionRenderer.tsx");
  // `Marcata` e singurul drum pe care ajung pe ecran sectiunile de acasa SI cele fixe (`ChromeSection` o cheama).
  assert.match(
    s,
    /<MarcajSectiune sectiune=\{section\}>\s*<PazaSectiune nume=\{sectionMeta\(section\.kind\)\?\.label \?\? section\.kind\} inEditor=\{esteEditorDesign === true\}>\s*<SectionOne section=\{section\} estePrima=\{estePrima\} \/>\s*<\/PazaSectiune>\s*<\/MarcajSectiune>/,
    "sectiunea nu mai sta in `PazaSectiune` (sau paza a iesit din marcajul de editor)",
  );
  assert.match(s, /export function ChromeSection[\s\S]*?return <Marcata section=\{section\} \/>;/, "antetul si subsolul ocolesc `Marcata`, deci si paza");
  // In lista paginii, toate trec prin `Marcata`: niciun `SectionOne` pus direct.
  const lista = s.slice(s.indexOf("export function SectionRenderer"), s.indexOf("export function ChromeSection"));
  assert.ok(lista.includes("<Marcata "), "lista paginii nu mai foloseste `Marcata`");
  assert.ok(!lista.includes("<SectionOne"), "o sectiune a paginii se randeaza direct, in afara pazei");
});

test("⚠⚠ continutul paginilor fara catalog (produs, magazin, cos, pagini proprii) sta in paza, cu un mesaj pentru cumparator", () => {
  const s = cod("src/components/storefront/StorePageShell.tsx");
  assert.match(
    s,
    /<PazaSectiune nume="Conținutul paginii" inEditor=\{esteEditorDesign\} rezerva=\{<ContinutCazut acasa=\{chrome\.basePath \|\| "\/"\} \/>\}>\s*\{children\}\s*<\/PazaSectiune>/,
  );
  // Antetul si subsolul raman in AFARA pazei continutului: daca pagina cade, ele sunt drumul inapoi.
  const iAntet = s.indexOf("<ChromeSection section={design.chrome.header} />");
  const iPaza = s.indexOf("<PazaSectiune nume=\"Conținutul paginii\"");
  const iSubsol = s.indexOf("<ChromeSection section={design.chrome.footer} />");
  assert.ok(iAntet > 0 && iAntet < iPaza && iPaza < iSubsol, "ordinea antet / continut pazit / subsol s-a stricat");
});

test("⚠⚠ paza e granita lui Next (`catchError`): lasa sa treaca 404-ul si redirectarile, se sterge la navigare, raporteaza restul", () => {
  const s = faraComentarii(cod(PAZA));
  /*
    `catchError` (stabil din Next 16.3) arunca mai departe erorile de rutare ale lui Next, sterge starea de cadere cand
    se schimba calea si lasa robotilor HTML-ul de pe server. O clasa scrisa de mana le-ar pierde pe toate trei in tacere:
    de-aia proba refuza `getDerivedStateFromError` aici.
  */
  assert.match(s, /import \{ catchError, type ErrorInfo \} from "next\/error";/);
  assert.match(s, /export const PazaSectiune = catchError\(function PazaSectiune\(proprietati: Proprietati, \{ error, retry \}: ErrorInfo\) \{\s*return <SectiuneCazuta \{\.\.\.proprietati\} eroare=\{error\} reincearca=\{retry\} \/>;\s*\}\);/);
  assert.doesNotMatch(s, /getDerivedStateFromError|componentDidCatch|extends Component/, "paza a redevenit o granita scrisa de mana");
  // Raportul pleaca dintr-un efect, cu numele sectiunii.
  assert.match(s, /useEffect\(\(\) => \{\s*raporteazaEroarea\(eroare instanceof Error \? eroare : new Error\(String\(eroare\)\), \{ sectiune: nume \}\);\s*\}, \[eroare, nume\]\);/);
  // Pe magazinul public: nimic (sau rezerva data); caseta cu explicatia doar in editor.
  assert.match(s, /if \(!inEditor\) return rezerva \?\? null;/);
});

test("⚠ fara `<Suspense>` in jurul sectiunilor: ar schimba felul in care se trimite pagina", () => {
  for (const f of [PAZA, "src/components/storefront/SectionRenderer.tsx", "src/components/storefront/StorePageShell.tsx"]) {
    assert.doesNotMatch(faraComentarii(cod(f)), /<Suspense|\bSuspense\b/, `${f} foloseste Suspense`);
  }
});

test("pagina de magazin are granita ei de eroare, cu drum inapoi in magazin si fara clase de panou", () => {
  const f = "src/app/(public)/[slug]/error.tsx";
  assert.ok(existsSync(f), "lipseste `error.tsx` al magazinului: o cadere pe server arata „500”-ul platformei");
  const s = cod(f);
  assert.match(s, /^"use client";/);
  assert.match(s, /raporteazaEroarea\(error\);/);
  assert.match(s, /onClick=\{reset\}/);
  assert.match(s, /<a href=\{acasa\}/);
  // Text de vitrina: fara diacritice in ce vede cumparatorul.
  const vizibil = [...faraComentarii(s).matchAll(/>([^<>{}]+)</g)].map((m) => m[1]).join(" ");
  assert.doesNotMatch(vizibil, /[ăâîșțĂÂÎȘȚ]/, "textul paginii de eroare a magazinului are diacritice");
  // Si mesajul din paza continutului (`ContinutCazut`, ce vede cumparatorul; caseta din editor e a panoului, cu diacritice).
  const paza = faraComentarii(cod(PAZA));
  const pentruCumparator = paza.slice(paza.indexOf("export function ContinutCazut"));
  assert.ok(pentruCumparator.startsWith("export function ContinutCazut"), "`ContinutCazut` a disparut din paza");
  const vizibilPaza = [...pentruCumparator.matchAll(/<(?:p|button|a)[^>]*>\s*([^<>{}]+?)\s*<\/(?:p|button|a)>/g)].map((m) => m[1]).join(" ");
  assert.ok(vizibilPaza.includes("Pagina nu s-a putut afisa"));
  assert.doesNotMatch(vizibilPaza, /[ăâîșțĂÂÎȘȚ]/, "mesajul pentru cumparator are diacritice");
});

/*
  404-ul magazinului (19.11.2026, gasit de auditul temelor pe toate cele 30 de teme): pagina afla magazinul dupa gazda,
  deci doar pe domeniu propriu. Pe adresa cu slug butonul ducea la `/`, pe site-ul platformei, in culoarea platformei,
  cu text alb la 2,4:1, iar pagina nu avea `<main>`.
*/
test("⚠⚠ 404-ul si eroarea magazinului isi iau prima pagina de la layout, nu din `/`", () => {
  const layout = cod("src/app/(public)/[slug]/layout.tsx");
  // Layoutul stie daca adresele poarta slugul (`basePath`) si are randul magazinului: le da mai departe copiilor.
  assert.match(
    layout,
    /<IdentitateMagazinProvider valoare=\{\{ nume: business \? storeName : null, culoare: color, culoareText: contrastOn\(color\), acasa: basePath \|\| "\/", [^}]*\}\}>\s*\{children\}\s*<\/IdentitateMagazinProvider>/,
    "layoutul magazinului nu mai da identitatea lui paginilor de 404 si de eroare",
  );
  assert.match(layout, /const basePath = adreseFaraSlug\(host, \{ slug, custom_domain: customDomain \}\) \? "" : `\/\$\{slug\}`;/);

  const negasita = faraComentarii(cod("src/app/(public)/[slug]/not-found.tsx"));
  assert.match(negasita, /const \{ nume, culoare, culoareText, acasa \} = useIdentitateMagazin\(\);/);
  /* `<a>`, nu `<Link>` (25.11.2026): pagina apare si pe adrese din zona de cont, de unde se iese prin incarcare completa. */
  assert.match(negasita, /<a href=\{acasa\}/, "butonul 404-ului nu mai duce la prima pagina a magazinului");
  assert.doesNotMatch(negasita, /href="\/"/, "404-ul magazinului trimite iar la radacina (site-ul platformei, pe adresa cu slug)");
  assert.doesNotMatch(negasita, /createAdminClient|headers\(\)/, "404-ul interogheaza iar baza dupa gazda");
  // Accesibilitate: reper `main`, textul butonului in culoarea care se citeste pe fondul lui.
  assert.match(negasita, /<main /);
  assert.match(negasita, /style=\{\{ backgroundColor: culoare, color: culoareText \}\}/);
  assert.doesNotMatch(negasita, /text-white/, "butonul scrie iar alb pe orice culoare");
  const vizibil = [...negasita.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]).join(" ") + [...negasita.matchAll(/[`"]([^`"]*Adresa pe care[^`"]*)[`"]/g)].map((m) => m[1]).join(" ");
  assert.ok(vizibil.includes("Pagina nu a fost gasita") && vizibil.includes("Inapoi in magazin"));
  assert.doesNotMatch(vizibil, /[ăâîșțĂÂÎȘȚ]/, "textul 404-ului are diacritice");

  assert.match(faraComentarii(cod("src/app/(public)/[slug]/error.tsx")), /const \{ acasa \} = useIdentitateMagazin\(\);/);
});

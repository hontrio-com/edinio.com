import "../../globals.css";

/**
 * Foaia de stil a magazinului, pentru miniaturile din galeria de design-uri.
 *
 * ═══ DE CE EXISTĂ FIȘIERUL ĂSTA ═══
 *
 * Ruta `/preview-sectiune/[slug]` stă DELIBERAT în afara lui `[slug]`, nu sub
 * el: layout-ul magazinului injectează pixelii de marketing și bannerul de
 * cookies, iar bannerul acoperea miniaturile și fiecare card ar fi trimis câte
 * un pageview în Facebook, TikTok și Google Analytics ale comerciantului. Vezi
 * nota întreagă din `preview-sectiune/[slug]/page.tsx`.
 *
 * ⚠ DAR TOT DE ACOLO VENEA ȘI CSS-UL. `(public)/[slug]/layout.tsx` importă
 * `globals.css`; ruta asta îi e SORĂ, nu fiică, deci nu-l moștenea. Iar rădăcina
 * nu importă nicio foaie dinadins (vezi nota din `app/layout.tsx`): fiecare grup
 * și-o aduce pe a lui, ca site-ul de prezentare să nu care utilitarele panoului.
 *
 * Urmarea, măsurată în producție pe 04.09.2026: pagina de previzualizare încărca
 * 65 de reguli CSS în total, iar `.flex`, `.items-center`, `.h-16` și `.gap-2`
 * lipseau cu totul. Headerul avea `display: block` în loc de `flex`, deci
 * butoanele se așezau unul sub altul: un cap de magazin de 64px raporta 1356px
 * înălțime, iar cardul din galerie se întindea la peste 900px. Nimic nu cădea —
 * pagina răspundea 200, cu markup corect și clase corecte, doar fără foaia care
 * le dă înțeles.
 *
 * ⚠ NU S-A REZOLVAT MUTÂND RUTA ÎNAPOI SUB `[slug]`. Aia ar fi adus CSS-ul, dar
 * și cele două lucruri pentru care a fost scoasă de acolo. Un layout propriu ia
 * exact ce lipsea, și nimic altceva.
 *
 * ⚠ Layout-ul nu desenează NIMIC — întoarce chiar `children`. Un `<div>` în plus
 * ar fi intrat între `<body>` și secțiune, iar înălțimea pe care miniatura o
 * raportează prin `postMessage` se măsoară tocmai pe elementele alea.
 */
export default function LayoutPreviewSectiune({ children }: { children: React.ReactNode }) {
  return children;
}

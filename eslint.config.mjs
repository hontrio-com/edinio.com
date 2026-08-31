import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      /*
        ═══════════════════════════════════════════════════════════════════════
        JSX SCRIS ÎN AFARA LUI `return` — COMPILEAZĂ ȘI NU AJUNGE NICĂIERI
        ═══════════════════════════════════════════════════════════════════════

        ⚠ PORNITĂ PE 31.08.2026, DUPĂ CE DEFECTUL A TRĂIT ÎN PRODUCȚIE. Toate
        patru paginile legale aveau forma asta:

            export default function CookiesPage() {
              {jsonLd ? <script type="application/ld+json" … /> : null}
              return <PaginaLegal doc={COOKIES} />;
            }

        `{…}` la început de instrucțiune e un BLOC, iar JSX-ul dinăuntru e o
        expresie care se evaluează și se aruncă. Nimic nu se plânge: `tsc` trece,
        build-ul trece, pagina se randează frumos. Doar că datele structurate
        nu ajung niciodată în ea.

        Dovada, luată de pe edinio.com înainte de reparație:

            /cookies /termeni /gdpr /confidentialitate → 2 blocuri ld+json
            /preturi /despre                           → 6 blocuri ld+json

        Cele două erau Organization + WebSite, emise de aspectul comun. `WebPage`
        și `BreadcrumbList` ale fiecărei pagini lipseau cu totul, de luni de zile.

        ⚠ REGULA A FOST CONFRUNTATĂ CU DEFECTUL: forma stricată pusă la loc într-un
        fișier dă „Expected an assignment or function call and instead saw an
        expression". Costul de pornire azi: ZERO încălcări în tot `src/`.

        ⚠ REGULA NU LIPSEA. `eslint-config-next` o dădea deja — pe severitatea 1,
        AVERTISMENT. Verificat cu `eslint --print-config`: fără rândul de mai jos
        iese `[1, {...}]`, cu el iese `[2, {...}]`.

        Asta e chiar explicația pentru care defectul a trăit luni de zile: era
        RAPORTAT tot timpul, ca al 125-lea avertisment dintr-o listă pe care n-o
        citește nimeni. Deci ce se schimbă aici nu e „se vede sau nu", ci „oprește
        sau nu". Un avertisment într-un `lint` deja roșu e egal cu tăcere.
      */
      "@typescript-eslint/no-unused-expressions": "error",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

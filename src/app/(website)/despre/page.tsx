import type { Metadata } from "next";
import { PageHero } from "@/components/website/PageHero";
import { FinalCta } from "@/components/website/sections/FinalCta";
import { ACASA, type Firimitura } from "@/lib/website/breadcrumbs";
import {
  DESPRE_LEAD,
  DESPRE_TITLU,
  DIFERENTE,
  DIFERENTE_TITLU,
  POVESTE,
  POVESTE_TITLU,
} from "@/lib/website/despre";
import { siteMetadata } from "@/lib/website/metadata";
import { jsonLdSafe } from "@/lib/json-ld";
import { paginaSiteJsonLd } from "@/lib/website-jsonld";

/**
 * Despre Edinio.
 *
 * ═══ ⚠ PAGINA ASTA ERA ÎN AFARA SISTEMULUI DE DESIGN ═══
 *
 * Auditul din 23.08 a strâns pe ea 25 de constatări, mai multe decât pe orice
 * alt fișier al site-ului, și patru dovezi care spun toate același lucru:
 *
 * 1. **Containerele porneau la 256px** de marginea stângă (`max-w-6xl` centrat),
 *    când toate celelalte pagini pornesc la ~37px. Linia verticală a site-ului
 *    se rupea vizibil la intrarea pe pagină. Erau, de altfel, TREI containere
 *    diferite pe aceeași pagină: `max-w-6xl`, `max-w-3xl`, `max-w-5xl`.
 * 2. **Scara Tailwind în loc de pixeli.** `text-4xl`, `text-lg`, `text-2xl`,
 *    `text-sm` — nouă folosiri, zero valori în pixeli. Restul site-ului e
 *    invers: 424 de valori în pixeli la 48 din scara presetată.
 * 3. **Tokenii vechi**: `text-foreground`, `text-muted-foreground`,
 *    `border-border`, `bg-card`, `rounded-xl`, niciunul folosit altundeva.
 * 4. **Niciun diacritic**, în tot fișierul. Singura pagină a site-ului fără.
 *
 * Nu folosea nimic comun: nici `PageHero`, nici `FinalCta`, nici
 * `siteMetadata()`. Titlul ieșea 48px cu interlinia 1,00, adică o a patra
 * treaptă de `<h1>`, în nicio familie.
 *
 * ═══ CE S-A ÎNLOCUIT, PE RÂND ═══
 *
 * **Capul de pagină** → `PageHero`. Aduce firimiturile, datele structurate
 * `BreadcrumbList` și treapta mică de titlu, aceeași ca pe `/preturi` și
 * `/contact`.
 *
 * **Cele patru carduri cu iconiță în pătrat verde** → o singură placă cu patru
 * celule. Tiparul „iconiță într-un pătrat colorat, titlu, descriere" e primul
 * din lista de tipare tăiate de client, iar aici era în forma lui cea mai
 * curată: patru carduri fără nicio destinație, adică patru afirmații deghizate
 * în navigare. Vezi `BandaContact.tsx`, unde e scris pe larg de ce o placă cu
 * celule spune același lucru fără să pară un meniu.
 *
 * ⚠ Fără iconițe deloc. Pe `BandaContact` pictograma dublează o etichetă pe care
 * o recunoști („Telefon"); aici ar fi trebuit să deseneze „Simplu de folosit",
 * ceea ce nu se poate face fără o pictogramă care nu spune nimic.
 *
 * **Secțiunea verde plină de la final** → `FinalCta`. ⚠ E aceeași greșeală care
 * fusese deja scoasă de pe `/preturi` — vezi nota de acolo: o bandă `bg-primary`
 * cu text alb și un buton alb înăuntru. Rămăsese doar aici.
 *
 * ⚠ TEXTUL S-A CORECTAT ÎN TREI LOCURI, și nu e cosmetică: pagina promitea un
 * „plan gratuit generos" care nu există. Motivele, scrise pe larg în
 * `lib/website/despre.ts`.
 */

const FIRIMITURI: Firimitura[] = [ACASA, { label: DESPRE_TITLU }];

export const metadata: Metadata = siteMetadata({
  title: "Despre noi",
  description:
    "Edinio face comertul online accesibil oricarei afaceri din Romania. Cine suntem, de ce am construit platforma si ce ne diferentiaza.",
  path: "/despre",
});

// `AboutPage` + `about` catre nodul de organizatie: semnalul „pagina ASTA
// descrie firma", care consolideaza entitatea de brand in cautare.
const jsonLd = paginaSiteJsonLd({
  cale: "despre",
  nume: "Despre noi",
  descriere: metadata.description as string,
  tip: "AboutPage",
  despreFirma: true,
});

export default function DesprePage() {
  return (
    <>
      {jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdSafe(jsonLd) }} /> : null}
      <PageHero sir={FIRIMITURI} title={DESPRE_TITLU} lead={DESPRE_LEAD} />

      <section className="bg-white py-14 lg:py-20">
        <div className="mx-auto max-w-[1200px] px-5 sm:px-6 lg:px-8">
          {/* Coloană îngustă pentru textul curgător: 1200px de proză nu se
              citește. E aceeași măsură ca la documentele legale. */}
          <div className="max-w-[720px]">
            <h2 className="text-[26px] font-bold leading-[1.15] tracking-[-0.02em] text-ink sm:text-[32px]">
              {POVESTE_TITLU}
            </h2>
            {POVESTE.map((paragraf) => (
              <p
                key={paragraf.slice(0, 40)}
                className="mt-5 text-[16px] leading-[1.7] text-ink-2 sm:text-[17px]"
              >
                {paragraf}
              </p>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-hairline bg-tint py-14 lg:py-20">
        <div className="mx-auto max-w-[1200px] px-5 sm:px-6 lg:px-8">
          <h2 className="max-w-[720px] text-[26px] font-bold leading-[1.15] tracking-[-0.02em] text-ink sm:text-[32px]">
            {DIFERENTE_TITLU}
          </h2>

          {/*
            O PLACĂ CU PATRU CELULE, nu patru carduri. Vezi nota de sus și
            comentariul din `BandaContact.tsx`.

            `overflow-hidden` ține colțurile rotunjite peste celulele dinăuntru.
            Liniile despărțitoare stau pe copil, nu ca `divide-*` pe părinte:
            `divide-` cu o culoare din temă a ieșit deja transparentă o dată în
            proiectul ăsta.
          */}
          <div className="placa mt-8 overflow-hidden rounded-[16px]">
            <div className="grid sm:grid-cols-2">
              {DIFERENTE.map((d, i) => (
                <div
                  key={d.titlu}
                  className={[
                    "px-6 py-6 sm:px-7 sm:py-7",
                    /* Pe telefon totul e pe o coloană, deci linia e DEASUPRA,
                       fără prima. De la `sm` sunt două coloane: linia de sus
                       lipsește la primele două, iar cea din stânga cade pe
                       celulele impare. */
                    i > 0 ? "border-t border-hairline" : "",
                    i === 1 ? "sm:border-t-0" : "",
                    i % 2 === 1 ? "sm:border-l sm:border-l-hairline" : "",
                  ].join(" ")}
                >
                  <h3 className="text-[17px] font-bold tracking-[-0.01em] text-ink">
                    {d.titlu}
                  </h3>
                  <p className="mt-2 text-[15px] leading-[1.6] text-ink-2">{d.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <FinalCta />
    </>
  );
}

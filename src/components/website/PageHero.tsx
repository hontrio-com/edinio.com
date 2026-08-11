import { Breadcrumbs } from "./Breadcrumbs";
import { firimituriJsonLd, type Firimitura } from "@/lib/website/breadcrumbs";

/**
 * Capul SCURT al paginilor de conținut: unde ești, cum se cheamă pagina, o
 * frază. Atât.
 *
 * ═══ NU E `PageShell`, ȘI DIFERENȚA E DE ROL ═══
 *
 * `PageShell` e capul paginilor care VÂND: titlu de 52px, două butoane, rândul
 * de garanții. Are sens pe „Magazin online" sau „Curieri", unde omul tocmai a
 * dat clic dintr-un meniu și trebuie convins.
 *
 * Aici omul a venit cu o întrebare. Un buton „Începe gratuit" între el și
 * răspuns e în drum. Deci: firimituri, titlu, frază, linie — și conținutul
 * începe imediat.
 *
 * ═══ DE CE NU ARE NICIUN ORNAMENT ═══
 *
 * Fără lumină verde, fără pastilă în față, fără fundal colorat. Pagina de start
 * are `HeroMesh` fiindcă e primul ecran al site-ului; repetat pe fiecare pagină
 * interioară, efectul devine tapet, iar un cap de pagină care strigă mai tare
 * decât conținutul de sub el e exact tiparul pe care clientul l-a tăiat de
 * fiecare dată (vezi regulile de gust din notițe). Ce ține capul ăsta legat de
 * restul site-ului e tipografia și linia de jos, nu o podoabă.
 *
 * Fundal alb, ca tot site-ul. Vezi „Fundal ALB peste tot".
 *
 * ═══ FIRIMITURILE ȘI DATELE STRUCTURATE VIN DIN ACELAȘI ȘIR ═══
 *
 * Blocul `BreadcrumbList` se construiește AICI, din chiar lista care se
 * desenează. Nu se poate întâmpla ca pagina să arate un drum și Google să
 * primească altul — aceeași lecție ca la `intrebariStructurate()` din `faq.ts`,
 * unde a doua copie scrisă de mână ar fi rămas în urmă la prima corectură.
 */
export function PageHero({
  sir,
  title,
  lead,
}: {
  /** Drumul până aici. Ultima intrare e pagina curentă și n-are `href`. */
  sir: Firimitura[];
  title: string;
  /** O frază, nu un paragraf. Se poate omite când titlul spune tot. */
  lead?: string;
}) {
  return (
    <section className="border-b border-hairline bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: firimituriJsonLd(sir) }}
      />

      {/* Același container ca restul site-ului: 1200 și aceleași margini. */}
      <div className="mx-auto max-w-[1200px] px-5 pt-8 pb-10 sm:px-6 lg:px-8 lg:pt-10 lg:pb-14">
        <Breadcrumbs sir={sir} />

        {/*
          34/44px, nu 38/52 ca în `PageShell`. E tot un `<h1>`, dar aici sub el
          urmează conținut, nu o pagină de prezentare: la 52px titlul ar cântări
          cât întreaga listă de dedesubt.
        */}
        <h1 className="mt-4 text-[34px] font-bold leading-[1.08] tracking-[-0.03em] text-ink sm:text-[44px]">
          {title}
        </h1>

        {lead ? (
          <p className="mt-4 max-w-[620px] text-[16px] leading-[1.6] text-ink-2 sm:text-[18px]">
            {lead}
          </p>
        ) : null}
      </div>
    </section>
  );
}

import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { FOOTER_COLUMNS, SOCIAL_LINKS, type FooterLink } from "@/lib/website/footer";

/**
 * Subsolul site-ului de prezentare.
 *
 * ═══ ALB, CA TOT RESTUL ═══
 *
 * ⚠ Era pe fundal închis (`bg-foreground`), singurul lucru rămas așa de când
 * banda de final a trecut pe alb. Regula site-ului e „fundal ALB peste tot", iar
 * cererea a fost „refăcut în design-ul nostru" — deci alb, cu o linie subțire
 * sus care îl desparte de secțiunea de deasupra.
 *
 * E o schimbare vizibilă și se întoarce dintr-o clasă, dacă preferă închis.
 *
 * ═══ CE S-A SCOS ═══
 *
 * Datele firmei (denumire, CUI, sediu). Cerute afară, fiindcă apar oricum în
 * Politici — verificat că e adevărat: sunt în `/termeni` și
 * `/confidentialitate`. Vezi nota din `lib/website/footer.ts`.
 *
 * Insignele ANPC rămân: sunt obligatorii și n-au unde altundeva să stea.
 *
 * ═══ SIGLELE SOCIALE SUNT GRI PÂNĂ LA HOVER ═══
 *
 * În culorile lor, cele trei ar fi cel mai colorat lucru de pe o pagină pe care
 * clientul a cerut, la harta din CTA, „mai subtil". Gri implicit, culoare la
 * hover: mărcile nu se modifică permanent, iar subsolul rămâne liniștit.
 */
export function Footer() {
  return (
    <footer className="border-t border-hairline bg-white">
      <div className="mx-auto max-w-[1200px] px-5 py-14 sm:px-6 lg:px-8 lg:py-16">
        {/*
          ⚠ Coloanele NU sunt egale, și nu din estetică.

          Etichetele au lungimi foarte diferite: „Integrare curieri" are 17
          caractere, „Email: contact@edinio.com" are 25. Cu coloane egale, cele
          lungi s-ar rupe pe două rânduri la fiecare intrare, iar Platformă ar sta
          pe jumătate goală. Fracțiile sunt calculate din lățimea reală a celui
          mai lung text din fiecare coloană, MĂSURATĂ în browser — prima încercare
          dăduse coloanei Contact 147px, iar „Email: contact@edinio.com" (158px)
          se rupea pe două rânduri.

          ⚠ ERAU CINCI FRACȚII PÂNĂ PE 04.09.2026: `1.25fr_0.95fr_1.1fr_1.2fr_0.95fr`.
          A patra, `1.2fr`, era a coloanei „Industrii", plecată odată cu paginile.
          S-a scos DOAR ea; celelalte n-au fost rebalansate, fiindcă fiecare e
          măsurată din propriul ei text, nu din raportul cu vecinele.

          Coloana de marcă rămâne cea mai lată: ține o frază, nu o listă. Pe
          telefon toate stau una sub alta; de la `sm` în sus, marca ocupă două
          celule și rămân TREI liste într-o grilă de două coloane, deci ultima
          („Contact") stă singură pe rândul ei. Am cântărit alternativa — trei
          coloane la `sm` — și e mai rea: rupe „Politica de confidențialitate"
          pe două rânduri.
        */}
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.25fr_0.95fr_1.1fr_0.95fr] lg:gap-8">
          <div className="sm:col-span-2 lg:col-span-1">
            <Logo size="lg" />
            <p className="mt-4 max-w-[320px] text-[13.5px] leading-[1.6] text-ink-2">
              Platformă completă pentru magazine online. Creează-ți magazinul în
              câteva minute, cu mentenanță gratuită pe viață și suport 7 zile din 7.
            </p>

            <ul className="mt-6 flex items-center gap-3">
              {SOCIAL_LINKS.map((s) => (
                <li key={s.label}>
                  <a
                    href={s.href}
                    target="_blank"
                    /*
                      `noopener` nu e opțional pe linkuri care deschid fereastră
                      nouă: fără el, pagina deschisă poate ajunge la `window.opener`.
                    */
                    rel="noopener noreferrer"
                    aria-label={`Edinio pe ${s.label}`}
                    /* `tint-2`, nu `tint`: e un CONTROL, nu o suprafata. Doua trepte sub alb
                       aproape nu se vad pe un patrat de 36px. Regula, cu masuratoarea,
                       e in `lib/website/buton.ts`. */
                    className="group flex h-9 w-9 items-center justify-center rounded-[8px] border border-hairline transition-colors duration-200 hover:bg-tint-2"
                  >
                    {/*
                      Culoarea vine la hover pe TOT butonul, nu pe siglă: ținta
                      de apăsare e pătratul de 36px, iar dacă efectul ar sta pe
                      `<img>`, o treime din suprafață ar rămâne moartă.
                    */}
                    <Image
                      src={s.src}
                      alt=""
                      aria-hidden="true"
                      width={Math.round(s.inaltime * s.ratio)}
                      height={s.inaltime}
                      /* Loader-ul proiectului lasă neatinse imaginile locale. */
                      unoptimized
                      style={{ height: s.inaltime, width: "auto" }}
                      className="opacity-55 grayscale transition duration-200 group-hover:opacity-100 group-hover:grayscale-0"
                    />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {FOOTER_COLUMNS.map((col) => (
            <nav key={col.title} aria-labelledby={`subsol-${col.title}`}>
              <h2
                id={`subsol-${col.title}`}
                className="text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-3"
              >
                {col.title}
              </h2>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <LinkSubsol link={link} />
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-6 border-t border-hairline pt-8 sm:flex-row">
          <p className="text-[13px] text-ink-3">
            &copy; {new Date().getFullYear()} Edinio. Toate drepturile rezervate.
          </p>

          {/*
            Insignele ANPC. Pe fundal alb nu mai au nevoie de opacitate
            coborâtă — pe cel închis stăteau la 0,6 tocmai ca să nu strige.

            `unoptimized`: sunt fișiere locale, iar loader-ul proiectului le lasă
            oricum neatinse. Fără steag, Next construia degeaba un `srcSet` cu
            patru variante ale aceleiași adrese și se plângea în consolă pe
            fiecare pagină — avertismentul se vedea și înainte de refacere.
          */}
          <div className="flex items-center gap-3">
            <a href="https://anpc.ro/ce-este-sal/" target="_blank" rel="noopener noreferrer">
              <Image
                src="/anpc-sal.avif"
                alt="ANPC — Soluționarea Alternativă a Litigiilor"
                width={180}
                height={50}
                unoptimized
                className="h-10 w-auto"
              />
            </a>
            <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer">
              <Image
                src="/anpc-sol.avif"
                alt="ANPC — Soluționarea Online a Litigiilor"
                width={180}
                height={50}
                unoptimized
                className="h-10 w-auto"
              />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

/**
 * Un rând din subsol.
 *
 * `tel:` și `mailto:` NU trec prin `next/link`: routerul încearcă să le trateze
 * ca navigări interne, iar pe unele browsere asta înseamnă că apăsarea nu face
 * nimic. Ele rămân `<a>` simple.
 */
function LinkSubsol({ link }: { link: FooterLink }) {
  const clase = "text-[13.5px] leading-[1.5] text-ink-2 transition-colors hover:text-ink";
  const tinta = link.extern ? (
    <a href={link.href} className={clase}>
      {link.label}
    </a>
  ) : (
    <Link href={link.href} className={clase}>
      {link.label}
    </Link>
  );

  if (!link.prefix) return tinta;
  /*
    Aranjare ÎN LINIE, nu `flex`: cu `flex` cuvântul și valoarea sunt două cutii
    lipite, iar spațiul dintre ele ar depinde de un `gap` — care s-a și dovedit
    că nu se genera, si iesea „Telefon:0750 456 809". Aici spațiul e chiar un
    spațiu, iar rândul se rupe unde se rupe orice text.
  */
  return (
    <span className="text-[13.5px] leading-[1.5] text-ink-3">
      {link.prefix} {tinta}
    </span>
  );
}

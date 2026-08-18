import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Clock, Mail, Phone } from "lucide-react";
import { PageHero } from "@/components/website/PageHero";
import { ContactForm } from "@/components/website/ContactForm";
import { WhatsAppIcon } from "@/components/website/WhatsAppIcon";
import { FaqAccordion } from "@/components/website/FAQSection";
import { FinalCta } from "@/components/website/sections/FinalCta";
import { ACASA } from "@/lib/website/breadcrumbs";
import { EMAIL, PROGRAM, TELEFON, VERDE_WHATSAPP, WHATSAPP } from "@/lib/website/contact";
import { FAQ_TITLE } from "@/lib/website/faq";
import { SOCIAL_LINKS } from "@/lib/website/footer";
import { siteMetadata } from "@/lib/website/metadata";

/*
  Metadatele treceau prin obiectul scris de mana, nu prin `siteMetadata`, si de
  aceea adresa canonica era pe `www` doar din intamplare. Acum vin din acelasi
  ajutor ca restul paginilor.

  Descrierea spunea „Suport 7 zile din 7" fara ore; acum are programul intreg,
  din aceeasi sursa ca pagina.
*/
export const metadata: Metadata = siteMetadata({
  title: "Contact - suport creare magazin online",
  description: `Scrie-ne sau suna-ne. Asistenta ${PROGRAM.zile.toLowerCase()}, intre ${PROGRAM.ore}. Raspundem la orice intrebare despre magazinul tau online.`,
  path: "/contact",
});

const FIRIMITURI = [ACASA, { label: "Contact" }];

/**
 * Cele trei lucruri de stiut, ca banda de sub intrebarile frecvente: o placa cu
 * celule, nu trei carduri cu iconita in patrat colorat.
 *
 * Difera de `BandaContact` prin al treilea element: acolo e „Formular", care
 * duce chiar aici; aici formularul e deja pe pagina, deci locul lui il ia
 * PROGRAMUL — singura informatie de pe pagina asta care nu e o cale de contact,
 * dar fara de care celelalte doua nu spun tot (un numar fara ore nu spune cand
 * raspunde cineva).
 */
const REPERE = [
  { Icoana: Phone, eticheta: "Telefon", valoare: TELEFON.label, href: TELEFON.href },
  { Icoana: Mail, eticheta: "Email", valoare: EMAIL.label, href: EMAIL.href },
  { Icoana: Clock, eticheta: "Program", valoare: PROGRAM.zile, aditional: PROGRAM.ore },
];

export default function ContactPage() {
  return (
    <>
      <PageHero
        sir={FIRIMITURI}
        title="Contact"
        lead="Scrie-ne sau sună-ne. Îți răspundem la orice întrebare despre magazinul tău online."
        aliniere="centru"
      />

      <section className="bg-white py-14 lg:py-20">
        {/*
          Doua coloane de la `lg`: reperele la stanga, formularul la dreapta
          (cerut de client). 2/5 si 3/5 — formularul are patru campuri si are
          nevoie de latime; reperele sunt trei randuri scurte.

          Sub `lg` se stivuiesc, iar reperele raman PRIMELE: cine vrea sa sune
          nu trebuie sa treaca peste tot formularul ca sa gaseasca numarul.
          Containerul e 1080, nu 1200: la 1200 coloana formularului ajunge la
          ~700px, iar un rand de text de peste 75 de semne se citeste greu.
        */}
        <div className="mx-auto grid max-w-[1080px] gap-8 px-5 sm:px-6 lg:grid-cols-5 lg:gap-10 lg:px-8">
          {/* ── Coloana din stanga: repere, WhatsApp, retele ────────────────── */}
          <div className="flex flex-col gap-5 lg:col-span-2">
            <div className="placa overflow-hidden rounded-[16px]">
              <div className="grid sm:grid-cols-3 lg:grid-cols-1">
              {REPERE.map(({ Icoana, eticheta, valoare, href, aditional }, i) => {
                const continut = (
                  <>
                    <Icoana
                      aria-hidden="true"
                      strokeWidth={1.75}
                      className="h-[18px] w-[18px] shrink-0 text-ink-3 transition-colors duration-200 group-hover:text-ink-2"
                    />
                    <span className="min-w-0">
                      <span className="block text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-3">
                        {eticheta}
                      </span>
                      <span className="mt-0.5 block truncate text-[15px] font-medium text-ink">
                        {valoare}
                      </span>
                      {aditional ? (
                        <span className="block text-[15px] font-medium text-ink">{aditional}</span>
                      ) : null}
                    </span>
                  </>
                );

                /*
                  Linia despartitoare urmeaza ARANJAREA, si aici trece prin trei
                  stari, nu doua ca in `BandaContact`:
                    sub `sm`  — stivuite  → linie DEASUPRA
                    `sm`→`lg` — alaturi   → linie la STANGA
                    de la `lg` — stivuite iar (coloana ingusta) → linie DEASUPRA

                  ⚠ Prima forma avea doar `sm:border-l`, care ramanea aplicat si
                  peste `lg`: la latimea mare, celulele stateau una sub alta cu
                  linia in stanga, deci nu se vedea NICIUN despartitor. Cand o
                  grila isi schimba directia de doua ori, si chenarele trebuie
                  intoarse de doua ori.
                */
                const clase = [
                  "group flex items-start gap-3 px-5 py-4 transition-colors duration-200 sm:px-6 sm:py-5",
                  href ? "hover:bg-tint" : "",
                  i > 0 ? "border-t border-hairline sm:border-t-0 sm:border-l lg:border-l-0 lg:border-t" : "",
                ].join(" ");

                /* Programul NU e link: n-are unde duce. Un `<a href="#">` pus ca
                   sa arate la fel ar fi o tinta care nu face nimic. */
                return href ? (
                  <a key={eticheta} href={href} className={clase}>
                    {continut}
                  </a>
                ) : (
                  <div key={eticheta} className={clase}>
                    {continut}
                  </div>
                );
              })}
              </div>
            </div>

            {/*
              WhatsApp, cu verdele LUI, nu cu al nostru.
              Nu e o scapare de la regula „un singur buton verde plin": ala e
              verdele Edinio, care inseamna „actiunea noastra principala".
              #25D366 nu concureaza cu el, e sigla altcuiva — la fel cum sigla
              Facebook ramane albastra oriunde ar sta. Un buton WhatsApp in alta
              culoare nu se mai recunoaste dintr-o privire, si asta e tot rostul lui.
            */}
            <a
              href={WHATSAPP.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-12 items-center justify-center gap-2.5 rounded-[8px] text-[15px] font-semibold text-white transition-transform duration-200 hover:scale-[1.01] active:scale-100"
              style={{ backgroundColor: VERDE_WHATSAPP }}
            >
              <WhatsAppIcon className="h-[18px] w-[18px]" />
              {WHATSAPP.label}
            </a>

            {/* ── Retelele sociale ─────────────────────────────────────────── */}
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-3">
                Ne găsești și pe
              </p>
              {/*
                Aceleasi patrate ca in subsol: gri implicit, culoare la hover.
                In culorile lor, trei sigle ar fi cel mai colorat lucru de pe
                pagina — si ar trage ochiul de la formular, care e treaba
                paginii. Vezi nota din `Footer.tsx`.
              */}
              <ul className="mt-3 flex items-center gap-3">
                {SOCIAL_LINKS.map((s) => (
                  <li key={s.label}>
                    <a
                      href={s.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Edinio pe ${s.label}`}
                      className="group flex h-9 w-9 items-center justify-center rounded-[8px] border border-hairline transition-colors hover:bg-tint"
                    >
                      <Image
                        src={s.src}
                        alt=""
                        aria-hidden="true"
                        width={Math.round(s.inaltime * s.ratio)}
                        height={s.inaltime}
                        unoptimized
                        style={{ height: s.inaltime, width: "auto" }}
                        className="opacity-55 grayscale transition duration-200 group-hover:opacity-100 group-hover:grayscale-0"
                      />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* ── Formularul, coloana din dreapta ─────────────────────────────── */}
          <div className="lg:col-span-3">
            <ContactForm />
          </div>
        </div>
      </section>

      {/*
        Intrebarile frecvente, si aici (cerut de client).

        ACEEASI LISTA, nu o copie: `FaqAccordion` citeste din `lib/website/faq.ts`,
        deci cele trei locuri care o arata — pagina de start, `/intrebari-frecvente`
        si pagina asta — nu se pot desparti. O a doua copie ar fi raspuns altfel
        la aceeasi intrebare, in functie de unde nimereai.

        `h2` pentru titlul sectiunii, deci intrebarile sunt `h3` — invers fata de
        `/intrebari-frecvente`, unde stau direct sub `h1`. Vezi nota din
        `FaqAccordion`.

        Linie deasupra si `bg-tint`: e o sectiune de sine statatoare, nu o
        continuare a formularului. Fara despartitor, ultima bifa a formularului
        si primul titlu de intrebare ar sta in acelasi camp alb.
      */}
      <section className="border-t border-hairline bg-tint py-14 lg:py-20">
        <div className="mx-auto max-w-[1200px] px-5 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[720px] text-center">
            <h2 className="text-[26px] font-bold leading-[1.12] tracking-[-0.025em] text-ink sm:text-[34px]">
              {FAQ_TITLE}
            </h2>
            <p className="mt-4 text-[15px] leading-[1.6] text-ink-2 sm:text-[17px]">
              Poate găsești răspunsul mai repede aici decât scriindu-ne.
            </p>
          </div>

          <FaqAccordion nivelTitlu="h3" className="mx-auto mt-10 lg:mt-12" />

          <p className="mt-8 text-center text-[14px] text-ink-2">
            <Link
              href="/intrebari-frecvente"
              className="font-medium underline decoration-1 underline-offset-[5px] transition-opacity duration-200 hover:opacity-70"
            >
              Vezi toate întrebările frecvente
            </Link>
          </p>
        </div>
      </section>

      {/*
        Banda de final, aceeasi ca pe pagina de start.

        Se REFOLOSESTE, nu se scrie alta: textul ei e al clientului si e aprobat.
        O varianta scrisa doar pentru pagina asta ar fi insemnat text inventat de
        mine pe o pagina comerciala, si inca una care s-ar fi despartit de
        celelalte la prima corectura.

        ⚠ Vine DUPA intrebari, nu inaintea formularului. Cine deschide „Contact"
        vrea sa ne scrie; un indemn la inscriere pus deasupra i-ar sta in drum.
        Asezata la coada, e raspunsul la „si daca nu mai am nimic de intrebat?".

        Sectiunea de deasupra e pe `bg-tint`, banda e pe alb — se despart singure,
        deci nu mai trebuie o linie intre ele.
      */}
      <FinalCta />
    </>
  );
}

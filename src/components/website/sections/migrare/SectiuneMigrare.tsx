import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { DASH_ON_WHITE } from "@/lib/website/linii";
import type { SectiuneMigrareText } from "@/lib/website/migrare";
import { SectionEyebrow } from "../SectionEyebrow";

/**
 * Cadrul secțiunilor de pe pagina „Migrare magazin".
 *
 * Fiecare secțiune e O CASETĂ LATĂ, tăiată în două de o linie: textul într-o
 * jumătate, panoul în cealaltă. Jumătățile se schimbă între ele de la o secțiune
 * la alta. Cerut de client (14.08), după o schiță cu exact asta — o casetă,
 * „TEXT" la stânga, „IMAGINI" la dreapta — și cu linia punctată.
 *
 * ═══ DE CE ÎNCASETATE ═══
 *
 * Vin patru secțiuni una după alta, toate cu același schelet. Lăsate să curgă pe
 * pagină, s-ar fi citit ca o singură bandă lungă în care nu se mai vede unde se
 * termină una și începe alta; singurul semn ar fi fost spațierea, iar spațierea nu
 * e un semn, e o lipsă. Încasetate, cusătura o face marginea, nu golul — deci nu
 * mai e nevoie nici de fundaluri care alternează.
 *
 * ═══ LINIA PUNCTATĂ NU E O INVENȚIE A PAGINII ĂSTEIA ═══
 *
 * E chiar limbajul cardurilor de funcții de pe pagina de start: aceeași ramă
 * punctată, aceeași culoare, luată din același loc (`lib/website/linii.ts`).
 * Acolo scrie și de ce nu e `--color-hairline`: o linie punctată are jumătate din
 * lungime goală, deci la aceeași culoare se pierde pe alb.
 *
 * ⚠ PUNCTAT ÎNSEAMNĂ CASETĂ, CONTINUU ÎNSEAMNĂ CARD. Rama secțiunii și
 * despărțitorul sunt punctate; cardurile de produs dinăuntru au chenar continuu.
 * Nu e o alegere de gust: cu amândouă la fel, patru carduri mici într-o casetă
 * mare ar fi fost cinci dreptunghiuri de același fel, iar ochiul n-ar mai fi știut
 * care ține pe care.
 *
 * ═══ ALTERNANȚA ═══
 *
 * ⚠ `order` SCHIMBĂ UNDE SE AȘAZĂ JUMĂTĂȚILE, NU CÂT DE LATE SUNT COLOANELE.
 * Lecția e luată de-a gata de la cardurile de pe pagina de start, unde a fost
 * prinsă doar măsurând: acolo, pe cardurile întoarse, imaginea nimerea în coloana
 * îngustă și ieșea mai mică decât textul. De aceea se întoarce ȘI șablonul de
 * coloane, nu doar ordinea — sunt două șabloane, nu unul.
 *
 * ⚠ În marcaj textul rămâne MEREU primul, deci și în ordinea de citire și la
 * tastatură. Cine ajunge pe pagină cu un cititor de ecran aude titlul înaintea
 * ilustrației lui, la toate patru, indiferent cum arată.
 *
 * ⚠ Inversarea e doar de la `lg`. Sub prag totul e pe o coloană, iar acolo textul
 * trebuie să stea SUS la toate secțiunile: pe telefon, o ilustrație pusă înaintea
 * titlului ei e o poză fără explicație.
 *
 * ═══ ÎMPĂRȚIREA 5/7, NU 6/6 ═══
 *
 * Panoul primește mai mult, și e o măsurătoare, nu un gust: în el intră patru
 * carduri de produs pe un rând. La jumătate-jumătate ar fi ieșit de 112px fiecare,
 * prea înguste pentru o denumire pe două rânduri; la 7/12 ies 134, unde încap.
 * Textul n-are nevoie de mai mult — rândul lui rămâne pe la 60 de semne, adică fix
 * cât se citește comod.
 */
export function SectiuneMigrare({
  text,
  children,
  inversat,
}: {
  text: SectiuneMigrareText;
  /** Panoul din cealaltă jumătate. */
  children: ReactNode;
  /** De la `lg`: panoul trece în stânga, textul în dreapta. */
  inversat?: boolean;
}) {
  return (
    <section className="bg-white">
      <div className="mx-auto max-w-[1200px] px-5 py-8 sm:px-6 lg:px-8 lg:py-10">
        {/*
          Caseta. `overflow-hidden` ca despărțitorul și colțurile să se taie
          curat, iar spațierea stă în JUMĂTĂȚI, nu aici: linia trebuie să treacă
          dintr-o margine în cealaltă, ca în schiță, nu să se oprească într-un
          chenar de spațiere.
        */}
        <div
          className={cn(
            "grid overflow-hidden rounded-[20px] border border-dashed lg:rounded-[24px]",
            /* Vezi nota de sus: se întoarce și șablonul, nu doar ordinea. */
            inversat
              ? "lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]"
              : "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]",
          )}
          style={{ borderColor: DASH_ON_WHITE }}
        >
          {/* ── Textul ──────────────────────────────────────────────────── */}
          <div
            className={cn(
              "flex flex-col justify-center p-6 sm:p-8 lg:p-10",
              /* Când textul e al doilea, despărțitorul îi revine LUI. */
              inversat && "lg:order-2 lg:border-l lg:border-dashed",
            )}
            style={{ borderColor: DASH_ON_WHITE }}
          >
            <SectionEyebrow label={text.eticheta} />

            {/*
              `h2`, nu `h3`: secțiunile stau direct sub `h1`-ul din hero, una
              lângă alta, nu una în alta.

              Mai mic decât titlul benzii de final (32 → 52), fiindcă stă ÎNTR-o
              casetă, nu pe toată pagina: un titlu de 52 într-o jumătate de 393px
              s-ar fi rupt pe patru rânduri.
            */}
            <h2 className="mt-5 text-[26px] font-bold leading-[1.12] tracking-[-0.03em] text-ink sm:text-[32px] lg:text-[36px]">
              {text.titlu}
            </h2>

            <p className="mt-4 max-w-[460px] text-[15px] leading-[1.6] text-ink-2 sm:text-[16.5px]">
              {text.descriere}
            </p>

            {/*
              Butonul are chenar, nu e verde plin: verdele plin e al butonului
              principal, iar pe pagina asta el e deja în hero. Patru butoane verzi
              pline, unul pe secțiune, ar fi făcut din el un element de decor.

              Chenar CONTINUU, ca la cardurile de produs: e un lucru pe care apeși,
              nu o casetă care ține altceva.
            */}
            <Link
              href={text.cta.href}
              className="group mt-7 inline-flex h-12 w-fit items-center justify-center gap-2 rounded-[8px] border border-hairline bg-white px-6 text-[15px] font-semibold text-ink transition-colors duration-200 hover:bg-tint"
            >
              {text.cta.label}
              <ArrowRight
                className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          </div>

          {/* ── Panoul ──────────────────────────────────────────────────── */}
          {/*
            Despărțitorul trece de la ORIZONTAL la VERTICAL odată cu așezarea:
            stivuite, linia e deasupra panoului; alături, e în stânga lui. Aceeași
            linie, întoarsă — nu două.
          */}
          <div
            className={cn(
              "flex flex-col justify-center border-t border-dashed p-6 sm:p-8 lg:border-t-0 lg:p-10",
              inversat ? "lg:order-1" : "lg:border-l lg:border-dashed",
            )}
            style={{ borderColor: DASH_ON_WHITE }}
          >
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

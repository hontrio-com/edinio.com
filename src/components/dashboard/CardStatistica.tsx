import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { ExplicatieCard } from "@/components/dashboard/ExplicatieCard";
import { marimeaCifrei } from "@/lib/dashboard/cifra-pe-un-rand";

/*
  ═══════════════════════════════════════════════════════════════════════════
  CARDUL DE CIFRA, UNUL SINGUR PENTRU TOT PANOUL
  ═══════════════════════════════════════════════════════════════════════════

  A stat pana acum in pagina panoului principal. Cerere din 20.09.2026: pagina
  Statistici sa aiba exact aceleasi carduri.

  ⚠ MUTAT, NU COPIAT. Doua carduri desenate separat ar fi divergit la prima
  retusare - exact ce s-a intamplat cu cele doua meniuri, unde de pe telefon
  lipseau sectiuni intregi fara ca nimeni sa afle.
*/

export type CardStatisticaProps = {
  label: string;
  value: string | number;
  unit?: string;
  delta?: string;
  deltaDir?: "up" | "down";
  deltaCaption?: string;
  /**
   * Daca o CRESTERE e o veste buna. Implicit da, fiindca asa e la aproape toate
   * cifrele panoului.
   *
   * ⚠ EXISTA FIINDCA SAGEATA SI CULOAREA SPUN LUCRURI DIFERITE. Sageata arata
   * incotro s-a miscat cifra, culoarea arata daca e bine. La „rata de anulare"
   * erau legate, si o crestere a anularilor se scria cu verde: exact pe dos.
   */
  susEBine?: boolean;
  /** Unde duce cardul. Lipsa lui inseamna „nu duce nicaieri": pe pagina de
      statistici, unele cifre n-au alt ecran in spate, iar o legatura catre
      pagina pe care esti deja e o promisiune goala. */
  href?: string;
  icon: LucideIcon;
  empty?: boolean;
  /** Cum se calculeaza cifra, pe intelesul comerciantului. Vezi `ExplicatieCard`. */
  explicatie?: string;
  /**
   * Un rand scurt in subsolul cardului, in locul lui „Actualizat acum”.
   *
   * ⚠ NU e `delta`, si de-aia are camp separat: `delta` se deseneaza cu sageata
   * si cu verde/rosu, adica „s-a miscat incolo fata de perioada trecuta”. Ce
   * scrie aici e o insotitoare a cifrei („28% din afisari”), nu o schimbare in
   * timp — pusa in `delta`, ar fi capatat o sageata care nu inseamna nimic.
   */
  subsol?: string;
  /**
   * ⚠⚠ MARIMEA CIFREI, HOTARATA DE RANDUL INTREG.
   *
   * Lasata pe seama cardului, fiecare cutie si-o alegea dupa cifra ei: „6" la
   * 44px langa „15.831,80 lei" la 22px, adica patru cutii care nu mai arata ca
   * un set. Pagina o socoteste o data, cu `marimeaRandului`, din toate cifrele
   * pe care le arata.
   *
   * Lipsa ei cade pe cifra proprie — ca sa nu se rupa un card folosit singur.
   */
  marime?: string;
};

export function CardStatistica({
  label,
  value,
  unit,
  delta,
  deltaDir = "up",
  deltaCaption = "vs. ieri",
  susEBine = true,
  href,
  icon: Icon,
  empty = false,
  explicatie,
  subsol,
  marime,
}: CardStatisticaProps) {
  return (
    /*
      ⚠ CARDUL NU MAI E O LEGATURA, ci o cutie cu o legatura intinsa peste ea.

      Semnul de intrebare e un `<button>`; inauntrul unui `<a>` ar fi fost si
      cuibarire nevalida de HTML, si o capcana: orice apasare pe el ar fi dus
      omul la pagina de detalii in loc sa-i arate explicatia. Asa, legatura
      acopera cardul (`absolute inset-0`), iar butonul sta deasupra ei.
    */
    <div
      className={[
        "group relative flex flex-col overflow-hidden rounded-xl bg-surface",
        "shadow-[0_1px_2px_rgba(15,23,20,0.04)]",
        "border border-border transition-all duration-200",
        "hover:-translate-y-0.5",
        "hover:shadow-[0_1px_2px_rgba(15,23,20,0.04),0_18px_32px_-20px_rgba(15,23,20,0.12)]",
        /*
          ⚠ MAI SCUND PE TELEFON. La o coloană (cum sunt toate cele patru pagini
          care folosesc cardul), 168px pentru un singur număr înseamnă un card
          aproape gol și trei carduri care umplu ecranul înainte să ajungi la ce
          ai venit să vezi. De la `sm` rămâne cum era, fiindcă acolo stau două
          sau patru pe rând și înălțimea le ține aliniate.
        */
        "min-h-[116px] sm:min-h-[168px]",
      ].join(" ")}
    >
      {href && (
        <Link
          href={href}
          aria-label={`${label}: vezi detalii`}
          className="absolute inset-0 z-10 no-underline"
        />
      )}

      {/* top — label + icon */}
      <div className="flex items-center justify-between border-b border-dashed border-border px-[18px] py-[14px]">
        <span className="text-[12px] font-medium text-muted-foreground tracking-[0.01em]">
          {label}
        </span>
        <span className="flex items-center gap-0.5">
          {explicatie && <ExplicatieCard text={explicatie} eticheta={label} />}
          <span className="grid h-7 w-7 place-items-center text-muted-foreground">
            <Icon strokeWidth={1.4} className="h-[15px] w-[15px]" />
          </span>
        </span>
      </div>

      {/* bottom — value + footer */}
      <div className="flex flex-1 flex-col justify-between px-[18px] pt-3 pb-[14px] sm:pt-4 sm:pb-[18px]">
        {/*
          ⚠⚠ MARIMEA SE IA DIN LUNGIMEA CIFREI, si NU e una fixa.
          Era `text-[44px]`, iar `15.831,80 lei` la 44px cere vreo 310px — un
          card dintr-o grila de patru are sub 200px, deci suma trecea pe randul
          urmator. Semnalat de el de doua ori: intai pe telefon la Clienti
          (atunci s-a reparat grila), apoi pe desktop la Discounturi.
          Vezi `src/lib/dashboard/cifra-pe-un-rand.ts`.

          ⚠ Si `whitespace-nowrap`, fiindca o marime mai mica doar AMANA
          ruperea: la o suma si mai lunga s-ar fi rupt din nou.
        */}
        <div
          className={cn(
            /*
              ⚠ SI UNITATEA SE NUMARA. Ea se scrie langa cifra, in cardul asta
              („34.864" + „lei"), deci tine latime. Masurata doar cifra, un card
              cu unitate ar fi iesit din cutie taman cand e mai plin.
            */
            marime ?? marimeaCifrei(value, unit),
            "whitespace-nowrap leading-none font-medium tracking-[-0.03em] tabular-nums",
            empty ? "text-muted-foreground/30" : "text-foreground"
          )}
        >
          {value}
          {unit && (
            <span className="ml-1 text-[20px] font-normal text-muted-foreground">
              {unit}
            </span>
          )}
        </div>

        {/*
          ⚠ Cresterea si „Vezi detalii" stau pe RANDURI DIFERITE.
          Pe acelasi rand, un card cu crestere de doua cifre si o perioada scrisa
          („19,5% vs. 1 - 20 aug.") impingea „Vezi detalii" in trei bucati
          suprapuse. Randul de jos e mereu scurt, deci nu se mai poate rupe.
        */}
        <div className="mt-[14px] flex flex-col gap-1 text-[12px] text-muted-foreground">
          <div className="flex items-center gap-2">
            {!empty && delta ? (
              <>
                <span className={cn(
                  "font-medium tabular-nums",
                  (deltaDir === "up") === susEBine ? "text-primary" : "text-destructive"
                )}>
                  {deltaDir === "up" ? "↑" : "↓"} {delta}
                </span>
                <span>{deltaCaption}</span>
              </>
            ) : (
              <span>{subsol ?? "Actualizat acum"}</span>
            )}
          </div>

          {href && (
            <span className="inline-flex items-center gap-1.5 self-end text-[12px] font-medium text-muted-foreground transition-colors group-hover:text-foreground">
              Vezi detalii
              <span className="inline-block transition-transform duration-200 group-hover:translate-x-[3px]">
                →
              </span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}


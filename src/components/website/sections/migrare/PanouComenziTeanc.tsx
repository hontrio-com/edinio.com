import type { CSSProperties } from "react";
import { COMANDA_TEANC, TEANC_RESTUL } from "@/lib/website/migrare";
import { LaIntrareInEcran } from "./LaIntrareInEcran";

/**
 * Ilustrația secțiunii „Comenzi": o comandă întreagă deasupra, și se vede că sub
 * ea mai sunt.
 *
 * ═══ CE SPUNE, ȘI DE CE ALTFEL DECÂT ÎNȘTIINȚĂRILE ═══
 *
 * Trei înștiințări una sub alta spuneau „tocmai au venit astea" — trafic, nu
 * istoric. Secțiunea promite altceva: că tot ce s-a strâns până acum vine cu tine,
 * cu tot cu „datele importante".
 *
 * Teancul spune amândouă lucrurile dintr-o privire, fără să numere nimeni:
 * ADÂNCIME (mai sunt multe dedesubt) și CUPRINS (comanda din față e întreagă — ce
 * s-a cumpărat, când, cât, cum s-a plătit), nu un rând de tabel scos din chenar.
 *
 * ═══ CE FACE UN TEANC SĂ PARĂ TEANC ═══
 *
 * - **Cele din spate sunt MAI ÎNGUSTE și ies pe DEDESUBT.** Așa se vede un teanc
 *   privit de sus: marginile de jos ale foilor de dedesubt. Ieșite pe deasupra, ar
 *   fi arătat a trei carduri suprapuse aiurea.
 * - **Se sting treptat.** Foaia a doua e mai palidă decât prima, a treia decât a
 *   doua. Fără asta, trei dreptunghiuri albe cu umbră arată a scară, nu a teanc.
 * - **Numai cea din față are conținut.** O a doua foaie cu scris pe ea ar face
 *   ochiul să caute ce zice, iar teancul ar redeveni o listă.
 * - **Rândul de dedesubt spune de CÂND.** „încă 1.041, din 2021" e chiar
 *   istoricul; fără el, desenul arată a trei comenzi, nu a arhivă.
 * - **Fără pastilă de stare.** Era singura culoare din desen, deci primul lucru
 *   la care se uita ochiul — iar ea răspunde la altă întrebare decât secțiunea:
 *   unde a ajuns comanda, nu dacă istoricul vine cu tine. Ce rămâne pe card sunt
 *   numai lucrurile care spun „e o comandă adevărată, întreagă".
 *
 * ⚠ Rândul acela NU e capul de panou scos pe 19.08 („Comenzi", „1.042 în total").
 * Acela era cronologia unui panou de administrare, pusă deasupra unui tabel; ăsta
 * e o singură propoziție sub un obiect, și spune cât de departe merge teancul
 * înapoi — adică exact ce promite secțiunea.
 *
 * ═══ AȘEZAREA ═══
 *
 * Teancul se adună când ajunge în dreptul ochilor: întâi cardul din față, apoi
 * foile alunecă afară de sub el, iar la urmă se scrie rândul care spune câte mai
 * sunt. Ordinea e argumentată în `globals.css`, la `.se-aseaza`; declanșatorul,
 * în `LaIntrareInEcran`.
 *
 * ⚠ Componenta rămâne de SERVER. Singurul JavaScript e învelișul de deasupra, care
 * nu desenează nimic — aceeași împărțire ca la `FerireDeCursor` / `CampSigle` de pe
 * „Integrări".
 *
 * ⚠ Nimic nu se apasă, ca la toate ilustrațiile paginii. Totul e `aria-hidden`; ce
 * se aude e propoziția de mai jos. Animația nu schimbă nimic din asta: se joacă o
 * dată și pe urmă teancul stă nemișcat, ca orice altă ilustrație de pe site.
 */
export function PanouComenziTeanc() {
  return (
    <LaIntrareInEcran>
      <div className="mx-auto w-full max-w-[440px] lg:max-w-none">
        <p className="sr-only">
          Un teanc de comenzi migrate: deasupra, comanda {COMANDA_TEANC.numar} a lui{" "}
          {COMANDA_TEANC.client}, de {COMANDA_TEANC.total}; sub ea, încă{" "}
          {TEANC_RESTUL.cate} de comenzi strânse din {TEANC_RESTUL.din}.
        </p>

        {/* Plasa pentru „fără JavaScript" stă în `LaIntrareInEcran`, o dată
            pentru toate ilustrațiile care se așază. */}

        <div aria-hidden="true">
          {/*
            Teancul. Foile de dedesubt sunt puse ABSOLUT, cu fundul ieșit afară;
            înălțimea o dă cardul din față, iar `pb` de jos face loc marginilor lor
            să se vadă fără să iasă din casetă.
          */}
          <div className="relative pb-[30px]">
            {/*
              Foile de dedesubt. Tot `placa` — același alb și aceeași umbră ca cea
              din față, fiindcă sunt același fel de obiect, doar mai departe.

              Opacitatea de repaus le duce în spate: stinge și umbra odată cu
              foaia, deci marginea lor se citește mai slab, exact ca a unei hârtii
              de dedesubt. Stă în `--aseaza-opacitate`, nu într-o clasă, fiindcă e
              și ținta animației — un singur loc pentru aceeași valoare, așa cum
              face și arcul din hero cu poziția lui de repaus.

              ⚠ Ies cu 30 și cu 16 pixeli sub cea din față. Sub vreo zece, marginile
              arată a greșeală de aliniere, nu a teanc.

              ⚠ Pornesc de SUS (`--aseaza-de-la` negativ): stau ascunse sub card și
              alunecă afară pe dedesubt, adică teancul crește în jos. Ridicate de
              jos, ar fi intrat pe sub marginea casetei ca venite din altă parte a
              paginii.
            */}
            <span
              className="se-aseaza placa absolute inset-x-[30px] bottom-0 h-20 rounded-[14px]"
              style={{ "--aseaza-opacitate": 0.5, "--aseaza-de-la": "-14px", "--aseaza-intarziere": "0.42s" } as CSSProperties}
            />
            <span
              className="se-aseaza placa absolute inset-x-[15px] bottom-[14px] h-20 rounded-[16px]"
              style={{ "--aseaza-opacitate": 0.8, "--aseaza-de-la": "-10px", "--aseaza-intarziere": "0.3s" } as CSSProperties}
            />

            {/*
              Cardul din față se așază PRIMUL, cu o urcare mică. Nu de la zero
              întârziere: pornit instant, pare că era deja acolo, nu că tocmai s-a
              așezat.
            */}
            <div
              className="se-aseaza placa relative rounded-[18px] p-[18px] sm:p-5"
              style={{ "--aseaza-de-la": "12px", "--aseaza-intarziere": "0.06s" } as CSSProperties}
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="truncate text-[15px] font-semibold leading-tight tracking-[-0.01em] text-ink sm:text-[16px]">
                  {COMANDA_TEANC.client}
                </p>
                <span className="shrink-0 text-[17px] font-bold tabular-nums tracking-[-0.02em] text-ink sm:text-[18px]">
                  {COMANDA_TEANC.total}
                </span>
              </div>

              <p className="mt-[7px] text-[12px] leading-none text-ink-3">
                <span className="tabular-nums">#{COMANDA_TEANC.numar}</span>
                {" · "}
                {COMANDA_TEANC.cand}
              </p>

              {/*
                Ce s-a cumpărat. Asta lipsea cu totul din înștiințări, deși
                descrierea secțiunii promite „datele importante" — iar o comandă
                fără produsele ei nu e o comandă, e o sumă.

                Linie de un fir deasupra, nu spațiu: desparte antetul comenzii de
                conținutul ei, așa cum arată orice fișă adevărată.
              */}
              <div className="mt-3.5 border-t border-hairline pt-3.5">
                <p className="truncate text-[13px] leading-tight text-ink-2">
                  {COMANDA_TEANC.produse}
                </p>
                <p className="mt-2.5 text-[11.5px] leading-none text-ink-3">{COMANDA_TEANC.plata}</p>
              </div>
            </div>
          </div>

          {/*
            Adâncimea teancului, scrisă. Centrat sub el, nu aliniat la stânga: e o
            notă despre obiectul de deasupra, nu următorul rând al unei liste.

            Vine ULTIMA, după ce teancul s-a așezat: e concluzia desenului, iar o
            concluzie citită înainte de lucrul la care se referă nu e o concluzie.
          */}
          <p
            className="se-aseaza mt-3.5 text-center text-[12.5px] leading-none text-ink-3"
            style={{ "--aseaza-de-la": "6px", "--aseaza-intarziere": "0.62s" } as CSSProperties}
          >
            și încă <span className="font-semibold tabular-nums text-ink-2">{TEANC_RESTUL.cate}</span>
            {" "}de comenzi, din {TEANC_RESTUL.din} încoace
          </p>
        </div>
      </div>
    </LaIntrareInEcran>
  );
}

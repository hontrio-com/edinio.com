import { DASH_ON_WHITE } from "@/lib/website/linii";
import {
  ANCORA_FORMULAR,
  PLATFORME_DREAPTA,
  PLATFORME_STANGA,
  SECTIUNE_PLATFORME,
} from "@/lib/website/migrare";
import { SectionEyebrow } from "../SectionEyebrow";
import { FormularMigrare } from "./FormularMigrare";
import { IlustratieFascicule } from "./IlustratieFascicule";

/**
 * Secțiunea „Platforme", ultima de pe pagina „Migrare": de pe ce platforme mutăm,
 * și formularul prin care se cere mutarea.
 *
 * ═══ ILUSTRAȚIA ȘI FORMULARUL SUNT ACEEAȘI SECȚIUNE, NU DOUĂ ═══
 *
 * Cerut așa de client (19.08): întâi ilustrația cu fascicule, apoi, în aceeași
 * casetă, formularul. Și e bine că stau împreună — ilustrația spune „venim după
 * datele tale de oriunde", iar formularul e chiar locul unde se cere asta.
 * Despărțite de o margine, prima ar fi rămas o afirmație fără urmare.
 *
 * De la `lg` stau una lângă alta, cu capul deasupra amândurora. Una sub alta,
 * caseta ieșea de peste o mie de pixeli înălțime, iar butonul de trimis cădea la
 * două ecrane sub titlul care îl cere.
 *
 * ⚠ Până la formularul ăsta, `/migrare` era patru secțiuni care povestesc ce se
 * mută și niciun loc unde să ceri mutarea. Sub el vine `FinalCta`, ca pe toate
 * celelalte pagini de site — cele două nu se calcă: aici se cere să mutăm noi
 * magazinul, acolo se duce la înscriere, pentru cine vrea să încerce singur.
 *
 * ═══ CASETĂ, CA CELELALTE TREI ═══
 *
 * Aceeași rețetă ca `SectiuneMigrare` — ramă punctată, fundal alb,
 * `feature-card-shadow` — dar FĂRĂ împărțirea în jumătăți egale și fără
 * despărțitor. Motivul pentru care are casetă e cel scris în capul lui
 * `SectiuneMigrare`: patru secțiuni una sub alta se citesc ca o bandă lungă dacă
 * nu le desparte o margine, iar spațierea nu e un semn, e o lipsă. Una fără
 * casetă ar fi rupt ritmul tocmai la sfârșit.
 *
 * ⚠ Nu refolosește `SectiuneMigrare`: acolo jumătățile egale, despărțitorul și
 * inversarea prin `order` sunt tot ce e componenta. Împrumută doar învelișul.
 *
 * ⚠ Componenta asta e de SERVER, deși amândoi copiii ei sunt de client. Nu e o
 * scăpare — e chiar rostul împărțirii: capul secțiunii (etichetă, titlu, descriere
 * și rândul citit de cititoarele de ecran) pleacă din HTML-ul serverului și e
 * acolo înainte să se încarce vreun script.
 */
export function SectiuneFascicule() {
  return (
    /*
      `id` din aceeași constantă ca `href`-ul butoanelor din celelalte trei
      secțiuni — `ANCORA_FORMULAR` are `#`, iar `id` nu, de-aia se taie primul semn.
      `scroll-mt` fiindcă bara de sus e lipicioasă: fără el, saltul oprește
      titlul FIX SUB ea, iar cine apasă „Începe migrarea" ajunge la o secțiune
      care pare să înceapă cu un formular.
    */
    <section id={ANCORA_FORMULAR.slice(1)} className="scroll-mt-24 bg-white">
      <div className="mx-auto max-w-[1200px] px-5 py-8 sm:px-6 lg:px-8 lg:py-10">
        <div
          className="feature-card-shadow overflow-hidden rounded-[20px] border border-dashed bg-white p-6 sm:p-8 lg:rounded-[24px] lg:p-10"
          style={{ borderColor: DASH_ON_WHITE }}
        >
          {/*
            Capul secțiunii, îngust și centrat. Aceleași mărimi ca peste tot pe
            site: 32px pe telefon / 44 de la `sm`, descrierea 16 → 18. Coloana de
            720px e cea măsurată pentru capetele centrate.
          */}
          <div className="mx-auto max-w-[720px] text-center">
            <SectionEyebrow label={SECTIUNE_PLATFORME.eticheta} />
            <h2 className="mt-6 text-[32px] font-bold leading-[1.08] tracking-[-0.03em] text-ink sm:text-[44px]">
              {SECTIUNE_PLATFORME.titlu}
            </h2>
            <p className="mx-auto mt-5 max-w-[560px] text-[16px] leading-[1.6] text-ink-2 sm:text-[18px]">
              {SECTIUNE_PLATFORME.descriere}
            </p>
          </div>

          {/*
            Ilustrația e `aria-hidden` de la un capăt la altul — sunt cercuri și
            curbe, nimic de citit. Ce spune ea în cuvinte stă aici, o singură dată.
          */}
          <p className="sr-only">
            Mutăm magazinele făcute pe{" "}
            {[...PLATFORME_STANGA, ...PLATFORME_DREAPTA].map((p) => p.nume).join(", ")}{" "}
            și pe alte platforme.
          </p>

          {/*
            Ilustrația ia ce rămâne, formularul are o lățime a lui: un formular
            întins pe jumătate dintr-o casetă de 1200 ajunge cu rândurile de
            aproape 500px, iar câmpurile late arată a tabel de completat, nu a
            întrebare. 480 e cât ține două câmpuri alăturate fără să se înghesuie.

            `items-center` fiindcă cele două coloane n-au aceeași înălțime și nici
            n-au de ce: ilustrația e un desen, formularul e o listă de câmpuri.
          */}
          <div className="mt-10 grid items-center gap-10 lg:mt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,480px)] lg:gap-12">
            <IlustratieFascicule />
            <FormularMigrare />
          </div>
        </div>
      </div>
    </section>
  );
}

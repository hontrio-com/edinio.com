import { BandaContact, CAI_AJUTOR } from "@/components/website/BandaContact";
import { AJUTOR_CONTACT_SUBTITLU, AJUTOR_CONTACT_TITLU } from "@/lib/website/ajutor";
import { PROGRAM } from "@/lib/website/contact";

/**
 * Banda din josul centrului de ajutor: „Nu găsești răspunsul? Contactează-ne”,
 * cu cele trei căi.
 *
 * Cerută în schița clientului (19.08), inclusiv cele trei butoane și ordinea lor:
 * telefon, WhatsApp, email.
 *
 * ═══ ⚠ CĂILE SE RANDEAZĂ PRIN `BandaContact`, NU AICI ═══
 *
 * Prima variantă a fișierului ăstuia își desena singură cele trei căi, ca trei
 * carduri cu iconița într-un cerc gri. Adică exact tiparul pe care `BandaContact`
 * îl evită dinadins, explicat pe larg în comentariul ei — și pe care clientul îl
 * tăiase deja de mai multe ori. L-am scris fiindcă acolo a treia cale e WhatsApp,
 * nu formularul, iar componenta veche avea lista scrisă înăuntru.
 *
 * Acum lista e argument (`CAI_AJUTOR`), deci diferența se dă din afară și rămâne
 * o singură rețetă vizuală pentru bandă pe tot site-ul. Ce a mai rămas aici e
 * doar ce chiar e al centrului de ajutor: titlul, fraza de deasupra și programul.
 *
 * ⚠ PROGRAMUL E SUB BANDĂ, și nu de umplutură: „Telefon” e o promisiune că
 * răspunde cineva. La 23:00 nu răspunde, iar cine sună degeaba nu mai sună a doua
 * oară. O propoziție care spune când e cineva acolo transformă o promisiune
 * încălcată într-o așteptare.
 *
 * ⚠ NUMĂRUL, ADRESA ȘI PROGRAMUL VIN DIN `lib/website/contact.ts`. Motivul e
 * chiar cel notat acolo: aceleași date apar deja în subsolul fiecărei pagini și
 * în banda de sub întrebările frecvente, iar o copie scrisă de mână se desparte
 * de celelalte la prima schimbare de număr — și nu observă nimeni, fiindcă toate
 * arată la fel de corect.
 *
 * Componentă de server: e text și trei linkuri.
 */
export function BandaAjutor() {
  return (
    <section className="border-t border-hairline bg-tint">
      <div className="mx-auto max-w-[1200px] px-5 py-16 text-center sm:px-6 lg:px-8 lg:py-20">
        <h2 className="text-[26px] font-bold leading-[1.15] tracking-[-0.02em] text-ink sm:text-[32px]">
          {AJUTOR_CONTACT_TITLU}
        </h2>
        <p className="mt-2 text-[17px] font-semibold tracking-[-0.01em] text-ink-2 sm:text-[19px]">
          {AJUTOR_CONTACT_SUBTITLU}
        </p>

        {/* Aceeași lățime și același ax ca pe `/preturi` și `/intrebari-frecvente`:
            banda e același obiect, deci se așază la fel peste tot. */}
        <BandaContact cai={CAI_AJUTOR} className="mx-auto mt-8 max-w-[820px] text-start" />

        <p className="mt-6 text-[14px] text-ink-3">
          Îți răspunde un om, {PROGRAM.zile.toLowerCase()}, între {PROGRAM.ore}.
        </p>
      </div>
    </section>
  );
}

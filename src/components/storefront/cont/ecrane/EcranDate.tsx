import { Download, KeyRound, LockKeyhole, LogOut, MonitorSmartphone, ShieldAlert } from "lucide-react";
import type { ContactulMeu } from "@/lib/cont/date";
import { GestioneazaContacte } from "../GestioneazaContacte";
import { StergeContul } from "../StergeContul";
import { SchimbaParola } from "../SchimbaParola";
import { Sectiune } from "../ui/piese";
import { BUTON_SECUNDAR } from "../ui/clase";

/**
 * Datele contului: contactele, parola, sesiunile, exportul si stergerea.
 *
 * ⚠ Nu exista agenda de adrese: contul n-are asa ceva, deci nu se deseneaza ecran
 * pentru ea. Parola exista din 24.09.2026 (intrarea e cu email si parola).
 */
export function EcranDate({ contacte, comenzi, areParola }: { contacte: ContactulMeu[]; comenzi: number; areParola: boolean }) {
  return (
    <>
      <Sectiune
        titlu="Contacte"
        icon={KeyRound}
        descriere="Adresele confirmate sunt cele cu care intri in cont, si felul in care comenzile tale se leaga de el."
      >
        <GestioneazaContacte contacte={contacte} />
      </Sectiune>

      <Sectiune titlu="Parola" icon={LockKeyhole} descriere="Intri cu emailul si parola; pe un dispozitiv nou iti cerem si un cod pe email.">
        <SchimbaParola areParola={areParola} />
      </Sectiune>

      <Sectiune titlu="Sesiuni" icon={MonitorSmartphone} descriere="Contul ramane deschis pe acest dispozitiv pana iesi din el.">
        <div className="flex flex-wrap gap-2">
          {/* ⚠ Formulare, nu legaturi: iesirea trece prin POST si merge si fara JavaScript. */}
          <form method="post" action="/api/cont/iesire">
            <button type="submit" className={BUTON_SECUNDAR}>
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Iesi din cont
            </button>
          </form>
          <form method="post" action="/api/cont/iesire-peste-tot">
            <button type="submit" className={BUTON_SECUNDAR}>
              <MonitorSmartphone className="h-4 w-4" aria-hidden="true" />
              Iesi de pe toate dispozitivele
            </button>
          </form>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-[var(--st-muted)]">
          Ai intrat de pe un calculator care nu e al tau? Iesi de pe toate dispozitivele si intra din nou doar de aici.
        </p>
      </Sectiune>

      <Sectiune titlu="Descarca datele tale" icon={Download} descriere="Contul, contactele, comenzile, retururile, preferintele si jurnalul intrarilor.">
        {/* ⚠ Formular, nu legatura: descarcarea trece prin POST, deci are si poarta
            de origine, si merge fara JavaScript. */}
        <form method="post" action="/api/cont/export">
          <button type="submit" className={BUTON_SECUNDAR}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Descarca datele mele
          </button>
        </form>
      </Sectiune>

      <Sectiune titlu="Stergerea contului" icon={ShieldAlert} descriere="Ireversibil. Citeste ce se sterge si ce ramane.">
        <StergeContul comenzi={comenzi} />
      </Sectiune>
    </>
  );
}

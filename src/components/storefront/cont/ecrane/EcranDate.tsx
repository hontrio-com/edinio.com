import { Download, KeyRound, LockKeyhole, LogOut, MonitorSmartphone, ShieldAlert, UserRound } from "lucide-react";
import type { ContactulMeu } from "@/lib/cont/date";
import type { ProfilCont } from "@/lib/cont/profil-reguli";
import { EditeazaProfilul } from "../EditeazaProfilul";
import { GestioneazaContacte } from "../GestioneazaContacte";
import { StergeContul } from "../StergeContul";
import { SchimbaParola } from "../SchimbaParola";
import { Mesaj, Sectiune } from "../ui/piese";
import { BUTON_SECUNDAR } from "../ui/clase";

/**
 * Datele contului: contactele, parola, sesiunile, exportul si stergerea.
 *
 * ⚠ Nu exista agenda de adrese: contul n-are asa ceva, deci nu se deseneaza ecran
 * pentru ea. Parola exista din 24.09.2026 (intrarea e cu email si parola).
 */
export function EcranDate({
  profil,
  pozaSrc,
  avatarSvg,
  contacte,
  comenzi,
  areParola,
  eroare = null,
}: {
  profil: ProfilCont;
  pozaSrc: string | null;
  avatarSvg: string;
  contacte: ContactulMeu[];
  comenzi: number;
  areParola: boolean;
  /** Dupa o iesire de peste tot sau un export esuat (formularele navigheaza, deci mesajul vine prin adresa). */
  eroare?: string | null;
}) {
  return (
    <>
      {eroare && <Mesaj fel="eroare">{eroare}</Mesaj>}

      <Sectiune titlu="Profil" icon={UserRound} descriere="Numele, poza, telefonul si adresa de livrare.">
        <EditeazaProfilul profil={profil} pozaSrc={pozaSrc} avatarSvg={avatarSvg} />
      </Sectiune>

      <Sectiune
        titlu="Contacte"
        icon={KeyRound}
        descriere="Cu adresele confirmate intri in cont, iar comenzile plasate cu ele apar automat aici."
      >
        <GestioneazaContacte contacte={contacte} areParola={areParola} />
      </Sectiune>

      <Sectiune titlu="Parola" icon={LockKeyhole} descriere="Intri cu emailul si parola. Uneori iti cerem si un cod trimis pe email.">
        <SchimbaParola areParola={areParola} />
      </Sectiune>

      {/* ⚠ Numerele sunt cele din `privat.cont_reguli_sesiune()` (30 de zile, 14 fara folosire). */}
      <Sectiune
        titlu="Dispozitive conectate"
        icon={MonitorSmartphone}
        descriere="Ramai conectat pe acest dispozitiv cel mult 30 de zile. Daca nu folosesti contul 14 zile, vei fi deconectat."
      >
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
          Ai intrat in cont de pe un calculator strain? Iesi din cont de pe toate dispozitivele, apoi intra din nou de aici.
          Dispozitivele memorate vor fi si ele uitate, asa ca la urmatoarea autentificare iti vom cere din nou codul primit pe email.
        </p>
      </Sectiune>

      <Sectiune titlu="Descarca datele tale" icon={Download} descriere="Contul, contactele, toate comenzile cu detaliile lor, retururile, preferintele, dispozitivele memorate si istoricul autentificarilor.">
        {/* ⚠ Formular, nu legatura: descarcarea trece prin POST, deci are si poarta
            de origine, si merge fara JavaScript. */}
        <form method="post" action="/api/cont/export">
          <button type="submit" className={BUTON_SECUNDAR}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Descarca datele mele
          </button>
        </form>
      </Sectiune>

      <Sectiune titlu="Stergerea contului" icon={ShieldAlert} descriere="Stergerea este definitiva. Vezi mai jos ce se sterge si ce se pastreaza.">
        <StergeContul comenzi={comenzi} areParola={areParola} />
      </Sectiune>
    </>
  );
}

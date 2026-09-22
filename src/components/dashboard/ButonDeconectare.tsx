"use client";

import { useState } from "react";
import { Loader2, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogClose, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * BUTONUL DE DECONECTARE, UNUL SINGUR PENTRU TOATE INTEGRARILE  (22.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Cerut de el: „daca apesi pe Deconecteaza sa iti ceara o confirmare (valabil la
 * toate integrarile)".
 *
 * ⚠⚠ MASURAT INAINTE: din 36 de ecrane de integrare cu deconectare, DOUA
 * intrebau ceva (Trendyol si About You, prin `window.confirm`), iar restul de 34
 * rupeau legatura din prima apasare. La jumatate dintre ele asta inseamna
 * stergerea cheilor din baza: ca sa te intorci, ceri din nou credentialele de la
 * furnizor. Butonul statea in coltul din dreapta sus al cartonasului de cont,
 * adica exact unde se duce mausul cand cauti „setari".
 *
 * ⚠ DE CE O COMPONENTA, SI NU `window.confirm` PUS DE 34 DE ORI.
 *
 * 1. `window.confirm` blocheaza firul si arata ca o fereastra de sistem, nu ca
 *    panoul. Pe o hotarare care sterge acreditari, casuta cenusie a browserului
 *    e taman semnul care se apasa din reflex.
 * 2. Scris de 34 de ori, textul ar fi divergit de la un ecran la altul din prima
 *    saptamana, si tot de 34 de ori ar fi trebuit reparat.
 * 3. Cea mai importanta: un ecran de integrare NOU primeste confirmarea fiindca
 *    foloseste butonul, nu fiindca si-a adus aminte cineva. Vezi
 *    `deconectarea-cere-confirmare.test.ts`, care cere ca orice ecran cu o
 *    actiune de deconectare sa treaca pe aici.
 *
 * ⚠ CE SE PIERDE SE SCRIE PE FATA, si de-aia `cePierzi` nu are implicit: „Esti
 * sigur?" nu e o intrebare, e o formalitate. Omul trebuie sa afle daca pierde
 * cheile, listarile, sau doar legatura.
 */
export function ButonDeconectare({
  nume,
  cePierzi,
  eticheta = "Deconectează",
  pending = false,
  marime = "sm",
  className,
  onConfirma,
}: {
  /** Numele furnizorului, asa cum il stie comerciantul: „Trendyol", „FAN Courier". */
  nume: string;
  /** Ce se pierde, spus limpede. Apare in fereastra, sub intrebare. */
  cePierzi: string;
  /** Doar daca ecranul are nevoie de alt text pe buton. */
  eticheta?: string;
  /** Se invarte cat timp deconectarea chiar se petrece. */
  pending?: boolean;
  marime?: "sm" | "default";
  className?: string;
  onConfirma: () => void;
}) {
  const [deschis, setDeschis] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={marime}
        className={className}
        disabled={pending}
        onClick={() => setDeschis(true)}
      >
        {pending ? <Loader2 className="animate-spin" /> : <Unplug />}
        {eticheta}
      </Button>

      <Dialog open={deschis} onOpenChange={setDeschis}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deconectezi {nume}?</DialogTitle>
            <DialogDescription>{cePierzi}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Anulează</DialogClose>
            {/*
              ⚠ ROSU, fiindca e o rupere, nu o salvare. Si scrie CE face, nu „Da":
              pe un buton rosu, „Da" cere sa-ti amintesti intrebarea.
            */}
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => { setDeschis(false); onConfirma(); }}
            >
              {eticheta}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, UserX } from "lucide-react";
import { toast } from "sonner";

import { intrebareaStergerii, sePoateSterge } from "@/lib/customers/gestionare";
import {
  CE_NU_PUTEM_FACE, CE_RAMANE, CE_SE_STERGE, aAtinsCeva, intrebareaAnonimizarii,
  rezumatulAnonimizarii,
} from "@/lib/customers/anonimizare";
import { anonimizeazaClienti, stergeContact } from "@/lib/actions/customer-manage.actions";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SCOATEREA UNUI OM DIN PLATFORMA                               (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Un singur loc, două drumuri, după cum e omul:
 *
 *   FĂRĂ nicio comandă → se ȘTERGE rândul cu totul. Exista numai ca să poarte
 *                        datele lui; scos, nu rămâne nimic în urmă.
 *   CU comenzi         → se ANONIMIZEAZĂ. Numele, telefonul, emailul și adresa
 *                        dispar; comenzile, facturile și banii rămân.
 *
 * ⚠⚠ ȘI DE CE NU SE ȘTERGE UN CUMPĂRĂTOR CU TOTUL, deși butonul spune „șterge":
 * documentele fiscale se păstrează zece ani. O comandă ștearsă ar face să scadă
 * RETROACTIV venitul unei luni încheiate și ar lăsa o factură emisă fără nimic
 * în spate. Proprietarul a ales anume anonimizarea, întrebat.
 *
 * ⚠ CE RĂMÂNE SE SCRIE PE ECRAN, sub buton, nu doar în confirmare. Un om care
 * crede că a șters un client și îi vede apoi comenzile în rapoarte se sperie și
 * cheamă suportul — sau, mai rău, reia operația.
 */

export function StergeContact({
  businessId,
  cheie,
  nume,
  orderCount,
  onSters,
}: {
  businessId: string;
  cheie: string;
  nume: string;
  orderCount: number;
  onSters: () => void;
}) {
  const router = useRouter();
  const [lucreaza, start] = useTransition();
  /* Un contact fără comenzi se șterge de tot; un cumpărător se anonimizează. */
  const eContact = sePoateSterge({ orderCount });

  function cere() {
    const intrebare = eContact
      ? intrebareaStergerii(nume)
      : intrebareaAnonimizarii(nume, orderCount);
    if (!window.confirm(intrebare)) return;

    start(async () => {
      if (eContact) {
        let r: Awaited<ReturnType<typeof stergeContact>>;
        try {
          r = await stergeContact(businessId, cheie);
        } catch (e) {
          toast.error("Nu am primit răspuns: " + (e as Error).message);
          return;
        }
        if ("error" in r) { toast.error(r.error, { duration: 9000 }); return; }
        toast.success(`Contactul „${nume}” a fost șters.`);
      } else {
        let r: Awaited<ReturnType<typeof anonimizeazaClienti>>;
        try {
          r = await anonimizeazaClienti(businessId, [cheie]);
        } catch (e) {
          /*
            ⚠ NU SE SPUNE „a eșuat". E o tranzacție: ori s-a făcut tot, ori nimic
            — dar dacă a căzut legătura DUPĂ commit, n-avem de unde ști. Se spune
            să se uite, nu se spune că n-a mers.
          */
          toast.error(
            "N-am primit răspuns până la capăt. Reîncarcă pagina și uită-te la client "
            + "înainte să reiei: se poate să fi mers. " + (e as Error).message,
            { duration: 14000 },
          );
          onSters();
          return;
        }
        if ("error" in r) { toast.error(r.error, { duration: 12000 }); return; }

        /* ⚠ Cifrele adevărate, nu „gata": după ceva fără întoarcere, omul are
           nevoie să vadă că s-a atins exact ce credea el. */
        if (!aAtinsCeva(r.urma)) { toast.error(rezumatulAnonimizarii(r.urma)); return; }
        toast.success(rezumatulAnonimizarii(r.urma), { duration: 9000 });
      }

      onSters();
      router.refresh();
    });
  }

  return (
    <div className="border-t border-border pt-3">
      <button
        type="button"
        onClick={cere}
        disabled={lucreaza}
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
      >
        {lucreaza
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : eContact ? <Trash2 className="h-3.5 w-3.5" /> : <UserX className="h-3.5 w-3.5" />}
        {eContact ? "Șterge contactul" : "Șterge datele clientului"}
      </button>

      {eContact ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Contact fără nicio comandă. Se șterge de tot.
        </p>
      ) : (
        <div className="mt-2 space-y-1.5 text-[11px] text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Se șterg:</span>{" "}
            {CE_SE_STERGE.join(", ")}.
          </p>
          <p>
            <span className="font-medium text-foreground">Rămân:</span>{" "}
            {CE_RAMANE.join("; ")}.
          </p>
          <p className="text-muted-foreground/80">{CE_NU_PUTEM_FACE}</p>
        </div>
      )}
    </div>
  );
}

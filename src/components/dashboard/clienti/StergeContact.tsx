"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { DE_CE_NU_SE_STERGE, intrebareaStergerii, sePoateSterge } from "@/lib/customers/gestionare";
import { stergeContact } from "@/lib/actions/customer-manage.actions";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * STERGEREA UNUI CONTACT (G4)                                   (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ NUMAI UN CONTACT FARA NICIO COMANDA. Un cumparator are in spate facturi
 * fiscale, AWB-uri si bani incasati; sters, ar ramane comenzi fara nume si
 * facturi care arata catre nimeni — iar facturile nu se pot reface, au plecat
 * deja la SmartBill si la client.
 *
 * ⚠ BUTONUL SE ARATA SI CAND NU SE POATE, dar stins, cu motivul scris dedesubt.
 * Ascuns cu totul, un comerciant care cauta unde se sterge un client ar fi
 * cautat prin toate filele, apoi prin Setari, si ar fi ajuns la suport.
 *
 * ⚠ Judecata adevarata e oricum in baza, in chiar instructiunea care sterge
 * (`customer_delete_contact`). Aici e doar ce se vede.
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
  const [sterge, startStergere] = useTransition();
  const poate = sePoateSterge({ orderCount });

  function cere() {
    if (!poate) return;
    if (!window.confirm(intrebareaStergerii(nume))) return;

    startStergere(async () => {
      let r: Awaited<ReturnType<typeof stergeContact>>;
      try {
        r = await stergeContact(businessId, cheie);
      } catch (e) {
        toast.error("Nu am primit răspuns: " + (e as Error).message);
        return;
      }
      /*
        ⚠ Si „zero randuri" vine tot ca eroare din actiune, nu ca izbanda:
        inseamna ca paza din baza a oprit stergerea, sau ca altcineva a sters
        contactul inaintea noastra.
      */
      if ("error" in r) { toast.error(r.error, { duration: 9000 }); return; }

      toast.success(`Contactul „${nume}” a fost șters.`);
      onSters();
      router.refresh();
    });
  }

  return (
    <div className="border-t border-border pt-3">
      <button
        type="button"
        onClick={cere}
        disabled={!poate || sterge}
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-transparent"
      >
        {sterge ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        Șterge contactul
      </button>
      {!poate && (
        <p className="mt-1 text-[11px] text-muted-foreground">{DE_CE_NU_SE_STERGE}</p>
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { dezleagaComandaDeCont } from "@/lib/actions/conturi-panou.actions";

/**
 * Dezleaga o comanda pe care a legat-o comerciantul de mana.
 *
 * ⚠ Butonul apare NUMAI la acelea (`legat-de-comerciant`), si baza refuza oricum
 * pe celelalte: o comanda venita pe adresa confirmata a omului s-ar fi legat la
 * loc la urmatoarea intrare, iar una plasata din cont e a lui fara discutie.
 * ⚠ Cere a doua apasare („Sigur?”), fiindca omul pierde pe loc comanda din cont.
 */
export function DezleagaComanda({
  businessId,
  contId,
  orderId,
  numar,
}: {
  businessId: string;
  contId: string;
  orderId: string;
  numar: string;
}) {
  const router = useRouter();
  const [lucreaza, start] = useTransition();
  const [sigur, setSigur] = useState(false);

  return (
    <button
      type="button"
      disabled={lucreaza}
      onBlur={() => setSigur(false)}
      onClick={() => {
        if (!sigur) {
          setSigur(true);
          /* Safari nu da focus unui buton apasat, deci `onBlur` nu vine mereu: se dezarmeaza singur. */
          setTimeout(() => setSigur(false), 4000);
          return;
        }
        start(async () => {
          let r: Awaited<ReturnType<typeof dezleagaComandaDeCont>>;
          try {
            r = await dezleagaComandaDeCont(businessId, contId, orderId);
          } catch {
            toast.error("Nu am primit răspuns. Reîncarcă pagina și uită-te la comenzile contului înainte să reiei.");
            return;
          }
          setSigur(false);
          if ("error" in r) {
            toast.error(r.error, { duration: 9000 });
            return;
          }
          toast.success(r.mesaj);
          router.refresh();
        });
      }}
      aria-label={sigur ? `Confirmă dezlegarea comenzii ${numar}` : `Dezleagă comanda ${numar} de cont`}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
    >
      {lucreaza && <Loader2 className="h-3 w-3 animate-spin" />}
      {sigur ? "Sigur? Apasă din nou" : "Dezleagă"}
    </button>
  );
}

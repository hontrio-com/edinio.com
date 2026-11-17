"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RotateCcw } from "lucide-react";
import { inregistreazaStornareaEasybill } from "@/lib/actions/easybill.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

/**
 * „Ai stornat factura în easybill? Înregistreaz-o aici”: randul discret din fila easybill a paginii
 * comenzii. API-ul easybill n-are stornare, deci omul o face in easybill si ne spune seria si numarul.
 *
 * ⚠ NU INREGISTREAZA PE INCREDERE: actiunea cauta documentul in easybill si il verifica (finalizat,
 * neanulat, total negativ). Aici doar se aduna seria si numarul si se spune limpede ce a iesit.
 */
export function EasybillStornareManuala({ businessId, orderId }: { businessId: string; orderId: string }) {
  const router = useRouter();
  const [deschis, setDeschis] = useState(false);
  const [serie, setSerie] = useState("");
  const [numar, setNumar] = useState("");
  const [lucreaza, setLucreaza] = useState(false);

  async function inregistreaza() {
    if (!numar.trim()) {
      toast.error("Scrie numărul stornării, exact cum apare în easybill.");
      return;
    }
    setLucreaza(true);
    try {
      const r = await inregistreazaStornareaEasybill(businessId, orderId, { serie: serie.trim(), numar: numar.trim() });
      if ("error" in r) {
        toast.error(r.error, { duration: 12000 });
        return;
      }
      const et = [r.series, r.number].filter(Boolean).join(" ");
      if (r.avertisment) toast.warning(`Stornarea ${et} s-a înregistrat pe comandă. ${r.avertisment}`, { duration: 15000 });
      else toast.success(`Stornarea ${et} s-a înregistrat pe comandă.`);
      setDeschis(false);
      setSerie("");
      setNumar("");
      router.refresh();
    } catch {
      toast.error("Nu am primit răspuns de la server. Încearcă din nou.");
    } finally {
      setLucreaza(false);
    }
  }

  if (!deschis) {
    return (
      <button
        type="button"
        onClick={() => setDeschis(true)}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Ai stornat factura în easybill? Înregistreaz-o aici
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Scrie seria și numărul stornării, cum apar în easybill. Le căutăm acolo și le înregistrăm doar dacă documentul e o stornare finalizată, cu total negativ.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
        <Field label="Serie" htmlFor={`easybill-storno-serie-${orderId}`}>
          <Input id={`easybill-storno-serie-${orderId}`} type="text" autoComplete="off" value={serie}
            onChange={(e) => setSerie(e.target.value)} placeholder="ex: EBF" className="font-mono" disabled={lucreaza} />
        </Field>
        <Field label="Număr" htmlFor={`easybill-storno-numar-${orderId}`} required>
          <Input id={`easybill-storno-numar-${orderId}`} type="text" autoComplete="off" value={numar}
            onChange={(e) => setNumar(e.target.value)} placeholder="ex: 961" className="font-mono" disabled={lucreaza}
            onKeyDown={(e) => { if (e.key === "Enter" && !lucreaza) { e.preventDefault(); void inregistreaza(); } }} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={inregistreaza} disabled={lucreaza || !numar.trim()}>
          {lucreaza ? <Loader2 className="animate-spin" /> : <RotateCcw />}
          {lucreaza ? "Se verifică..." : "Verifică și înregistrează"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDeschis(false)} disabled={lucreaza}>
          Renunță
        </Button>
      </div>
    </div>
  );
}

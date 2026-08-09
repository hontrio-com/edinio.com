"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils/format";
import {
  deblocheazaOperatieAction,
  operatiiAtarnateAction,
} from "@/lib/actions/operatii.actions";
import type { OperatieAtarnata } from "@/lib/operatii/registru";

/**
 * Operatiile externe ramase atarnate pe comanda asta.
 *
 * ═══ CAND SE VEDE ═══
 *
 * Aproape niciodata, si asa trebuie: lista goala inseamna ca fiecare AWB si fiecare
 * factura si-au aflat soarta. Panoul apare doar cand o operatie a ramas `in_curs`
 * (am chemat furnizorul si n-am apucat sa scriem rezultatul) sau `necunoscut`
 * (raspunsul nu a ajuns). In amandoua cazurile operatia s-ar putea sa fi REUSIT
 * acolo, deci butonul care ar reface-o e blocat.
 *
 * ═══ DE CE ARE NEVOIE DE OM ═══
 *
 * Nu deblocam automat dupa un timp. Daca procesul a murit intre apel si scriere,
 * furnizorul cel mai probabil A FACUT operatia, iar o expirare automata ar reface-o
 * — adica exact duplicatul pe care il inchidem. Singurul care poate raspunde e
 * cineva care se uita in contul furnizorului.
 */
export function OperatiiAtarnate({
  businessId,
  orderId,
}: {
  businessId: string;
  orderId: string;
}) {
  const [operatii, setOperatii] = useState<OperatieAtarnata[]>([]);
  const [deschis, setDeschis] = useState<string | null>(null);
  /** Motiv PE OPERATIE: cu o singura stare, scrisul intr-un rand golea formularul altuia. */
  const [motive, setMotive] = useState<Record<string, string>>({});
  /** La fel pentru „se lucreaza": altfel apasarea pe o operatie dezactiva butoanele tuturor. */
  const [inLucru, setInLucru] = useState<string | null>(null);
  const [seIncarca, setSeIncarca] = useState(true);

  /*
   * Reincarcarea la FOCUS nu e o rafinare, e chiar drumul comerciantului.
   *
   * Cand o operatie se blocheaza, mesajul ii spune sa verifice in contul
   * furnizorului. El deschide alt tab, se uita, si se intoarce. Fara reincarcare,
   * panoul ar aparea abia la urmatoarea incarcare de pagina — adica supapa ar lipsi
   * exact in clipa si in sesiunea in care e nevoie de ea.
   */
  useEffect(() => {
    let activ = true;
    const incarca = () => {
      operatiiAtarnateAction(businessId, orderId)
        .then((r) => { if (activ) setOperatii(r); })
        .finally(() => { if (activ) setSeIncarca(false); });
    };
    incarca();
    window.addEventListener("focus", incarca);
    return () => { activ = false; window.removeEventListener("focus", incarca); };
  }, [businessId, orderId]);

  // Cazul normal: nimic atarnat, deci niciun chenar de alarma pe o comanda sanatoasa.
  if (seIncarca || operatii.length === 0) return null;

  async function deblocheaza(op: OperatieAtarnata) {
    setInLucru(op.id);
    try {
      const r = await deblocheazaOperatieAction(businessId, op.id, motive[op.id] ?? "");
      if (!r.ok) { toast.error(r.mesaj); return; }
      setOperatii((v) => v.filter((x) => x.id !== op.id));
      setDeschis(null);
      setMotive((v) => { const n = { ...v }; delete n[op.id]; return n; });
      /*
       * Mesajul urmeaza ce s-a intamplat CU ADEVARAT. Daca intre afisarea panoului
       * si apasare operatia s-a incheiat singura cu succes, „poti incerca din nou"
       * ar fi o minciuna: randul e stabil pe `reusit` si urmatoarea apasare va fi
       * refuzata la fel. Vezi `deblocheazaOperatie`.
       */
      toast.success(
        r.stabilizata
          ? "Operatia se incheiase intre timp cu succes. Reincarca pagina ca sa vezi rezultatul."
          : "Operatia a fost deblocata. Poti incerca din nou.",
      );
    } finally {
      setInLucru(null);
    }
  }

  return (
    // `mb-5` sta AICI, nu pe fratele de dedesubt: cand nu e nimic atarnat
    // componenta intoarce `null` si nu ramane niciun spatiu gol in pagina.
    <div className="mb-5 rounded-lg border border-warning/40 bg-warning/5 p-4">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {operatii.length === 1 ? "O operatie a ramas neterminata" : `${operatii.length} operatii au ramas neterminate`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Nu stim daca s-au facut la furnizor, deci nu le repetam singuri: o a doua
            incercare ar putea produce un duplicat platit. Verifica in contul
            furnizorului, apoi deblocheaza aici.
          </p>

          <ul className="mt-3 space-y-3">
            {operatii.map((op) => (
              <li key={op.id} className="rounded-md border border-border bg-background p-3">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-sm font-medium text-foreground">
                    {eticheta(op)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(op.creatLa)}
                    {op.incercari > 1 ? ` · ${op.incercari} incercari` : ""}
                  </span>
                </div>
                {op.ultimaEroare ? (
                  <p className="mt-1 break-words text-xs text-muted-foreground">{op.ultimaEroare}</p>
                ) : null}

                {deschis === op.id ? (
                  <div className="mt-3 space-y-2">
                    <label className="block text-xs text-muted-foreground" htmlFor={`motiv-${op.id}`}>
                      Ce ai verificat in contul {op.furnizor}?
                    </label>
                    <input
                      id={`motiv-${op.id}`}
                      value={motive[op.id] ?? ""}
                      onChange={(e) => setMotive((v) => ({ ...v, [op.id]: e.target.value }))}
                      placeholder="ex: nu exista niciun AWB pe comanda asta"
                      className="w-full max-w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => void deblocheaza(op)} disabled={inLucru === op.id}>
                        {inLucru === op.id ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
                        Confirma deblocarea
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeschis(null)} disabled={inLucru === op.id}>
                        Renunta
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    onClick={() => setDeschis(op.id)}
                  >
                    Am verificat, deblocheaza
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function eticheta(op: OperatieAtarnata): string {
  const ce =
    op.fel === "awb" ? "Emiterea AWB"
      : op.fel === "anulare_awb" ? "Anularea AWB"
      : op.fel === "factura" ? "Emiterea facturii"
      : op.fel === "proforma" ? "Emiterea proformei"
      : op.fel === "storno" ? "Stornarea"
      : op.fel === "anulare_document" ? "Anularea documentului"
      : op.fel === "ridicare" ? "Comanda de ridicare"
      : op.fel === "plata" ? "Plata"
      : op.fel === "incasare" ? "Incasarea"
      : op.fel === "rambursare" ? "Rambursarea"
      : "Operatia";
  // `in_curs` si `necunoscut` nu inseamna acelasi lucru pentru cel care citeste:
  // primul e „a plecat si nu s-a mai auzit nimic", al doilea „a raspuns prost".
  const stare = op.stare === "in_curs" ? "a plecat si nu s-a mai auzit nimic" : "raspunsul nu a ajuns";
  return `${ce} la ${op.furnizor} — ${stare}`;
}

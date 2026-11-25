"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { BUTON_CONTUR, BUTON_PLIN, SECTIUNE } from "@/components/dashboard/atomi-panou";
import { cn } from "@/lib/utils/cn";
import { formatDateTime } from "@/lib/utils/format";
import {
  deblocheazaOperatieAction,
  operatiiAtarnateAction,
  refuzuriPeComandaAction,
} from "@/lib/actions/operatii.actions";
import type { OperatieAtarnata, RefuzOperatie } from "@/lib/operatii/registru";

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
  const [refuzuri, setRefuzuri] = useState<RefuzOperatie[]>([]);
  /** ⚠ Starea a treia: nu „zero refuzuri", ci „n-am putut afla". Vezi `RezultatRefuzuri`. */
  const [refuzuriNecitite, setRefuzuriNecitite] = useState(false);

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
      /*
        ⚠ CERERE SEPARATA, DINADINS. Un refuz nu blocheaza nimic si nu are nevoie
        de nicio hotarare — daca citirea lui pica, panoul de deblocare trebuie sa
        apara oricum. Alaturate intr-un `Promise.all`, o eroare pe refuzuri ar fi
        ascuns supapa care chiar conteaza.
      */
      refuzuriPeComandaAction(businessId, orderId)
        .then((r) => {
          if (!activ) return;
          setRefuzuriNecitite(!r.ok);
          setRefuzuri(r.ok ? r.refuzuri : []);
        })
        /* ⚠ Si o cadere de retea e tot „n-am putut afla". Inainte era `.catch(() => {})`,
           adica tacere: al treilea drum prin care un refuz ramanea nevazut. */
        .catch(() => { if (activ) setRefuzuriNecitite(true); });
    };
    incarca();
    window.addEventListener("focus", incarca);
    return () => { activ = false; window.removeEventListener("focus", incarca); };
  }, [businessId, orderId]);

  /* Cazul normal: nimic atarnat SI niciun refuz, deci niciun chenar pe o comanda sanatoasa.
     ⚠ `refuzuriNecitite` intra in conditie: fara el, tocmai starea „n-am putut afla" ar fi
     iesit din componenta cu `null`, adica exact tacerea pe care reparatia o inchide. */
  if (seIncarca || (operatii.length === 0 && refuzuri.length === 0 && !refuzuriNecitite)) return null;

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
          ? "Operația se încheiase între timp cu succes. Reîncarcă pagina ca să vezi rezultatul."
          : "Operația a fost deblocată. Poți încerca din nou.",
      );
    } finally {
      setInLucru(null);
    }
  }

  return (
    <>
    {/* `mb-5` sta pe fiecare chenar, nu pe invelis: cand unul lipseste, nu
        ramane niciun spatiu gol in pagina. */}
    {operatii.length > 0 ? (
    <div className={cn(SECTIUNE, "mb-5 p-4")}>
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {operatii.length === 1 ? "O operație a rămas neterminată" : `${operatii.length} operații au rămas neterminate`}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Nu știm dacă s-au făcut la furnizor, deci nu le repetăm singuri: o a doua
            încercare ar putea produce un duplicat plătit. Verifică în contul
            furnizorului, apoi deblochează aici.
          </p>

          <ul className="mt-3 space-y-3">
            {operatii.map((op) => (
              <li key={op.id} className="rounded-lg bg-background p-3 ring-1 ring-black/10">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-sm font-medium text-foreground">
                    {eticheta(op)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(op.creatLa)}
                    {op.incercari > 1 ? ` · ${op.incercari} încercări` : ""}
                  </span>
                </div>
                {op.ultimaEroare ? (
                  <p className="mt-1 break-words text-xs text-muted-foreground">{op.ultimaEroare}</p>
                ) : null}

                {deschis === op.id ? (
                  <div className="mt-3 space-y-2">
                    <label className="block text-xs text-muted-foreground" htmlFor={`motiv-${op.id}`}>
                      Ce ai verificat în contul {op.furnizor}?
                    </label>
                    <input
                      id={`motiv-${op.id}`}
                      value={motive[op.id] ?? ""}
                      onChange={(e) => setMotive((v) => ({ ...v, [op.id]: e.target.value }))}
                      placeholder="de pildă: nu există niciun AWB pe comanda asta"
                      className="h-9 w-full max-w-full rounded-lg bg-surface px-2.5 text-sm text-foreground outline-none ring-1 ring-black/10 focus-visible:ring-2 focus-visible:ring-ring max-lg:h-10"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={BUTON_PLIN} onClick={() => void deblocheaza(op)} disabled={inLucru === op.id}>
                        {inLucru === op.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        Confirmă deblocarea
                      </button>
                      <button type="button" className={BUTON_CONTUR} onClick={() => setDeschis(null)} disabled={inLucru === op.id}>
                        Renunță
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className={cn(BUTON_CONTUR, "mt-3")} onClick={() => setDeschis(op.id)}>
                    Am verificat, deblochează
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
    ) : null}

    {/*
      ═══ ⚠ REFUZURILE, CARE PANA ACUM NU SE VEDEAU NICAIERI ═══

      Un rand `esuat` nu ajungea nici in panoul de mai sus (filtreaza
      `in_curs`/`necunoscut`), nici in santinela, nici in vreo notificare. Pe calea
      manuala traia intr-un toast de cateva secunde; pe cea automata, in nimic.

      Masurat pe VetDepo: patru facturi refuzate intre 11.08 si 01.09.2026, zero
      emise, si comerciantul a aflat abia cand a scris el ca „nu merge Oblio".

      ⚠ ALT CHENAR, ALT INTELES. Aici nu e niciun buton: nu e nimic de deblocat si
      nicio hotarare de luat. Furnizorul a spus limpede nu, si nu s-a intamplat
      nimic la el. Singurul lucru care lipsea era sa se stie.
    */}
    {refuzuriNecitite ? (
      <div className={cn(SECTIUNE, "mb-5 p-4")}>
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Nu am putut citi starea operațiilor refuzate pentru comanda asta. Nu înseamnă că
            nu există: înseamnă că nu știm. Reîncarcă pagina.
          </p>
        </div>
      </div>
    ) : null}

    {refuzuri.length > 0 ? (
      <div className="mb-5 rounded-xl bg-surface p-4 ring-1 ring-destructive/30">
        <div className="flex items-start gap-2">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              {refuzuri.length === 1
                ? "O operație a fost refuzată de furnizor"
                : `${refuzuri.length} operații au fost refuzate de furnizor`}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Nu s-a întâmplat nimic la ei, deci se poate încerca din nou după ce
              repari ce spune mesajul. Dacă mesajul vorbește despre setări, se
              repară la Integrări.
            </p>

            <ul className="mt-3 space-y-3">
              {refuzuri.map((r) => (
                <li key={r.id} className="rounded-lg bg-background p-3 ring-1 ring-black/10">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-sm font-medium text-foreground">
                      {etichetaFel(r.fel)} la {r.furnizor}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(r.creatLa)}
                      {r.incercari > 1 ? ` · ${r.incercari} încercări` : ""}
                    </span>
                  </div>
                  {/* Mesajul furnizorului, NETRADUS si netaiat: el spune ce e de reparat. */}
                  <p className="mt-1 whitespace-pre-line break-words text-xs text-muted-foreground">
                    {r.mesaj}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}

/**
 * Numele felului de operatie, in romaneste.
 *
 * ⚠ Scos din `eticheta` ca sa-l foloseasca si chenarul de refuzuri. Doua liste
 * paralele de `fel` s-ar fi despartit la primul fel nou adaugat, iar cea uitata
 * ar fi scris „Operatia" fara ca nimic sa cada.
 */
function etichetaFel(fel: OperatieAtarnata["fel"]): string {
  return fel === "awb" ? "Emiterea AWB"
    : fel === "anulare_awb" ? "Anularea AWB"
    : fel === "factura" ? "Emiterea facturii"
    : fel === "proforma" ? "Emiterea proformei"
    : fel === "storno" ? "Stornarea"
    : fel === "anulare_document" ? "Anularea documentului"
    : fel === "ridicare" ? "Comanda de ridicare"
    : fel === "plata" ? "Plata"
    : fel === "incasare" ? "Încasarea"
    : fel === "rambursare" ? "Rambursarea"
    : fel === "publicare" ? "Publicarea pe marketplace"
    : fel === "retragere" ? "Retragerea de pe marketplace"
    : fel === "expediere" ? "Confirmarea expedierii"
    : fel === "export" ? "Trimiterea în contabilitate"
    : "Operația";
}

/** Numele caselor de facturare si al contabilitatii, cum le stie omul (restul raman cu id-ul lor). */
const NUME_FURNIZOR: Record<string, string> = {
  smartbill: "SmartBill", oblio: "Oblio", fgo: "fGO", facturis: "Facturis",
  factureaza: "Factureaza.ro", easybill: "easybill", saga: "SAGA",
};

function eticheta(op: OperatieAtarnata): string {
  // `in_curs` si `necunoscut` nu inseamna acelasi lucru pentru cel care citeste:
  // primul e „a plecat si nu s-a mai auzit nimic", al doilea „a raspuns prost".
  const stare = op.stare === "in_curs" ? "a plecat și nu s-a mai auzit nimic" : "răspunsul nu a ajuns";
  return `${etichetaFel(op.fel)} la ${NUME_FURNIZOR[op.furnizor] ?? op.furnizor}: ${stare}`;
}

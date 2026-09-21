"use client";

import { useEffect, useState, useTransition } from "react";
import { X, Loader2, Truck, AlertCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useDialogAccesibil } from "./useDialogAccesibil";
import { getWootSenderLocations } from "@/lib/actions/woot.actions";
import { pregatesteLotWoot, emiteLotWoot, type PregatireLot, type RezultatLot } from "@/lib/actions/woot-lot.actions";
import { cerePunctDePredare } from "@/lib/woot/lot";
import type { WootLocation, WootPriceResult } from "@/lib/woot";

/*
  ═══════════════════════════════════════════════════════════════════════════
  AWB-URI WOOT PENTRU MAI MULTE COMENZI: SE INTREABA O DATA
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ DE CE EXISTA fereastra asta, cand celelalte paisprezece loturi n-au niciuna:
  Woot e broker, iar serviciul vine dintr-o cotatie LIVE. Nu e scris pe comanda
  (masurat: zero din 267 il poarta) si nu se poate lua nici dupa numele celui de
  data trecuta, fiindca numele acela s-a schimbat deja sub noi odata. Deci se
  intreaba, o singura data, pentru tot lotul. Vezi `@/lib/woot/lot.ts`.

  ⚠ SE ARATA CE SE SARE INAINTE DE APASARE, nu dupa. Emiterea costa bani si nu se
  poate lua inapoi la toti curierii; un om care vede „18 selectate" si primeste 12
  AWB-uri nu mai are cum sa afle care sase lipsesc decat cautand prin tabel.
*/

interface Props {
  open: boolean;
  onClose: () => void;
  businessId: string;
  orderIds: string[];
  onDone: () => void;
}

export function WootBulkModal(props: Props) {
  /* Montata abia la deschidere: altfel ar cere cotatia la incarcarea paginii. */
  if (!props.open) return null;
  return <Formular {...props} />;
}

function Formular({ onClose, businessId, orderIds, onDone }: Props) {
  const [pregatire, setPregatire] = useState<PregatireLot | null>(null);
  const [eroare, setEroare] = useState("");
  const [seIncarca, setSeIncarca] = useState(true);

  const [ales, setAles] = useState<WootPriceResult | null>(null);
  const [puncte, setPuncte] = useState<WootLocation[]>([]);
  const [seIncarcaPuncte, setSeIncarcaPuncte] = useState(false);
  const [punctId, setPunctId] = useState<number | null>(null);

  const [emite, startEmitere] = useTransition();
  const [rezultat, setRezultat] = useState<RezultatLot | null>(null);

  const cutia = useDialogAccesibil(true, onClose);

  useEffect(() => {
    let anulat = false;
    void (async () => {
      let r: Awaited<ReturnType<typeof pregatesteLotWoot>>;
      try {
        r = await pregatesteLotWoot(businessId, orderIds);
      } catch (e) {
        /* ⚠ O CITIRE: nu s-a schimbat nimic la Woot, deci se poate reincerca linistit. */
        if (!anulat) { setEroare("Nu am primit răspuns: " + (e as Error).message); setSeIncarca(false); }
        return;
      }
      if (anulat) return;
      setSeIncarca(false);
      if ("error" in r) { setEroare(r.error); return; }
      setPregatire(r);
    })();
    return () => { anulat = true; };
  }, [businessId, orderIds]);

  function alege(s: WootPriceResult) {
    setAles(s);
    setPuncte([]);
    setPunctId(null);
    if (!cerePunctDePredare(s)) return;

    /*
      ⚠ Punctul de predare se alege O SINGURA DATA pentru tot lotul, si asta e corect:
      expeditorul e acelasi la toate comenzile. (Punctul de LIVRARE ar fi fost altceva,
      si de aceea serviciile care livreaza la locker nici nu apar in lista de mai sus.)
    */
    setSeIncarcaPuncte(true);
    void (async () => {
      let r: Awaited<ReturnType<typeof getWootSenderLocations>>;
      try {
        r = await getWootSenderLocations(businessId, s.courier_id);
      } catch (e) {
        toast.error("Woot nu a răspuns la locațiile de predare: " + (e as Error).message);
        setSeIncarcaPuncte(false);
        return;
      }
      setSeIncarcaPuncte(false);
      if (r.success && r.locations) setPuncte(r.locations);
      else if (r.error) toast.error(r.error);
    })();
  }

  const cerePunct = !!ales && cerePunctDePredare(ales);
  const gata = !!ales && (!cerePunct || !!punctId);
  const cate = pregatire?.eligibile.length ?? 0;

  function porneste() {
    if (!ales) return;
    /*
      ⚠ CONFIRMARE, ca la celelalte loturi de AWB-uri: sunt expedieri REALE, platite.
      Textul spune numarul si serviciul, nu doar „ești sigur?".
    */
    if (!window.confirm(
      `Emiți ${cate} ${cate === 1 ? "AWB" : "AWB-uri"} la Woot, pe „${ales.courier_name} · ${ales.service_name}”? `
      + "Sunt expedieri REALE, plătite. Verifică creditul contului înainte.",
    )) return;

    startEmitere(async () => {
      let r: Awaited<ReturnType<typeof emiteLotWoot>>;
      try {
        r = await emiteLotWoot(businessId, orderIds, ales.service_id, punctId ?? undefined);
      } catch (e) {
        /*
          ⚠ EMITEREA SCHIMBA LA WOOT: nu se spune „a eșuat". O parte din AWB-uri pot
          fi plecat, iar o reluare oarbă ar face al doilea colet pe aceeași comandă.
        */
        toast.error(
          "Woot nu a răspuns până la capăt. O parte din AWB-uri pot fi deja emise: "
          + "reîncarcă pagina și uită-te la comenzi înainte să reiei. " + (e as Error).message,
          { duration: 16000 },
        );
        onDone();
        return;
      }
      if ("error" in r) { toast.error(r.error); return; }
      setRezultat(r);
      onDone();
      if (r.failed > 0) toast.error(`Woot: ${r.done} emise, ${r.failed} eșuate.`);
      else toast.success(`Woot: ${r.done} ${r.done === 1 ? "AWB emis" : "AWB-uri emise"}.`);
    });
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" onClick={onClose} />
      <div
        ref={cutia}
        role="dialog"
        aria-modal="true"
        aria-label="AWB-uri Woot pentru mai multe comenzi"
        className="fixed left-1/2 top-1/2 z-50 w-[min(42rem,calc(100vw-2rem))] max-h-[85vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">AWB-uri Woot în masă</h2>
            <p className="text-xs text-muted-foreground">
              Woot e broker: serviciul se alege o dată, aici, și se folosește pe toate comenzile.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Închide" className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {seIncarca && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cer prețurile de la Woot…
          </p>
        )}

        {eroare && (
          <p className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {eroare}
          </p>
        )}

        {pregatire && !rezultat && (
          <>
            <p className="mb-3 text-sm text-foreground">
              <span className="font-semibold">{cate}</span>{" "}
              {cate === 1 ? "comandă intră în lot" : "comenzi intră în lot"}
              {pregatire.cotatPe && (
                <span className="text-muted-foreground">
                  {" "}· prețurile de mai jos sunt de pe ruta comenzii {pregatire.cotatPe}
                </span>
              )}
              {pregatire.credit != null && (
                <span className="text-muted-foreground"> · credit în cont: {pregatire.credit} lei</span>
              )}
            </p>

            {pregatire.sarite.length > 0 && (
              <div className="mb-3 rounded-lg border border-border p-3">
                <p className="mb-1 text-xs font-semibold text-foreground">
                  {pregatire.sarite.length} {pregatire.sarite.length === 1 ? "comandă nu intră" : "comenzi nu intră"}
                </p>
                <ul className="space-y-1">
                  {pregatire.sarite.map((s) => (
                    <li key={s.comanda} className="text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground">{s.comanda}</span>: {s.motiv}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {cate > 0 && pregatire.servicii.length === 0 && (
              <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                Pe ruta primei comenzi, Woot oferă doar servicii cu livrare la punct (locker). Acelea nu
                intră într-un lot: punctul e altul pentru fiecare cumpărător. Emite comenzile individual.
              </p>
            )}

            {pregatire.servicii.length > 0 && (
              <div className="space-y-1.5">
                {pregatire.servicii.map((s) => (
                  <label
                    key={s.service_id}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl border p-2.5 transition-colors ${
                      ales?.service_id === s.service_id ? "border-primary/40 bg-primary/5" : "border-border"
                    }`}
                  >
                    <input
                      type="radio"
                      name="serviciu-woot"
                      checked={ales?.service_id === s.service_id}
                      onChange={() => alege(s)}
                      className="h-4 w-4 accent-[var(--primary)]"
                    />
                    <Truck className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-foreground">{s.courier_name} · {s.service_name}</span>
                    <span className="ml-auto text-sm font-semibold text-foreground">
                      {s.final_total} lei
                    </span>
                  </label>
                ))}
              </div>
            )}

            {cerePunct && (
              <div className="mt-3">
                <p className="mb-1 text-xs text-muted-foreground">
                  Serviciul ăsta cere să predai tu coletele la un punct. Alege-l o dată, pentru tot lotul.
                </p>
                {seIncarcaPuncte ? (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Aduc punctele de predare…
                  </p>
                ) : (
                  <select
                    value={punctId ?? ""}
                    onChange={(e) => setPunctId(e.target.value ? Number(e.target.value) : null)}
                    aria-label="Punctul de predare"
                    className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                  >
                    <option value="">Alege punctul de predare…</option>
                    {puncte.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} · {p.address}, {p.city_name}</option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <Button onClick={porneste} disabled={!gata || emite || cate === 0} size="lg" className="mt-4 w-full">
              {emite && <Loader2 className="h-4 w-4 animate-spin" />}
              Emite {cate} {cate === 1 ? "AWB" : "AWB-uri"}
            </Button>
          </>
        )}

        {rezultat && (
          <div className="space-y-2">
            <p className="text-sm text-foreground">
              <span className="text-success font-semibold">{rezultat.done} emise</span>
              {rezultat.skipped > 0 && <span className="text-muted-foreground"> · {rezultat.skipped} sărite</span>}
              {rezultat.failed > 0 && <span className="text-destructive"> · {rezultat.failed} eșuate</span>}
            </p>
            {rezultat.oprit && (
              <p className="text-xs text-muted-foreground">
                Lotul s-a oprit la timp, iar restul comenzilor nu au fost nici măcar încercate.
                Selectează-le din nou și reia: nimic nu s-a emis de două ori.
              </p>
            )}
            {rezultat.errors.length > 0 && (
              <ul className="space-y-1">
                {rezultat.errors.map((e, i) => (
                  <li key={`${e.comanda}-${i}`} className="text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground">{e.comanda}</span>: {e.motiv}
                  </li>
                ))}
              </ul>
            )}
            <Button variant="ghost" onClick={onClose} className="w-full">Închide</Button>
          </div>
        )}
      </div>
    </>
  );
}

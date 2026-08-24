"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertCircle, CheckCircle, Download, Loader2, Package, Truck, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  descarcaEtichetaAwbEmag, emiteAwbEmag, pregatireAwbEmag, type PregatireAwbEmag,
} from "@/lib/actions/emag.actions";
import { coleteDeTrimis } from "@/lib/emag/colete";
import { useGreutateaAwb, notaGreutate } from "./useGreutateaAwb";
import type { Database } from "@/types/database.types";

type Order = Database["public"]["Tables"]["orders"]["Row"];

/**
 * AWB pentru o comandă eMAG.
 *
 * ═══ ⚠ ADRESA NU SE POATE EDITA, ȘI ASTA E TOT ROSTUL ECRANULUI ═══
 *
 * La toate celelalte modaluri de AWB din Edinio, destinatarul se completează într-un
 * formular. Aici NU. Adresa unei comenzi de marketplace e a lor și nu se negociază:
 * eMAG o dă, clientul a comandat pe ea, iar un curier trimis altundeva înseamnă
 * marfă pierdută și un client care n-a primit nimic.
 *
 * Deci ea se ARATĂ, ca omul să o vadă, dar câmpurile nu există — fiindcă
 * `emiteAwbEmag` le-ar fi ignorat oricum, iar un formular ale cărui valori se aruncă
 * e mai rău decât niciunul: promite o putere pe care n-o are.
 *
 * ═══ ⚠ CE SE SPUNE ÎNAINTE DE APĂSARE ═══
 *
 * Emiterea costă bani: curierul vine, iar un al doilea AWB e al doilea transport
 * plătit. Deci prin ce curier pleacă și cât se încasează la livrare se citesc DE LA
 * EI înainte, nu se află din rezultat. Iar când nu se poate — comandă FBE, listă de
 * curieri impusă goală, niciun cont potrivit — se spune de ce, în loc să se apese și
 * să vină un refuz despre un cont pe care omul l-ar căuta în setările lui.
 */

interface Props {
  onClose: () => void;
  order: Order;
  businessId: string;
  onSuccess: () => void;
}

const CAMP =
  "w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

interface AdresaEmag {
  street?: string;
  city?: string;
  county?: string;
  postal_code?: string;
  contact?: string;
  phone?: string;
  locker_name?: string | null;
}

export function EmagAwbModal({ onClose, order, businessId, onSuccess }: Props) {
  const [pregatire, setPregatire] = useState<PregatireAwbEmag | null>(null);
  /*
   * ⚠ Porneste pe `true`, si de aceea modalul se MONTEAZA abia la deschidere (vezi
   * `EmagFulfillmentPanel`). Pus pe `false` si aprins in efect, `eslint` se plange pe
   * drept: un `setState` sincron in corpul unui efect declanseaza o a doua randare
   * inainte ca ecranul sa fi apucat sa arate ceva. Montat proaspat, starea de start e
   * chiar cea corecta si nu mai are cine s-o schimbe degeaba.
   */
  const [seCitesc, setSeCitesc] = useState(true);
  const [seTrimite, incepe] = useTransition();

  /* ⚠ `hasAwb` vine din ce a spus eMAG, nu dintr-o coloana a comenzii: AWB-urile lor
     nu stau in `orders`, ci in `emag_awb`. Citit de acolo, greutatea s-ar fi
     recalculat si dupa emitere, degeaba. */
  const { weight, setWeight, dinCatalog, liniiFaraGreutate } = useGreutateaAwb({
    open: true, hasAwb: !!pregatire?.awbExistent, businessId, orderId: order.id,
  });
  const nota = notaGreutate(dinCatalog, liniiFaraGreutate);
  const [colete, setColete] = useState("1");
  const [observatii, setObservatii] = useState("");
  /*
   * ⚠ CENTIMETRI. La `/measurements/save` acelasi cuvant inseamna MILIMETRI.
   * Vezi `coleteDeTrimis`: campurile poarta unitatea in eticheta tocmai fiindca
   * greseala se face o data si se plateste luni intregi, in refacturari de curier.
   */
  const [lungime, setLungime] = useState("");
  const [latime, setLatime] = useState("");
  const [inaltime, setInaltime] = useState("");

  const adresa = (order.shipping_address ?? {}) as AdresaEmag;

  useEffect(() => {
    let viu = true;
    void (async () => {
      const r = await pregatireAwbEmag(businessId, order.id);
      if (!viu) return;
      setSeCitesc(false);

      /*
       * ═══ ⚠ SE PRECOMPLETEAZĂ, DAR SE SCRIE DOAR PESTE GOL ═══
       *
       * Câmpurile rămân editabile: catalogul știe marfa, comerciantul știe cutia —
       * aceeași regulă ca la greutate. Scris necondiționat, cineva care a tastat
       * dimensiunile ambalajului lui și a redeschis modalul s-ar fi întors la cele
       * din catalog, fără să înțeleagă de ce.
       *
       * ⚠ Și numai când propunerea e `din_catalog`. `nu_se_stie` NU umple nimic: o
       * cutie ghicită din mai multe produse ar fi arătat exact ca o măsurătoare
       * adevărată, iar curierul refacturează banda pe care o găsește la depozit.
       */
      if (!("error" in r) && r.dimensiuni.fel === "din_catalog") {
        const d = r.dimensiuni.dimensiuni;
        setLungime((v) => (v.trim() === "" ? String(d.length) : v));
        setLatime((v) => (v.trim() === "" ? String(d.width) : v));
        setInaltime((v) => (v.trim() === "" ? String(d.height) : v));
      }
      if ("error" in r) {
        toast.error(r.error);
        setPregatire(null);
        return;
      }
      setPregatire(r);
    })();
    return () => {
      viu = false;
    };
  }, [businessId, order.id]);

  function emite() {
    const nrColete = Math.max(1, Math.floor(Number(colete) || 1));
    const g = Number(weight);
    incepe(async () => {
      /*
       * ═══ ⚠ DIMENSIUNILE NU SE INVENTEAZA ═══
       *
       * Prima forma trimitea `20 × 15 × 10` pentru orice colet, ca sa nu ramana campul
       * gol. Dar `packages` e folosit de eMAG la taxarea volumetrica: un frigider
       * declarat cutie de pantofi inseamna un cost de transport calculat gresit, iar
       * diferenta o refactureaza curierul peste saptamani.
       *
       * `coleteDeTrimis` intoarce `undefined` cand nu se stiu toate trei laturile —
       * si atunci NU se trimite nimic. `packages` e optional la ei; curierul
       * cantareste si masoara oricum.
       */
      const r = await emiteAwbEmag(businessId, order.id, {
        colete: coleteDeTrimis(g, nrColete, {
          length: Number(lungime) || undefined,
          width: Number(latime) || undefined,
          height: Number(inaltime) || undefined,
        }),
        observatii: observatii.trim() || undefined,
      });
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success(
        r.deja
          ? `AWB-ul era deja emis: ${r.numar ?? "fără număr"}`
          : `AWB emis: ${r.numar ?? "fără număr"}. Curierul vine să ridice coletul.`,
      );
      onSuccess();
    });
  }

  /**
   * Aduce eticheta si o deschide in fila.
   *
   * ⚠ SE COMPUNE UN `blob:`, NU SE CERE O ADRESA PUBLICA. O adresa spre eticheta unui
   * colet ar fi purtat numele, adresa si telefonul CUMPARATORULUI pe internet. Asa,
   * octetii ajung direct in fila care i-a cerut, iar legatura se elibereaza imediat.
   */
  function descarcaEticheta(format: "A4" | "A6") {
    incepe(async () => {
      const r = await descarcaEtichetaAwbEmag(businessId, order.id, format);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      const octeti = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([octeti], { type: r.tip }));
      const a = document.createElement("a");
      a.href = url;
      a.download = r.nume;
      a.click();
      /* ⚠ Se elibereaza, altfel octetii raman in memoria filei pana la reincarcare —
         iar la un depozit care tipareste cateva sute de etichete pe zi, se aduna. */
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }

  const gata = pregatire && !pregatire.piedica && !pregatire.awbExistent;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Truck className="h-4 w-4" /> AWB prin eMAG
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">Comanda {order.order_number}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        {seCitesc && (
          <div className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Se întreabă eMAG ce curier e disponibil…
          </div>
        )}

        {pregatire && (
          <div className="mt-5 space-y-4">
            {/* ── Ce oprește, dacă oprește ceva ──────────────────────────── */}
            {pregatire.piedica && (
              <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{pregatire.piedica}</span>
              </p>
            )}

            {pregatire.awbExistent && (
              <p className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
                <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <span>
                  Comanda are deja AWB: <strong>{pregatire.awbExistent.numar ?? "fără număr"}</strong>.
                  {/* ⚠ Se spune de ce nu se mai poate: un al doilea AWB înseamnă al
                      doilea transport plătit și un curier care vine de două ori. */}
                  <span className="block text-muted-foreground">
                    Un al doilea AWB ar însemna al doilea transport plătit.
                  </span>
                </span>
              </p>
            )}

            {/* ⚠ Fara eticheta, AWB-ul e un numar intr-o baza de date: coletul n-are ce
                sa poarte si curierul nu-l ia. Lipsa n-ar fi dat nicio eroare — s-ar fi
                vazut abia la depozit. */}
            {pregatire.awbExistent && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => descarcaEticheta("A4")}
                  disabled={seTrimite}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
                >
                  {seTrimite ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Etichetă A4
                </button>
                <button
                  type="button"
                  onClick={() => descarcaEticheta("A6")}
                  disabled={seTrimite}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
                >
                  <Download className="h-4 w-4" />
                  Etichetă A6
                </button>
              </div>
            )}

            {/* ── Unde merge coletul ─────────────────────────────────────── */}
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs font-medium">Destinatar</p>
              {/* ⚠ Se arată, NU se editează. Adresa e a eMAG-ului, iar acțiunea o ia
                  de la ei oricum — un formular ale cărui valori se aruncă promite o
                  putere pe care n-o are. */}
              <p className="mt-1 text-xs text-muted-foreground">
                {pregatire.locker ? (
                  <>Ridicare din <strong className="text-foreground">{pregatire.locker}</strong></>
                ) : (
                  <>
                    {adresa.contact || order.customer_name}
                    {adresa.phone ? ` · ${adresa.phone}` : ""}
                    <br />
                    {[adresa.street, adresa.city, adresa.county, adresa.postal_code].filter(Boolean).join(", ")}
                  </>
                )}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Adresa vine de la eMAG și nu se poate schimba de aici.
              </p>
            </div>

            {/* ── Curier și ramburs ──────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Curier</p>
                <p className="mt-0.5 text-sm font-medium">{pregatire.curier ?? "necunoscut"}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">De încasat la livrare</p>
                <p className="mt-0.5 text-sm font-medium tabular-nums">
                  {pregatire.ramburs > 0 ? `${pregatire.ramburs.toFixed(2)} lei` : "Nimic de încasat, comanda e plătită"}
                </p>
              </div>
            </div>

            {/* ── Ce completează omul ────────────────────────────────────── */}
            {gata && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium">Greutate totală (kg)</span>
                    <input
                      className={CAMP}
                      value={weight}
                      inputMode="decimal"
                      onChange={(e) => setWeight(e.target.value)}
                    />
                    {nota && <span className="mt-1 block text-xs text-muted-foreground">{nota}</span>}
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium">Câte colete</span>
                    <input
                      className={CAMP}
                      value={colete}
                      inputMode="numeric"
                      onChange={(e) => setColete(e.target.value.replace(/\D/g, "") || "1")}
                    />
                  </label>
                </div>

                <div>
                  <span className="mb-1 block text-xs font-medium">
                    Dimensiunile coletului, în <strong>centimetri</strong> (opțional)
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    <input className={CAMP} placeholder="lungime" inputMode="decimal"
                      value={lungime} onChange={(e) => setLungime(e.target.value)} />
                    <input className={CAMP} placeholder="lățime" inputMode="decimal"
                      value={latime} onChange={(e) => setLatime(e.target.value)} />
                    <input className={CAMP} placeholder="înălțime" inputMode="decimal"
                      value={inaltime} onChange={(e) => setInaltime(e.target.value)} />
                  </div>
                  {/* ⚠ Se spune ce se intampla cand le lasi goale, ca sa fie o alegere,
                      nu o scapare. Și se spune DE UNDE vin cifrele când vin: o valoare
                      apărută singură în câmp, fără explicație, e mai rea decât un câmp
                      gol — nu se știe dacă e măsurată sau ghicită. */}
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {pregatire?.dimensiuni.fel === "din_catalog"
                      ? "Luate din fișa produsului. Schimbă-le dacă ambalajul e altfel."
                      : pregatire?.dimensiuni.motiv
                        ? `${pregatire.dimensiuni.motiv} Le completezi tu, sau le lași goale.`
                        : "Le folosește eMAG la calculul volumetric."}
                    {" "}Goale, nu trimitem nicio dimensiune. Curierul măsoară coletul la ridicare.
                  </span>
                </div>

                <label className="block">
                  <span className="mb-1 block text-xs font-medium">Observații pentru curier</span>
                  <input
                    className={CAMP}
                    value={observatii}
                    placeholder="opțional"
                    onChange={(e) => setObservatii(e.target.value)}
                  />
                </label>
              </>
            )}

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Închide
              </Button>
              <Button type="button" onClick={emite} disabled={!gata || seTrimite}>
                {seTrimite ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Package className="mr-2 h-4 w-4" />}
                Emite AWB
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

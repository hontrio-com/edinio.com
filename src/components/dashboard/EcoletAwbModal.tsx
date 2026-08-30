"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Download, Loader2, Package, RefreshCw, Truck, X } from "lucide-react";
import { rambursDeIncasat } from "@/lib/orders/ramburs";
import {
  coteazaEcoletAction,
  createEcoletAwbAction,
  finalizeazaEcoletAction,
  type OfertaAratata,
} from "@/lib/actions/ecolet.actions";
import { useGreutateaAwb, notaGreutate } from "@/components/dashboard/useGreutateaAwb";
import { numeServiciuEcolet } from "@/lib/ecolet/preturi";
import { Button } from "@/components/ui/button";
import type { Database } from "@/types/database.types";

type Order = Database["public"]["Tables"]["orders"]["Row"];

type ShippingAddress = {
  city?: string;
  county?: string;
  address?: string;
  street?: string;
  street_no?: string;
  postal_code?: string;
  ecolet_service_slug?: string;
  ecolet_courier_name?: string;
  ecolet_service_name?: string;
};

/**
 * Emiterea unei expedieri eColet.
 *
 * ═══ CE E ALTFEL FATA DE CELELALTE FORMULARE DE AWB ═══
 *
 *   - **Doi pasi**: intai „Calculeaza preturi" (o citire pura, `reload-form`),
 *     apoi alegerea serviciului. Ca la Woot si Colete, fiindca eColet e broker.
 *   - **Serviciul ales de CLIENT in checkout se preselecteaza**, si se spune asta
 *     pe fata: comerciantul poate schimba, dar trebuie sa vada ce a platit omul.
 *   - ⚠ **Emiterea e ASINCRONA.** Butonul nu produce un AWB pe loc: trimite
 *     expedierea si eColet o prelucreaza. De aia fereastra ramane deschisa, arata
 *     starea, si are un buton de reverificare.
 */
type Props = {
  open: boolean;
  onClose: () => void;
  order: Order;
  businessId: string;
  onSuccess: () => void;
};

/**
 * Invelisul care MONTEAZA formularul abia la deschidere, ca valorile initiale sa
 * se calculeze din nou de fiecare data, fara efect de sincronizare.
 */
export function EcoletAwbModal(props: Props) {
  if (!props.open) return null;
  return <Formular {...props} />;
}

type ComandaEcolet = {
  ecolet_awb_number?: string | null;
  ecolet_order_to_send_id?: number | null;
  ecolet_send_state?: string | null;
  ecolet_send_error?: string | null;
  ecolet_service_name?: string | null;
};

function Formular({ onClose, order, businessId, onSuccess }: Props) {
  const comanda = order as typeof order & ComandaEcolet;
  const addr = (order.shipping_address ?? {}) as ShippingAddress;

  /* Starea locala a emiterii: fereastra nu se inchide dupa trimitere. */
  const [emisa, setEmisa] = useState<{ stare: string; awb: string | null; eroare: string | null } | null>(null);
  const stareCurenta = emisa?.stare ?? comanda.ecolet_send_state ?? null;
  const awbCurent = emisa?.awb ?? comanda.ecolet_awb_number ?? null;
  const eroareCurenta = emisa?.eroare ?? comanda.ecolet_send_error ?? null;
  /*
   * ⚠ Dupa „Verifica starea", prop-ul din baza e INVECHIT: pagina nu s-a
   * reincarcat. Citit neconditionat, un refuz proaspat al brokerului ar fi ramas
   * ascuns sub „se prelucreaza", iar omul ar fi asteptat la nesfarsit un AWB care
   * nu mai vine. Cand avem un raspuns local, el decide singur.
   */
  /*
   * ⚠ Din starea locala se exclude DOAR refuzul.
   *
   * Prima forma accepta numai „new", dar `ordered` FARA AWB e o stare normala la
   * un broker asincron — si atunci nu se randa nici blocul de asteptare, nici
   * butonul „Verifica starea", ci FORMULARUL, cu „Trimite expedierea" activ. Adica
   * exact langa avertismentul care spune sa nu trimiti de doua ori.
   */
  const inCurs = !awbCurent && (emisa
    ? emisa.stare !== "error"
    : (stareCurenta === "new" || stareCurenta === "ordered" || !!comanda.ecolet_order_to_send_id));
  const gata = !!awbCurent;

  const [oras, setOras] = useState(addr.city ?? "");
  const [judet, setJudet] = useState(addr.county ?? "");
  const { weight, setWeight, dinCatalog, liniiFaraGreutate } = useGreutateaAwb({
    open: true, hasAwb: gata || inCurs, businessId, orderId: order.id,
  });

  /*
   * ⚠ Rambursul se ia dupa BANI, nu dupa metoda de plata: o comanda cu plata
   * online ramasa neplatita arata ca una cu cardul si ar pleca cu ramburs zero.
   */
  const [ramburs, setRamburs] = useState(() =>
    gata || inCurs ? "0" : rambursDeIncasat({ payment_status: order.payment_status, total: order.total }).toFixed(2),
  );
  const [continut, setContinut] = useState(() => {
    const items = (Array.isArray(order.items) ? order.items : []) as { name?: string }[];
    return (items.map((i) => i?.name).filter(Boolean).join(", ") || "Produse").slice(0, 100);
  });
  const [observatii, setObservatii] = useState("");

  const [oferte, setOferte] = useState<OfertaAratata[] | null>(null);
  const [ales, setAles] = useState<string>(addr.ecolet_service_slug ?? "");
  const [coteaza, setCoteaza] = useState(false);
  const [creeaza, setCreeaza] = useState(false);
  const [verifica, setVerifica] = useState(false);
  const [descarca, setDescarca] = useState(false);

  /** Ce a ales clientul in checkout, daca a ales ceva. */
  const alesDeClient = addr.ecolet_service_slug
    ? numeServiciuEcolet(addr.ecolet_courier_name, addr.ecolet_service_name) || addr.ecolet_service_slug
    : null;

  function incheie() {
    if (emisa) onSuccess();
    else onClose();
  }

  async function calculeaza() {
    if (!oras.trim() || !judet.trim()) return toast.error("Completeaza localitatea si judetul");
    const kg = parseFloat(weight);
    if (!Number.isFinite(kg) || kg <= 0) return toast.error("Completeaza greutatea");

    /* ⚠ `finally`: o actiune care se respinge ar lasa altfel butonul blocat pe
       „Se calculeaza..." pentru totdeauna, fara niciun mesaj. */
    setCoteaza(true);
    let r: Awaited<ReturnType<typeof coteazaEcoletAction>>;
    try {
      r = await coteazaEcoletAction(businessId, order.id, {
        oras: oras.trim(), judet: judet.trim(), greutateKg: kg, ramburs: parseFloat(ramburs) || 0,
      });
    } catch (e) {
      toast.error(`eColet nu a raspuns: ${(e as Error).message}`);
      return;
    } finally {
      setCoteaza(false);
    }

    if ("error" in r) {
      setOferte(null);
      toast.error(r.error);
      return;
    }
    setOferte(r.oferte);
    if (r.oferte.length === 0) {
      toast.warning("eColet nu are niciun serviciu pentru comanda asta.");
      return;
    }
    /*
     * Preselectia: intai ce a ales CLIENTUL, daca mai e disponibil; altfel cea mai
     * ieftina. Comerciantul poate schimba, dar pornim de la ce a platit omul.
     */
    const alClientului = r.oferte.find((o) => o.slug === addr.ecolet_service_slug);
    setAles(alClientului?.slug ?? r.oferte[0].slug);
  }

  async function emite() {
    const oferta = oferte?.find((o) => o.slug === ales);
    if (!oferta) return toast.error("Alege un serviciu");

    const kg = parseFloat(weight);
    const cod = parseFloat(ramburs) || 0;
    if (cod > 0 && !oferta.acceptaRamburs) {
      return toast.error(`${oferta.numeServiciu} nu incaseaza la livrare. Alege alt serviciu.`);
    }

    setCreeaza(true);
    let r: Awaited<ReturnType<typeof createEcoletAwbAction>>;
    try {
      r = await createEcoletAwbAction(businessId, order.id, {
        serviciu: oferta.slug,
        numeServiciu: oferta.eticheta,
        oras: oras.trim(), judet: judet.trim(),
        greutateKg: kg,
        ramburs: cod,
        continut: continut.trim() || null,
        observatii: observatii.trim() || null,
      });
    } catch (e) {
      /* ⚠ Nu stim daca expedierea a plecat: NU se spune „a esuat". */
      toast.error(`eColet nu a raspuns. Verifica starea inainte sa incerci din nou: ${(e as Error).message}`);
      return;
    } finally {
      setCreeaza(false);
    }

    if ("error" in r) {
      toast.error(r.error);
      return;
    }

    setEmisa(r);
    if (r.awb) toast.success(`Expediere eColet creata — AWB ${r.awb}`);
    else if (r.stare === "error") toast.error(r.eroare ?? "eColet a refuzat expedierea");
    else toast.success("Expediere trimisa la eColet. AWB-ul apare in scurt timp.");
  }

  async function reverifica() {
    setVerifica(true);
    let r: Awaited<ReturnType<typeof finalizeazaEcoletAction>>;
    try {
      r = await finalizeazaEcoletAction(businessId, order.id);
    } catch (e) {
      toast.error(`eColet nu a raspuns: ${(e as Error).message}`);
      return;
    } finally {
      setVerifica(false);
    }
    if ("error" in r) return toast.error(r.error);

    setEmisa(r);
    if (r.awb) toast.success(`AWB eColet ${r.awb}`);
    else if (r.stare === "error") toast.error(r.eroare ?? "eColet a refuzat expedierea");
    else toast.info("Inca se prelucreaza la eColet. Mai incearca peste un minut.");
  }

  async function descarcaEticheta() {
    setDescarca(true);
    try {
      const res = await fetch(`/api/ecolet/awb?orderId=${order.id}&businessId=${businessId}`);
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(j?.error ?? "Eticheta nu a putut fi descarcata");
        return;
      }
      /*
       * ⚠ Numele se ia din antet INAINTE de `blob()`.
       *
       * Un blob URL nu poarta antetele raspunsului, deci `Content-Disposition` e
       * ignorat si `a.download` hotaraste singur. Cu `.pdf` scris in cod, o
       * eticheta ZPL — pe care eColet chiar o poate intoarce — ajungea pe disc ca
       * PDF si se deschidea goala.
       */
      const dispozitie = res.headers.get("content-disposition") ?? "";
      const dinAntet = /filename="([^"]+)"/.exec(dispozitie)?.[1];
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = dinAntet || `awb-ecolet-${awbCurent}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDescarca(false);
    }
  }

  const nota = notaGreutate(dinCatalog, liniiFaraGreutate);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-background p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Truck className="h-5 w-5" />
            Expediere eColet
          </h2>
          <button onClick={incheie} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Gata: AWB obtinut ── */}
        {gata && (
          <div className="mb-4 space-y-2 rounded-lg border border-border bg-muted/40 px-3 py-3 text-sm">
            <p>
              AWB eColet <strong>{awbCurent}</strong>
              {comanda.ecolet_service_name ? ` · ${comanda.ecolet_service_name}` : ""}
            </p>
            <Button size="sm" variant="outline" onClick={descarcaEticheta} disabled={descarca}>
              {descarca ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Descarca eticheta
            </Button>
          </div>
        )}

        {/*
          ⚠ Starea proprie eColet, pe care n-o are niciun alt curier: expedierea a
          plecat, dar AWB-ul inca nu exista. Fara blocul asta, comerciantul ar
          vedea o comanda fara AWB si ar apasa din nou — a doua expediere reala.
        */}
        {!gata && inCurs && (
          <div className="mb-4 space-y-2 rounded-lg border border-warning/30 bg-warning/5 p-3">
            <p className="flex items-start gap-2 text-sm font-medium text-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              Expedierea e trimisa si se prelucreaza la eColet.
            </p>
            <p className="text-xs text-muted-foreground">
              AWB-ul apare de obicei in cateva zeci de secunde. NU emite din nou —
              ar fi a doua expediere, facturata. Daca dureaza mult, verifica aici.
            </p>
            <Button size="sm" onClick={reverifica} disabled={verifica}>
              {verifica ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Verifica starea
            </Button>
          </div>
        )}

        {/* ── Refuz la broker ── */}
        {!gata && !inCurs && eroareCurenta && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-sm font-medium text-foreground">eColet a refuzat expedierea</p>
            <p className="mt-1 text-xs text-muted-foreground">{eroareCurenta}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Corecteaza si incearca din nou — nu s-a creat niciun transport.
            </p>
          </div>
        )}

        {/* ── Formularul ── */}
        {!gata && !inCurs && (
          <div className="space-y-3">
            {alesDeClient && (
              <div className="rounded-lg border border-info/30 bg-info/5 px-3 py-2 text-xs">
                Clientul a ales si a platit: <strong>{alesDeClient}</strong>.
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Localitate *</span>
                <input className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={oras} onChange={(e) => { setOras(e.target.value); setOferte(null); }} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Judet *</span>
                <input className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={judet} onChange={(e) => { setJudet(e.target.value); setOferte(null); }} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Greutate (kg)</span>
                <input type="number" step="0.01" min={0}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={weight} onChange={(e) => { setWeight(e.target.value); setOferte(null); }} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Ramburs (lei)</span>
                <input type="number" step="0.01" min={0}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={ramburs} onChange={(e) => { setRamburs(e.target.value); setOferte(null); }} />
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block text-muted-foreground">Continut</span>
                <input className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={continut} onChange={(e) => setContinut(e.target.value)} />
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block text-muted-foreground">Observatii</span>
                <input className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={observatii} onChange={(e) => setObservatii(e.target.value)} />
              </label>
            </div>

            {nota && <p className="text-xs text-muted-foreground">{nota}</p>}

            <Button variant="outline" onClick={calculeaza} disabled={coteaza}>
              {coteaza ? <Loader2 className="animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {coteaza ? "Se calculeaza..." : "Calculeaza preturi"}
            </Button>

            {oferte && oferte.length > 0 && (
              <div className="space-y-1.5 rounded-lg border border-border p-3">
                <p className="mb-1 text-xs font-medium text-foreground">Alege serviciul</p>
                {oferte.map((o) => (
                  <label key={o.slug} className="flex items-center gap-2 text-sm">
                    <input type="radio" name="serviciu-ecolet" checked={ales === o.slug}
                      onChange={() => setAles(o.slug)} />
                    <span className="flex-1">{o.eticheta}</span>
                    <span className="font-medium">{o.pret.toFixed(2)} lei</span>
                    {/* ⚠ Rambursul e per SERVICIU la un broker, nu al platformei. */}
                    {!o.acceptaRamburs && (
                      <span className="text-[10px] text-muted-foreground">fara ramburs</span>
                    )}
                  </label>
                ))}
              </div>
            )}

            <p className="rounded-md border border-info/30 bg-info/5 px-3 py-2 text-xs">
              eColet prelucreaza expedierea dupa trimitere, deci AWB-ul apare cu o mica
              intarziere. Fereastra ramane deschisa si iti arata cand e gata.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={incheie} disabled={creeaza}>Renunta</Button>
              <Button onClick={emite} disabled={creeaza || !oferte || oferte.length === 0}>
                {creeaza ? <Loader2 className="animate-spin" /> : <Package className="h-4 w-4" />}
                {creeaza ? "Se trimite..." : "Trimite expedierea"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

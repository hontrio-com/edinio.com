"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FileDown, Loader2, Package, Search, Truck, X } from "lucide-react";
import { rambursDeIncasat } from "@/lib/orders/ramburs";
import {
  coteazaFedexAction, createFedexAwbAction, getFedexEtichetaAction, verificaFedexAwbAction,
} from "@/lib/actions/fedex.actions";
import { useGreutateaAwb, notaGreutate } from "@/components/dashboard/useGreutateaAwb";
import { cheiaOfertei, etichetaOferta } from "@/lib/fedex/preturi";
import type { OfertaFedex } from "@/lib/fedex/client";
import { Button } from "@/components/ui/button";
import type { Database } from "@/types/database.types";

type Order = Database["public"]["Tables"]["orders"]["Row"];

type ShippingAddress = {
  city?: string; county?: string; address?: string; street?: string; street_no?: string;
  postal_code?: string; country?: string; courier?: string; delivery_type?: string;
  /* ⚠ Numele astea trebuie sa fie IDENTICE cu ce scrie checkout-ul in
     `OrderModal.tsx` si in `checkout-core.ts`. Un camp scris altfel se pierde tacut,
     si alegerea clientului n-ar ajunge niciodata aici. */
  fedex_service_type?: string;
  fedex_service_name?: string;
};

/**
 * Emiterea unei expedieri FedEx.
 *
 * ═══ DOI PASI, CA LA CEILALTI ═══
 *
 * Intai „Calculeaza preturi" (`POST /rate/v1/rates/quotes` — citire pura, nu creeaza
 * nimic), apoi alegerea serviciului.
 *
 * ═══ ⚠ TREI DEOSEBIRI FATA DE TOTI CEILALTI TREISPREZECE ═══
 *
 * 1. **Fara ramburs.** FedEx a retras C.O.D. la 31.07.2023 peste tot in afara de
 *    FedEx Ground in/spre Canada. O comanda cu plata la livrare nu se poate expedia
 *    prin ei DELOC — se spune aici, nu dupa ce cade emiterea.
 *
 * 2. **Fara puncte de ridicare.** In Romania FedEx are statii de curier, nu o retea
 *    de lockere pentru consumatori. Nu exista selector de punct, si nu e o scapare.
 *
 * 3. **Eticheta se pastreaza de NOI.** FedEx nu are endpoint de reimprimare, iar
 *    linkul din raspunsul lor expira in cel mult 12 ore. Butonul de descarcare
 *    citeste din `fedex_etichete`, nu de la ei.
 *
 * ⚠ Serviciul ales de CLIENT in checkout se preselecteaza, si se spune pe fata:
 * comerciantul poate schimba, dar trebuie sa vada ce a platit omul.
 */
type Props = {
  open: boolean;
  onClose: () => void;
  order: Order;
  businessId: string;
  onSuccess: () => void;
};

export function FedexAwbModal(props: Props) {
  if (!props.open) return null;
  return <Formular {...props} />;
}

type ComandaFedex = {
  fedex_awb_number?: string | null;
  fedex_service_name?: string | null;
  fedex_service_type?: string | null;
  fedex_tracking_url?: string | null;
  fedex_cost?: number | null;
  fedex_currency?: string | null;
  fedex_reference?: string | null;
};

/** Tipul MIME dupa formatul cerut. `ZPLII` e text pentru imprimanta termica. */
function tipulFisierului(nume: string): string {
  if (nume.endsWith(".png")) return "image/png";
  if (nume.endsWith(".zpl")) return "text/plain";
  return "application/pdf";
}

function Formular({ onClose, order, businessId, onSuccess }: Props) {
  const comanda = order as typeof order & ComandaFedex;
  const addr = (order.shipping_address ?? {}) as ShippingAddress;
  const awb = comanda.fedex_awb_number ?? null;

  const { weight, setWeight, dinCatalog, liniiFaraGreutate } = useGreutateaAwb({
    open: true, hasAwb: !!awb, businessId, orderId: order.id,
  });
  const nota = notaGreutate(dinCatalog, liniiFaraGreutate);

  const ramburs = rambursDeIncasat(order);

  /** Serviciul ales de client in checkout, cand exista. */
  const alesDeClient = (addr.courier ?? "").toLowerCase().trim() === "fedex"
    ? (addr.fedex_service_type ?? "").trim().toUpperCase() || null
    : null;

  const [continut, setContinut] = useState("Produse");
  const [oferte, setOferte] = useState<OfertaFedex[] | null>(null);
  const [aleasa, setAleasa] = useState<OfertaFedex | null>(null);
  const [valuteRefuzate, setValuteRefuzate] = useState<string[]>([]);
  const [doarLista, setDoarLista] = useState(false);
  const [cotand, setCotand] = useState(false);
  const [emitand, setEmitand] = useState(false);
  const [verificand, setVerificand] = useState(false);
  const [descarcand, setDescarcand] = useState(false);

  function destinatar() {
    return {
      nume: order.customer_name,
      strada: addr.street || addr.address || "",
      numar: addr.street_no || null,
      oras: addr.city || "",
      judet: addr.county || null,
      codPostal: addr.postal_code || null,
      telefon: order.customer_phone,
      email: order.customer_email,
      tara: addr.country || "RO",
    };
  }

  /** ⚠ UN SINGUR loc care compune datele: cotarea si emiterea le impart. */
  function dateComune() {
    return {
      destinatar: destinatar(),
      greutateKg: Number(weight) || 0,
      continut: continut.trim() || "Produse",
      ramburs,
      valoareComanda: Number(order.total) || 0,
      serviceType: aleasa?.serviceType ?? null,
      serviceName: aleasa?.serviceName ?? null,
      cost: aleasa?.pret ?? null,
      valuta: aleasa?.valuta ?? null,
    };
  }

  async function handleCoteaza() {
    setCotand(true);
    const r = await coteazaFedexAction(businessId, order.id, dateComune());
    setCotand(false);
    if (!r.ok) return toast.error(r.error, { duration: 15000 });

    setOferte(r.oferte);
    setValuteRefuzate(r.valuteRefuzate);
    setDoarLista(r.doarPretDeLista);

    if (r.oferte.length === 0) {
      toast.warning(
        r.valuteRefuzate.length > 0
          ? `FedEx a cotat in ${r.valuteRefuzate.join(", ")}, nu in lei. Nu convertim noi sumele — cere-i reprezentantului FedEx tarife in RON.`
          : "FedEx n-a intors niciun serviciu pentru adresa asta.",
        { duration: 15000 },
      );
      return;
    }
    /* Preselectam ce a ales clientul, daca serviciul mai exista. */
    const alePrecedenta = alesDeClient ? r.oferte.find((o) => o.serviceType === alesDeClient) : null;
    setAleasa(alePrecedenta ?? r.oferte[0]);
  }

  async function handleEmite() {
    setEmitand(true);
    const r = await createFedexAwbAction(businessId, order.id, dateComune());
    setEmitand(false);
    if ("error" in r) return toast.error(r.error, { duration: 15000 });
    toast.success(`AWB FedEx creat: ${r.awb}`);
    onSuccess();
    onClose();
  }

  /**
   * „Am trimis si n-am primit raspuns — s-a creat sau nu?"
   *
   * ⚠ E o CITIRE (`POST /track/v1/referencenumbers` dupa referinta noastra), nu o
   * reemitere. FedEx n-are idempotenta, deci o a doua apasare pe „Emite" ar face al
   * doilea AWB, taxabil — butonul asta exista tocmai ca sa nu fie nevoie de ea.
   */
  async function handleVerifica() {
    setVerificand(true);
    const r = await verificaFedexAwbAction(businessId, order.id);
    setVerificand(false);
    if (!r.ok) return toast.error(r.error, { duration: 15000 });
    if (r.gasit) {
      toast.success(r.mesaj, { duration: 12000 });
      onSuccess();
      onClose();
      return;
    }
    toast.info(r.mesaj, { duration: 12000 });
  }

  async function handleEticheta() {
    setDescarcand(true);
    const r = await getFedexEtichetaAction(businessId, order.id);
    setDescarcand(false);
    if (!r.ok) return toast.error(r.error, { duration: 15000 });
    /*
     * ⚠ Eticheta vine din TABELUL NOSTRU, nu de la FedEx: ei nu au reimprimare, iar
     * linkul din raspunsul de emitere expira. E singurul curier din cei paisprezece
     * la care o pierdere de-a noastra e definitiva.
     */
    const octeti = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([octeti], { type: tipulFisierului(r.nume) }));
    const a = document.createElement("a");
    a.href = url;
    a.download = r.nume;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-surface p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Truck className="h-4 w-4" /> Expediere FedEx
          </h2>
          <button type="button" onClick={onClose} aria-label="Inchide"><X className="h-4 w-4" /></button>
        </div>

        {awb ? (
          <div className="space-y-3 text-sm">
            <p>
              AWB: <strong>{awb}</strong>
              {comanda.fedex_service_name ? ` · ${comanda.fedex_service_name}` : ""}
            </p>
            {comanda.fedex_cost !== null && comanda.fedex_cost !== undefined && (
              <p className="text-muted-foreground">
                Cost cotat: {comanda.fedex_cost} {comanda.fedex_currency ?? "lei"}
              </p>
            )}
            {comanda.fedex_tracking_url && (
              <p className="text-muted-foreground break-all">
                Urmarire: <a className="underline" href={comanda.fedex_tracking_url} target="_blank" rel="noreferrer">{comanda.fedex_tracking_url}</a>
              </p>
            )}
            <Button variant="outline" onClick={handleEticheta} disabled={descarcand}>
              {descarcand ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              Descarca eticheta
            </Button>
            <p className="text-[11px] text-muted-foreground">
              ⚠ FedEx nu permite reimprimarea prin API, deci eticheta o pastram noi de la emitere.
              Daca s-a pierdut, o gasesti si in contul FedEx dupa numarul AWB.
            </p>
          </div>
        ) : ramburs > 0 ? (
          /*
           * ⚠ AICI SE OPRESTE TOT. O comanda cu ramburs nu poate pleca prin FedEx, si
           * nicio configurare nu schimba asta — ei au retras serviciul. Spus aici,
           * comerciantul alege alt curier in cinci secunde; spus abia la emitere, ar
           * fi umblat degeaba prin setari.
           */
          <div className="space-y-3 text-sm">
            <p className="flex items-start gap-2 text-warning">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                Comanda are <strong>plata la livrare ({ramburs} lei)</strong>, iar FedEx nu ofera ramburs.
                Serviciul a fost retras de ei in iulie 2023 peste tot in afara de FedEx Ground in Canada.
              </span>
            </p>
            <p className="text-muted-foreground">
              Expediaza comanda cu alt curier, sau incaseaza-o in avans si revino aici.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="text-xs block">
              Greutate (kg)
              <input
                className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                value={weight} onChange={(e) => setWeight(e.target.value)}
              />
            </label>
            {nota && <p className="text-[11px] text-muted-foreground">{nota}</p>}

            <label className="text-xs block">
              Continut (se tipareste pe factura comerciala, la expedierile internationale)
              <input
                className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                value={continut} onChange={(e) => setContinut(e.target.value)}
              />
            </label>

            <Button onClick={handleCoteaza} disabled={cotand}>
              {cotand ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
              Calculeaza preturi
            </Button>

            {valuteRefuzate.length > 0 && (
              <p className="text-[11px] text-warning flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                Contul FedEx coteaza in {valuteRefuzate.join(", ")}, iar magazinul lucreaza in lei.
                Nu convertim noi sumele — un pret in euro scris ca lei ar subfactura transportul de cinci ori.
              </p>
            )}

            {doarLista && (
              <p className="text-[11px] text-muted-foreground">
                FedEx a intors doar preturi de LISTA, nu tarife de cont. Daca ai contract negociat,
                verifica la ei ca e legat de proiectul de API pe care il folosesti.
              </p>
            )}

            {oferte && oferte.length > 0 && (
              <div className="space-y-1.5">
                {alesDeClient && !oferte.some((o) => o.serviceType === alesDeClient) && (
                  <p className="text-[11px] text-warning flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    Serviciul ales de client la comanda nu mai e disponibil. Alege altul — pretul poate diferi.
                  </p>
                )}
                {oferte.map((o) => (
                  <button
                    key={cheiaOfertei(o)}
                    type="button"
                    onClick={() => setAleasa(o)}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs ${
                      aleasa?.serviceType === o.serviceType ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <span>
                      {etichetaOferta(o)}
                      {o.serviceType === alesDeClient ? " · ales de client" : ""}
                    </span>
                    <strong>{o.pret} {o.valuta === "RON" ? "lei" : o.valuta}</strong>
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button onClick={handleEmite} disabled={emitand || !aleasa}>
                {emitand ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                Emite AWB
              </Button>
              <Button variant="outline" onClick={handleVerifica} disabled={verificand}>
                {verificand ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Verifica la FedEx
              </Button>
            </div>

            <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              Daca emiterea pare ca a esuat, apasa <strong className="mx-1">Verifica la FedEx</strong> in loc sa
              incerci din nou: FedEx nu are protectie contra dublurilor, deci a doua apasare ar crea al doilea AWB,
              taxabil. Verificarea cauta dupa referinta comenzii si nu creeaza nimic.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

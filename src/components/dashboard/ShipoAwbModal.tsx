"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, FileDown, Loader2, MapPin, Package, Truck, X } from "lucide-react";
import { rambursDeIncasat } from "@/lib/orders/ramburs";
import {
  coteazaShipoAction, createShipoAwbAction, getShipoEtichetaAction, getShipoPuncteAction,
  validesteShipoAction,
} from "@/lib/actions/shipo.actions";
import { useGreutateaAwb, notaGreutate } from "@/components/dashboard/useGreutateaAwb";
import { cheiaOfertei, etichetaOferta, type OfertaShipo } from "@/lib/shipo/preturi";
import type { PunctAratat } from "@/lib/shipo/puncte";
import { Button } from "@/components/ui/button";
import type { Database } from "@/types/database.types";

type Order = Database["public"]["Tables"]["orders"]["Row"];

type ShippingAddress = {
  city?: string; county?: string; address?: string; street?: string; street_no?: string;
  postal_code?: string; courier?: string; delivery_type?: string;
  locker_id?: string; locker_name?: string; locker_address?: string; locker_city?: string;
  /* ⚠ Numele astea trebuie sa fie IDENTICE cu ce scrie checkout-ul in
     `OrderModal.tsx` si in `checkout-core.ts`. Un camp scris altfel se pierde
     tacut, si alegerea clientului n-ar ajunge niciodata aici. */
  shipo_rate_id?: number;
  shipo_courier_slug?: string;
  shipo_courier_name?: string;
};

/**
 * Emiterea unei expedieri Shipo.
 *
 * ═══ DOI PASI, CA LA CEILALTI BROKERI ═══
 *
 * Intai „Calculeaza preturi" (`POST /rates` — citire pura, nu creeaza nimic),
 * apoi alegerea ofertei. Ca la Woot, Colete, eColet, Innoship si SmartShip.
 *
 * ⚠ Cu DOUA deosebiri fata de SmartShip, amandoua in favoarea noastra:
 *
 * 1. **Lockerele se coteaza normal.** La Shipo un serviciu de locker are
 *    `rate_id`-ul lui si apare in tarife cu pret real, ca oricare altul — punctul
 *    se alege dupa aceea si nu schimba pretul. La SmartShip lockerul primea
 *    tariful fix, fiindca acolo cotarea CERE lockerul dinainte.
 *
 * 2. **Exista validare fara efect** (`POST /shipment/validate`, aceiasi parametri
 *    ca emiterea). Butonul „Verifica datele" o foloseste: se poate afla ca o
 *    adresa cade FARA sa platesti un transport.
 *
 * ⚠ Oferta aleasa de CLIENT in checkout se preselecteaza, si se spune pe fata:
 * comerciantul poate schimba, dar trebuie sa vada ce a platit omul.
 */
type Props = {
  open: boolean;
  onClose: () => void;
  order: Order;
  businessId: string;
  onSuccess: () => void;
};

export function ShipoAwbModal(props: Props) {
  if (!props.open) return null;
  return <Formular {...props} />;
}

type ComandaShipo = {
  shipo_awb_number?: string | null;
  shipo_courier_name?: string | null;
  shipo_courier_slug?: string | null;
  shipo_tracking_url?: string | null;
  shipo_cost?: number | null;
  shipo_point_name?: string | null;
  shipo_rate_id?: number | null;
};

function Formular({ onClose, order, businessId, onSuccess }: Props) {
  const comanda = order as typeof order & ComandaShipo;
  const addr = (order.shipping_address ?? {}) as ShippingAddress;
  const awb = comanda.shipo_awb_number ?? null;

  const { weight, setWeight, dinCatalog, liniiFaraGreutate } = useGreutateaAwb({
    open: true, hasAwb: !!awb, businessId, orderId: order.id,
  });
  const nota = notaGreutate(dinCatalog, liniiFaraGreutate);

  const ramburs = rambursDeIncasat(order);

  /** Serviciul ales de client in checkout, cand exista. */
  const alesDeClient = (addr.courier ?? "").toLowerCase().trim() === "shipo"
    ? Number(addr.shipo_rate_id) || null
    : null;

  /**
   * Punctul ales de CLIENT in checkout, in forma listei.
   *
   * ⚠ Valabil DOAR pe serviciul lui: `GET /points` intoarce „doar puncte acceptate
   * de acel serviciu", deci un `recipient_address_id` dintr-un alt `rate_id` ar fi
   * din reteaua altui curier. De aia preselectia de mai jos e conditionata.
   */
  const punctClient: PunctAratat | null =
    (addr.courier ?? "").toLowerCase().trim() === "shipo"
    && addr.delivery_type === "locker"
    && Number(addr.locker_id) > 0
      ? {
          id: String(Number(addr.locker_id)),
          nume: (addr.locker_name ?? "").trim() || `Punct ${Number(addr.locker_id)}`,
          adresa: addr.locker_address ?? "",
          oras: addr.locker_city ?? "",
          judet: "", codPostal: "", lat: 0, lng: 0, program: "", distantaKm: null,
        }
      : null;

  const [continut, setContinut] = useState("Produse");
  const [colete, setColete] = useState("1");
  const [oferte, setOferte] = useState<OfertaShipo[] | null>(null);
  const [aleasa, setAleasa] = useState<OfertaShipo | null>(null);
  const [puncte, setPuncte] = useState<PunctAratat[] | null>(null);
  const [punctAles, setPunctAles] = useState<PunctAratat | null>(punctClient);
  const [cotand, setCotand] = useState(false);
  const [emitand, setEmitand] = useState(false);
  const [validand, setValidand] = useState(false);
  const [descarcand, setDescarcand] = useState(false);
  const [incarcPuncte, setIncarcPuncte] = useState(false);


  function destinatar() {
    return {
      nume: order.customer_name,
      strada: addr.street || addr.address || "",
      numar: addr.street_no || null,
      /*
       * ⚠ Adresa RAMANE a clientului chiar si la livrarea in punct: Shipo ruteaza
       * dupa `recipient_address_id`, iar campurile de adresa nici nu se trimit
       * atunci (vezi `corpExpediere`). Pe dos fata de Sameday si GLS, unde adresa
       * se inlocuieste cu a punctului.
       */
      oras: addr.city || "",
      judet: addr.county || null,
      codPostal: addr.postal_code || null,
      telefon: order.customer_phone,
      email: order.customer_email,
    };
  }

  /** ⚠ UN SINGUR loc care compune datele: cotarea, validarea si emiterea le impart. */
  function dateComune() {
    return {
      destinatar: destinatar(),
      greutateKg: Number(weight) || 0,
      continut: continut.trim() || "Produse",
      numarColete: Math.max(1, Math.floor(Number(colete) || 1)),
      ramburs,
      valoareDeclarata: Number(order.total) || 0,
      felLivrare: (aleasa?.laPunct ? "locker" : "domiciliu") as "locker" | "domiciliu",
      punctId: punctAles ? Number(punctAles.id) : null,
      punctNume: punctAles?.nume ?? null,
      rateId: aleasa?.rateId ?? null,
      courierSlug: aleasa?.courierSlug ?? null,
      courierName: aleasa?.numeCurier ?? null,
      cost: aleasa?.pret ?? null,
    };
  }

  async function handleCoteaza() {
    setCotand(true);
    const r = await coteazaShipoAction(businessId, order.id, dateComune());
    setCotand(false);
    if (!r.ok) return toast.error(r.error, { duration: 12000 });
    setOferte(r.oferte);
    if (r.oferte.length === 0) {
      toast.warning("Shipo n-a intors nicio oferta pentru adresa asta.");
      return;
    }
    /* Preselectam ce a ales clientul, daca oferta mai exista. */
    const alePrecedenta = alesDeClient ? r.oferte.find((o) => o.rateId === alesDeClient) : null;
    const noua = alePrecedenta ?? r.oferte[0];
    setAleasa(noua);
    setPuncte(null);
    /* Punctul clientului supravietuieste doar daca oferta lui e cea aleasa. */
    setPunctAles(noua.rateId === alesDeClient ? punctClient : null);
  }

  async function handlePuncte(oferta: OfertaShipo) {
    setIncarcPuncte(true);
    const r = await getShipoPuncteAction(businessId, oferta.rateId, addr.city || "", addr.county || null);
    setIncarcPuncte(false);
    if (!r.ok) return toast.error(r.error);
    setPuncte(r.puncte);
    if (r.puncte.length === 0) toast.warning("Nu s-au gasit puncte de ridicare pentru localitatea asta.");
  }

  async function handleValideaza() {
    setValidand(true);
    const r = await validesteShipoAction(businessId, order.id, dateComune());
    setValidand(false);
    if (!r.ok) return toast.error(r.error, { duration: 12000 });
    toast.success("Datele trec validarea Shipo. Poti emite.");
  }

  async function handleEmite() {
    setEmitand(true);
    const r = await createShipoAwbAction(businessId, order.id, dateComune());
    setEmitand(false);
    if ("error" in r) return toast.error(r.error, { duration: 15000 });
    toast.success(`AWB Shipo creat: ${r.awb}`);
    onSuccess();
    onClose();
  }

  async function handleEticheta() {
    setDescarcand(true);
    const r = await getShipoEtichetaAction(businessId, order.id);
    setDescarcand(false);
    if (!r.ok) return toast.error(r.error);
    /*
     * ⚠ Eticheta vine ca base64, prin serverul nostru, si NU ca link direct catre
     * ei: id-ul din numele fisierului lor e secvential, iar o eticheta poarta
     * numele, telefonul si adresa cumparatorului. Vezi `eticheta()` din client.
     */
    const octeti = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([octeti], { type: "application/pdf" }));
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
            <Truck className="h-4 w-4" /> Expediere Shipo
          </h2>
          <button type="button" onClick={onClose} aria-label="Inchide"><X className="h-4 w-4" /></button>
        </div>

        {awb ? (
          <div className="space-y-3 text-sm">
            <p>
              AWB: <strong>{awb}</strong>
              {comanda.shipo_courier_name ? ` · ${comanda.shipo_courier_name}` : ""}
            </p>
            {comanda.shipo_point_name && (
              <p className="text-muted-foreground flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> {comanda.shipo_point_name}
              </p>
            )}
            {comanda.shipo_cost !== null && comanda.shipo_cost !== undefined && (
              <p className="text-muted-foreground">Cost cotat: {comanda.shipo_cost} lei</p>
            )}
            <Button variant="outline" onClick={handleEticheta} disabled={descarcand}>
              {descarcand ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              Descarca eticheta
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs">
                Greutate (kg)
                <input
                  className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                  value={weight} onChange={(e) => setWeight(e.target.value)}
                />
              </label>
              <label className="text-xs">
                Colete
                <input
                  className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                  value={colete} onChange={(e) => setColete(e.target.value)}
                />
              </label>
            </div>
            {nota && <p className="text-[11px] text-muted-foreground">{nota}</p>}

            <label className="text-xs block">
              Continut (max 40 caractere, doar litere si cifre — asa cere Shipo)
              <input
                className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                value={continut} onChange={(e) => setContinut(e.target.value)}
              />
            </label>

            <Button onClick={handleCoteaza} disabled={cotand}>
              {cotand ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
              Calculeaza preturi
            </Button>

            {oferte && oferte.length > 0 && (
              <div className="space-y-1.5">
                {alesDeClient && !oferte.some((o) => o.rateId === alesDeClient) && (
                  <p className="text-[11px] text-warning flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    Serviciul ales de client la comanda nu mai e disponibil. Alege altul — pretul poate diferi.
                  </p>
                )}
                {oferte.map((o) => (
                  <button
                    key={cheiaOfertei(o)}
                    type="button"
                    onClick={() => { setAleasa(o); setPuncte(null); setPunctAles(o.rateId === alesDeClient ? punctClient : null); }}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs ${
                      aleasa?.rateId === o.rateId ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <span>
                      {etichetaOferta(o)}
                      {o.rateId === alesDeClient ? " · ales de client" : ""}
                    </span>
                    <strong>{o.pret} lei</strong>
                  </button>
                ))}
              </div>
            )}

            {/* ⚠ Punctul se cere pe SERVICIU (`rate_id`), nu pe curier: curierul si
                tipul punctului sunt deduse de ei din serviciu. */}
            {aleasa?.laPunct && (
              <div className="space-y-2">
                {punctClient && (
                  <p className="text-[11px] flex items-start gap-1.5">
                    <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>
                      Clientul a ales <strong>{punctClient.nume}</strong>
                      {punctClient.adresa ? ` · ${punctClient.adresa}` : ""}.
                      {aleasa.rateId !== alesDeClient
                        ? " ⚠ Ai schimbat serviciul — punctul lui nu mai e valabil aici, alege altul."
                        : punctAles && punctAles.id !== punctClient.id
                          ? " ⚠ Ai schimbat punctul — coletul pleaca in alta parte decat a cerut."
                          : ""}
                    </span>
                  </p>
                )}
                <Button variant="outline" onClick={() => handlePuncte(aleasa)} disabled={incarcPuncte}>
                  {incarcPuncte ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                  Vezi punctele de ridicare
                </Button>
                {puncte && puncte.length > 0 && (
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {puncte.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPunctAles(p)}
                        className={`flex w-full flex-col rounded-lg border px-3 py-2 text-left text-xs ${
                          punctAles?.id === p.id ? "border-primary bg-primary/5" : "border-border"
                        }`}
                      >
                        <span className="font-medium">{p.nume}</span>
                        <span className="text-muted-foreground">
                          {[p.adresa, p.oras].filter(Boolean).join(", ")}
                          {p.distantaKm !== null ? ` · ${p.distantaKm} km` : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {!punctAles && (
                  <p className="text-[11px] text-muted-foreground">
                    Alege un punct: fara el, emiterea cade — acolo se livreaza coletul.
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="outline" onClick={handleValideaza} disabled={validand || !aleasa}>
                {validand ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Verifica datele
              </Button>
              <Button onClick={handleEmite} disabled={emitand || !aleasa || (aleasa.laPunct && !punctAles)}>
                {emitand ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                Emite AWB
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Emiterea e reala si facturata din prima — Shipo n-are mediu de proba. „Verifica datele” foloseste
              validarea lor, care nu creeaza nimic.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

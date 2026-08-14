"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, MapPin, Package, Search, Truck, X } from "lucide-react";
import { rambursDeIncasat } from "@/lib/orders/ramburs";
import {
  coteazaInnoshipAction,
  createInnoshipAwbAction,
  getInnoshipTraceAction,
  verificaInnoshipAwbAction,
  type StareAfisata,
} from "@/lib/actions/innoship.actions";
import { useGreutateaAwb, notaGreutate } from "@/components/dashboard/useGreutateaAwb";
import { etichetaOferta, ofertePosibile, termenLivrare, type OfertaAratata } from "@/lib/innoship/preturi";
import { Button } from "@/components/ui/button";
import type { Database } from "@/types/database.types";

type Order = Database["public"]["Tables"]["orders"]["Row"];

type ShippingAddress = {
  city?: string; county?: string; address?: string; street?: string; street_no?: string;
  postal_code?: string; courier?: string; delivery_type?: string;
  locker_id?: string; locker_name?: string; locker_city?: string; locker_county?: string; locker_post_code?: string;
  innoship_courier_id?: number; innoship_service_id?: number; innoship_service_name?: string;
};

/**
 * Emiterea unei expedieri Innoship.
 *
 * ═══ DOI PASI, CA LA CEILALTI BROKERI ═══
 *
 * Intai „Calculeaza preturi" (o citire pura — `POST /api/Price` nu creeaza nimic),
 * apoi alegerea ofertei. Ca la Woot, Colete si eColet.
 *
 * ⚠ Oferta aleasa de CLIENT in checkout se preselecteaza, si se spune pe fata:
 * comerciantul poate schimba, dar trebuie sa vada ce a platit omul. Schimbata
 * fara sa stie, diferenta de pret o suporta el.
 */
type Props = {
  open: boolean;
  onClose: () => void;
  order: Order;
  businessId: string;
  onSuccess: () => void;
};

export function InnoshipAwbModal(props: Props) {
  if (!props.open) return null;
  return <Formular {...props} />;
}

type ComandaInnoship = {
  innoship_awb_number?: string | null;
  innoship_courier_name?: string | null;
  innoship_service_name?: string | null;
  innoship_track_url?: string | null;
};

function Formular({ onClose, order, businessId, onSuccess }: Props) {
  const comanda = order as typeof order & ComandaInnoship;
  const addr = (order.shipping_address ?? {}) as ShippingAddress;
  const awb = comanda.innoship_awb_number ?? null;

  const laPunct = (addr.courier ?? "").toLowerCase().trim() === "innoship"
    && addr.delivery_type === "locker"
    && !!addr.locker_id;

  const { weight, setWeight, dinCatalog, liniiFaraGreutate } = useGreutateaAwb({
    open: true, hasAwb: !!awb, businessId, orderId: order.id,
  });
  const nota = notaGreutate(dinCatalog, liniiFaraGreutate);

  const [continut, setContinut] = useState("Produse");
  const [oferte, setOferte] = useState<OfertaAratata[] | null>(null);
  const [aleasa, setAleasa] = useState<OfertaAratata | null>(null);
  const [cotand, setCotand] = useState(false);
  const [emitand, setEmitand] = useState(false);
  const [verificand, setVerificand] = useState(false);
  const [stari, setStari] = useState<{ stari: StareAfisata[]; ramburs: StareAfisata[] } | null>(null);
  const [incarcStari, setIncarcStari] = useState(false);

  const ramburs = rambursDeIncasat(order);

  function destinatar() {
    return {
      nume: order.customer_name,
      persoanaContact: order.customer_name,
      strada: addr.street || addr.address || "",
      numar: addr.street_no || null,
      /* ⚠ La punct, localitatea si judetul sunt ALE PUNCTULUI, nu ale clientului. */
      oras: (laPunct ? addr.locker_city : "") || addr.city || "",
      judet: ((laPunct ? addr.locker_county : "") || addr.county) || null,
      codPostal: ((laPunct ? addr.locker_post_code : "") || addr.postal_code) || null,
      telefon: order.customer_phone,
      email: order.customer_email,
    };
  }

  function dateComune() {
    return {
      destinatar: destinatar(),
      greutateKg: Number(weight) || 0,
      continut: continut.trim() || "Produse",
      ramburs,
      valoareDeclarata: Number(order.total) || 0,
      felLivrare: (laPunct ? "locker" : "domiciliu") as "locker" | "domiciliu",
      fixedLocationId: laPunct ? addr.locker_id : null,
    };
  }

  async function handleCoteaza() {
    setCotand(true);
    const r = await coteazaInnoshipAction(businessId, order.id, dateComune());
    setCotand(false);
    if (!r.ok) return toast.error(r.error, { duration: 10000 });

    const lista = ofertePosibile(r.oferte);
    setOferte(lista);
    if (lista.length === 0) return toast.warning("Innoship n-a intors nicio oferta pentru comanda asta.");

    /* Preselectam ce a ales clientul; daca nu mai e in lista, prima (cea mai ieftina). */
    const alesaDeClient = lista.find((o) => o.courierId === addr.innoship_courier_id);
    setAleasa(alesaDeClient ?? lista[0]);
    toast.success(`${lista.length} oferte`);
  }

  async function handleEmite() {
    if (!aleasa) return toast.error("Alege o oferta");
    setEmitand(true);
    const r = await createInnoshipAwbAction(businessId, order.id, {
      ...dateComune(),
      courierId: aleasa.courierId,
      serviceId: aleasa.serviceId,
      /* Toate cele trei parti ale cheii, plus numele pentru panou. */
      optionId: aleasa.optionId,
      courierName: aleasa.courier,
      serviceName: aleasa.serviciu,
    });
    setEmitand(false);
    if ("error" in r) return toast.error(r.error, { duration: 12000 });
    for (const av of r.avertismente) toast.warning(av, { duration: 10000 });
    toast.success(`AWB emis: ${r.awb}`);
    onSuccess();
  }

  async function handleVerifica() {
    setVerificand(true);
    const r = await verificaInnoshipAwbAction(businessId, order.id);
    setVerificand(false);
    if (!r.ok) return toast.error(r.error, { duration: 12000 });
    toast[r.gasit ? "success" : "info"](r.mesaj, { duration: 12000 });
    if (r.gasit) onSuccess();
  }

  async function handleStari() {
    setIncarcStari(true);
    const r = await getInnoshipTraceAction(businessId, order.id);
    setIncarcStari(false);
    if (!r.ok) return toast.error(r.error);
    setStari({ stari: r.stari, ramburs: r.ramburs });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-surface p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Truck className="h-4 w-4" />Innoship
            </h3>
            <p className="text-xs text-muted-foreground">Comanda {order.order_number} · {order.customer_name}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        {awb ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-success/20 bg-success/5 p-3">
              <p className="text-xs text-muted-foreground">Numar AWB</p>
              <p className="font-mono text-sm font-semibold text-foreground">{awb}</p>
              {comanda.innoship_service_name && (
                <p className="mt-1 text-xs text-muted-foreground">{comanda.innoship_service_name}</p>
              )}
              {comanda.innoship_track_url && (
                <a href={comanda.innoship_track_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-primary underline">
                  Pagina de urmarire
                </a>
              )}
            </div>

            <Button variant="outline" onClick={handleStari} disabled={incarcStari} className="w-full">
              {incarcStari ? <Loader2 className="animate-spin" /> : <Package />}
              {incarcStari ? "Se cere..." : "Vezi unde e coletul"}
            </Button>

            {stari && (
              <div className="space-y-3">
                {stari.stari.length > 0 && (
                  <ul className="space-y-1.5 rounded-lg border border-border p-3">
                    {stari.stari.map((s, i) => (
                      <li key={`s-${i}`} className="text-xs">
                        <span className="text-foreground">{s.descriere}</span>
                        {s.localitate ? <span className="text-muted-foreground"> · {s.localitate}</span> : null}
                        {s.data ? <span className="text-muted-foreground"> · {new Date(s.data).toLocaleString("ro-RO")}</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
                {/* ⚠ Statusul BANILOR, separat de al coletului. Nu-l da niciun alt curier. */}
                {stari.ramburs.length > 0 && (
                  <div className="rounded-lg border border-border p-3">
                    <p className="mb-1 text-xs font-semibold text-foreground">Rambursul</p>
                    <ul className="space-y-1">
                      {stari.ramburs.map((s, i) => (
                        <li key={`r-${i}`} className="text-xs text-muted-foreground">
                          {s.descriere}{s.data ? ` · ${new Date(s.data).toLocaleString("ro-RO")}` : ""}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Informativ: statusul comenzii nu se schimba singur dupa el.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {laPunct && (
              <div className="flex items-start gap-2 rounded-lg border border-info/20 bg-info/5 p-3 text-xs">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
                <div>
                  <p className="font-semibold text-foreground">Ridicare din punct</p>
                  <p className="text-muted-foreground">{addr.locker_name || addr.locker_id}{addr.locker_city ? ` · ${addr.locker_city}` : ""}</p>
                </div>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Greutate (kg)</label>
              <input value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="decimal"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" />
              {nota && <p className="mt-1 text-xs text-warning">{nota}</p>}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Continut</label>
              <input value={continut} onChange={(e) => setContinut(e.target.value)} maxLength={100}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" />
            </div>

            <Button variant="outline" onClick={handleCoteaza} disabled={cotand} className="w-full">
              {cotand ? <Loader2 className="animate-spin" /> : <Search />}
              {cotand ? "Se calculeaza..." : "Calculeaza preturi"}
            </Button>

            {oferte && oferte.length > 0 && (
              <div className="max-h-56 space-y-1 overflow-y-auto">
                {oferte.map((o) => {
                  const cheie = `${o.courierId}::${o.serviceId}::${o.optionId ?? ""}`;
                  const selectata = aleasa
                    && aleasa.courierId === o.courierId
                    && aleasa.serviceId === o.serviceId
                    && aleasa.optionId === o.optionId;
                  const alesaDeClient = o.courierId === addr.innoship_courier_id;
                  return (
                    <button key={cheie} type="button" onClick={() => setAleasa(o)}
                      className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs ${selectata ? "border-primary bg-primary/5" : "border-border"}`}>
                      <span className="flex-1">
                        {etichetaOferta({ carrier: o.courier, service: o.serviciu })}
                        {alesaDeClient && <span className="ml-1 text-primary">· ales de client</span>}
                        {termenLivrare(o) && <span className="block text-muted-foreground">{termenLivrare(o)}</span>}
                      </span>
                      <span className="font-semibold">{o.pret.toFixed(2)} lei</span>
                    </button>
                  );
                })}
              </div>
            )}

            {ramburs > 0 && (
              <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-foreground">
                Ramburs de incasat: <strong>{ramburs.toFixed(2)} lei</strong>
              </p>
            )}

            <div className="flex items-start gap-2 rounded-lg border border-warning/20 bg-warning/5 p-3 text-xs">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
              <p className="text-muted-foreground">
                Expedierea e <strong>reala si facturata</strong>. Emiterea e aparata impotriva
                dublei apasari; daca ceva pica nesigur, apasa „Verifica la Innoship”.
              </p>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={handleVerifica} disabled={verificand} className="flex-1">
                {verificand ? <Loader2 className="animate-spin" /> : null}
                Verifica la Innoship
              </Button>
              <Button onClick={handleEmite} disabled={emitand || !aleasa} className="flex-1">
                {emitand ? <Loader2 className="animate-spin" /> : <Truck />}
                {emitand ? "Se emite..." : "Creeaza AWB"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

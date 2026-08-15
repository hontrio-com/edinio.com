"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, MapPin, Package, Printer, Truck, X } from "lucide-react";
import { rambursDeIncasat } from "@/lib/orders/ramburs";
import {
  createPacketaAwbAction, dezleagaPacketaAction, getPacketaLabelAction, getPacketaTrackingAction,
  type StareAfisata,
} from "@/lib/actions/packeta.actions";
import { useGreutateaAwb, notaGreutate } from "@/components/dashboard/useGreutateaAwb";
import { Button } from "@/components/ui/button";
import type { Database } from "@/types/database.types";

type Order = Database["public"]["Tables"]["orders"]["Row"];

type ShippingAddress = {
  city?: string; county?: string; address?: string; street?: string; street_no?: string;
  postal_code?: string; courier?: string; delivery_type?: string;
  locker_id?: string; locker_name?: string; locker_city?: string;
  locker_county?: string; locker_post_code?: string;
};

/**
 * Emiterea unui colet Packeta.
 *
 * ═══ ⚠ CE E ALTFEL FATA DE TOATE CELELALTE FORMULARE DE AWB ═══
 *
 *   - **Nu exista anulare.** API-ul lor nu are metoda. Butonul de aici doar
 *     DEZLEAGA coletul de comanda, iar mesajul spune raspicat ca la ei ramane si
 *     trebuie anulat de mana. Ascunsa, deosebirea asta l-ar face pe comerciant sa
 *     creada ca a anulat un colet care in realitate se va factura.
 *   - **Se valideaza inainte.** `packetAttributesValid()` e gratis si nu creeaza
 *     nimic, deci datele gresite se afla INAINTE de efectul care nu se mai poate
 *     desface. Campurile respinse se arata cu numele lor.
 *   - **Destinatia e un singur id.** Punct, automat sau curier — toate sunt
 *     `addressId` din acelasi spatiu. Alegerea cumparatorului din checkout ajunge
 *     direct acolo.
 */
type Props = {
  open: boolean;
  onClose: () => void;
  order: Order;
  businessId: string;
  onSuccess: () => void;
};

export function PacketaAwbModal(props: Props) {
  if (!props.open) return null;
  return <Formular {...props} />;
}

type ComandaPacketa = {
  packeta_packet_id?: string | null;
  packeta_barcode?: string | null;
  packeta_address_id?: string | null;
  packeta_external_tracking?: string | null;
};

function Formular({ onClose, order, businessId, onSuccess }: Props) {
  const comanda = order as typeof order & ComandaPacketa;
  const addr = (order.shipping_address ?? {}) as ShippingAddress;

  const packetId = comanda.packeta_packet_id ?? null;
  const [emitere, setEmitere] = useState(false);
  const [stari, setStari] = useState<StareAfisata[] | null>(null);
  const [incarcStari, setIncarcStari] = useState(false);
  const [eticheta, setEticheta] = useState(false);
  const [campuri, setCampuri] = useState<{ nume: string; motiv: string }[]>([]);

  /*
   * ⚠ Punctul ales in checkout E destinatia: `locker_id` e chiar `addressId`.
   * La Packeta un punct, un automat si un curier sunt id-uri din acelasi spatiu,
   * deci nu exista „serviciu" separat de ales.
   */
  const laPunct = (addr.courier ?? "").toLowerCase().trim() === "packeta"
    && addr.delivery_type === "locker"
    && !!addr.locker_id;

  const [addressId, setAddressId] = useState(
    comanda.packeta_address_id ?? (laPunct ? addr.locker_id ?? "" : ""),
  );

  const { weight, setWeight, dinCatalog, liniiFaraGreutate } = useGreutateaAwb({
    open: true, hasAwb: !!packetId, businessId, orderId: order.id,
  });
  const nota = notaGreutate(dinCatalog, liniiFaraGreutate);

  const [nota_, setNota] = useState("");
  const ramburs = rambursDeIncasat(order);

  async function handleEmite() {
    if (!addressId.trim()) {
      return toast.error("Alege destinatia: un punct Packeta sau un curier de livrare la adresa.");
    }
    setEmitere(true);
    setCampuri([]);
    const r = await createPacketaAwbAction(businessId, order.id, {
      destinatar: {
        nume: order.customer_name,
        strada: addr.street || addr.address || "",
        numar: addr.street_no || null,
        /* ⚠ La punct, orasul si codul postal sunt ALE PUNCTULUI: coletul ajunge
           acolo, nu acasa la client. Aceeasi regula ca la GLS si Posta. */
        oras: (laPunct ? addr.locker_city : "") || addr.city || "",
        judet: ((laPunct ? addr.locker_county : "") || addr.county) || null,
        codPostal: ((laPunct ? addr.locker_post_code : "") || addr.postal_code) || null,
        telefon: order.customer_phone,
        email: order.customer_email,
      },
      greutateKg: Number(weight) || 0,
      /* Packeta cere OBLIGATORIU o valoare, pentru asigurare. */
      valoare: Number(order.total) || 0,
      ramburs,
      addressId: addressId.trim(),
      nota: nota_.trim() || null,
    });
    setEmitere(false);

    if ("error" in r) {
      if (r.campuri?.length) setCampuri(r.campuri);
      return toast.error(r.error, { duration: 12000 });
    }
    toast.success(`Colet creat: ${r.barcode || r.packetId}`);
    onSuccess();
  }

  async function handleEticheta() {
    setEticheta(true);
    const r = await getPacketaLabelAction(businessId, order.id);
    setEticheta(false);
    if ("error" in r) return toast.error(r.error, { duration: 10000 });
    if (r.avertisment) toast.warning(r.avertisment, { duration: 12000 });

    /* Base64 → fisier, fara sa treaca prin server inca o data. */
    const octeti = Uint8Array.from(atob(r.pdf), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([octeti], { type: "application/pdf" }));
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function handleStari() {
    setIncarcStari(true);
    const r = await getPacketaTrackingAction(businessId, order.id);
    setIncarcStari(false);
    if ("error" in r) return toast.error(r.error);
    setStari(r.stari);
    if (r.stari.length === 0) toast.info("Packeta nu are inca niciun eveniment pentru coletul asta.");
  }

  async function handleDezleaga() {
    if (!confirm(
      "Scoti coletul de pe comanda?\n\nATENTIE: la Packeta coletul RAMANE — API-ul lor nu are anulare. "
      + "Trebuie sa-l anulezi de mana din contul Packeta, altfel ramane facturabil.",
    )) return;
    const r = await dezleagaPacketaAction(businessId, order.id);
    if ("error" in r) return toast.error(r.error);
    toast.warning(r.avertisment, { duration: 15000 });
    onSuccess();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-surface p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Truck className="h-4 w-4" /> Packeta
            </h3>
            <p className="text-xs text-muted-foreground">
              Comanda {order.order_number} · {order.customer_name}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        {packetId ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-success/20 bg-success/5 p-3">
              <p className="text-xs text-muted-foreground">Colet Packeta</p>
              <p className="font-mono text-sm font-semibold text-foreground">
                {comanda.packeta_barcode || packetId}
              </p>
              {comanda.packeta_external_tracking && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Numar la curierul care livreaza: <span className="font-mono">{comanda.packeta_external_tracking}</span>
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={handleEticheta} disabled={eticheta}>
                {eticheta ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4 mr-1" />}
                Eticheta
              </Button>
              <Button variant="outline" size="sm" onClick={handleStari} disabled={incarcStari}>
                {incarcStari ? <Loader2 className="h-4 w-4 animate-spin" /> : "Istoric"}
              </Button>
              <Button variant="outline" size="sm" onClick={handleDezleaga} className="text-red-600">
                Scoate de pe comanda
              </Button>
            </div>

            {/*
              * ⚠ Se spune limpede ce NU se poate face de aici. Un buton „Anuleaza"
              * care doar sterge legatura ar fi o minciuna cu urmari pe factura.
              */}
            <div className="flex gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-muted-foreground">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
              <p>
                Packeta nu permite anularea prin API. „Scoate de pe comanda” sterge doar legatura
                de aici; coletul trebuie anulat din contul Packeta.
              </p>
            </div>

            {stari && stari.length > 0 && (
              <div className="space-y-1 rounded-lg border border-border p-3">
                {stari.map((s, i) => (
                  <div key={i} className="flex justify-between gap-3 text-xs">
                    <span className="text-foreground">{s.descriere}</span>
                    <span className="shrink-0 text-muted-foreground">{s.cand ?? ""}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {laPunct && (
              <div className="flex gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs">
                <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                <p>
                  Clientul a ales ridicarea din <strong>{addr.locker_name || addr.locker_id}</strong>
                  {addr.locker_city ? `, ${addr.locker_city}` : ""}. Coletul ajunge acolo.
                </p>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                Destinatia (addressId)
              </label>
              <input
                value={addressId}
                onChange={(e) => setAddressId(e.target.value)}
                placeholder="Id punct Packeta sau id curier"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                La Packeta punctul, automatul si curierul sunt id-uri din acelasi spatiu. Cand
                clientul a ales un punct in checkout, se completeaza singur.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">Greutate (kg)</label>
              <input
                type="number" min={0} step="0.1" value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              />
              {nota && <p className="mt-1 text-[11px] text-muted-foreground">{nota}</p>}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">Nota pe eticheta</label>
              <input
                value={nota_} onChange={(e) => setNota(e.target.value)}
                placeholder="Optional"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              />
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              <p className="flex items-center gap-2">
                <Package className="h-3.5 w-3.5" />
                Valoare declarata: <strong>{Number(order.total || 0).toFixed(2)} lei</strong>
                {ramburs > 0 && <> · Ramburs: <strong>{ramburs.toFixed(2)} lei</strong></>}
              </p>
              <p className="mt-1">Packeta cere obligatoriu o valoare, pentru asigurare.</p>
            </div>

            {/* Campurile respinse de validarea LOR, cu numele lor: singurul furnizor
                care ne spune exact ce e gresit inainte de efectul real. */}
            {campuri.length > 0 && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs">
                <p className="mb-1 font-medium text-red-600">Packeta a respins datele:</p>
                <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
                  {campuri.map((c) => <li key={c.nume}><strong>{c.nume}</strong>: {c.motiv}</li>)}
                </ul>
              </div>
            )}

            <div className="flex gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-muted-foreground">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
              <p>
                Verificam datele la Packeta inainte de a crea coletul. Odata creat,
                <strong> nu se mai poate anula prin API</strong> — doar de mana, din contul lor.
              </p>
            </div>

            <Button onClick={handleEmite} disabled={emitere} className="w-full">
              {emitere ? <Loader2 className="h-4 w-4 animate-spin" /> : "Creeaza coletul"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
